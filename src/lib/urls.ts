/**
 * URL helpers. The site can live under a base path (e.g. https://user.github.io/repo-name/),
 * so internal links must NEVER be written as "/shop/". Always use these helpers:
 *
 *   localePath('de', 'shop/')   → "/repo-name/de/shop/"   (or "/de/shop/" with a custom domain)
 *   assetPath('media/products/cp-001/1-400.jpg') → "/repo-name/media/products/cp-001/1-400.jpg"
 *   absoluteUrl(localePath('it', 'shop/'))       → "https://user.github.io/repo-name/shop/"
 */
import { DEFAULT_LANG, type Lang } from './i18n';

/** import.meta.env.BASE_URL, always with a trailing slash ("/" or "/repo-name/"). */
export const BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

const stripLeadingSlash = (path: string) => path.replace(/^\/+/, '');

/** A file in public/ (favicon, product photos…). */
export function assetPath(path: string): string {
  return BASE + stripLeadingSlash(path);
}

/**
 * A page in a given language. `path` is the route without language and without leading slash,
 * ending with "/" (pages use trailing slashes): '' = home, 'shop/', 'shop/cp-001/', 'info/#care'.
 */
export function localePath(lang: Lang, path = ''): string {
  const prefix = lang === DEFAULT_LANG ? '' : `${lang}/`;
  return BASE + prefix + stripLeadingSlash(path);
}

/** Absolute URL (for canonical, hreflang, Open Graph, JSON-LD). */
export function absoluteUrl(pathWithBase: string): string {
  const site = import.meta.env.SITE || 'https://example.github.io';
  return new URL(pathWithBase, site).href;
}
