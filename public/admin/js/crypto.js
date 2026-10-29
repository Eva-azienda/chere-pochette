/**
 * Admin login (one admin, e-mail + password): encryption of public/admin/auth.json.
 *
 * auth.json is deployed with the site, so the GitHub token inside it is encrypted with a key
 * derived from the admin's e-mail AND password. The e-mail itself is NOT stored in the file.
 *
 *   {"v":2,"owner":"…","repo":"…","branch":"main","kdf":"PBKDF2-SHA256","iterations":600000,
 *    "salt":"<base64 16 bytes>","iv":"<base64 12 bytes>","ciphertext":"<base64 AES-256-GCM, 16-byte tag appended>"}
 *
 *   normalizedEmail = email.trim().toLowerCase()
 *   key             = PBKDF2-SHA256(UTF-8 of normalizedEmail + "\n" + password, salt, iterations) → 256-bit AES-GCM key
 *   plaintext       = UTF-8 JSON {"token":"<github token>"}
 *
 * A wrong e-mail or a wrong password give the same error ("E-mail o password non corretti"):
 * the AES-GCM tag check fails in both cases, so nobody can tell which of the two was wrong.
 *
 * scripts/admin-setup.mjs writes the same format with node:crypto (tests check both directions).
 * Uses only globalThis.crypto.subtle (WebCrypto), so this file also runs in Node 22.
 */

export const AUTH_VERSION = 2;
export const AUTH_KDF = 'PBKDF2-SHA256';
export const DEFAULT_ITERATIONS = 600000;
export const WRONG_CREDENTIALS_MESSAGE = 'E-mail o password non corretti';

/** Thrown by decryptAuth when e-mail and password do not open auth.json. */
export class WrongCredentialsError extends Error {
  constructor() {
    super(WRONG_CREDENTIALS_MESSAGE);
    this.name = 'WrongCredentialsError';
    this.code = 'BAD_CREDENTIALS';
  }
}

/** " Chere.Pochette@SCCBellinzona.ch " → "chere.pochette@sccbellinzona.ch" */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/** The secret the key is derived from: normalized e-mail, a line feed, the password (as typed). */
export function keyMaterial(email, password) {
  return `${normalizeEmail(email)}\n${String(password ?? '')}`;
}

/* ---------- base64 helpers (also used to upload images to GitHub) ---------- */

/** Uint8Array → base64 string (chunked, so large images do not overflow the call stack). */
export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** base64 string → Uint8Array. */
export function base64ToBytes(base64) {
  const binary = atob(String(base64).trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ---------- key derivation ---------- */

function subtle() {
  const s = globalThis.crypto && globalThis.crypto.subtle;
  if (!s) throw new Error('Il browser non supporta la crittografia (serve una pagina https o localhost).');
  return s;
}

async function deriveKey(email, password, salt, iterations, usages) {
  const baseKey = await subtle().importKey(
    'raw',
    new TextEncoder().encode(keyMaterial(email, password)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

/* ---------- public API ---------- */

/**
 * Builds the content of auth.json (used by tests; the real file is written by admin-setup.mjs).
 * @param {{token: string}} payload  what to protect (the GitHub token)
 * @param {string} email             the admin's e-mail (not stored)
 * @param {string} password          the admin's password
 * @param {{owner?: string, repo?: string, branch?: string, iterations?: number}} [meta]
 * @returns {Promise<object>} the auth.json object (JSON.stringify it to write the file)
 */
export async function encryptAuth(payload, email, password, meta = {}) {
  if (!payload || typeof payload.token !== 'string' || !payload.token) {
    throw new Error('encryptAuth: payload.token mancante');
  }
  if (!normalizeEmail(email)) throw new Error('encryptAuth: e-mail mancante');
  if (!password) throw new Error('encryptAuth: password mancante');
  const iterations = meta.iterations || DEFAULT_ITERATIONS;
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(email, password, salt, iterations, ['encrypt']);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return {
    v: AUTH_VERSION,
    owner: meta.owner || '',
    repo: meta.repo || '',
    branch: meta.branch || 'main',
    kdf: AUTH_KDF,
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };
}

/** True when `json` looks like an auth.json this page can open (format v2). */
export function isAuthConfig(json) {
  return Boolean(
    json && json.v === AUTH_VERSION && json.kdf === AUTH_KDF && json.owner && json.repo &&
      json.salt && json.iv && json.ciphertext,
  );
}

/**
 * Opens auth.json with the admin's e-mail and password.
 * @param {object} authJson  parsed auth.json
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{owner: string, repo: string, branch: string, token: string}>}
 * @throws {WrongCredentialsError} when e-mail or password are wrong ("E-mail o password non corretti")
 */
export async function decryptAuth(authJson, email, password) {
  const a = authJson || {};
  if (!isAuthConfig(a)) {
    throw new Error('Il file auth.json non è valido: esegui di nuovo «npm run admin:setup».');
  }
  if (!normalizeEmail(email) || !password) throw new WrongCredentialsError();
  const iterations = Number(a.iterations) || DEFAULT_ITERATIONS;
  const key = await deriveKey(email, password, base64ToBytes(a.salt), iterations, ['decrypt']);
  let plaintext;
  try {
    plaintext = await subtle().decrypt({ name: 'AES-GCM', iv: base64ToBytes(a.iv) }, key, base64ToBytes(a.ciphertext));
  } catch {
    // AES-GCM authentication failed: wrong e-mail or password (or a corrupted file).
    throw new WrongCredentialsError();
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('Il contenuto di auth.json non è leggibile.');
  }
  if (!payload || typeof payload.token !== 'string' || !payload.token) {
    throw new Error('auth.json non contiene un token.');
  }
  return { owner: a.owner, repo: a.repo, branch: a.branch || 'main', token: payload.token };
}
