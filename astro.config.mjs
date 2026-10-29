// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// SITE and BASE_PATH are injected by the GitHub Pages workflow (actions/configure-pages).
// Locally they default to the root. When the custom domain is connected, BASE_PATH becomes "/".
const site = process.env.SITE_URL || 'https://example.github.io';
const base = process.env.BASE_PATH || '/';

// Pages that must not be in the sitemap: payment redirects, admin, and sold bags (noindex).
const productsDir = new URL('./src/data/products/', import.meta.url);
const soldIds = readdirSync(productsDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(new URL(file, productsDir), 'utf8')))
  .filter((product) => product.status !== 'available')
  .map((product) => product.id);
const excluded = ['/admin/', '/thanks/', '/payment-cancelled/', ...soldIds.map((id) => `/shop/${id}/`)];

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
      i18n: {
        defaultLocale: 'it',
        locales: { it: 'it-CH', de: 'de-CH', en: 'en' },
      },
    }),
  ],
});
