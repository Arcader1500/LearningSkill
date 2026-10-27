import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, unlink, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { commit, readCourse } from '../src/store.mjs';
import { state, record } from './helpers.mjs';

test('commits, reads, appends detached refs, and resolves idempotent retry before stale revision', async (t) => {
  const root = await mkdtemp(path.join(process.cwd(), '.test-tmp-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = record('course_initialized', { initialState: state() }, { recordId: 'r1', operationId: 'op1' });
  const committed = await commit(root, { operationId: 'op1', expectedRevision: 0, records: [first] });
  assert.equal(committed.state.revision, 1);
  assert.match(committed.state.recordRefs[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal((await readCourse(root)).state.revision, 1);
  assert.equal((await commit(root, { operationId: 'op1', expectedRevision: 0, records: [first] })).revision, 1);
  const second = record('qa_recorded', {}, { recordId: 'r2', operationId: 'op2', revision: 2 });
  assert.equal((await commit(root, { operationId: 'op2', expectedRevision: 1, records: [second] })).revision, 2);
  assert.equal((await readCourse(root)).records.length, 2);
  const beforeFault = record('qa_recorded', {}, { recordId: 'fault-1', operationId: 'fault-op', revision: 3 });
  await assert.rejects(commit(root, { operationId: 'fault-op', expectedRevision: 2, records: [beforeFault] }, { fs: { open: async () => { throw Object.assign(new Error('open denied'), { code: 'EACCES' }); } } }), { code: 'IO_ERROR' });
  let persistentAttempts = 0;
  await assert.rejects(commit(root, { operationId: 'fault-op', expectedRevision: 2, records: [beforeFault] }, { fs: { rename: async () => { persistentAttempts++; throw Object.assign(new Error('persistent rename failure'), { code: 'EPERM' }); } } }), { code: 'IO_ERROR' });
  assert.equal(persistentAttempts, 5);
  assert.equal((await readCourse(root)).state.revision, 2);
  const interrupted = record('qa_recorded', {}, { recordId: 'orphan-1', operationId: 'orphan-op', revision: 3 });
  await assert.rejects(commit(root, { operationId: 'orphan-op', expectedRevision: 2, records: [interrupted] }, { afterArtifacts: async () => { throw new Error('interrupted'); } }));
  const retry = { ...interrupted, timestamp: '2026-02-02T00:00:00.000Z', fingerprint: 'new-envelope-fingerprint' };
  assert.equal((await commit(root, { operationId: 'orphan-op', expectedRevision: 2, records: [retry] })).revision, 3);
  const post = record('qa_recorded', {}, { recordId: 'post-1', operationId: 'post-op', revision: 4 });
  const postResult = await commit(root, { operationId: 'post-op', expectedRevision: 3, records: [post] }, { afterCheckpoint: async () => { throw new Error('post commit'); } });
  assert.equal(postResult.committed, true);
  assert.equal((await readCourse(root)).state.revision, 4);
  const transient = record('qa_recorded', {}, { recordId: 'transient-1', operationId: 'transient-op', revision: 5 });
  let transientAttempts = 0;
  const recoveredRename = await commit(root, { operationId: 'transient-op', expectedRevision: 4, records: [transient] }, { fs: { rename: async (from, to) => { if (++transientAttempts === 1) throw Object.assign(new Error('transient rename contention'), { code: 'EPERM' }); return (await import('node:fs/promises')).rename(from, to); } } });
  assert.equal(recoveredRename.revision, 5);
  assert.equal(transientAttempts, 2);
  const secondRoot = await mkdtemp(path.join(process.cwd(), '.test-tmp-concurrent-'));
  t.after(() => rm(secondRoot, { recursive: true, force: true }));
  const entry = new URL('../src/store.mjs', import.meta.url).href;
  const runner = `import {commit} from ${JSON.stringify(entry)}; const r={schemaVersion:1,recordId:'race-'+process.pid,operationId:'race-'+process.pid,kind:'course_initialized',timestamp:new Date().toISOString(),courseId:'race-course',revision:1,contentRevision:1,fingerprint:'x',payload:{initialState:{schemaVersion:1,courseId:'race-course',revision:0,contentRevision:1,phase:'draft',learnerContext:{},goal:'g',prerequisites:[],readingRateWpm:238,lessons:[],reading:{},assessments:{},assignments:{},courseManifest:null,materialRefs:[],pendingQuestion:null,attempts:{},recordRefs:[],operationFingerprints:{},unresolvedTopics:[],nextAction:'n',notesProjection:null}}}; try { await commit(process.argv[1],{operationId:r.operationId,expectedRevision:0,records:[r]}); console.log('ok'); } catch(e) { console.log(e.code); }`;
  const runChild = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', runner, secondRoot], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = ''; child.stdout.on('data', (chunk) => { out += chunk; }); child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', (code) => code === 0 ? resolve(out.trim()) : reject(new Error(err || `child exit ${code}`)));
  });
  const races = await Promise.all([runChild(), runChild()]);
  assert.equal(races.filter((x) => x === 'ok').length, 1, JSON.stringify(races));
  assert.ok(races.some((x) => x === 'LOCKED' || x === 'CONFLICT'));
  await writeFile(path.join(secondRoot, '.course.lock'), JSON.stringify({ token: 'correct' }));
  const { recoverLock } = await import('../src/store.mjs');
  await assert.rejects(recoverLock(secondRoot, { ownerToken: 'wrong', confirmedInactive: true }), { code: 'LOCKED' });
  assert.deepEqual(await recoverLock(secondRoot, { ownerToken: 'correct', confirmedInactive: true }), { recovered: true });
  const changed = { ...first, fingerprint: committed.state.operationFingerprints.op1, payload: { ...first.payload, nextAction: 'different' } };
  await assert.rejects(commit(root, { operationId: 'op1', expectedRevision: 0, records: [changed] }), { code: 'CONFLICT' });
  const stale = { ...first, operationId: 'op2', recordId: 'r2' };
  await assert.rejects(commit(root, { operationId: 'op2', expectedRevision: 0, records: [stale] }), { code: 'CONFLICT' });
  await unlink(path.join(root, 'records', 'r1.json'));
  await assert.rejects(readCourse(root), { code: 'CORRUPT_STATE' });
  await writeFile(path.join(root, 'state.json'), JSON.stringify({ schemaVersion: 999 }));
  await assert.rejects(commit(root, { operationId: 'op2', expectedRevision: 0, records: [stale] }), { code: 'UNSUPPORTED_SCHEMA' });
});

test('readCourse rejects an escaping checkpoint symlink', async (t) => {
  const root = await mkdtemp(path.join(process.cwd(), '.test-tmp-state-link-'));
  const outside = await mkdtemp(path.join(process.cwd(), '.test-tmp-state-out-'));
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]));
  const externalState = path.join(outside, 'state.json');
  await writeFile(externalState, '{}');
  try { await symlink(externalState, path.join(root, 'state.json'), 'file'); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { t.skip('OS does not allow symlink fixture'); return; } throw e; }
  await assert.rejects(readCourse(root), { code: 'PATH_ESCAPE' });
});
