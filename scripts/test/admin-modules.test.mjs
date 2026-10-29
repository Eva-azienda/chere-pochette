// Smoke tests for the admin page's files (public/admin/**): every module parses and imports,
// every relative import points to an existing file, and no leftover of the removed demo mode.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ADMIN = fileURLToPath(new URL('../../public/admin/', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(ADMIN);
const jsFiles = files.filter((f) => f.endsWith('.js'));

describe('admin page files', () => {
  test('every module is valid JavaScript (node --check)', () => {
    assert.ok(jsFiles.length >= 10);
    for (const file of jsFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  });

  test('every relative import points to an existing file', () => {
    for (const file of jsFiles) {
      const source = readFileSync(file, 'utf8');
      for (const [, spec] of source.matchAll(/\bfrom\s+'(\.{1,2}\/[^']+)'/g)) {
        assert.ok(existsSync(path.resolve(path.dirname(file), spec)), `${path.relative(ADMIN, file)} imports missing ${spec}`);
      }
    }
  });

  test('every module except the entry point (app.js boots the page) imports in Node', async () => {
    for (const file of jsFiles.filter((f) => !f.endsWith(`${path.sep}app.js`))) {
      const mod = await import(pathToFileURL(file).href);
      assert.ok(Object.keys(mod).length > 0, `${path.relative(ADMIN, file)} exports something`);
    }
  });

  test('index.html loads app.js; the CSP allows only GitHub besides the page itself', () => {
    const html = readFileSync(path.join(ADMIN, 'index.html'), 'utf8');
    assert.match(html, /<script type="module" src="\.\/js\/app\.js"><\/script>/);
    const csp = /Content-Security-Policy"\s+content="([^"]+)"/.exec(html)[1];
    assert.match(csp, /connect-src 'self' https:\/\/api\.github\.com https:\/\/raw\.githubusercontent\.com;/);
    assert.match(csp, /img-src 'self' blob: data:/, 'photos downloaded through the API are blob: URLs');
  });

  test('the demo mode is gone (no files, no code paths, no texts)', () => {
    for (const file of files) {
      assert.doesNotMatch(path.relative(ADMIN, file), /demo/i);
      if (/\.(js|css|html|json|webmanifest)$/.test(file)) {
        assert.doesNotMatch(readFileSync(file, 'utf8'), /demo/i, path.relative(ADMIN, file));
      }
    }
  });

  test('login: e-mail + password form that password managers understand', () => {
    const login = readFileSync(path.join(ADMIN, 'js/screens/login.js'), 'utf8');
    for (const attr of ["type: 'email'", "autocomplete: 'username'", "inputmode: 'email'", "autocapitalize: 'off'",
      "autocomplete: 'current-password'", "'form'", "type: 'submit'", "'Entra'", 'Admin non ancora configurato', 'npm run admin:setup']) {
      assert.ok(login.includes(attr), attr);
    }
  });
});
