import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const platforms = ['codex', 'antigravity'];
const canonicalFiles = ['references/teaching.md', 'references/persistence.md', 'references/assignments.md', 'references/assessment.md', 'templates/course.md', 'templates/lesson.md', 'templates/assignment.md'];
const ownerValue = JSON.stringify({ owner: 'learning-skill-build-plugins', version: 1 });

function within(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

async function regular(root, relative) {
  const file = path.resolve(root, relative);
  if (!within(root, file)) throw new Error(`Path escapes package root: ${relative}`);
  let cursor = root;
  for (const part of path.relative(root, file).split(path.sep)) {
    cursor = path.join(cursor, part);
    const stat = await lstat(cursor);
    if (stat.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${cursor}`);
  }
  if (!(await lstat(file)).isFile()) throw new Error(`Expected regular file: ${file}`);
  return file;
}

function parseJson(text, name) {
  try { return JSON.parse(text); } catch { throw new Error(`Invalid JSON: ${name}`); }
}

async function checkedCopy(source, packageRoot, sourceRelative, packageRelative) {
  const original = await readFile(await regular(source, sourceRelative));
  const packaged = await readFile(await regular(packageRoot, packageRelative));
  if (!original.equals(packaged)) throw new Error(`Canonical resource differs: ${packageRelative}`);
}

async function allFiles(dir) {
  const result = [];
  async function walk(folder) {
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${full}`);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) result.push(full);
      else throw new Error(`Unsupported package entry: ${full}`);
    }
  }
  await walk(dir); return result;
}

function checkMarkdownLinks(text, file, root) {
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const ref = match[1].trim().replace(/^<|>$/g, '').split(/[?#]/, 1)[0];
    if (!ref || ref.includes('{{') || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) continue;
    const target = path.resolve(path.dirname(file), decodeURIComponent(ref));
    if (!within(root, target)) throw new Error(`Escaping resource link in ${file}: ${ref}`);
    const stat = lstatSync(target);
    if (!stat?.isFile() && !stat?.isDirectory()) throw new Error(`Missing resource link in ${file}: ${ref}`);
  }
}

function lstatSync(file) {
  try {
    const { lstatSync: stat } = requireFs();
    return stat(file);
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function requireFs() { return fsSync; }
import * as fsSync from 'node:fs';

async function checkModuleImports(text, file, root) {
  const specifiers = [];
  for (const match of text.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g)) specifiers.push(match[1]);
  for (const match of text.matchAll(/\bimport\s*\(\s*([^)]*?)\s*\)/g)) {
    const literal = match[1].match(/^(?:'([^']+)'|"([^"]+)")$/);
    if (!literal) throw new Error(`Non-literal dynamic import is not allowed in ${file}`);
    specifiers.push(literal[1] ?? literal[2]);
  }
  for (const specifier of specifiers) {
    if (specifier.startsWith('node:')) {
      if (!builtinModules.includes(specifier.slice(5))) throw new Error(`Unknown Node builtin import in ${file}: ${specifier}`);
      continue;
    }
    if (!specifier.startsWith('.')) throw new Error(`Bare package import is not allowed in ${file}: ${specifier}`);
    const target = path.resolve(path.dirname(file), specifier);
    if (!within(root, target)) throw new Error(`Escaping module import in ${file}: ${specifier}`);
    await regular(root, path.relative(root, target));
  }
}

async function checkSkill(sourceRoot, packageRoot, platform) {
  const skillFile = await regular(packageRoot, 'skills/learn/SKILL.md');
  const text = await readFile(skillFile, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match || !/^name:\s*learn\s*$/m.test(match[1]) || !/^description:\s*\S/m.test(match[1])) throw new Error(`Invalid skill frontmatter: ${platform}`);
  const canonical = await readFile(path.join(sourceRoot, 'shared/skills/learn/SKILL.md'), 'utf8');
  const marker = `## ${platform === 'codex' ? 'Codex' : 'Antigravity'} platform bindings`;
  const index = text.indexOf(marker);
  if (index < 0 || text.slice(0, index).trimEnd() !== canonical.trimEnd()) throw new Error(`Canonical skill or appended adapter mismatch: ${platform}`);
  const adapter = await readFile(path.join(sourceRoot, `platforms/${platform}/adapter.md`), 'utf8');
  if (text.slice(index).trim() !== adapter.trim()) throw new Error(`Platform adapter mismatch: ${platform}`);
}

export async function validatePlugins({ root = path.resolve(here, '..'), distRoot = path.join(root, 'dist') } = {}) {
  root = path.resolve(root); distRoot = path.resolve(distRoot);
  const errors = [];
  const check = async (fn) => { try { await fn(); } catch (error) { errors.push(error.message); } };
  await check(async () => {
    if (!within(root, distRoot) || root === distRoot) throw new Error('Generated output root must be a child of the source root');
    for (const folder of [distRoot, ...platforms.map(platform => path.join(distRoot, platform))]) {
      const stat = await lstat(folder);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Invalid package directory: ${folder}`);
    }
  });
  let packageVersion = '';
  await check(async () => { packageVersion = parseJson(await readFile(path.join(root, 'package.json'), 'utf8'), 'package.json').version; });
  for (const platform of platforms) await check(async () => {
    const packageRoot = path.join(distRoot, platform);
    const files = await allFiles(packageRoot);
    if (await readFile(path.join(packageRoot, '.learningskill-owned.json'), 'utf8') !== ownerValue) throw new Error(`Missing package ownership marker: ${platform}`);
    const manifestRelative = platform === 'codex' ? '.codex-plugin/plugin.json' : 'plugin.json';
    const manifest = parseJson(await readFile(await regular(packageRoot, manifestRelative), 'utf8'), `${platform} manifest`);
    const sourceManifest = parseJson(await readFile(path.join(root, `platforms/${platform}/plugin.json`), 'utf8'), `${platform} source manifest`);
    if (JSON.stringify(manifest) !== JSON.stringify(sourceManifest)) throw new Error(`Manifest differs from canonical source: ${platform}`);
    if (manifest.name !== 'learning-skill' || manifest.version !== packageVersion) throw new Error(`Manifest metadata/version mismatch: ${platform}`);
    if (platform === 'codex' && manifest.skills !== './skills/') throw new Error('Codex manifest does not declare the packaged skills directory');
    await checkSkill(root, packageRoot, platform);
    for (const rel of canonicalFiles) await checkedCopy(root, packageRoot, `shared/skills/learn/${rel}`, `skills/learn/${rel}`);
    await checkedCopy(root, packageRoot, 'docs/protocol.md', 'skills/learn/docs/protocol.md');
    await checkedCopy(root, packageRoot, 'scripts/learning-state.mjs', 'skills/learn/scripts/learning-state.mjs');
    for (const file of (await readdir(path.join(root, 'src'))).filter(name => name.endsWith('.mjs')).sort()) await checkedCopy(root, packageRoot, `src/${file}`, `skills/learn/src/${file}`);
    for (const rel of ['skills/learn/docs/protocol.md', 'skills/learn/scripts/learning-state.mjs', ...canonicalFiles.map(file => `skills/learn/${file}`)]) await regular(packageRoot, rel);
    const sourceModules = (await readdir(path.join(root, 'src'))).filter(name => name.endsWith('.mjs')).sort();
    for (const file of sourceModules) await regular(packageRoot, `skills/learn/src/${file}`);
    for (const file of files) {
      if (file.endsWith('.md')) checkMarkdownLinks(await readFile(file, 'utf8'), file, packageRoot);
      if (file.endsWith('.mjs')) await checkModuleImports(await readFile(file, 'utf8'), file, packageRoot);
    }
    const syntaxFiles = [...(await readdir(path.join(root, 'src'))).filter(name => name.endsWith('.mjs')).map(file => path.join(root, 'src', file)), path.join(root, 'scripts/learning-state.mjs'), ...files.filter(file => file.endsWith('.mjs'))];
    for (const file of syntaxFiles) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`JavaScript syntax check failed for ${file}: ${result.stderr || result.stdout}`);
    }
  });
  await check(async () => {
    const marketplace = parseJson(await readFile(path.join(root, '.agents/plugins/marketplace.json'), 'utf8'), 'marketplace');
    if (marketplace.name !== 'learning-skill-local' || marketplace.interface?.displayName !== 'LearningSkill Local' || marketplace.plugins?.filter(entry => entry.name === 'learning-skill').length !== 1) throw new Error('Marketplace metadata mismatch');
    const entry = marketplace.plugins.find(item => item.name === 'learning-skill');
    if (JSON.stringify(entry) !== JSON.stringify({ name: 'learning-skill', source: { path: './dist/codex', source: 'local' }, category: 'Productivity', policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' } })) throw new Error('Marketplace plugin entry mismatch');
  });
  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validatePlugins();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
