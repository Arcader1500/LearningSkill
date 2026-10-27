import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import { resolveCourseRoot, resolveContained } from '../src/paths.mjs';

test('selects course roots and rejects traversal and escaping links', async (t) => {
  const base = await mkdtemp(path.join(process.cwd(), '.test-tmp-path-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  assert.equal(await resolveCourseRoot({ workspaceRoot: base, courseId: 'one' }), path.join(base, 'courses', 'one'));
  await assert.rejects(resolveContained(base, '../escape'), { code: 'PATH_ESCAPE' });
  await assert.rejects(resolveContained(base, 'missing/file'), { code: 'INVALID_INPUT' });
  assert.equal(await resolveContained(path.join(base, 'not-created'), 'course', { allowMissing: true }), path.join(base, 'not-created', 'course'));
  const outside = await mkdtemp(path.join(process.cwd(), '.test-tmp-out-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  try {
    await symlink(outside, path.join(base, 'link'), 'junction');
    await assert.rejects(resolveContained(base, 'link/file'), { code: 'PATH_ESCAPE' });
  } catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') t.skip('OS does not allow symlink fixture'); else throw e; }
});
