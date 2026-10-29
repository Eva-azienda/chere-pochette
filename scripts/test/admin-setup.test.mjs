// Tests for scripts/admin-setup.mjs (one admin: e-mail + password → public/admin/auth.json v2).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  encryptAuth, decryptAuth, suggestPassphrase, checkPassword, isEmail, verifyToken, runSetup, parseArgs,
  KDF_ITERATIONS, FALLBACK_DEFAULTS,
} from '../admin-setup.mjs';
import * as browser from '../../public/admin/js/crypto.js';

// Obviously fake (a value shaped like a real GitHub token would trip GitHub push protection).
const TOKEN = 'test-token-not-a-real-secret';
const EMAIL = 'chere.pochette@sccbellinzona.ch';
const PASSWORD = 'toravi-memuso-bilena-carepo';
const SCRIPT = fileURLToPath(new URL('../admin-setup.mjs', import.meta.url));

/** Collects what the script prints. */
function sink() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  });
  stream.text = () => chunks.join('');
  return stream;
}

/** Fake api.github.com for verifyToken / runSetup. */
const fakeGitHub = (repoStatus, repoBody = {}) => async (url) => {
  if (/\/repos\/[^/]+\/[^/]+$/.test(url)) return new Response(JSON.stringify(repoBody), { status: repoStatus });
  if (url.includes('/branches/')) return new Response('{}', { status: 200 });
  if (url.includes('/actions/workflows/')) return new Response('{}', { status: 200 });
  return new Response('{}', { status: 404 });
};

describe('admin-setup: auth.json v2 encryption', () => {
  let auth;
  before(() => {
    auth = encryptAuth({ owner: 'Eva-azienda', repo: 'chere-pochette', branch: 'main', email: EMAIL, token: TOKEN, password: PASSWORD });
  });

  test('has exactly the documented format (no e-mail, no token in clear)', () => {
    assert.deepEqual(Object.keys(auth), ['v', 'owner', 'repo', 'branch', 'kdf', 'iterations', 'salt', 'iv', 'ciphertext']);
    assert.equal(auth.v, 2);
    assert.equal(auth.owner, 'Eva-azienda');
    assert.equal(auth.repo, 'chere-pochette');
    assert.equal(auth.branch, 'main');
    assert.equal(auth.kdf, 'PBKDF2-SHA256');
    assert.equal(auth.iterations, 600000);
    assert.equal(KDF_ITERATIONS, 600000);
    assert.equal(Buffer.from(auth.salt, 'base64').length, 16);
    assert.equal(Buffer.from(auth.iv, 'base64').length, 12);
    const plainLength = Buffer.byteLength(JSON.stringify({ token: TOKEN }));
    assert.equal(Buffer.from(auth.ciphertext, 'base64').length, plainLength + 16); // + GCM tag
    assert.ok(!JSON.stringify(auth).includes(TOKEN), 'token must not appear in clear text');
    assert.ok(!JSON.stringify(auth).includes('pochette@'), 'the e-mail must not be stored');
  });

  test('round trip: the right e-mail + password give the token back', () => {
    assert.deepEqual(decryptAuth(auth, EMAIL, PASSWORD), { token: TOKEN });
    assert.deepEqual(decryptAuth(auth, '  Chere.Pochette@SCCBellinzona.ch ', PASSWORD), { token: TOKEN });
  });

  test('a wrong e-mail or a wrong password is rejected', () => {
    assert.throws(() => decryptAuth(auth, EMAIL, 'not-the-password-123'), /wrong e-mail or password/);
    assert.throws(() => decryptAuth(auth, 'info@sccbellinzona.ch', PASSWORD), /wrong e-mail or password/);
    assert.throws(() => decryptAuth({ ...auth, v: 1 }, EMAIL, PASSWORD), /unsupported/);
  });

  test('a tampered file is rejected', () => {
    const bytes = Buffer.from(auth.ciphertext, 'base64');
    bytes[0] ^= 1;
    assert.throws(() => decryptAuth({ ...auth, ciphertext: bytes.toString('base64') }, EMAIL, PASSWORD), /wrong e-mail or password/);
  });

  test('salt and iv are random each time', () => {
    const a = encryptAuth({ owner: 'o', repo: 'r', email: EMAIL, token: TOKEN, password: PASSWORD, iterations: 1000 });
    const b = encryptAuth({ owner: 'o', repo: 'r', email: EMAIL, token: TOKEN, password: PASSWORD, iterations: 1000 });
    assert.notEqual(a.salt, b.salt);
    assert.notEqual(a.iv, b.iv);
  });

  test('raw WebCrypto can decrypt it with the documented key material', async () => {
    const { subtle } = globalThis.crypto;
    const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
    const material = new TextEncoder().encode(`${EMAIL}\n${PASSWORD}`);
    const baseKey = await subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey']);
    const key = await subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: b64(auth.salt), iterations: auth.iterations },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: b64(auth.iv) }, key, b64(auth.ciphertext));
    assert.deepEqual(JSON.parse(new TextDecoder().decode(plain)), { token: TOKEN });
  });
});

describe('admin-setup: input helpers', () => {
  test('suggestPassphrase gives 4 pronounceable words', () => {
    const p = suggestPassphrase();
    assert.match(p, /^([a-z]{6}-){3}[a-z]{6}$/);
    assert.notEqual(p, suggestPassphrase());
  });

  test('checkPassword: at least 12 characters, not trivial, not the e-mail', () => {
    assert.ok(checkPassword('short'));
    assert.ok(checkPassword('aaaaaaaaaaaaaaaa'));
    assert.ok(checkPassword('password12345'));
    assert.ok(checkPassword('chere.pochette2026', EMAIL));
    assert.equal(checkPassword(PASSWORD, EMAIL), null);
  });

  test('isEmail and options', () => {
    assert.equal(isEmail(EMAIL), true);
    assert.equal(isEmail(' Chere.Pochette@SCCBellinzona.ch '), true);
    assert.equal(isEmail('chere.pochette'), false);
    assert.equal(isEmail('a b@c.ch'), false);
    assert.deepEqual(
      { ...parseArgs(['--skip-verify', '--force']), out: undefined },
      { skipVerify: true, force: true, out: undefined, help: false },
    );
    assert.throws(() => parseArgs(['--nope']), /unknown option/);
    assert.equal(FALLBACK_DEFAULTS.email, EMAIL);
  });
});

describe('admin-setup: token check', () => {
  test('accepts a token with push permission; notes a private repository', async () => {
    const r = await verifyToken({ owner: 'o', repo: 'r', branch: 'main', token: 't', fetch: fakeGitHub(200, { private: true, permissions: { push: true } }) });
    assert.equal(r.ok, true);
    assert.equal(r.private, true);
    assert.match(r.notes.join(), /private/);
  });

  test('rejects a read-only token', async () => {
    const r = await verifyToken({ owner: 'o', repo: 'r', branch: 'main', token: 't', fetch: fakeGitHub(200, { permissions: { push: false } }) });
    assert.equal(r.ok, false);
    assert.match(r.problems.join(), /cannot write/);
  });

  test('rejects an invalid token, an unknown repo and a network failure', async () => {
    const r = await verifyToken({ owner: 'o', repo: 'r', branch: 'main', token: 't', fetch: fakeGitHub(401) });
    assert.equal(r.ok, false);
    assert.match(r.problems.join(), /invalid or expired/);
    const r404 = await verifyToken({ owner: 'o', repo: 'r', branch: 'main', token: 't', fetch: fakeGitHub(404) });
    assert.match(r404.problems.join(), /not found/);
    const offline = await verifyToken({ owner: 'o', repo: 'r', branch: 'main', token: 't', fetch: async () => { throw new TypeError('fetch failed'); } });
    assert.match(offline.problems.join(), /cannot reach/);
  });
});

describe('admin-setup: the whole flow (non-interactive)', () => {
  let dir;
  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'cp-admin-setup-'));
  });

  test('env vars: checks the token, writes auth.json the admin page can open', async (t) => {
    t.after(() => rm(dir, { recursive: true, force: true }));
    const out = path.join(dir, 'auth.json');
    const output = sink();
    const seen = [];
    const result = await runSetup({
      argv: ['--out', out],
      env: {
        ADMIN_OWNER: 'Eva-azienda', ADMIN_REPO: 'chere-pochette', ADMIN_BRANCH: 'main',
        ADMIN_EMAIL: ' Chere.Pochette@SCCBellinzona.ch ', ADMIN_PASSWORD: PASSWORD, ADMIN_TOKEN: TOKEN,
      },
      input: Readable.from([]),
      output,
      fetch: async (url, init) => {
        seen.push([url, init.headers.Authorization]);
        return fakeGitHub(200, { private: true, permissions: { push: true } })(url);
      },
    });
    assert.equal(result.out, out);
    assert.equal(seen[0][0], 'https://api.github.com/repos/Eva-azienda/chere-pochette');
    assert.equal(seen[0][1], `Bearer ${TOKEN}`);
    const file = await readFile(out, 'utf8');
    assert.ok(file.endsWith('}\n'));
    const auth = JSON.parse(file);
    assert.equal(auth.v, 2);
    assert.equal(auth.owner, 'Eva-azienda');
    assert.ok(!file.includes(TOKEN) && !file.includes(PASSWORD) && !file.toLowerCase().includes('pochette@'));
    assert.deepEqual(await browser.decryptAuth(auth, EMAIL, PASSWORD), { owner: 'Eva-azienda', repo: 'chere-pochette', branch: 'main', token: TOKEN });
    await assert.rejects(() => browser.decryptAuth(auth, 'other@sccbellinzona.ch', PASSWORD), /E-mail o password non corretti/);
    const text = output.text();
    assert.match(text, /Hostpoint/, 'recommends a unique passphrase');
    assert.match(text, /npm run dev/);
    assert.match(text, /git add/);
    assert.ok(!text.includes(PASSWORD) && !text.includes(TOKEN), 'secrets are never printed');

    // existing file: refused without --force (stdin has no answer), overwritten with --force
    const env = { ADMIN_EMAIL: EMAIL, ADMIN_PASSWORD: PASSWORD, ADMIN_TOKEN: TOKEN, ADMIN_OWNER: 'o', ADMIN_REPO: 'r', ADMIN_BRANCH: 'main' };
    await assert.rejects(
      () => runSetup({ argv: ['--out', out, '--skip-verify'], env, input: Readable.from([]), output: sink(), rootDir: dir }),
      /nothing written/,
    );
    await runSetup({ argv: ['--out', out, '--skip-verify', '--force'], env, input: Readable.from([]), output: sink(), rootDir: dir });
    assert.equal(JSON.parse(await readFile(out, 'utf8')).owner, 'o');
  });

  test('answers piped on stdin (Enter = default, password twice)', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cp-admin-root-'));
    try {
      const out = path.join(root, 'auth.json');
      // owner, repo, branch → Enter = defaults; e-mail → Enter = default; password ×2; token
      const answers = ['', '', '', '', PASSWORD, PASSWORD, TOKEN].map((l) => `${l}\n`);
      const output = sink();
      await runSetup({ argv: ['--out', out, '--skip-verify'], env: {}, input: Readable.from(answers), output, rootDir: root });
      const auth = JSON.parse(await readFile(out, 'utf8'));
      assert.equal(auth.owner, FALLBACK_DEFAULTS.owner);
      assert.equal(auth.repo, FALLBACK_DEFAULTS.repo);
      assert.equal((await browser.decryptAuth(auth, EMAIL, PASSWORD)).token, TOKEN);
      assert.ok(!output.text().includes(PASSWORD));

      // two different passwords → stops, nothing written
      const out2 = path.join(root, 'auth2.json');
      const bad = ['', '', '', '', PASSWORD, `${PASSWORD}x`, TOKEN].map((l) => `${l}\n`);
      await assert.rejects(
        () => runSetup({ argv: ['--out', out2, '--skip-verify'], env: {}, input: Readable.from(bad), output: sink(), rootDir: root }),
        /differ/,
      );
      // too short
      await assert.rejects(
        () => runSetup({ argv: ['--out', out2, '--skip-verify'], env: { ADMIN_PASSWORD: 'short' }, input: Readable.from(['\n\n\n\n']), output: sink(), rootDir: root }),
        /at least 12/,
      );
      // read-only token → stops
      await assert.rejects(
        () => runSetup({
          argv: ['--out', out2], env: { ADMIN_EMAIL: EMAIL, ADMIN_PASSWORD: PASSWORD, ADMIN_TOKEN: TOKEN, ADMIN_OWNER: 'o', ADMIN_REPO: 'r', ADMIN_BRANCH: 'main' },
          input: Readable.from([]), output: sink(), rootDir: root, fetch: fakeGitHub(200, { permissions: { push: false } }),
        }),
        /token check failed/,
      );
      await assert.rejects(() => readFile(out2), /ENOENT/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('CLI: `node scripts/admin-setup.mjs` with env vars and no terminal', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cp-admin-cli-'));
    try {
      const out = path.join(root, 'auth.json');
      const env = {
        ...process.env,
        ADMIN_OWNER: 'Eva-azienda', ADMIN_REPO: 'chere-pochette', ADMIN_BRANCH: 'main',
        ADMIN_EMAIL: EMAIL, ADMIN_PASSWORD: PASSWORD, ADMIN_TOKEN: TOKEN,
      };
      const { stdout } = await new Promise((resolve, reject) => {
        const child = execFile(process.execPath, [SCRIPT, '--skip-verify', '--out', out], { env, timeout: 60000 }, (err, so, se) =>
          err ? reject(Object.assign(err, { stdout: so, stderr: se })) : resolve({ stdout: so, stderr: se }));
        child.stdin.end();
      });
      assert.match(stdout, /Written:/);
      const auth = JSON.parse(await readFile(out, 'utf8'));
      assert.equal((await browser.decryptAuth(auth, EMAIL, PASSWORD)).token, TOKEN);

      const failed = await new Promise((resolve) => {
        const child = execFile(process.execPath, [SCRIPT, '--skip-verify', '--out', path.join(root, 'x.json')],
          { env: { ...env, ADMIN_PASSWORD: 'too-short' }, timeout: 60000 }, (err, so, se) => resolve({ code: err ? err.code : 0, stderr: se }));
        child.stdin.end();
      });
      assert.equal(failed.code, 1);
      assert.match(failed.stderr, /Admin setup stopped: ADMIN_PASSWORD: at least 12/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
