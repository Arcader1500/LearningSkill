import { constants } from 'node:fs';
import { lstat, open, readFile, unlink } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import { dispatch } from '../src/dispatch.mjs';

function errorResult(code, message) { return { ok: false, error: { code, message } }; }
function classify(error) {
  return ['ENOENT', 'EACCES', 'EPERM', 'EIO', 'ELOOP'].includes(error.code) ? 'IO_ERROR' : error.code ?? 'IO_ERROR';
}

const args = process.argv.slice(2);
const cleanup = args.filter((arg) => arg === '--cleanup-request').length;
const paths = args.filter((arg) => arg !== '--cleanup-request');
let result;
let cleanupTarget;
if (cleanup > 1 || args.some((arg) => arg.startsWith('-') && arg !== '--cleanup-request') || paths.length !== 1) {
  result = errorResult('INVALID_INPUT', 'Provide exactly one request-file path and optionally --cleanup-request');
} else {
  const requestPath = paths[0];
  try {
    let bytes;
    if (cleanup) {
      const before = await lstat(requestPath);
      if (before.isFile() && !before.isSymbolicLink()) {
        const handle = await open(requestPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        try {
          const opened = await handle.stat();
          if (opened.isFile() && opened.dev === before.dev && opened.ino === before.ino) {
            cleanupTarget = { dev: before.dev, ino: before.ino };
            bytes = await handle.readFile();
          } else {
            const error = new Error('Request file changed while it was being opened'); error.code = 'IO_ERROR'; throw error;
          }
        } finally { await handle.close(); }
      } else {
        const error = new Error('Request file must be a regular nonsymlink file'); error.code = 'IO_ERROR'; throw error;
      }
    } else bytes = await readFile(requestPath);
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bytes = bytes.subarray(3);
    let source;
    try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { const error = new Error('Request file is not valid UTF-8'); error.code = 'INVALID_INPUT'; throw error; }
    const request = JSON.parse(source);
    result = await dispatch(request);
  } catch (error) {
    const code = error instanceof SyntaxError ? 'INVALID_INPUT' : classify(error);
    result = errorResult(code, error instanceof SyntaxError ? 'Request file is not valid JSON' : error.message);
  }
  if (cleanup && result?.ok === true && cleanupTarget) {
    try {
      const current = await lstat(requestPath);
      if (!current.isFile() || current.isSymbolicLink() || current.dev !== cleanupTarget.dev || current.ino !== cleanupTarget.ino) {
        const error = new Error('Request file changed before cleanup'); error.code = 'ESTALE'; throw error;
      }
      await unlink(requestPath);
      result.cleanupStatus = { ok: true, removed: true };
    } catch (error) {
      result.cleanupStatus = { ok: false, error: { code: classify(error), message: error.message } };
    }
  }
}
process.stdout.write(`${JSON.stringify(result)}\n`);
if (!result.ok) process.exitCode = 1;
