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
    for (const ref of state.artifactRefs) {
      let file;
      try { file = await resolveContained(root, ref.path); }
      catch (e) { if (e.code === 'INVALID_INPUT') fail('CORRUPT_STATE', `Referenced artifact is missing: ${ref.path}`); throw e; }
      if (hash(await readFile(file)) !== ref.sha256) fail('CORRUPT_STATE', `Artifact hash mismatch: ${ref.path}`);
    }
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
      if (ref.path !== `records/${record.recordId}.json`) fail('CORRUPT_STATE', `Record path mismatch: ${ref.recordId}`);
      records.push(record);
    }
    const replayedArtifactRefs = mergeArtifactRefs([], records.flatMap((record) => record.artifactRefs ?? []));
    if (JSON.stringify(replayedArtifactRefs) !== JSON.stringify(state.artifactRefs)) fail('CORRUPT_STATE', 'Checkpoint artifact references do not match committed records');
    if (records.length !== state.revision) fail('CORRUPT_STATE', 'Checkpoint revision does not match its record history');
    const replayed = records.length ? reduceState(null, records) : validateState(state);
    const { recordRefs: _actualRefs, artifactRefs: _actualArtifacts, ...actual } = state;
    const { recordRefs: _replayedRefs, artifactRefs: _replayedArtifacts, ...expected } = replayed;
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

export async function mutationFingerprint(operationId, semanticInput, snapshots = []) {
  if (typeof operationId !== 'string' || !operationId || semanticInput === undefined) fail('INVALID_INPUT', 'Fingerprint requires an operation ID and semantic input');
  const artifactHashes = await snapshotHashes(snapshots);
  const semantic = { operationId, semanticInput, snapshots: artifactHashes };
  return hash(Buffer.from(JSON.stringify(canonical(semantic))));
}

export async function findCommittedOperation(root, { operationId, fingerprint }) {
  if (typeof operationId !== 'string' || !operationId || !/^[a-f0-9]{64}$/i.test(fingerprint ?? '')) fail('INVALID_INPUT', 'Replay lookup requires operation ID and computed fingerprint');
  let loaded;
  try { loaded = await readCourse(root); }
  catch (e) { if (e.code === 'CORRUPT_STATE' && !(await exists(path.join(root, 'state.json')))) return null; throw e; }
  const { state, records } = loaded;
  const committedFingerprint = state.operationFingerprints[operationId];
  if (!committedFingerprint) return null;
  if (committedFingerprint !== fingerprint) fail('CONFLICT', 'Operation ID was already used with different content');
  let end = -1;
  for (let i = 0; i < records.length; i++) if (records[i].operationId === operationId) end = i;
  if (end < 0) fail('CORRUPT_STATE', 'Operation fingerprint has no record history');
  const resultState = reduceState(null, records.slice(0, end + 1));
  resultState.recordRefs = state.recordRefs.slice(0, end + 1);
  resultState.artifactRefs = mergeArtifactRefs([], records.slice(0, end + 1).flatMap((record) => record.artifactRefs ?? []));
  return { committed: true, revision: records[end].revision, state: resultState, records: records.filter((r) => r.operationId === operationId), idempotent: true };
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
    const semanticInput = request.semanticInput ?? { records: inputRecords.map(({ recordId, revision, timestamp, fingerprint: _fingerprint, artifactRefs: _artifactRefs, ...r }) => r) };
    const fingerprint = await mutationFingerprint(mutation.operationId, semanticInput, snapshots);
    const priorFingerprint = prior?.operationFingerprints[mutation.operationId];
    if (priorFingerprint) {
      if (priorFingerprint !== fingerprint) fail('CONFLICT', 'Operation ID was already used with different content');
      return { committed: true, revision: prior.revision, state: prior, records: existingRecords.filter((r) => r.operationId === mutation.operationId), idempotent: true };
    }
    if ((prior?.revision ?? 0) !== mutation.expectedRevision) fail('CONFLICT', 'Expected revision does not match current checkpoint');
    const operationArtifactRefs = hashedSnapshots.map(({ path: artifactPath, sha256 }) => ({ path: artifactPath, sha256 }));
    const enriched = inputRecords.map(({ artifactRefs: _untrustedArtifactRefs, ...r }) => ({ ...r, fingerprint, artifactRefs: operationArtifactRefs }));
    const recordBytes = [];
    const storedRecords = [];
    const snapshotDestinations = await snapshotDestinationMap(root, snapshots, hashedSnapshots);
    const recordDestinations = await Promise.all(enriched.map((r) => resolveContained(root, `records/${r.recordId}.json`, { allowMissing: true })));
    const keys = new Set(recordDestinations.map(destinationKey));
    if (snapshotDestinations.some(({ destination }) => keys.has(destinationKey(destination)))) fail('CONFLICT', 'Snapshot destination collides with an immutable record');
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
    for (const item of await prepareSnapshots(root, snapshots, hashedSnapshots, snapshotDestinations)) recordBytes.push(item);
    await options.afterArtifacts?.();
    let next = reduceState(prior, storedRecords);
    next.recordRefs = [...(prior?.recordRefs ?? []), ...recordBytes.filter((x) => x.record).map(({ record, bytes, rel }) => ({ recordId: record.recordId, path: rel, sha256: hash(bytes) }))];
    next.artifactRefs = mergeArtifactRefs(prior?.artifactRefs ?? [], recordBytes.filter((x) => !x.record).map(({ bytes, rel }) => ({ path: rel, sha256: hash(bytes) })));
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
  const keys = new Set();
  const items = await Promise.all(snapshots.map(async (s) => ({ path: s.path.replaceAll('\\', '/'), sha256: hash(await sourceBytes(s)) })));
  for (const item of items) {
    const normalized = path.posix.normalize(item.path);
    const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    if (keys.has(key)) fail('INVALID_INPUT', `Duplicate snapshot destination: ${item.path}`);
    keys.add(key);
  }
  return items.sort((a, b) => a.path.localeCompare(b.path));
}
async function sourceBytes(s) { if (s.bytes === undefined) fail('INVALID_INPUT', 'Snapshots must provide selected bytes'); return Buffer.from(s.bytes); }
const destinationKey = (destination) => process.platform === 'win32' ? path.resolve(destination).toLowerCase() : path.resolve(destination);
async function snapshotDestinationMap(root, snapshots, hashes) {
  const byHashPath = new Map(hashes.map((item) => [`${item.path}\0${item.sha256}`, item]));
  return Promise.all(snapshots.map(async (snapshot) => {
    const rel = snapshot.path.replaceAll('\\', '/');
    const sha256 = hash(await sourceBytes(snapshot));
    if (!byHashPath.has(`${rel}\0${sha256}`)) fail('INVALID_INPUT', 'Snapshot path normalization failed');
    return { destination: await resolveContained(root, rel, { allowMissing: true }), rel, sha256 };
  }));
}
function mergeArtifactRefs(existing, incoming) {
  const refs = [...existing];
  for (const item of incoming) {
    const found = refs.find((ref) => ref.path === item.path);
    if (found && found.sha256 !== item.sha256) fail('CONFLICT', `Immutable artifact path already has different bytes: ${item.path}`);
    if (!found) refs.push(item);
  }
  return refs.sort((a, b) => a.path.localeCompare(b.path));
}
async function prepareSnapshots(root, snapshots, hashes, destinations) {
  const out = [];
  for (let i = 0; i < snapshots.length; i++) {
    const s = snapshots[i];
    const bytes = await sourceBytes(s); const { destination: dest, rel } = destinations[i];
    await mkdir(path.dirname(dest), { recursive: true });
    if (await exists(dest)) { if (!(await readFile(dest)).equals(bytes)) fail('CONFLICT', `Immutable snapshot collision: ${s.path}`); }
    else await writeFile(dest, bytes, { flag: 'wx' });
    out.push({ bytes, rel, sha256: hashes.find((item) => item.path === rel)?.sha256 });
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
