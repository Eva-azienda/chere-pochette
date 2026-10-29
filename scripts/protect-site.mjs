#!/usr/bin/env node
/**
 * Preview password gate for the whole website (run after `npm run build`).
 *
 * While the shop is not officially launched, every page in dist/ is encrypted with StatiCrypt
 * (AES-256, password checked in the browser). Visitors type the password once; "Ricordami"
 * keeps them in for 30 days on that device. Nothing can be read in the page source without it.
 *
 *   SITE_PASSWORD set   → encrypt all pages (except /admin/, which has its own login),
 *                         replace robots.txt with "Disallow: /" and remove the sitemaps.
 *   SITE_PASSWORD empty → do nothing: the site is public (launch = delete the GitHub secret).
 *
 * Notes
 * - Images, CSS and JS files are not encrypted (only the HTML pages are).
 * - scripts/gate/staticrypt.json holds a fixed, non-secret salt so "Ricordami" survives redeploys.
 *   Changing the password logs everyone out.
 * - The gate page design lives in scripts/gate/template.html ({{BASE}} = site base path).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const password = process.env.SITE_PASSWORD ?? '';

if (!password) {
  console.log('SITE_PASSWORD not set – the website is public (no password gate).');
  process.exit(0);
}
if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html not found – run `npm run build` first.');
  process.exit(1);
}

// Base path of the site ("/" on cherepochette.ch, "/repo/" on a GitHub project URL).
let base = process.env.BASE_PATH || '/';
if (!base.startsWith('/')) base = `/${base}`;
if (!base.endsWith('/')) base = `${base}/`;

const work = mkdtempSync(join(tmpdir(), 'cp-gate-'));
const template = join(work, 'template.html');
writeFileSync(template, readFileSync(join(root, 'scripts/gate/template.html'), 'utf8').replaceAll('{{BASE}}', base));

// Keep the admin out of the gate: move it aside while encrypting.
const adminDir = join(dist, 'admin');
const adminAside = join(work, 'admin');
const hasAdmin = existsSync(adminDir);
if (hasAdmin) renameSync(adminDir, adminAside);

// StatiCrypt writes "<-d>/<input folder name>/…" and copies every non-HTML file along, so we
// encrypt dist/ into a temporary folder and swap it in afterwards. Paths are relative to the
// project root (StatiCrypt expects a relative config path).
const outDir = '.gate-out';
rmSync(join(root, outDir), { recursive: true, force: true });

const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'staticrypt.cmd' : 'staticrypt');
const args = [
  'dist', '-r', '-d', outDir,
  '-c', 'scripts/gate/staticrypt.json',
  '--template', template,
  '--remember', '30',
  '--short',
  '--template-title', 'Chère Pochette',
  '--template-instructions',
  'Il sito è in anteprima: inserisci la password per entrare.<br><span class="gate-sub">Vorschau – bitte Passwort eingeben · Preview – please enter the password</span>',
  '--template-placeholder', 'Password',
  '--template-button', 'Entra',
  '--template-remember', 'Ricordami su questo dispositivo',
  '--template-error', 'Password non corretta',
  '--template-toggle-show', 'Mostra password',
  '--template-toggle-hide', 'Nascondi password',
  '--template-color-primary', '#82001f',
  '--template-color-secondary', '#faf7f2',
];

// The password is passed via the environment only – never on the command line or in logs.
const result = spawnSync(bin, args, { cwd: root, env: { ...process.env, STATICRYPT_PASSWORD: password }, encoding: 'utf8' });
const encrypted = join(root, outDir, 'dist');
if (result.status !== 0 || !existsSync(join(encrypted, 'index.html'))) {
  if (hasAdmin) renameSync(adminAside, adminDir);
  console.error('StatiCrypt failed:', (result.stderr || result.stdout || 'no output').replaceAll(password, '***'));
  process.exit(1);
}
rmSync(dist, { recursive: true, force: true });
renameSync(encrypted, dist);
rmSync(join(root, outDir), { recursive: true, force: true });
if (hasAdmin) renameSync(adminAside, adminDir);

// No indexing while the gate is on.
writeFileSync(join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
for (const f of readdirSync(dist)) if (/^sitemap.*\.xml$/.test(f)) rmSync(join(dist, f));

const countPages = (dir) =>
  readdirSync(dir, { withFileTypes: true }).reduce((n, e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return full === adminDir ? n : n + countPages(full);
    return e.name.endsWith('.html') && readFileSync(full, 'utf8').includes('staticrypt') ? n + 1 : n;
  }, 0);
rmSync(work, { recursive: true, force: true });
console.log(`Password gate on: ${countPages(dist)} pages encrypted (admin excluded), robots.txt = Disallow all, sitemaps removed.`);
