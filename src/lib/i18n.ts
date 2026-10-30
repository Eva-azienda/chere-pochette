/**
 * Translations and language helpers.
 *
 * All texts live in src/i18n/{it,de,en}.json (see src/i18n/README.md).
 * In a page:
 *
 *   const { t, list } = useTranslations(lang);
 *   t('shop.title')                         → "Le nostre borse all'uncinetto"
 *   t('common.uniquePiece', { number: '012' }) → "Pezzo unico N° 012"
 *   list('about.born.paragraphs')           → an array from the JSON file
 *
 * A missing key stops the build with an error, so typos are caught before publishing.
 */
import it from '../i18n/it.json';
import de from '../i18n/de.json';
import en from '../i18n/en.json';

export const LOCALES = ['it', 'de', 'en'] as const;
export type Lang = (typeof LOCALES)[number];
export const DEFAULT_LANG: Lang = 'it';

/** <html lang> and lang="" attributes: Swiss variants for it/de; English is for everyone. */
export const HTML_LANG: Record<Lang, string> = { it: 'it-CH', de: 'de-CH', en: 'en' };

/**
 * hreflang (head + sitemap): language only. There is one version per language, so speakers in
 * Switzerland, Liechtenstein, Italy, Germany and Austria all find "their" page.
 * Keep in sync with HREFLANG in astro.config.mjs.
 */
export const HREFLANG: Record<Lang, string> = { it: 'it', de: 'de', en: 'en' };

const dictionaries: Record<Lang, unknown> = { it, de, en };

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Reads "a.b.c" from a nested object. */
function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[part];
    return undefined;
  }, dict);
}

/** Replaces {placeholders} with values. Unknown placeholders are left as they are. */
export function fill(text: string, vars: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function useTranslations(lang: Lang) {
  const dict = dictionaries[lang];

  /** A text (string) from the language file, with placeholders filled in. */
  function t(key: string, vars?: Record<string, string | number>): string {
    const value = lookup(dict, key);
    if (typeof value !== 'string') {
      throw new Error(`[i18n] Missing text "${key}" in src/i18n/${lang}.json`);
    }
    return fill(value, vars);
  }

  /** A list (array) from the language file, e.g. paragraphs or FAQ items. */
  function list<T = string>(key: string): T[] {
    const value = lookup(dict, key);
    if (!Array.isArray(value)) {
      throw new Error(`[i18n] Expected a list at "${key}" in src/i18n/${lang}.json`);
    }
    return value as T[];
  }

  /** Title + description of a page from meta.pages.<page>. */
  function pageMeta(page: string, vars?: Record<string, string | number>) {
    const title = t(`meta.pages.${page}.title`, vars);
    return {
      // The home title is already complete; every other page uses "Chère Pochette · {title}".
      title: page === 'home' ? title : t('meta.titleTemplate', { title }),
      description: t(`meta.pages.${page}.description`, vars),
    };
  }

  return { t, list, pageMeta };
}

/**
 * getStaticPaths() for pages under src/pages/[...lang]/.
 * Italian has no prefix (lang = undefined → "/shop/"), the others do ("/de/shop/", "/en/shop/").
 */
export function langParam(lang: Lang): string | undefined {
  return lang === DEFAULT_LANG ? undefined : lang;
}

export function localeStaticPaths() {
  return LOCALES.map((lang) => ({ params: { lang: langParam(lang) }, props: { lang } }));
}

/** Language of the current page, from the [...lang] route parameter. */
export function langFromParams(params: Record<string, string | undefined>): Lang {
  const value = params.lang;
  return isLang(value) ? value : DEFAULT_LANG;
}
