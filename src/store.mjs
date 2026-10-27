import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { validateState, validateRecord, validateMutation, reduceState } from './model.mjs';
import { fail, LearningError } from './errors.mjs';
import { resolveContained } from './paths.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};
const json = (v) => Buffer.from(`${JSON.stringify(v, null, 2)}\n`, 'utf8');
const io = (e) => e instanceof LearningError ? e : new LearningError('IO_ERROR', e?.message ?? 'Filesystem operation failed', { cause: e?.code });

export async function readCourse(root) {
  try {
    const statePath = await resolveContained(root, 'state.json', { allowMissing: true });
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    validateState(state);
    const records = [];
    for (const ref of state.recordRefs) {
      let file;
      try { file = await resolveContained(root, ref.path); }
      catch (e) { if (e.code === 'INVALID_INPUT') fail('CORRUPT_STATE', `Referenced record is missing: ${ref.recordId}`); throw e; }
      const bytes = await readFile(file);
      if (hash(bytes) !== ref.sha256) fail('CORRUPT_STATE', `Record hash mismatch: ${ref.recordId}`);
      const record = JSON.parse(bytes.toString('utf8'));
      validateRecord(record);
      if (record.recordId !== ref.recordId) fail('CORRUPT_STATE', `Record identity mismatch: ${ref.recordId}`);
      records.push(record);
    }
    if (records.length !== state.revision) fail('CORRUPT_STATE', 'Checkpoint revision does not match its record history');
    const replayed = records.length ? reduceState(null, records) : validateState(state);
    const { recordRefs: _actualRefs, ...actual } = state;
    const { recordRefs: _replayedRefs, ...expected } = replayed;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('CORRUPT_STATE', 'Checkpoint does not match its committed record history');
    return { state, records };
  } catch (e) { if (e.code === 'ENOENT') fail('CORRUPT_STATE', 'Course checkpoint or referenced record is missing'); throw io(e); }
}

export async function withCourseLock(root, callback, options = {}) {
  const lockPath = path.join(root, '.course.lock');
  await (options.fs?.mkdir ?? mkdir)(root, { recursive: true });
  const token = randomUUID();
  let handle;
  try {
    handle = await (options.fs?.open ?? open)(lockPath, 'wx');
    await handle.writeFile(JSON.stringify({ token, pid: process.pid, host: os.hostname(), startedAt: new Date().toISOString() }));
    await handle.close(); handle = null;
  } catch (e) { if (handle) await handle.close(); if (e.code === 'EEXIST') fail('LOCKED', 'Course is locked by another operation'); throw io(e); }
  let committed = false;
  try { return await callback({ token, markCommitted: () => { committed = true; } }); }
  finally {
    try {
      const owner = JSON.parse(await (options.fs?.readFile ?? readFile)(lockPath, 'utf8'));
      if (owner.token === token) await (options.fs?.unlink ?? unlink)(lockPath);
    } catch (e) { if (!committed) throw io(e); }
  }
}

export async function recoverLock(root, { ownerToken, confirmedInactive } = {}) {
  if (confirmedInactive !== true || !ownerToken) fail('LOCKED', 'Recovery requires confirmed inactive ownership and its token');
  const lockPath = path.join(root, '.course.lock');
  let owner;
  try { owner = JSON.parse(await readFile(lockPath, 'utf8')); } catch (e) { throw io(e); }
  if (owner.token !== ownerToken) fail('LOCKED', 'Lock token does not match');
  await unlink(lockPath);
  return { recovered: true };
}

export async function renameWithRetry(from, to, { rename: replace = rename } = {}) {
  for (const delay of [0, 10, 25, 50, 100]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try { await replace(from, to); return; }
    catch (e) { if (e.code !== 'EPERM' || delay === 100) throw e; }
  }
}

export async function commit(root, request, options = {}) {
  const mutation = validateMutation(request);
  return withCourseLock(root, async ({ markCommitted }) => {
    let prior = null; let existingRecords = [];
    try { ({ state: prior, records: existingRecords } = await readCourse(root)); }
    catch (e) { if (e.code !== 'ENOENT' && e.code !== 'CORRUPT_STATE') throw e; if (e.code === 'CORRUPT_STATE' && await exists(path.join(root, 'state.json'))) throw e; }
    const inputRecords = request.records;
    if (!Array.isArray(inputRecords) || !inputRecords.length) fail('INVALID_INPUT', 'At least one record is required');
    for (const r of inputRecords) { validateRecord(r); if (r.operationId !== mutation.operationId) fail('INVALID_INPUT', 'Record operationId must match mutation'); }
    const snapshots = request.snapshots ?? [];
    const hashedSnapshots = await snapshotHashes(snapshots);
    for (const record of inputRecords.filter((r) => r.kind === 'submission_recorded')) {
      if (!hashedSnapshots.some((s) => s.path === record.payload.snapshotPath && s.sha256 === record.payload.snapshotSha256)) fail('INVALID_INPUT', 'Submission record must reference the exact supplied snapshot bytes');
    }
    const semantic = { operationId: mutation.operationId, records: inputRecords.map(({ recordId, revision, timestamp, fingerprint: _fingerprint, ...r }) => r), snapshots: hashedSnapshots };
    const fingerprint = hash(Buffer.from(JSON.stringify(canonical(semantic))));
    const priorFingerprint = prior?.operationFingerprints[mutation.operationId];
    if (priorFingerprint) {
      if (priorFingerprint !== fingerprint) fail('CONFLICT', 'Operation ID was already used with different content');
      return { committed: true, revision: prior.revision, state: prior, records: existingRecords.filter((r) => r.operationId === mutation.operationId), idempotent: true };
    }
    if ((prior?.revision ?? 0) !== mutation.expectedRevision) fail('CONFLICT', 'Expected revision does not match current checkpoint');
    const enriched = inputRecords.map((r) => ({ ...r, fingerprint }));
    const recordBytes = [];
    const storedRecords = [];
    for (const r of enriched) {
      const bytes = json(r); const rel = `records/${r.recordId}.json`; const file = await resolveContained(root, rel, { allowMissing: true });
      await mkdir(path.dirname(file), { recursive: true });
      let storedBytes = bytes;
      if (await exists(file)) {
        storedBytes = await readFile(file);
        if (!storedBytes.equals(bytes)) {
          let orphan;
          try { orphan = JSON.parse(storedBytes.toString('utf8')); } catch { fail('CONFLICT', `Immutable record collision: ${r.recordId}`); }
          validateRecord(orphan);
          const comparable = (record) => canonical(Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'timestamp')));
          if (JSON.stringify(comparable(orphan)) !== JSON.stringify(comparable(r))) fail('CONFLICT', `Immutable record collision: ${r.recordId}`);
          if (orphan.fingerprint !== fingerprint || orphan.revision !== r.revision) fail('CONFLICT', `Orphan record envelope differs: ${r.recordId}`);
          storedRecords.push(orphan);
        } else {
          storedRecords.push(r);
        }
      } else { await writeFile(file, bytes, { flag: 'wx' }); storedRecords.push(r); }
      recordBytes.push({ record: storedRecords.at(-1), bytes: storedBytes, rel });
    }
    for (const item of await prepareSnapshots(root, request.snapshots ?? [])) recordBytes.push(item);
    await options.afterArtifacts?.();
    let next = reduceState(prior, storedRecords);
    next.recordRefs = [...(prior?.recordRefs ?? []), ...recordBytes.filter((x) => x.record).map(({ record, bytes, rel }) => ({ recordId: record.recordId, path: rel, sha256: hash(bytes) }))];
    next.operationFingerprints[mutation.operationId] = fingerprint;
    validateState(next);
    await options.beforeCheckpoint?.();
    await replaceCheckpoint(root, json(next), options);
    markCommitted();
    let postCommitError;
    try { await options.afterCheckpoint?.(); } catch (e) { postCommitError = { message: e.message, code: e.code }; }
    return { committed: true, revision: next.revision, state: next, records: storedRecords, ...(postCommitError ? { postCommitError } : {}) };
  }, options);
}

async function exists(file) { try { await readFile(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
async function snapshotHashes(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.some((s) => !s || typeof s.path !== 'string' || !s.path)) fail('INVALID_INPUT', 'Snapshots require destination paths');
  return Promise.all(snapshots.map(async (s) => ({ path: s.path, sha256: hash(await sourceBytes(s)) })));
}
async function sourceBytes(s) { if (s.bytes === undefined) fail('INVALID_INPUT', 'Snapshots must provide selected bytes'); return Buffer.from(s.bytes); }
async function prepareSnapshots(root, snapshots) {
  const out = [];
  for (const s of snapshots) {
    const bytes = await sourceBytes(s); const dest = await resolveContained(root, s.path, { allowMissing: true });
    await mkdir(path.dirname(dest), { recursive: true });
    if (await exists(dest)) { if (!(await readFile(dest)).equals(bytes)) fail('CONFLICT', `Immutable snapshot collision: ${s.path}`); }
    else await writeFile(dest, bytes, { flag: 'wx' });
    out.push({ bytes, rel: s.path });
  }
  return out;
}
async function replaceCheckpoint(root, bytes, options) {
  const target = await resolveContained(root, 'state.json', { allowMissing: true });
  const temp = await resolveContained(root, `.state-${randomUUID()}.tmp`, { allowMissing: true });
  try {
    await (options.fs?.writeFile ?? writeFile)(temp, bytes, { flag: 'wx' });
    await renameWithRetry(temp, target, { rename: options.fs?.rename ?? rename });
  }
  catch (e) { try { await unlink(temp); } catch {} throw io(e); }
}
