/** Small formatting helpers (Swiss conventions). */

/**
 * Swiss price format WITHOUT "CHF" (the texts add it: "CHF {price}").
 *   40   → "40.–"   (whole francs: dot + en dash)
 *   42.5 → "42.50"
 *   1200 → "1’200.–"
 */
export function formatPrice(chf: number): string {
  const whole = Number.isInteger(chf);
  const [francs, rappen] = chf.toFixed(2).split('.');
  const grouped = francs.replace(/\B(?=(\d{3})+(?!\d))/g, '’');
  return whole ? `${grouped}.–` : `${grouped}.${rappen}`;
}

/** Unique piece number, zero-padded to 3 digits: 12 → "012". */
export function padNumber(n: number): string {
  return String(n).padStart(3, '0');
}

/** Date as shown in Switzerland: 29.10.2026 (de/it) or 29 October 2026 (en). */
export function formatDate(iso: string, lang: string): string {
  const date = new Date(iso);
  if (lang === 'en') {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  return date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * A meta description from a longer text: search engines show about 155 characters, so keep the
 * whole sentences that fit in `max`, or cut at a word and add "…" when even the first is longer.
 */
export function metaDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentenceEnd >= 60) return cut.slice(0, sentenceEnd + 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:–-]$/, '')}…`;
}

/** Initials for the monogram avatars: "Eva Dall'Acqua" → "ED". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
