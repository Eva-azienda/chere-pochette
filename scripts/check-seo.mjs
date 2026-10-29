#!/usr/bin/env node
/**
 * SEO check of the built site (dist/), run automatically after `npm run build` (npm "postbuild")
 * and on demand with `npm run seo:check`.
 *
 * Errors (things that would really hurt search results or visitors):
 *   - an indexable page without exactly one <title>, meta description or canonical = its own URL;
 *   - hreflang links that point to a missing / noindex page or don't link back;
 *   - a sitemap URL that is missing or noindex, or an indexable page missing from the sitemap;
 *   - structured data (JSON-LD) that is not valid JSON;
 *   - an internal link or image that points to a file that does not exist (broken link);
 *   - placeholder text ("da completare", "TODO:") on a public page.
 *
 *   node scripts/check-seo.mjs          → lists problems, exit code 1 if there are errors
 *   node scripts/check-seo.mjs --warn   → lists problems as warnings, always exit code 0
 *                                         (used after the build so a deploy is never blocked)
 *
 * Uses the same SITE_URL / BASE_PATH as the build (see astro.config.mjs).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const warnOnly = process.argv.includes('--warn');
const github = process.env.GITHUB_ACTIONS === 'true';

const site = (process.env.SITE_URL || 'https://example.github.io').replace(/\/+$/, '');
let base = process.env.BASE_PATH || '/';
if (!base.startsWith('/')) base = `/${base}`;
if (!base.endsWith('/')) base = `${base}/`;
const origin = new URL(site).origin;

const problems = [];
const report = (where, message) => problems.push(`${where}: ${message}`);

// After the build (--warn) a bug in this script must never block a deploy.
if (warnOnly) {
  process.on('uncaughtException', (error) => {
    console.log(`${github ? '::warning::' : ''}SEO check could not finish: ${error.message}`);
    process.exit(0);
  });
}
const safeDecode = (text) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return null; // malformed %-escape → treated as a broken link
  }
};

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html not found – run `npm run build` first.');
  process.exit(warnOnly ? 0 : 1);
}

/* ---------- Read every page ---------- */

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'admin' ? [] : htmlFiles(path);
    return name.endsWith('.html') ? [path] : [];
  });
}

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1];
const decode = (text) =>
  text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const tags = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? [];

const pages = new Map(); // absolute URL → page info
for (const file of htmlFiles(dist)) {
  const rel = relative(dist, file).split('\\').join('/');
  if (rel === '404.html') continue;
  const url = origin + base + rel.replace(/index\.html$/, '');
  const html = readFileSync(file, 'utf8');
  const head = html.split(/<\/head>/i)[0];
  const metas = tags(head, 'meta');
  const links = tags(head, 'link');
  const meta = (name) => metas.filter((m) => attr(m, 'name') === name).map((m) => decode(attr(m, 'content') ?? ''));
  pages.set(url, {
    rel,
    html,
    titles: [...head.matchAll(/<title>([^<]*)<\/title>/gi)].map((m) => m[1].trim()),
    descriptions: meta('description'),
    noindex: meta('robots').some((value) => /noindex/i.test(value)),
    canonicals: links.filter((l) => attr(l, 'rel') === 'canonical').map((l) => decode(attr(l, 'href') ?? '')),
    alternates: links
      .filter((l) => attr(l, 'rel') === 'alternate' && attr(l, 'hreflang'))
      .map((l) => ({ lang: attr(l, 'hreflang'), href: decode(attr(l, 'href') ?? '') })),
    jsonLd: [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]),
  });
}

/* ---------- Head tags, hreflang, structured data ---------- */

const indexable = [...pages].filter(([, page]) => !page.noindex);
for (const [url, page] of indexable) {
  const where = page.rel;
  if (page.titles.length !== 1 || !page.titles[0]) report(where, `needs exactly one non-empty <title> (found ${page.titles.length})`);
  if (page.descriptions.length !== 1 || !page.descriptions[0]) report(where, 'needs exactly one meta description');
  if (page.canonicals.length !== 1 || page.canonicals[0] !== url)
    report(where, `canonical should be ${url} (found ${page.canonicals.join(', ') || 'none'})`);
  if (!page.alternates.some((a) => a.lang === 'x-default')) report(where, 'hreflang x-default missing');
  for (const { lang, href } of page.alternates) {
    const target = pages.get(href);
    if (!target) report(where, `hreflang ${lang} → ${href} does not exist`);
    else if (target.noindex) report(where, `hreflang ${lang} → ${href} is noindex`);
    else if (lang !== 'x-default' && !target.alternates.some((a) => a.href === url))
      report(where, `hreflang ${lang} → ${href} does not link back`);
  }
}
for (const [, page] of pages) {
  for (const json of page.jsonLd) {
    try {
      JSON.parse(json);
    } catch (error) {
      report(page.rel, `structured data is not valid JSON (${error.message})`);
    }
  }
}

/* ---------- Sitemap ---------- */

const sitemapIndex = join(dist, 'sitemap-index.xml');
if (!existsSync(sitemapIndex)) {
  report('sitemap-index.xml', 'missing');
} else {
  const inSitemap = new Set();
  const sitemapFiles = [...readFileSync(sitemapIndex, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const sitemapUrl of sitemapFiles) {
    const file = join(dist, safeDecode(new URL(sitemapUrl).pathname.slice(base.length)) ?? '');
    if (!existsSync(file)) {
      report('sitemap-index.xml', `${sitemapUrl} does not exist (check SITE_URL / BASE_PATH)`);
      continue;
    }
    for (const [, loc] of readFileSync(file, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const url = decode(loc);
      inSitemap.add(url);
      const page = pages.get(url);
      if (!page) report('sitemap', `${url} is not a built page`);
      else if (page.noindex) report('sitemap', `${url} is noindex and should not be listed`);
    }
  }
  for (const [url, page] of indexable) if (!inSitemap.has(url)) report(page.rel, 'indexable page missing from the sitemap');
}

/* ---------- Internal links and placeholders ---------- */

const exists = (pathname) => {
  if (!pathname.startsWith(base)) return false;
  const rel = safeDecode(pathname.slice(base.length));
  if (rel === null) return false;
  if (rel === '' || rel.endsWith('/')) return existsSync(join(dist, rel, 'index.html'));
  return existsSync(join(dist, rel)) || existsSync(join(dist, rel, 'index.html'));
};

for (const [, page] of pages) {
  const body = page.html;
  const refs = [
    ...[...body.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]),
    ...[...body.matchAll(/\ssrcset="([^"]+)"/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+/)[0])),
  ];
  const broken = new Set();
  for (const raw of refs) {
    const ref = decode(raw);
    if (/^(mailto:|tel:|data:|#|javascript:)/i.test(ref)) continue;
    let url;
    try {
      url = new URL(ref, origin + base + page.rel);
    } catch {
      continue;
    }
    if (url.origin !== origin) continue; // external link
    if (!exists(url.pathname)) broken.add(url.pathname);
  }
  for (const path of broken) report(page.rel, `broken internal link → ${path}`);

  const text = body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const placeholder = text.match(/\[[^\]]*da completare[^\]]*\]|TODO:/i);
  if (placeholder) report(page.rel, `placeholder text on the page: "${placeholder[0]}"`);
}

/* ---------- Result ---------- */

const level = warnOnly ? 'warning' : 'error';
for (const problem of problems) console.log(github ? `::${level}::SEO check – ${problem}` : `  ✗ ${problem}`);
console.log(
  problems.length
    ? `SEO check: ${problems.length} problem(s) in ${pages.size} pages (${indexable.length} indexable).`
    : `SEO check: OK – ${pages.size} pages (${indexable.length} indexable), sitemap, hreflang and links consistent.`,
);
process.exit(problems.length && !warnOnly ? 1 : 0);
