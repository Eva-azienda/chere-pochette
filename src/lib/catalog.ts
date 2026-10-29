/**
 * Shop data: products (src/data/products/*.json), models, colours, linings, team.
 * Pages should get their data from here instead of reading the JSON files directly.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import modelsData from '../data/models.json';
import taxonomy from '../data/taxonomy.json';
import siteData from '../data/site.json';
import teamData from '../data/team.json';
import type { Lang } from './i18n';
import { formatPrice, padNumber } from './format';
import { assetPath } from './urls';

export const site = siteData;
export type Product = CollectionEntry<'products'>['data'];
export type Model = (typeof modelsData)[number];
export type TeamMember = (typeof teamData)[number];

export const models: Model[] = modelsData;
export const team: TeamMember[] = teamData;

/* ---------- Products ---------- */

/** Newest first (createdAt), then highest number first. */
function newestFirst(a: Product, b: Product): number {
  return b.createdAt.localeCompare(a.createdAt) || b.number - a.number;
}

/**
 * Every product that may have a page: "available" and "sold" (hidden ones never get a page).
 * Products with an unknown model are skipped with a warning instead of breaking the whole site.
 */
export async function getPublicProducts(): Promise<Product[]> {
  const entries = await getCollection('products');
  return entries
    .map((entry) => entry.data)
    .filter((p) => {
      if (p.status === 'hidden') return false;
      if (!getModel(p.model)) {
        console.warn(`[catalog] ${p.id}: unknown model "${p.model}" (see src/data/models.json) – skipped.`);
        return false;
      }
      return true;
    })
    .sort(newestFirst);
}

/** Bags on sale (shown in the shop), newest first. */
export async function getAvailableProducts(): Promise<Product[]> {
  return (await getPublicProducts()).filter((p) => p.status === 'available');
}

/* ---------- Lookups ---------- */

export function getModel(id: string): Model | undefined {
  return models.find((m) => m.id === id);
}

type Labelled = { id: string } & Record<Lang, string>;

export function getColour(id: string, lang: Lang): { label: string; swatch: string } {
  const colour = taxonomy.colours.find((c) => c.id === id) as (Labelled & { hex: string }) | undefined;
  // Unknown colour: show the id and a neutral swatch rather than failing.
  return { label: colour?.[lang] ?? id, swatch: colour?.hex ?? 'var(--c-line-strong)' };
}

export function getLiningLabel(id: string, lang: Lang): string {
  const lining = taxonomy.linings.find((l) => l.id === id) as Labelled | undefined;
  return lining?.[lang] ?? id;
}

/** Everything a page needs to show a product in one language. */
export function describeProduct(p: Product, lang: Lang) {
  const model = getModel(p.model)!;
  const colour = getColour(p.colour, lang);
  return {
    model,
    modelName: model.name,
    modelType: model.type[lang as keyof typeof model.type],
    colour,
    lining: getLiningLabel(p.lining, lang),
    /** "Belle · Bordeaux" */
    title: `${model.name} · ${colour.label}`,
    /** "012" */
    number: padNumber(p.number),
    /** "40.–" (without "CHF") */
    price: formatPrice(p.price),
  };
}

/* ---------- Photos (pre-sized files in public/, not processed by Astro) ---------- */

export const PHOTO_WIDTHS = [400, 900, 1600] as const;

/** URL of one size of a product photo: media/products/cp-001/1 → /media/products/cp-001/1-900.jpg */
export function photoUrl(src: string, width: (typeof PHOTO_WIDTHS)[number]): string {
  return assetPath(`${src}-${width}.jpg`);
}

/** srcset attribute for <img>: "…-400.jpg 400w, …-900.jpg 900w, …-1600.jpg 1600w" */
export function photoSrcset(src: string): string {
  return PHOTO_WIDTHS.map((w) => `${photoUrl(src, w)} ${w}w`).join(', ');
}

/* ---------- Payment ---------- */

export type Delivery = 'shipping' | 'pickup';

/** CHF → cents, the unit Zahls uses (40 → 4000, 42.5 → 4250). */
const toCents = (chf: number) => Math.round(chf * 100);
/** Products already reported in the build log (each page language would repeat the warning). */
const warned = new Set<string>();

/**
 * true only when online payment is switched on: "checkout": { "enabled": true } in src/data/site.json
 * (see docs/OPERATIONS.md §2). While it is off, the Zahls sync doesn't look for payments, so the
 * site must not offer payment links at all – even ones still stored in the product files.
 */
export function checkoutEnabled(): boolean {
  return (site as { checkout?: { enabled?: unknown } }).checkout?.enabled === true;
}

/**
 * Zahls payment link of a bag for one delivery option, or null when it can't be used
 * → the page shows "order by e-mail" instead. That happens when:
 *  - online payment is switched off (checkoutEnabled() above), or
 *  - the link doesn't exist yet (Zahls not configured / sync not run), or
 *  - the link was made for a different amount than the one shown on the page (the price or the
 *    shipping fee changed and scripts/zahls-sync.mjs hasn't recreated the links yet). A customer
 *    must never pay a different amount than the one we show.
 */
export function paymentLink(p: Product, delivery: Delivery): string | null {
  if (!checkoutEnabled()) return null;
  const zahls = p.zahls;
  const link = zahls?.[delivery]?.link;
  if (typeof link !== 'string' || !/^https:\/\//.test(link)) return null;

  const amountOk = zahls?.amount === toCents(p.price);
  const feeOk = delivery === 'pickup' || zahls?.shippingFee === toCents(site.shippingFee);
  if (!amountOk || !feeOk) {
    const key = `${p.id}/${delivery}`;
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(
        `[catalog] ${p.id}: the Zahls ${delivery} link was made for other amounts ` +
          `(price ${zahls?.amount ?? '?'}, shipping ${zahls?.shippingFee ?? '?'} cents) than the site shows ` +
          `(price ${toCents(p.price)}, shipping ${toCents(site.shippingFee)} cents) → "order by e-mail" until the next Zahls sync.`,
      );
    }
    return null;
  }
  return link;
}

/* ---------- Team ---------- */

export function getMember(slug: string): TeamMember | undefined {
  return team.find((m) => m.slug === slug);
}

/** "CAO – Responsabile amministrazione…" → "Responsabile amministrazione…" (the code is shown apart). */
export function roleDescription(member: TeamMember, lang: Lang): string {
  const title = member.roleTitle[lang];
  const parts = title.split(' – ');
  return parts.length > 1 ? parts.slice(1).join(' – ') : title;
}
