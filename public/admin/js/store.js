/**
 * Product data rules used by the GitHub backend (store-github.js).
 * Everything here is pure (no DOM, no network) so it can be tested with Node.
 *
 * ── Backend interface ─────────────────────────────────────────────────────────────
 * GitHubBackend (store-github.js) implements:
 *   kind                        'github'
 *   verify()                    checks that the access works (throws otherwise)
 *   load()                      → { models, taxonomy, site, products, problems }
 *   save(change, onProgress)    → { product, action }        (ONE commit per call)
 *   remove(id, onProgress)      → { product, action: 'delete' }
 *   thumb(src)                  → { url, fallback?: () => Promise<string|null> }
 *   dispose()                   frees the photo object URLs (logout)
 *   deployStatus()              → { state: 'online'|'running'|'error'|'other', url, createdAt } | null
 *   triggerSync()               starts the deploy workflow (Zahls sales sync + publish)
 * `change` is described in planSave() below; onProgress receives
 *   { phase: 'upload', done, total } and { phase: 'commit' }.
 * ──────────────────────────────────────────────────────────────────────────────────
 */

export const PRODUCTS_DIR = 'src/data/products'; // one JSON per bag
export const PUBLIC_DIR = 'public'; // site root inside the repository
export const MEDIA_PREFIX = 'media/products'; // photo folder, relative to the site root
export const PHOTO_SIZES = [1600, 900, 400];
export const MAX_PHOTOS = 8;
export const NOTE_MAX = 140;

/** Key order of a product file, as in CONTRACTS.md (unknown keys are kept at the end). */
export const PRODUCT_KEYS = [
  'id', 'number', 'model', 'status', 'price', 'colour', 'lining', 'note', 'photos',
  'createdAt', 'updatedAt', 'soldAt', 'soldChannel', 'zahls', 'sample',
];

export const STATUSES = ['available', 'sold', 'hidden'];

/** 12 → "cp-012" */
export function productId(number) {
  return 'cp-' + String(number).padStart(3, '0');
}

/** "cp-012" (or "cp-012.json") → 12, otherwise 0. */
export function numberFromId(id) {
  const m = /^cp-(\d+)(?:\.json)?$/.exec(String(id));
  return m ? Number(m[1]) : 0;
}

/** Next free number: highest existing number + 1. */
export function nextNumber(products) {
  return products.reduce((max, p) => Math.max(max, Number(p.number) || numberFromId(p.id)), 0) + 1;
}

/**
 * Number for a new bag at save time: the proposed one, unless somebody else took it
 * (or a higher one) in the meantime.
 */
export function chooseNumber(proposed, takenNumbers) {
  const maxTaken = takenNumbers.reduce((max, n) => Math.max(max, Number(n) || 0), 0);
  const p = Number(proposed) || 0;
  return takenNumbers.includes(p) || p < 1 ? maxTaken + 1 : Math.max(p, 1);
}

/** "media/products/cp-012/3" → 3 */
export function photoIndex(src) {
  const n = parseInt(String(src).split('/').pop(), 10);
  return Number.isFinite(n) ? n : 0;
}

/** ISO timestamp without milliseconds, e.g. "2026-10-29T15:00:00Z". */
export function nowIso(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Parses what the user typed in the price field. Accepts "40", "40.50", "40,50", "CHF 40.–".
 * Returns a number (max 2 decimals) or null when invalid.
 */
export function parsePrice(text) {
  const s = String(text ?? '')
    .trim()
    .replace(/^chf\s*/i, '')
    .replace(/[.,]\s*[–-]+$/, '')
    .replace(/['’\s]/g, '')
    .replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return n > 0 && n <= 5000 ? n : null;
}

/** Returns a copy with the contract key order and defaults for the required keys. */
export function normalizeProduct(p) {
  const defaults = {
    note: '', photos: [], soldAt: null, soldChannel: null, zahls: null,
  };
  const src = { ...defaults, ...p };
  const out = {};
  for (const key of PRODUCT_KEYS) {
    if (key === 'sample' && !('sample' in src)) continue; // optional key
    if (key in src) out[key] = src[key];
  }
  out.photos = (src.photos || []).map((ph) => {
    const { src: s, w, h, ...rest } = ph;
    return { src: s, w: Number(w) || 0, h: Number(h) || 0, ...rest };
  });
  for (const key of Object.keys(src)) if (!(key in out)) out[key] = src[key];
  return out;
}

/** Product → file content: 2-space JSON, contract key order, trailing newline. */
export function serializeProduct(p) {
  return JSON.stringify(normalizeProduct(p), null, 2) + '\n';
}

/**
 * Applies a change coming from the form to the LATEST version of the product.
 * Called again on every commit attempt, so changes made meanwhile by the Zahls sync
 * (status → sold, zahls links) are never overwritten unless the user changed that field.
 *
 * @param {object} args
 * @param {object} args.change {
 *     type: 'create' | 'update',
 *     action: 'create' | 'edit' | 'sold' | 'available' | 'hide' | 'show',
 *     id?: string,                 // update
 *     proposedNumber?: number,     // create
 *     fields?: { model, colour, lining, price, note },  // only the form fields
 *     status?: 'available' | 'sold' | 'hidden',
 *     photos?: Array<{ src, w, h } | { upload: { w, h, blobs } }>  // final order, undefined = unchanged
 *   }
 * @param {object|null} args.latest   current JSON in the repository (null for create)
 * @param {string} args.id            final id
 * @param {number} args.number        final number
 * @param {number[]} [args.usedPhotoNs] photo numbers already used in the media folder
 * @param {string} [args.now]
 * @returns {{ product: object, newPhotos: Array<{src: string, upload: object}>, removedSrcs: string[] }}
 */
export function planSave({ change, latest, id, number, usedPhotoNs = [], now = nowIso() }) {
  if (change.type === 'update' && !latest) {
    throw new Error("Questa borsa non esiste più (forse è stata eliminata). Ricarica l'inventario.");
  }
  const base = latest
    ? { ...latest }
    : {
        id, number, model: '', status: 'available', price: 0, colour: '', lining: '', note: '',
        photos: [], createdAt: now, updatedAt: now, soldAt: null, soldChannel: null, zahls: null,
      };
  const product = { ...base, ...(change.fields || {}) };
  product.id = id;
  product.number = number;

  if (change.status && change.status !== base.status) {
    product.status = change.status;
    if (change.status === 'sold') {
      product.soldAt = now;
      product.soldChannel = 'manual'; // sold in person (e.g. at a market stall)
    } else {
      product.soldAt = null;
      product.soldChannel = null;
    }
  }

  // Photos: new uploads get the next free number in the product's folder (never reuse a file).
  const oldPhotos = (latest && latest.photos) || [];
  let maxN = Math.max(0, ...usedPhotoNs, ...oldPhotos.map((p) => photoIndex(p.src)));
  const newPhotos = [];
  let photos = oldPhotos;
  if (change.photos) {
    photos = change.photos.map((p) => {
      if (p.upload) {
        const src = `${MEDIA_PREFIX}/${id}/${++maxN}`;
        newPhotos.push({ src, upload: p.upload });
        return { src, w: p.upload.w, h: p.upload.h };
      }
      const old = oldPhotos.find((o) => o.src === p.src);
      return old ? { ...old } : { src: p.src, w: p.w || 0, h: p.h || 0 };
    });
  }
  const kept = new Set(photos.map((p) => p.src));
  const removedSrcs = change.photos ? oldPhotos.filter((p) => !kept.has(p.src)).map((p) => p.src) : [];

  product.photos = photos;
  product.updatedAt = now;
  product.zahls = latest ? latest.zahls ?? null : null; // owned by the Zahls sync, never by the admin
  if (latest && latest.createdAt) product.createdAt = latest.createdAt;

  return { product: normalizeProduct(product), newPhotos, removedSrcs };
}

const SOLD_LABEL_FOR_MESSAGE = 'di persona';

/** Git commit message for an action, e.g. "admin: nuova borsa cp-012 (belle, bordeaux)". */
export function commitMessage(action, product) {
  const id = product.id;
  switch (action) {
    case 'create':
      return `admin: nuova borsa ${id} (${product.model}, ${product.colour})`;
    case 'sold':
      return `admin: ${id} venduta (${SOLD_LABEL_FOR_MESSAGE})`;
    case 'available':
      return `admin: ${id} rimessa in vendita`;
    case 'hide':
      return `admin: ${id} nascosta`;
    case 'show':
      return `admin: ${id} di nuovo visibile`;
    case 'delete':
      return `admin: elimina ${id}`;
    default:
      return `admin: modifica ${id}`;
  }
}
