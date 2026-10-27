import { readFile } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import { dispatch } from '../src/dispatch.mjs';

function errorResult(code, message) { return { ok: false, error: { code, message } }; }

let result;
if (process.argv.length !== 3) result = errorResult('INVALID_INPUT', 'Provide exactly one request-file path');
else {
  try {
    let bytes = await readFile(process.argv[2]);
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bytes = bytes.subarray(3);
    let source;
    try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { const error = new Error('Request file is not valid UTF-8'); error.code = 'INVALID_INPUT'; throw error; }
    const request = JSON.parse(source);
    result = await dispatch(request);
  } catch (error) {
    const code = ['ENOENT', 'EACCES', 'EPERM', 'EIO'].includes(error.code) ? 'IO_ERROR' : error.code ?? (error instanceof SyntaxError ? 'INVALID_INPUT' : 'IO_ERROR');
    result = errorResult(code, error instanceof SyntaxError ? 'Request file is not valid JSON' : error.message);
  }
}
process.stdout.write(`${JSON.stringify(result)}\n`);
if (!result.ok) process.exitCode = 1;
