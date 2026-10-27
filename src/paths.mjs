import path from 'node:path';
import { realpath, lstat } from 'node:fs/promises';
import { fail } from './errors.mjs';

const within = (root, target) => target === root || target.startsWith(root + path.sep);

export async function resolveCourseRoot({ workspaceRoot, courseRoot, courseId } = {}) {
  if (!workspaceRoot && !courseRoot) fail('INVALID_INPUT', 'workspaceRoot or courseRoot is required');
  if (courseRoot) return path.resolve(courseRoot);
  if (typeof courseId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(courseId)) fail('INVALID_INPUT', 'Invalid courseId');
  return resolveContained(path.resolve(workspaceRoot), path.join('courses', courseId), { allowMissing: true });
}

export async function resolveContained(root, relativePath, { allowMissing = false } = {}) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath)) fail('PATH_ESCAPE', 'Path must be relative to the selected root');
  const base = path.resolve(root);
  const target = path.resolve(base, relativePath);
  if (!within(base, target)) fail('PATH_ESCAPE', 'Path escapes the selected root');
  const realPathWithMissing = async (target) => {
    let cursor = target;
    const missing = [];
    while (true) {
      try { await lstat(cursor); break; }
      catch (e) {
        if (e.code !== 'ENOENT') throw e;
        if (!allowMissing) fail('INVALID_INPUT', `Path does not exist: ${target}`);
        missing.unshift(path.basename(cursor));
        const parent = path.dirname(cursor);
        if (parent === cursor) throw e;
        cursor = parent;
      }
    }
    return path.resolve(await realpath(cursor), ...missing);
  };
  const realBase = await realPathWithMissing(base);
  let cursor = target;
  const missing = [];
  while (true) {
    try { await lstat(cursor); break; }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      if (!allowMissing) fail('INVALID_INPUT', `Path does not exist: ${target}`);
      missing.unshift(path.basename(cursor));
      cursor = path.dirname(cursor);
    }
  }
  const realAncestor = await realpath(cursor);
  const realTarget = path.resolve(realAncestor, ...missing);
  if (!within(realBase, realTarget)) fail('PATH_ESCAPE', 'Path resolves outside the selected root');
  return target;
}
