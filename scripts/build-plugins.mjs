import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renameWithRetry } from '../src/store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OWNER = '.learningskill-owned.json';
const ownerValue = JSON.stringify({ owner: 'learning-skill-build-plugins', version: 1 });
const platforms = ['codex', 'antigravity'];
const sharedFiles = ['SKILL.md', 'references/teaching.md', 'references/persistence.md', 'references/assignments.md', 'references/assessment.md', 'templates/course.md', 'templates/lesson.md', 'templates/assignment.md'];

function inside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

async function assertNoLinks(root, target) {
  if (!inside(root, target)) throw new Error(`Path escapes its allowed root: ${target}`);
  let cursor = root;
  const parts = path.relative(root, target).split(path.sep).filter(Boolean);
  for (const part of parts) {
    cursor = path.join(cursor, part);
    let stat;
    try { stat = await lstat(cursor); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (stat.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${cursor}`);
  }
}

async function filesUnder(root, relative) {
  const base = path.join(root, relative);
  await assertNoLinks(root, base);
  const files = [];
  async function visit(dir) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      await assertNoLinks(root, file);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${file}`);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && file.endsWith('.mjs')) files.push(path.relative(root, file));
      else if (!entry.isFile()) throw new Error(`Unsupported source entry: ${file}`);
    }
  }
  await visit(base);
  return files.sort((a, b) => a.localeCompare(b));
}

async function writeCopy(sourceRoot, relative, stageRoot, destination) {
  const source = path.join(sourceRoot, relative);
  await assertNoLinks(sourceRoot, source);
  const stat = await lstat(source);
  if (!stat.isFile()) throw new Error(`Required regular file missing: ${source}`);
  const output = path.join(stageRoot, destination);
  await mkdir(path.dirname(output), { recursive: true });
  await cp(source, output);
}

async function owned(target) {
  try {
    const stat = await lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Refusing to replace non-directory or linked output: ${target}`);
    return await readFile(path.join(target, OWNER), 'utf8') === ownerValue;
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function buildPlugins({ root = path.resolve(here, '..'), distRoot = path.join(root, 'dist'), fileSystem = {} } = {}) {
  root = path.resolve(root); distRoot = path.resolve(distRoot);
  if (!inside(root, distRoot) || root === distRoot) throw new Error('Generated output root must be a child of the source root');
  await assertNoLinks(path.parse(root).root, root);
  await assertNoLinks(root, distRoot);
  await mkdir(distRoot, { recursive: true });
  await assertNoLinks(root, distRoot);
  const distStat = await lstat(distRoot);
  if (!distStat.isDirectory() || distStat.isSymbolicLink()) throw new Error(`Invalid generated root: ${distRoot}`);
  const srcFiles = await filesUnder(root, 'src');
  if (!srcFiles.length) throw new Error('No source modules found');
  const id = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const stages = Object.fromEntries(platforms.map(platform => [platform, path.join(distRoot, `.stage-${platform}-${id}`)]));
  const backups = Object.fromEntries(platforms.map(platform => [platform, path.join(distRoot, `.backup-${platform}-${id}`)]));
  const committed = [];
  const recoveryFailures = [];
  try {
    for (const platform of platforms) {
      const stage = stages[platform]; await mkdir(stage);
      for (const file of sharedFiles) await writeCopy(root, path.join('shared/skills/learn', file), stage, path.join('skills/learn', file));
      for (const rel of ['docs/protocol.md', ...srcFiles]) {
        const source = rel === 'docs/protocol.md' ? 'docs/protocol.md' : rel;
        const destination = rel.startsWith('src') ? path.join('skills/learn', rel) : path.join('skills/learn/docs/protocol.md');
        await writeCopy(root, source, stage, destination);
      }
      await writeCopy(root, 'scripts/learning-state.mjs', stage, 'skills/learn/scripts/learning-state.mjs');
      const adapterPath = path.join(root, `platforms/${platform}/adapter.md`);
      await assertNoLinks(root, adapterPath);
      const adapter = await readFile(adapterPath, 'utf8');
      const skillFile = path.join(stage, 'skills/learn/SKILL.md');
      await writeFile(skillFile, `${await readFile(skillFile, 'utf8').then(value => value.trimEnd())}\n\n${adapter.trim()}\n`);
      const sourceManifest = path.join(root, `platforms/${platform}/plugin.json`);
      await assertNoLinks(root, sourceManifest);
      const manifest = JSON.parse(await readFile(sourceManifest, 'utf8'));
      const manifestPath = path.join(stage, platform === 'codex' ? '.codex-plugin/plugin.json' : 'plugin.json');
      await mkdir(path.dirname(manifestPath), { recursive: true });
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await writeFile(path.join(stage, OWNER), ownerValue);
    }
    for (const platform of platforms) {
      const target = path.join(distRoot, platform);
      if (await exists(target)) {
        if (!await owned(target)) throw new Error(`Refusing to replace output without matching ownership marker: ${target}`);
        await renameWithRetry(target, backups[platform], { rename: fileSystem.rename ?? rename });
      }
      await renameWithRetry(stages[platform], target, { rename: fileSystem.rename ?? rename }); committed.push(platform);
    }
  } catch (error) {
    for (const platform of [...committed].reverse()) {
      const target = path.join(distRoot, platform);
      try {
        if (await exists(target) && await owned(target)) await rm(target, { recursive: true });
      } catch (rollbackError) { recoveryFailures.push(`${target} could not be removed: ${rollbackError.message}`); }
    }
    for (const platform of platforms) if (await exists(backups[platform])) {
      const target = path.join(distRoot, platform);
      if (await exists(target)) {
        recoveryFailures.push(`Prior package preserved at ${backups[platform]}; target remains at ${target}`);
        continue;
      }
      try { await renameWithRetry(backups[platform], target, { rename: fileSystem.rename ?? rename }); }
      catch (rollbackError) { recoveryFailures.push(`Prior package preserved at ${backups[platform]}; restore failed: ${rollbackError.message}`); }
    }
    if (recoveryFailures.length) throw new Error(`${error.message}\nRollback incomplete. ${recoveryFailures.join('\n')}`, { cause: error });
    throw error;
  } finally {
    for (const platform of platforms) {
      if (await exists(stages[platform])) await rm(stages[platform], { recursive: true });
    }
  }
  for (const platform of platforms) if (await exists(backups[platform])) await rm(backups[platform], { recursive: true });
  const marketplace = path.join(root, '.agents/plugins/marketplace.json');
  await assertNoLinks(root, marketplace);
  let current = { name: 'learning-skill-local', interface: { displayName: 'LearningSkill Local' }, plugins: [] };
  try { current = JSON.parse(await readFile(marketplace, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const entry = { name: 'learning-skill', source: { path: './dist/codex', source: 'local' }, category: 'Productivity', policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' } };
  const plugins = Array.isArray(current.plugins) ? current.plugins.filter(plugin => plugin.name !== entry.name) : [];
  plugins.unshift(entry);
  await mkdir(path.dirname(marketplace), { recursive: true });
  await writeFile(marketplace, `${JSON.stringify({ ...current, name: 'learning-skill-local', interface: { ...(current.interface ?? {}), displayName: 'LearningSkill Local' }, plugins }, null, 2)}\n`);
  return { outputs: platforms.map(platform => path.join(distRoot, platform)), marketplace };
}

async function exists(file) { try { await lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await buildPlugins(); process.stdout.write('Built Codex and Antigravity packages.\n'); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
