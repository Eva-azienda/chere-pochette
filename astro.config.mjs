// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// SITE and BASE_PATH are injected by the GitHub Pages workflow (actions/configure-pages).
// Locally they default to the root. When the custom domain is connected, BASE_PATH becomes "/".
const site = process.env.SITE_URL || 'https://example.github.io';
const base = process.env.BASE_PATH || '/';

// hreflang codes, language only – same as HREFLANG in src/lib/i18n.ts.
const HREFLANG = { it: 'it', de: 'de', en: 'en' };

/** @param {URL} url */
const readJson = (url) => JSON.parse(readFileSync(url, 'utf8'));
const productsDir = new URL('./src/data/products/', import.meta.url);
const products = readdirSync(productsDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => /** @type {Product} */ (readJson(new URL(file, productsDir))));

// Pages that must not be in the sitemap (they are noindex or not pages at all):
// payment redirects, admin, sold bags, and team profiles whose CV is not filled in yet
// (same rule as src/pages/[...lang]/team/[slug].astro).
const soldIds = products.filter((product) => product.status !== 'available').map((product) => product.id);
/** @type {{ slug: string, skills: Record<string, string[]>, experience: Record<string, string[]> }[]} */
const team = readJson(new URL('./src/data/team.json', import.meta.url));
const draftProfiles = team
  .filter((member) => Object.keys(HREFLANG).some((l) => !member.skills[l]?.length || !member.experience[l]?.length))
  .map((member) => `/team/${member.slug}/`);
const excluded = [
  '/admin/',
  '/thanks/',
  '/payment-cancelled/',
  ...soldIds.map((id) => `/shop/${id}/`),
  ...draftProfiles,
];

// <lastmod> only where we really know it: a bag page (its last change) and the shop (newest change
// of any bag, sold and hidden ones included: selling a bag removes it from the shop page too).
/** @typedef {{ id: string, status: string, createdAt: string, updatedAt?: string | null, soldAt?: string | null }} Product */
/** @param {Product} product */
const changedAt = (product) => [product.updatedAt, product.soldAt, product.createdAt].filter(Boolean).sort().at(-1);
const availableById = new Map(products.filter((p) => p.status === 'available').map((p) => [p.id, p]));
const shopLastmod = products.map(changedAt).filter(Boolean).sort().at(-1);

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  i18n: {
    locales: ['it', 'de', 'en'],
    defaultLocale: 'it',
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      filter: (page) => !excluded.some((path) => page.includes(path)),
      // adds <xhtml:link rel="alternate" hreflang="…"> for the three languages
      i18n: { defaultLocale: 'it', locales: HREFLANG },
      serialize(item) {
        // x-default = Italian, like the <link rel="alternate"> tags in BaseLayout.
        // A new array: the plugin shares one links array between the three language URLs.
        const links = item.links ?? [];
        const italian = links.find((link) => link.lang === HREFLANG.it);
        if (italian) item.links = [...links, { lang: 'x-default', url: italian.url }];
        const id = item.url.match(/\/shop\/([^/]+)\/$/)?.[1];
        const product = id ? availableById.get(id) : undefined;
        if (product) item.lastmod = changedAt(product);
        else if (/\/shop\/$/.test(item.url) && shopLastmod) item.lastmod = shopLastmod;
        return item;
      },
    }),
  ],
});
