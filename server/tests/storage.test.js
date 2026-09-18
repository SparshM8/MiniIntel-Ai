const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getUploadPath, getUploadDir } = require('../config/storage');

test('source files remain readable from a fresh process using the same persistent directory', () => {
  const original = process.env.UPLOAD_DIR;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineintel-storage-'));
  try {
    process.env.UPLOAD_DIR = directory;
    fs.writeFileSync(getUploadPath('source.csv'), 'mine,production\nJayant,10\n');
    const result = execFileSync(process.execPath, ['-e',
      `const { getUploadPath } = require(${JSON.stringify(require.resolve('../config/storage'))}); process.stdout.write(require('node:fs').readFileSync(getUploadPath('source.csv')));`],
    { env: process.env, encoding: 'utf8' });
    assert.equal(result, 'mine,production\nJayant,10\n');
    for (const filename of ['../secret', '..\\secret', '/', '', '..']) assert.throws(() => getUploadPath(filename), /Invalid stored filename/);
    process.env.UPLOAD_DIR = 'relative-directory';
    assert.throws(getUploadDir, /absolute/);
  } finally {
    if (original === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = original;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('production CORS allows only the configured browser origin and originless clients', () => {
  const { corsOptions } = require('../config/cors');
  const originalEnvironment = process.env.NODE_ENV;
  const originalClient = process.env.CLIENT_URL;
  try {
    process.env.NODE_ENV = 'production';
    process.env.CLIENT_URL = 'https://mineintel.example';
    for (const [origin, expected] of [['https://mineintel.example', true], [undefined, true],
      ['https://untrusted.example', false], ['http://localhost:5173', false]]) {
      corsOptions.origin(origin, (error, allowed) => { assert.equal(error, null); assert.equal(allowed, expected); });
    }
  } finally {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalEnvironment;
    if (originalClient === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = originalClient;
  }
});