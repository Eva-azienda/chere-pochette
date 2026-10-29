// auth.json compatibility: the file written by scripts/admin-setup.mjs (node:crypto) must open in
// the admin page (public/admin/js/crypto.js, WebCrypto) and vice versa. If one side changes the
// format (iterations, salt/iv length, tag position, key material…) these tests fail.
//
// Format v2 (admin-setup.mjs header):
//   { v: 2, owner, repo, branch, kdf: "PBKDF2-SHA256", iterations: 600000,
//     salt: base64(16 bytes), iv: base64(12 bytes), ciphertext: base64(AES-256-GCM ciphertext || 16-byte tag) }
//   key = PBKDF2-SHA256(UTF-8 of email.trim().toLowerCase() + "\n" + password, salt, iterations, 32 bytes)
//   plaintext = UTF-8 JSON {"token": "..."}; the e-mail is NOT stored in the file.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as setup from '../admin-setup.mjs';
import * as browser from '../../public/admin/js/crypto.js';

// Obviously fake (a value shaped like a real GitHub token would trip GitHub push protection).
const TOKEN = 'test-token-not-a-real-secret';
const EMAIL = 'chere.pochette@sccbellinzona.ch';
const META = { owner: 'Eva-azienda', repo: 'chere-pochette', branch: 'main' };
const KEYS = ['v', 'owner', 'repo', 'branch', 'kdf', 'iterations', 'salt', 'iv', 'ciphertext'];
const FAST = 1000; // iterations for the tests that do not check the default

/** What really happens: the object is written to auth.json and the page fetches + parses it. */
const viaFile = (auth) => JSON.parse(JSON.stringify(auth, null, 2) + '\n');

function assertFormat(auth) {
  assert.deepEqual(Object.keys(auth), KEYS);
  assert.equal(auth.v, 2);
  assert.equal(auth.kdf, 'PBKDF2-SHA256');
  assert.equal(Buffer.from(auth.salt, 'base64').length, 16);
  assert.equal(Buffer.from(auth.iv, 'base64').length, 12);
  assert.equal(Buffer.from(auth.ciphertext, 'base64').length, Buffer.byteLength(JSON.stringify({ token: TOKEN })) + 16);
  const text = JSON.stringify(auth);
  assert.ok(!text.includes(TOKEN), 'the token must never be stored in clear text');
  assert.ok(!text.toLowerCase().includes('sccbellinzona'), 'the e-mail must not be stored');
}

describe('auth.json v2: admin-setup.mjs ⇄ admin page (crypto.js)', () => {
  test('both sides use the same constants and key material', () => {
    assert.equal(setup.KDF, browser.AUTH_KDF);
    assert.equal(setup.KDF_ITERATIONS, browser.DEFAULT_ITERATIONS);
    assert.equal(setup.KDF_ITERATIONS, 600000);
    assert.equal(setup.AUTH_VERSION, 2);
    assert.equal(browser.AUTH_VERSION, 2);
    assert.equal(browser.keyMaterial(' Chere.Pochette@SCCBellinzona.CH ', 'pw x'), 'chere.pochette@sccbellinzona.ch\npw x');
    assert.equal(setup.keyMaterial(' Chere.Pochette@SCCBellinzona.CH ', 'pw x'), browser.keyMaterial(' Chere.Pochette@SCCBellinzona.CH ', 'pw x'));
  });

  test('setup encrypts → the admin page decrypts (default 600 000 iterations)', async () => {
    const password = 'toravi-memuso-bilena-carepo';
    const auth = setup.encryptAuth({ ...META, email: EMAIL, token: TOKEN, password });
    assertFormat(auth);
    assert.equal(auth.iterations, 600000);
    const opened = await browser.decryptAuth(viaFile(auth), EMAIL, password);
    assert.deepEqual(opened, { ...META, token: TOKEN });
  });

  test('the admin page encrypts → setup decrypts (same format, same key order)', async () => {
    const password = 'Pochette carry-on 2026!';
    const auth = await browser.encryptAuth({ token: TOKEN }, EMAIL, password, { ...META, iterations: FAST });
    assertFormat(auth);
    assert.deepEqual(setup.decryptAuth(viaFile(auth), EMAIL, password), { token: TOKEN });
  });

  test('the e-mail is case- and space-insensitive (phones capitalise the first letter)', async () => {
    const auth = setup.encryptAuth({ ...META, email: EMAIL, token: TOKEN, password: 'una-frase-lunga-sicura', iterations: FAST });
    for (const typed of ['Chere.pochette@sccbellinzona.ch', ' CHERE.POCHETTE@SCCBELLINZONA.CH ', 'chere.pochette@sccbellinzona.ch\t']) {
      assert.equal((await browser.decryptAuth(viaFile(auth), typed, 'una-frase-lunga-sicura')).token, TOKEN, typed);
    }
  });

  test('non-ASCII passwords are encoded the same way on both sides (UTF-8, no normalisation)', async () => {
    const password = 'Borsa è bella – Ünïcode ✓ 🧶';
    const fromSetup = setup.encryptAuth({ ...META, email: EMAIL, token: TOKEN, password, iterations: FAST });
    assert.equal((await browser.decryptAuth(viaFile(fromSetup), EMAIL, password)).token, TOKEN);
    const fromBrowser = await browser.encryptAuth({ token: TOKEN }, EMAIL, password, { ...META, iterations: FAST });
    assert.equal(setup.decryptAuth(viaFile(fromBrowser), EMAIL, password).token, TOKEN);
  });

  test('wrong e-mail OR wrong password → the same message "E-mail o password non corretti"', async () => {
    const auth = setup.encryptAuth({ ...META, email: EMAIL, token: TOKEN, password: 'the-right-passphrase', iterations: FAST });
    const cases = [
      ['someone.else@sccbellinzona.ch', 'the-right-passphrase'],
      [EMAIL, 'the-wrong-passphrase'],
      [EMAIL, 'The-right-passphrase'], // the password IS case-sensitive
      [EMAIL, 'the-right-passphrase '], // and not trimmed
      ['', 'the-right-passphrase'],
      [EMAIL, ''],
    ];
    for (const [email, password] of cases) {
      await assert.rejects(() => browser.decryptAuth(viaFile(auth), email, password), (err) => {
        assert.ok(err instanceof browser.WrongCredentialsError);
        assert.equal(err.message, 'E-mail o password non corretti');
        assert.equal(err.code, 'BAD_CREDENTIALS');
        return true;
      }, `${email} / ${password}`);
    }
    assert.throws(() => setup.decryptAuth(viaFile(auth), 'x@y.ch', 'the-right-passphrase'), /wrong e-mail or password/);
    assert.throws(() => setup.decryptAuth(viaFile(auth), EMAIL, 'nope-nope-nope'), /wrong e-mail or password/);
  });

  test('a damaged file is rejected (GCM tag check), never half-decrypted; v1 files are refused', async () => {
    const auth = setup.encryptAuth({ ...META, email: EMAIL, token: TOKEN, password: 'the-right-passphrase', iterations: FAST });
    const bytes = Buffer.from(auth.ciphertext, 'base64');
    bytes[bytes.length - 1] ^= 1; // flip one bit of the tag
    const damaged = { ...auth, ciphertext: bytes.toString('base64') };
    await assert.rejects(() => browser.decryptAuth(damaged, EMAIL, 'the-right-passphrase'), browser.WrongCredentialsError);
    await assert.rejects(() => browser.decryptAuth({ ...auth, v: 1 }, EMAIL, 'the-right-passphrase'), /non è valido/);
    assert.equal(browser.isAuthConfig(auth), true);
    assert.equal(browser.isAuthConfig({ ...auth, v: 1 }), false);
    assert.equal(browser.isAuthConfig({ ...auth, owner: '' }), false);
    assert.equal(browser.isAuthConfig(null), false);
  });

  test('base64 helpers of the admin page match Node (also for big photos)', () => {
    const big = Uint8Array.from({ length: 300_001 }, (_, i) => (i * 7 + (i >> 8)) % 256);
    assert.equal(browser.bytesToBase64(big), Buffer.from(big).toString('base64'));
    assert.deepEqual(browser.base64ToBytes(Buffer.from(big).toString('base64')), big);
  });
});
