import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const helper = path.resolve('scripts/learning-state.mjs');
const request = (workspaceRoot) => ({ protocolVersion: 1, op: 'course.discover', workspaceRoot });

async function setup(t) {
  const dir = await mkdtemp(path.join(process.cwd(), '.test-tmp-cleanup-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'request file.json');
  await writeFile(file, JSON.stringify(request(dir)));
  return { dir, file };
}

test('cleanup failure reports a separate error while preserving a committed mutation', async (t) => {
  const { dir, file } = await setup(t);
  const preloader = path.join(dir, 'deny-unlink.mjs');
  await writeFile(preloader, `import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
fs.unlink = async () => { throw Object.assign(new Error('Injected cleanup denial'), { code: 'EACCES' }); };
syncBuiltinESMExports();`);
  await writeFile(file, JSON.stringify({ protocolVersion: 1, op: 'course.init', workspaceRoot: dir,
    courseId: 'cleanup-denial', operationId: 'init', expectedRevision: 0,
    payload: { courseId: 'cleanup-denial', learnerContext: {}, goal: 'Learn', prerequisites: [], readingRateWpm: 238, lessons: [] },
  }));
  const child = spawnSync(process.execPath, ['--import', preloader, helper, '--cleanup-request', file], { encoding: 'utf8' });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.equal(result.cleanupStatus.ok, false);
  assert.equal(result.cleanupStatus.error.code, 'IO_ERROR');
  await readFile(file);
  const state = JSON.parse(await readFile(path.join(dir, 'courses', 'cleanup-denial', 'state.json'), 'utf8'));
  assert.equal(state.revision, 1);
});

function run(args) {
  const child = spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8' });
  assert.equal(child.error, undefined, `helper spawn failed: ${child.error}`);
  assert.equal(child.stderr, '', `helper stderr: ${child.stderr}; status: ${child.status}; error: ${child.error}`);
  assert.notEqual(child.stdout, '', `helper produced no stdout; status: ${child.status}`);
  return { status: child.status, result: JSON.parse(child.stdout) };
}

test('cleanup flag is optional, accepted on either side of the sole path, and argument errors are rejected', async (t) => {
  const { dir, file } = await setup(t);
  let out = run([file]);
  assert.equal(out.status, 0);
  assert.equal(Object.hasOwn(out.result, 'cleanupStatus'), false);
  await readFile(file);

  out = run(['--cleanup-request', file]);
  assert.equal(out.status, 0);
  assert.deepEqual(out.result.cleanupStatus, { ok: true, removed: true });
  await assert.rejects(readFile(file), { code: 'ENOENT' });

  await writeFile(file, JSON.stringify(request(dir)));
  out = run([file, '--cleanup-request']);
  assert.equal(out.status, 0);
  assert.deepEqual(out.result.cleanupStatus, { ok: true, removed: true });

  for (const args of [[file, file], ['--cleanup-request', '--cleanup-request', file], ['--other', file], [file, 'extra']]) {
    out = run(args);
    assert.equal(out.status, 1);
    assert.equal(out.result.error.code, 'INVALID_INPUT');
  }
});

test('cleanup retains malformed and unsuccessful requests and refuses symlink inputs', async (t) => {
  const { dir, file } = await setup(t);
  await writeFile(file, '{');
  let out = run(['--cleanup-request', file]);
  assert.equal(out.status, 1);
  assert.equal(out.result.error.code, 'INVALID_INPUT');
  assert.equal(await readFile(file, 'utf8'), '{');

  await writeFile(file, JSON.stringify({ protocolVersion: 1, op: 'not.allowed', workspaceRoot: dir }));
  out = run([file, '--cleanup-request']);
  assert.equal(out.status, 1);
  assert.equal(out.result.ok, false);
  await readFile(file);

  const target = path.join(dir, 'target.json');
  await writeFile(target, JSON.stringify(request(dir)));
  await rm(file);
  await symlink(target, file);
  out = run(['--cleanup-request', file]);
  assert.equal(out.status, 1);
  assert.equal(out.result.ok, false);
  await readFile(target);
  assert.equal((await lstat(file)).isSymbolicLink(), true);
});

test('successful mutation and committed mutation with notes failure both clean up the request', async (t) => {
  const { dir, file } = await setup(t);
  const courseRoot = path.join(dir, 'courses', 'cleanup-course');
  const initRequest = {
    protocolVersion: 1, op: 'course.init', workspaceRoot: dir, courseRoot,
    operationId: 'cleanup-init', expectedRevision: 0,
    payload: { courseId: 'cleanup-course', learnerContext: {}, goal: 'Learn layers', prerequisites: [], readingRateWpm: 238, lessons: [], assessments: {}, assignments: {} },
  };
  await writeFile(file, JSON.stringify(initRequest));
  let out = run(['--cleanup-request', file]);
  assert.equal(out.status, 0, JSON.stringify(out.result));
  assert.equal(out.result.ok, true);
  assert.equal(out.result.committed, true);
  assert.deepEqual(out.result.cleanupStatus, { ok: true, removed: true });
  await assert.rejects(readFile(file), { code: 'ENOENT' });

  await writeFile(path.join(courseRoot, 'classnotes.md'), 'manual edit');
  await writeFile(file, JSON.stringify({
    protocolVersion: 1, op: 'qa.record', workspaceRoot: dir, courseRoot,
    operationId: 'cleanup-qa', expectedRevision: 1,
    payload: { question: 'Why layers?', answerSummary: 'They store filesystem changes.' },
  }));
  out = run([file, '--cleanup-request']);
  assert.equal(out.status, 0, JSON.stringify(out.result));
  assert.equal(out.result.ok, true);
  assert.equal(out.result.committed, true);
  assert.equal(out.result.notesStatus.ok, false);
  assert.deepEqual(out.result.cleanupStatus, { ok: true, removed: true });
  await assert.rejects(readFile(file), { code: 'ENOENT' });
});

test('cleanup retains a request with malformed UTF-8', async (t) => {
  const { file } = await setup(t);
  await writeFile(file, Buffer.from([0xc3, 0x28]));
  const out = run(['--cleanup-request', file]);
  assert.equal(out.status, 1);
  assert.equal(out.result.error.code, 'INVALID_INPUT');
  assert.deepEqual(await readFile(file), Buffer.from([0xc3, 0x28]));
});
