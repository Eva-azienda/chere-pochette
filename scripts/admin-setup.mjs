#!/usr/bin/env node
/**
 * Admin setup — creates public/admin/auth.json, the encrypted access file the admin page
 * (/admin/) needs to save products to GitHub. There is ONE admin, who logs in with
 * e-mail + password.
 *
 *   npm run admin:setup                      interactive (asks everything; hidden input for secrets)
 *   npm run admin:setup -- --skip-verify     do not check the token against the GitHub API
 *   npm run admin:setup -- --force           overwrite an existing auth.json without asking
 *   npm run admin:setup -- --out <file>      write somewhere else (default public/admin/auth.json)
 *
 * Non-interactive use (CI, tests): every answer can come from an environment variable —
 *   ADMIN_OWNER, ADMIN_REPO, ADMIN_BRANCH, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_TOKEN.
 * When stdin is not a terminal, missing answers are read line by line from stdin.
 *
 * How it works: the GitHub token is encrypted with AES-256-GCM. The key is derived with
 * PBKDF2-SHA256 (600 000 iterations, random 16-byte salt) from the admin's e-mail and password.
 * The browser decrypts it with WebCrypto after the login. The e-mail is NOT stored in the file.
 * auth.json may therefore be published, but its security rests on the password (the shop's
 * e-mail address is public): use a long passphrase that is not used anywhere else.
 *
 * auth.json format v2 (public/admin/js/crypto.js relies on it — keep both in sync):
 *   { "v": 2, "owner", "repo", "branch", "kdf": "PBKDF2-SHA256", "iterations": 600000,
 *     "salt": base64(16 bytes), "iv": base64(12 bytes),
 *     "ciphertext": base64(AES-256-GCM ciphertext || 16-byte auth tag) }
 *   normalizedEmail = email.trim().toLowerCase()
 *   key       = PBKDF2-SHA256(UTF-8 of normalizedEmail + "\n" + password, salt, iterations, 32 bytes)
 *   plaintext = UTF-8 JSON {"token": "..."}
 *
 * Only Node.js built-ins are used.
 */
import { pbkdf2Sync, randomBytes, randomInt, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';

export const AUTH_VERSION = 2;
export const KDF = 'PBKDF2-SHA256';
export const KDF_ITERATIONS = 600_000;
export const MIN_PASSWORD_LENGTH = 12;

/** Used when src/data/site.json cannot be read. */
export const FALLBACK_DEFAULTS = {
  owner: 'Eva-azienda',
  repo: 'chere-pochette',
  branch: 'main',
  email: 'chere.pochette@sccbellinzona.ch',
};

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = path.join(ROOT_DIR, 'public', 'admin', 'auth.json');

// ─── Crypto (exported for tests; byte-compatible with public/admin/js/crypto.js) ──────────────

/** " Chere.Pochette@SCCBellinzona.ch " → "chere.pochette@sccbellinzona.ch" */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/** The secret the key is derived from: normalized e-mail, a line feed, the password (as typed). */
export function keyMaterial(email, password) {
  return `${normalizeEmail(email)}\n${String(password ?? '')}`;
}

/** PBKDF2-SHA256 → 32-byte AES key (UTF-8 bytes, exactly like TextEncoder in the browser). */
export function deriveKey(email, password, salt, iterations = KDF_ITERATIONS) {
  return pbkdf2Sync(Buffer.from(keyMaterial(email, password), 'utf8'), salt, iterations, 32, 'sha256');
}

/**
 * Encrypts the token. Returns the auth.json object (keys in the documented order).
 * `salt` / `iv` can be passed in for tests; normally they are random.
 */
export function encryptAuth({ owner, repo, branch = 'main', email, password, token, iterations = KDF_ITERATIONS, salt, iv }) {
  if (!token) throw new Error('token is required');
  if (!normalizeEmail(email)) throw new Error('e-mail is required');
  if (!password) throw new Error('password is required');
  salt ??= randomBytes(16);
  iv ??= randomBytes(12);
  const key = deriveKey(email, password, salt, iterations);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify({ token }), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return {
    v: AUTH_VERSION,
    owner,
    repo,
    branch,
    kdf: KDF,
    iterations,
    salt: Buffer.from(salt).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

/** Decrypts an auth.json object with e-mail + password. Returns { token }. Throws on wrong credentials. */
export function decryptAuth(auth, email, password) {
  if (!auth || auth.v !== AUTH_VERSION || auth.kdf !== KDF) throw new Error('unsupported auth.json format');
  const salt = Buffer.from(auth.salt, 'base64');
  const iv = Buffer.from(auth.iv, 'base64');
  const data = Buffer.from(auth.ciphertext, 'base64');
  if (data.length < 17) throw new Error('auth.json ciphertext is too short');
  const key = deriveKey(email, password, salt, auth.iterations);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(data.subarray(data.length - 16));
  try {
    const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  } catch {
    throw new Error('wrong e-mail or password (or damaged auth.json)');
  }
}

/**
 * Suggests a passphrase of 4 pronounceable made-up words, e.g. "toravi-memuso-bilena-carepo".
 * Each word = 3 random syllables out of 70 → ≈18 bits; 4 words ≈ 73 bits of entropy.
 */
export function suggestPassphrase(words = 4) {
  const consonants = 'bcdfglmnprstvz';
  const vowels = 'aeiou';
  const syllable = () => consonants[randomInt(consonants.length)] + vowels[randomInt(vowels.length)];
  return Array.from({ length: words }, () => syllable() + syllable() + syllable()).join('-');
}

/** Basic password policy. Returns an error message or null. */
export function checkPassword(pw, email = '') {
  if (pw.length < MIN_PASSWORD_LENGTH) return `at least ${MIN_PASSWORD_LENGTH} characters, please`;
  if (/^(.)\1+$/.test(pw)) return 'that is just one repeated character';
  if (/^(password|passwort|12345|qwert)/i.test(pw)) return 'too easy to guess';
  const local = normalizeEmail(email).split('@')[0];
  if (local.length >= 4 && pw.toLowerCase().includes(local)) return 'do not use (part of) the e-mail address in the password';
  return null;
}

/** Very small e-mail sanity check (the login only compares, it never sends e-mails). */
export function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

// ─── GitHub check ────────────────────────────────────────────────────────────

/**
 * Checks the token against the GitHub API. Returns { ok, problems[], notes[], private }.
 * Requires push access to the repo (fine-grained token: Contents → Read and write).
 */
export async function verifyToken({ owner, repo, branch, token, fetch = globalThis.fetch }) {
  const gh = (p) => fetch(`https://api.github.com${p}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'chere-pochette-admin-setup',
    },
  });
  const problems = [];
  const notes = [];
  const enc = encodeURIComponent;

  let repoRes;
  try {
    repoRes = await gh(`/repos/${enc(owner)}/${enc(repo)}`);
  } catch (err) {
    return { ok: false, problems: [`cannot reach api.github.com (${err.message}) — check the connection or use --skip-verify`], notes };
  }
  if (repoRes.status === 401) return { ok: false, problems: ['the token is invalid or expired'], notes };
  if (repoRes.status === 404 || repoRes.status === 403) {
    return { ok: false, problems: [`repository ${owner}/${repo} not found, or the token has no access to it`], notes };
  }
  if (!repoRes.ok) return { ok: false, problems: [`GitHub answered HTTP ${repoRes.status}`], notes };
  const info = await repoRes.json();
  if (info.permissions?.push !== true) {
    problems.push('the token cannot write to the repository (needs "Contents: Read and write")');
  }

  const branchRes = await gh(`/repos/${enc(owner)}/${enc(repo)}/branches/${enc(branch)}`);
  if (branchRes.status === 404) problems.push(`branch "${branch}" does not exist`);

  // The admin's "Aggiorna vendite ora" button starts the Deploy workflow → needs "Actions: Read and write".
  const wfRes = await gh(`/repos/${enc(owner)}/${enc(repo)}/actions/workflows/deploy.yml`);
  if (wfRes.status === 403) notes.push('the token cannot access GitHub Actions (add "Actions: Read and write" for the "Aggiorna vendite ora" button)');
  else if (wfRes.status === 404) notes.push('workflow deploy.yml not found yet (fine if it is not pushed yet)');

  if (info.private === true) {
    notes.push('the repository is private: the admin page loads photos through the GitHub API (fine); GitHub Pages on a free account needs a public repository');
  }
  return { ok: problems.length === 0, problems, notes, private: info.private === true };
}

// ─── Terminal input ──────────────────────────────────────────────────────────

/** Removes terminal escape sequences (arrow keys, bracketed paste markers…) from raw input. */
const ESCAPES = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b[O[][A-Za-z~]?|\u001b./g;

/**
 * Asks questions on a terminal (visible: readline; hidden: raw mode, nothing is echoed)
 * or, when stdin is not a terminal, reads the answers line by line from stdin.
 */
export function createPrompter({ input = process.stdin, output = process.stdout } = {}) {
  const interactive = Boolean(input.isTTY) && typeof input.setRawMode === 'function';
  const abort = () => {
    output.write('\nAborted, nothing written.\n');
    process.exit(130);
  };

  if (!interactive) {
    let lines = null; // created on first use: with only env vars, stdin is never touched
    let rl = null;
    const next = async (question) => {
      if (!lines) {
        rl = readline.createInterface({ input, terminal: false });
        lines = rl[Symbol.asyncIterator]();
      }
      const { value, done } = await lines.next();
      if (done) throw new Error(`no answer for "${question}" (stdin ended; set the ADMIN_* environment variables)`);
      return value;
    };
    return {
      interactive,
      async ask(question, fallback = '') {
        output.write(fallback ? `${question} [${fallback}]: ` : `${question}: `);
        const value = (await next(question)).trim();
        output.write(`${value}\n`);
        return value || fallback;
      },
      async askHidden(question) {
        output.write(`${question}: `);
        const value = await next(question);
        output.write('(hidden)\n');
        return value;
      },
      close() {
        if (rl) rl.close();
      },
    };
  }

  return {
    interactive,
    ask(question, fallback = '') {
      return new Promise((resolve) => {
        const rl = readline.createInterface({ input, output, terminal: true });
        rl.on('SIGINT', abort);
        rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `, (answer) => {
          rl.close();
          resolve(answer.trim() || fallback);
        });
      });
    },
    /** Raw mode: every key press arrives here and nothing is echoed (works in macOS Terminal). */
    askHidden(question) {
      return new Promise((resolve, reject) => {
        output.write(`${question}: `);
        const decoder = new StringDecoder('utf8');
        const wasRaw = Boolean(input.isRaw);
        let value = '';
        const finish = (err) => {
          input.removeListener('data', onData);
          input.setRawMode(wasRaw);
          input.pause();
          output.write('\n');
          if (err) reject(err);
          else resolve(value);
        };
        const onData = (chunk) => {
          const text = decoder.write(chunk).replace(ESCAPES, '');
          for (const ch of text) {
            if (ch === '\r' || ch === '\n') return finish();
            if (ch === '\u0003') {
              input.setRawMode(wasRaw);
              return abort(); // Ctrl-C
            }
            if (ch === '\u0004') {
              if (!value) return finish(new Error('input ended')); // Ctrl-D on an empty line
              continue;
            }
            if (ch === '\u007f' || ch === '\b') {
              value = Array.from(value).slice(0, -1).join(''); // backspace
              continue;
            }
            if (ch === '\u0015') {
              value = ''; // Ctrl-U: clear the line
              continue;
            }
            if (ch < ' ') continue; // other control characters
            value += ch;
          }
        };
        input.setRawMode(true);
        input.on('data', onData);
        input.resume();
      });
    },
    close() {},
  };
}

// ─── Setup flow ──────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = { skipVerify: false, force: false, out: DEFAULT_OUT, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--skip-verify') args.skipVerify = true;
    else if (a === '--force') args.force = true;
    else if (a === '--out') args.out = path.resolve(argv[++i] ?? '');
    else if (a === '-h' || a === '--help') args.help = true;
    else throw new Error(`unknown option ${a}`);
  }
  return args;
}

async function readSiteDefaults(rootDir) {
  try {
    const site = JSON.parse(await readFile(path.join(rootDir, 'src', 'data', 'site.json'), 'utf8'));
    return {
      owner: site.github?.owner || FALLBACK_DEFAULTS.owner,
      repo: site.github?.repo || FALLBACK_DEFAULTS.repo,
      branch: site.github?.branch || FALLBACK_DEFAULTS.branch,
      email: FALLBACK_DEFAULTS.email,
    };
  } catch {
    return { ...FALLBACK_DEFAULTS };
  }
}

const HELP = `Usage: npm run admin:setup [-- --skip-verify] [-- --force] [-- --out <file>]

Creates public/admin/auth.json (one admin: e-mail + password).
Non-interactive: set ADMIN_OWNER, ADMIN_REPO, ADMIN_BRANCH, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_TOKEN.`;

/**
 * The whole interactive setup. Injectable for tests.
 * @returns {Promise<{out: string, auth: object}|null>}
 */
export async function runSetup({
  argv = process.argv.slice(2),
  env = process.env,
  input = process.stdin,
  output = process.stdout,
  fetch = globalThis.fetch,
  rootDir = ROOT_DIR,
} = {}) {
  const args = parseArgs(argv);
  const say = (line = '') => output.write(`${line}\n`);
  if (args.help) {
    say(HELP);
    return null;
  }
  const defaults = await readSiteDefaults(rootDir);
  const prompt = createPrompter({ input, output });
  const fromEnv = (name) => (typeof env[name] === 'string' && env[name] !== '' ? env[name] : null);

  try {
    say('\nChère Pochette – admin setup');
    say('Creates the encrypted access file for the /admin/ page (one admin: e-mail + password).\n');

    // 1. Repository
    const owner = fromEnv('ADMIN_OWNER')?.trim() ?? (await prompt.ask('GitHub owner (account or organisation)', defaults.owner));
    const repo = fromEnv('ADMIN_REPO')?.trim() ?? (await prompt.ask('GitHub repository name', defaults.repo));
    const branch = fromEnv('ADMIN_BRANCH')?.trim() ?? (await prompt.ask('Branch', defaults.branch));
    if (!owner || !repo || !branch) throw new Error('owner, repository and branch are required');

    // 2. Admin e-mail
    let email = fromEnv('ADMIN_EMAIL');
    if (email != null && !isEmail(email)) throw new Error('ADMIN_EMAIL is not a valid e-mail address');
    while (email == null) {
      const answer = await prompt.ask('\nAdmin e-mail (used to log in)', defaults.email);
      if (isEmail(answer)) email = answer;
      else if (!prompt.interactive) throw new Error(`"${answer}" is not a valid e-mail address`);
      else say('  ✗ that does not look like an e-mail address, try again');
    }
    email = normalizeEmail(email);

    // 3. Password (twice)
    say(`\nNow choose the admin password (min. ${MIN_PASSWORD_LENGTH} characters).`);
    say('Use a UNIQUE passphrase that you do not use anywhere else — in particular NOT your');
    say('GitHub, Zahls or Hostpoint password. The e-mail is public, so this password alone protects the shop.');
    say(`Tip: 4 words are strong and easy to type on a phone, e.g.  ${suggestPassphrase()}`);
    let password = fromEnv('ADMIN_PASSWORD');
    if (password != null) {
      const problem = checkPassword(password, email);
      if (problem) throw new Error(`ADMIN_PASSWORD: ${problem}`);
      say('Password: from ADMIN_PASSWORD');
    }
    while (password == null) {
      const first = await prompt.askHidden('Admin password (hidden, then Enter)');
      const problem = checkPassword(first, email);
      if (problem) {
        if (!prompt.interactive) throw new Error(`password: ${problem}`);
        say(`  ✗ ${problem}`);
        continue;
      }
      const again = await prompt.askHidden('Repeat the password');
      if (again !== first) {
        if (!prompt.interactive) throw new Error('the two passwords differ');
        say('  ✗ the two passwords differ, try again');
        continue;
      }
      password = first;
    }

    // 4. GitHub token (+ check)
    say('\nFine-grained token: github.com → Settings → Developer settings → Personal access tokens →');
    say(`Fine-grained tokens → only repository ${owner}/${repo} → permissions "Contents" and "Actions": Read and write.`);
    let token = fromEnv('ADMIN_TOKEN')?.trim() ?? null;
    for (let attempt = 1; ; attempt++) {
      if (token == null) token = (await prompt.askHidden('Paste the GitHub token (hidden, then Enter)')).trim();
      if (!token) throw new Error('no token given');
      if (/\s/.test(token)) throw new Error('the token contains spaces — copy it again from GitHub');
      if (args.skipVerify) {
        say('Skipping the token check (--skip-verify).');
        break;
      }
      output.write('Checking the token with GitHub… ');
      const result = await verifyToken({ owner, repo, branch, token, fetch });
      say(result.ok ? 'OK' : 'PROBLEM');
      for (const n of result.notes) say(`  note: ${n}`);
      if (result.ok) break;
      for (const p of result.problems) say(`  ✗ ${p}`);
      if (!prompt.interactive || fromEnv('ADMIN_TOKEN') || attempt >= 3) {
        throw new Error('token check failed (fix it, or re-run with --skip-verify)');
      }
      say('Try again with another token (Ctrl-C to stop).');
      token = null;
    }

    // 5. Write auth.json
    const exists = await access(args.out).then(() => true, () => false);
    if (exists && !args.force) {
      let answer = '';
      try {
        answer = await prompt.ask(`\n${path.relative(rootDir, args.out)} already exists. Overwrite? (y/N)`);
      } catch {
        answer = '';
      }
      if (!/^y(es)?$/i.test(answer)) throw new Error('nothing written (use --force to overwrite)');
    }

    output.write('\nEncrypting (takes a second)… ');
    const auth = encryptAuth({ owner, repo, branch, email, password, token });
    decryptAuth(auth, email, password); // self-check
    await mkdir(path.dirname(args.out), { recursive: true });
    await writeFile(args.out, JSON.stringify(auth, null, 2) + '\n');
    say('done.\n');

    const rel = path.relative(rootDir, args.out) || args.out;
    say(`Written: ${rel}  (owner ${owner}, repo ${repo}, branch ${branch}; the e-mail and password are NOT stored)\n`);
    say('Next steps:');
    // `astro dev` serves files from public/ only by their full name: /admin/ alone gives a 404 there.
    say('  1. Use it on this computer:  npm run dev   → open http://localhost:4321/admin/index.html');
    say(`     Log in with ${email} and the password you just chose. Every save goes to the real repository.`);
    say('  2. Use it on the phone (published site): commit and push the file —');
    say(`       git add ${rel} && git commit -m "chore(admin): admin access" && git push`);
    say('     After the deploy (about 2 minutes) open https://cherepochette.ch/admin/ on the phone');
    say('     (or the GitHub Pages address until the domain is connected) and log in.');
    say('  3. Never write the password into a file, chat or e-mail. To change it, run this script again.');
    say('  4. Fine-grained tokens expire: create a new token and run this script again before that.');
    say('  5. If the token leaks: revoke it on GitHub immediately, create a new one, run this script again.');
    return { out: args.out, auth };
  } finally {
    prompt.close();
  }
}

/** True when this file is run directly, false when imported by tests. */
function isMainModule() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runSetup().catch((err) => {
    console.error(`\nAdmin setup stopped: ${err.message}`);
    process.exitCode = 1;
  });
}
