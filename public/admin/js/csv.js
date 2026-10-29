/**
 * CSV export of the inventory ("Esporta CSV"). Pure functions (no DOM, no network), tested in
 * scripts/test/admin-csv.test.mjs. The download itself (Blob + <a download>) is in inventory.js.
 *
 * Format, chosen so the file opens correctly in Excel / Numbers / Google Sheets set to Swiss
 * Italian or German: UTF-8 with BOM (accents like "Chère"), ";" as separator, CRLF line ends,
 * RFC 4180 quoting, and protection against formula injection (a note like "=HYPERLINK(…)"
 * is written as text, prefixed with an apostrophe).
 */

/**
 * Address of the LIVE website (custom domain). "Link pagina" in the CSV is built from it:
 * https://cherepochette.ch/shop/<id>/. Change it here if the domain ever changes.
 */
export const LIVE_SITE_URL = 'https://cherepochette.ch/';

export const CSV_SEPARATOR = ';';
export const CSV_EOL = '\r\n';
export const CSV_BOM = '﻿';
const TIME_ZONE = 'Europe/Zurich';

/** Column headers (Italian), in order. */
export const CSV_HEADERS = [
  'N°',
  'ID',
  'Modello',
  'Tipo',
  'Colore esterno',
  'Interno (fodera)',
  'Prezzo CHF',
  'Stato',
  'Creata il',
  'Aggiornata il',
  'Venduta il',
  'Canale di vendita',
  'Nota',
  'Link pagina',
  'Foto',
];

/** What is exported → part of the file name. */
export const CSV_SCOPES = {
  available: 'in-vendita',
  sold: 'vendute',
  hidden: 'nascoste',
  all: 'inventario',
};

const STATUS_LABELS = { available: 'In vendita', sold: 'Venduta', hidden: 'Nascosta' };
const CHANNEL_LABELS = {
  'online-shipping': 'online – spedizione',
  'online-pickup': 'online – ritiro',
  manual: 'manuale',
};

/**
 * One field: formula-injection protection, then RFC 4180 quoting.
 * Values starting with = + - @ TAB or CR get a leading apostrophe (spreadsheets show it as text);
 * fields containing ; " CR or LF are wrapped in double quotes, inner quotes doubled.
 */
export function csvField(value) {
  if (value == null) return '';
  let s = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(value);
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[;"\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Rows (arrays of values) → CSV text with BOM, ";" and CRLF (also after the last row). */
export function toCsv(rows) {
  return CSV_BOM + rows.map((row) => row.map(csvField).join(CSV_SEPARATOR) + CSV_EOL).join('');
}

function zurichParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => (parts.find((p) => p.type === type) || {}).value || '';
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour'), mm: get('minute') };
}

/** ISO timestamp → "2026-10-29 16:00" (Swiss time). Empty or invalid → "". */
export function formatDateTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const p = zurichParts(date);
  return `${p.y}-${p.m}-${p.d} ${p.hh}:${p.mm}`;
}

/** Date → "2026-10-29" (Swiss calendar day). */
export function formatDay(date = new Date()) {
  const p = zurichParts(date);
  return `${p.y}-${p.m}-${p.d}`;
}

/** 40 → "40.00", 42.5 → "42.50"; missing → "". */
export function formatPriceCsv(price) {
  const n = Number(price);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '';
}

/** "chere-pochette_in-vendita_2026-10-29.csv" */
export function csvFilename(scope, date = new Date()) {
  return `chere-pochette_${CSV_SCOPES[scope] || CSV_SCOPES.all}_${formatDay(date)}.csv`;
}

/** Absolute URL of the product page on the live site (hidden bags have no page → ""). */
export function productPageUrl(product, baseUrl = LIVE_SITE_URL) {
  if (!product || !product.id || product.status === 'hidden') return '';
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}shop/${encodeURIComponent(product.id)}/`;
}

/**
 * Products → rows (header first). `data` = { models, taxonomy } as loaded from the repository,
 * used for the Italian labels.
 */
export function inventoryRows(products, data = {}, { baseUrl = LIVE_SITE_URL } = {}) {
  const models = data.models || [];
  const taxonomy = data.taxonomy || {};
  const find = (list, id) => (list || []).find((x) => x.id === id);
  const statusLabel = (id) => {
    const s = find(taxonomy.statuses, id);
    return (s && s.it) || STATUS_LABELS[id] || id || '';
  };
  const rows = [CSV_HEADERS];
  for (const p of products || []) {
    const model = find(models, p.model);
    const colour = find(taxonomy.colours, p.colour);
    const lining = find(taxonomy.linings, p.lining);
    const sold = p.status === 'sold';
    rows.push([
      Number(p.number) || '',
      p.id || '',
      (model && model.name) || p.model || '',
      (model && model.type && model.type.it) || '',
      (colour && colour.it) || p.colour || '',
      (lining && lining.it) || p.lining || '',
      formatPriceCsv(p.price),
      statusLabel(p.status),
      formatDateTime(p.createdAt),
      formatDateTime(p.updatedAt),
      formatDateTime(p.soldAt),
      sold && p.soldChannel ? CHANNEL_LABELS[p.soldChannel] || p.soldChannel : '–',
      p.note || '',
      productPageUrl(p, baseUrl),
      Array.isArray(p.photos) ? p.photos.length : 0,
    ]);
  }
  return rows;
}

/** The complete CSV text for a list of products. */
export function inventoryCsv(products, data, options) {
  return toCsv(inventoryRows(products, data, options));
}
