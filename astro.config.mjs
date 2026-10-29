// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// SITE and BASE_PATH are injected by the GitHub Pages workflow (actions/configure-pages).
// Locally they default to the root. When the custom domain is connected, BASE_PATH becomes "/".
const site = process.env.SITE_URL || 'https://example.github.io';
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  i18n: {
    locales: ['it', 'de', 'en'],
    defaultLocale: 'it',
    routing: { prefixDefaultLocale: false },
  },
  integrations: [sitemap({ filter: (page) => !page.includes('/admin/') })],
});
