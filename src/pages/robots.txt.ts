/**
 * robots.txt, generated at build time so it always contains the right absolute sitemap URL
 * and the right base path (GitHub Pages project site or custom domain).
 * Note: search engines only read robots.txt at the root of a domain, so it fully takes effect
 * once the custom domain is connected (BASE_PATH = "/").
 */
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const sitemap = new URL(`${base}sitemap-index.xml`, site ?? 'https://example.github.io').href;

  const body = [
    'User-agent: *',
    `Disallow: ${base}admin/`,
    `Allow: ${base}`,
    '',
    `Sitemap: ${sitemap}`,
    '',
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
