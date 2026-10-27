import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildPlugins } from '../scripts/build-plugins.mjs';
import { validatePlugins } from '../scripts/validate-plugins.mjs';

const source = path.resolve('.');
const expectedAssets = [
  'skills/learn/SKILL.md', 'skills/learn/docs/protocol.md',
  'skills/learn/references/teaching.md', 'skills/learn/references/persistence.md',
  'skills/learn/references/assignments.md', 'skills/learn/references/assessment.md',
  'skills/learn/templates/course.md', 'skills/learn/templates/lesson.md',
  'skills/learn/templates/assignment.md', 'skills/learn/scripts/learning-state.mjs',
  ...['assessment','course','dispatch','errors','model','notes','paths','store'].map(name => `skills/learn/src/${name}.mjs`),
];

async function fixture(t) {
  const root = await mkdtemp(path.join(process.cwd(), '.test-tmp-packaging-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(source, 'shared'), path.join(root, 'shared'), { recursive: true });
  await cp(path.join(source, 'platforms'), path.join(root, 'platforms'), { recursive: true });
  await cp(path.join(source, 'src'), path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await cp(path.join(source, 'scripts', 'learning-state.mjs'), path.join(root, 'scripts', 'learning-state.mjs'));
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await cp(path.join(source, 'docs', 'protocol.md'), path.join(root, 'docs', 'protocol.md'));
  await cp(path.join(source, 'package.json'), path.join(root, 'package.json'));
  return { root, distRoot: path.join(root, 'dist') };
}

test('builds deterministic isolated packages and validates them without modifying them', async (t) => {
  const { root, distRoot } = await fixture(t);
  const outside = path.join(root, 'courses', 'course-1', 'sentinel.md');
  const unrelated = path.join(distRoot, 'keep.txt');
  await mkdir(path.dirname(outside), { recursive: true }); await writeFile(outside, 'learner data');
  await mkdir(distRoot); await writeFile(unrelated, 'unrelated');
  await mkdir(path.join(root, '.agents/plugins'), { recursive: true });
  await writeFile(path.join(root, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'old-name', interface: { displayName: 'Existing' }, plugins: [{ name: 'other-plugin', keep: true }] }));
  await buildPlugins({ root, distRoot });
  const first = new Map();
  for (const platform of ['codex','antigravity']) for (const rel of await readdir(path.join(distRoot, platform), { recursive: true })) {
    const file = path.join(distRoot, platform, rel);
    if ((await lstat(file)).isFile()) first.set(`${platform}/${rel}`, await readFile(file));
  }
  await buildPlugins({ root, distRoot });
  for (const [file, bytes] of first) assert.deepEqual(await readFile(path.join(distRoot, file)), bytes, `${file} is deterministic`);
  assert.equal(await readFile(outside, 'utf8'), 'learner data');
  assert.equal(await readFile(unrelated, 'utf8'), 'unrelated');
  const validation = await validatePlugins({ root, distRoot });
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  const before = new Map();
  for (const [file] of first) before.set(file, await readFile(path.join(distRoot, file)));
  await validatePlugins({ root, distRoot });
  for (const [file, bytes] of before) assert.deepEqual(await readFile(path.join(distRoot, file)), bytes);
  const codex = path.join(distRoot, 'codex');
  for (const rel of expectedAssets) await lstat(path.join(codex, rel));
  assert.match(await readFile(path.join(codex, 'skills/learn/SKILL.md'), 'utf8'), /Codex platform bindings/);
  assert.match(await readFile(path.join(distRoot, 'antigravity/skills/learn/SKILL.md'), 'utf8'), /Antigravity platform bindings/);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, '.agents/plugins/marketplace.json'), 'utf8')), {
    name: 'learning-skill-local', interface: { displayName: 'LearningSkill Local' }, plugins: [{
      name: 'learning-skill', source: { path: './dist/codex', source: 'local' }, category: 'Productivity',
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    }, { name: 'other-plugin', keep: true }],
  });
});

test('validator detects tampering, missing assets, version mismatch, and escaping links', async (t) => {
  const { root, distRoot } = await fixture(t); await buildPlugins({ root, distRoot });
  await writeFile(path.join(distRoot, 'codex/skills/learn/docs/protocol.md'), 'tampered');
  assert.equal((await validatePlugins({ root, distRoot })).ok, false);
  await buildPlugins({ root, distRoot });
  await rm(path.join(distRoot, 'codex/skills/learn/templates/course.md'));
  assert.equal((await validatePlugins({ root, distRoot })).ok, false);
  await buildPlugins({ root, distRoot });
  await writeFile(path.join(distRoot, 'codex/skills/learn/SKILL.md'), `${await readFile(path.join(distRoot, 'codex/skills/learn/SKILL.md'), 'utf8')}\n[escape](../../../../../../outside.md)\n`);
  assert.equal((await validatePlugins({ root, distRoot })).ok, false);
  await buildPlugins({ root, distRoot });
  await writeFile(path.join(distRoot, 'codex/.codex-plugin/plugin.json'), JSON.stringify({ name: 'learning-skill', version: '999.0.0' }));
  assert.equal((await validatePlugins({ root, distRoot })).ok, false);
});

test('validator rejects escaping dynamic imports and non-Node package imports', async (t) => {
  const { root, distRoot } = await fixture(t);
  const extraModule = path.join(root, 'src/extra.mjs');
  await writeFile(extraModule, "await import('../../../../outside.mjs');\n");
  await buildPlugins({ root, distRoot });
  let result = await validatePlugins({ root, distRoot });
  assert.ok(result.errors.some(error => error.includes('Escaping module import')));
  await rm(extraModule);
  await writeFile(extraModule, "import dep from 'not-installed-package';\n");
  await buildPlugins({ root, distRoot });
  result = await validatePlugins({ root, distRoot });
  assert.ok(result.errors.some(error => error.includes('Bare package import is not allowed')));
});

test('builder rejects source and destination symlinks without touching their targets', async (t) => {
  const { root, distRoot } = await fixture(t);
  const outside = path.join(path.dirname(root), `${path.basename(root)}-outside`); await mkdir(outside); await writeFile(path.join(outside, 'keep'), 'safe');
  t.after(() => rm(outside, { recursive: true, force: true }));
  try { await symlink(outside, path.join(root, 'shared', 'skills', 'learn', 'templates', 'linked'), 'junction'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip(`Symlink creation unavailable: ${error.code}`); return; } throw error; }
  await assert.rejects(buildPlugins({ root, distRoot }));
  assert.equal(await readFile(path.join(outside, 'keep'), 'utf8'), 'safe');
  await rm(path.join(root, 'shared', 'skills', 'learn', 'templates', 'linked'));
  await mkdir(distRoot); await symlink(outside, path.join(distRoot, 'codex'), 'junction');
  await assert.rejects(buildPlugins({ root, distRoot }));
  assert.equal(await readFile(path.join(outside, 'keep'), 'utf8'), 'safe');
});

test('builder confines outputs and refuses to replace unowned package directories', async (t) => {
  const { root, distRoot } = await fixture(t);
  const outside = path.join(path.dirname(root), `${path.basename(root)}-outside`); await mkdir(outside); await writeFile(path.join(outside, 'keep'), 'safe');
  t.after(() => rm(outside, { recursive: true, force: true }));
  await assert.rejects(buildPlugins({ root, distRoot: outside }), /child of the source root/);
  await mkdir(path.join(distRoot, 'codex'), { recursive: true });
  await writeFile(path.join(distRoot, 'codex', 'precious.txt'), 'user data');
  await assert.rejects(buildPlugins({ root, distRoot }), /without matching ownership marker/);
  assert.equal(await readFile(path.join(distRoot, 'codex', 'precious.txt'), 'utf8'), 'user data');
  assert.equal(await readFile(path.join(outside, 'keep'), 'utf8'), 'safe');
});

test('isolated generated package helper initializes and resumes without the source checkout', async (t) => {
  const { root, distRoot } = await fixture(t); await buildPlugins({ root, distRoot });
  const isolated = await mkdtemp(path.join(process.cwd(), '.test-tmp-isolated-plugin-'));
  t.after(() => rm(isolated, { recursive: true, force: true }));
  const installed = path.join(isolated, 'plugin');
  await cp(path.join(distRoot, 'codex'), installed, { recursive: true });
  const workspace = path.join(isolated, 'learner-workspace');
  const courseRoot = path.join(workspace, 'courses', 'fixture-course');
  await mkdir(workspace, { recursive: true });
  const helper = path.join(installed, 'skills/learn/scripts/learning-state.mjs');
  const requestFile = path.join(isolated, 'request.json');
  const request = { protocolVersion: 1, op: 'course.init', workspaceRoot: workspace, courseRoot, operationId: 'isolated-init', expectedRevision: 0, payload: { courseId: 'fixture-course', learnerContext: {}, goal: 'Learn layers', prerequisites: [], readingRateWpm: 238, lessons: [], assessments: {}, assignments: {} } };
  await writeFile(requestFile, JSON.stringify(request));
  let result = spawnSync(process.execPath, [helper, requestFile], { cwd: isolated, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).committed, true);
  await writeFile(requestFile, JSON.stringify({ protocolVersion: 1, op: 'course.resume', workspaceRoot: workspace, courseRoot }));
  result = spawnSync(process.execPath, [helper, requestFile], { cwd: isolated, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).state.courseId, 'fixture-course');
});

test('failed replacement and restore preserve the owned backup and report its recovery path', async (t) => {
  const { root, distRoot } = await fixture(t); await buildPlugins({ root, distRoot });
  const previousSkill = await readFile(path.join(distRoot, 'codex/skills/learn/SKILL.md'));
  const previousAntigravitySkill = await readFile(path.join(distRoot, 'antigravity/skills/learn/SKILL.md'));
  const outside = path.join(root, 'courses/learner/sentinel');
  await mkdir(path.dirname(outside), { recursive: true }); await writeFile(outside, 'keep');
  await writeFile(path.join(root, 'shared/skills/learn/SKILL.md'), 'changed canonical source\n');
  const realRename = (await import('node:fs/promises')).rename;
  const fail = (code) => Object.assign(new Error(`injected ${code}`), { code });
  const injectedRename = async (from, to) => {
    if (from.includes('.stage-antigravity-') && to === path.join(distRoot, 'antigravity')) throw fail('EIO');
    if (from.includes('.backup-codex-') && to === path.join(distRoot, 'codex')) throw fail('EIO');
    return realRename(from, to);
  };
  let failure;
  try { await buildPlugins({ root, distRoot, fileSystem: { rename: injectedRename } }); }
  catch (error) { failure = error; }
  assert.ok(failure, 'injected output failure must be reported');
  assert.match(failure.message, /Rollback incomplete/);
  const recoveryPath = failure.message.match(/Prior package preserved at (.*?); restore failed:/)?.[1];
  assert.ok(recoveryPath, failure.message);
  assert.equal(await readFile(path.join(recoveryPath, 'skills/learn/SKILL.md')).then(bytes => bytes.equals(previousSkill)), true);
  assert.equal(await readFile(outside, 'utf8'), 'keep');
  await assert.rejects(lstat(path.join(distRoot, 'codex')));
  assert.equal(await readFile(path.join(distRoot, 'antigravity/skills/learn/SKILL.md')).then(bytes => bytes.equals(previousAntigravitySkill)), true);
});
