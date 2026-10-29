#!/usr/bin/env node
/**
 * Zahls sync — keeps the shop inventory (src/data/products/*.json) and the Zahls
 * payment links ("Paylinks") in step with each other.
 *
 * Run by GitHub Actions every 10 minutes and after every push (see .github/workflows/deploy.yml),
 * or locally with `npm run zahls:sync` (reads a .env file in the project root if present).
 *
 * THE SWITCH: "checkout": { "enabled": … } in src/data/site.json.
 *   • not true (the default until Zahls is verified) → nothing in Zahls and nothing in the repository
 *     is changed. The sync only tests the connection (GET /SignatureCheck/), warns about payment links
 *     that are still open from earlier, and prints the links it WOULD create. It never fails the run
 *     (problems are GitHub ::warning:: annotations), so the website is always published.
 *   • true → the full sync described below.
 *
 * `node scripts/zahls-sync.mjs --check` only tests the connection (instance name + API key) and exits
 * with code 1 if Zahls refuses it. Used by .github/workflows/zahls-check.yml. Needs no SITE_URL.
 *
 * Full sync (checkout enabled), for every product file:
 *   • status "available"
 *       – if it already has links, first ask Zahls whether one of them was PAID
 *         → paid: status "sold", soldAt, soldChannel, zahls.transactionId; the other link is deleted
 *       – otherwise make sure two links exist for the current price / shipping fee:
 *           shipping link = price + shipping fee (asks for the postal address)
 *           pickup link   = price only (pickup in Bellinzona)
 *         (price or shipping fee changed → the old links are deleted and new ones created)
 *   • status "sold" / "hidden" → remaining links are checked one last time and then deleted.
 * Afterwards, links listed in scripts/zahls-links.json (the "ledger" of every open link the sync
 * created) that no product file uses any more — e.g. the bag was deleted in the admin — are
 * checked one last time and deleted too, so nobody can pay for a bag that no longer exists.
 *
 * Full sync: exit code 1 (= red run, GitHub e-mails the owner) when Zahls refuses the credentials,
 * when a product could not be synced, or when a payment needs a human (double payment, paid deleted bag).
 *
 * Environment variables:
 *   ZAHLS_INSTANCE   instance name, i.e. the "xyz" of https://xyz.zahls.ch   (missing → skip)
 *   ZAHLS_API_KEY    API secret of that instance                               (missing → skip)
 *   SITE_URL         public origin of the site, e.g. https://chere-pochette.github.io (full sync only)
 *   BASE_PATH        base path of the site, e.g. "/website/" or "/"
 *   DRY_RUN=1        only read from Zahls, print what would happen, change nothing
 *   RECREATE_LINKS=1 replace the links of every available product (e.g. after moving to a custom domain)
 *
 * PRIVACY: the repository is public. This script never writes or prints customer data
 * (names, e-mails, addresses) — only Zahls ids. Never print full API responses here.
 *
 * Only Node.js built-ins are used (no npm dependencies).
 */
import * as fsPromises from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Constants ───────────────────────────────────────────────────────────────

export const API_BASE = 'https://api.zahls.ch/v1.18';
export const LINK_KINDS = ['shipping', 'pickup'];
/** Ledger of open links, relative to the project root (committed by the workflow). */
export const LEDGER_FILE = path.join('scripts', 'zahls-links.json');

/** Key order of a product file (CONTRACTS.md). Used only to place keys that are missing. */
export const PRODUCT_KEY_ORDER = [
  'id', 'number', 'model', 'status', 'price', 'colour', 'lining', 'note', 'photos',
  'createdAt', 'updatedAt', 'soldAt', 'soldChannel', 'zahls', 'sample',
];
/** Key order of the `zahls` object (CONTRACTS.md). */
export const ZAHLS_KEY_ORDER = ['amount', 'shippingFee', 'shipping', 'pickup', 'syncedAt', 'transactionId'];

/** Contact fields the customer must fill in on the Zahls payment page. */
export const CONTACT_FIELDS = {
  shipping: ['forename', 'surname', 'email', 'phone', 'street', 'postcode', 'place', 'country'],
  pickup: ['forename', 'surname', 'email', 'phone'],
};

/** Paylink / transaction statuses (Zahls = Payrexx API). */
const PAID_STATUSES = new Set(['confirmed']);
// Money authorised but not captured yet. We never request pre-authorisation, so this should not
// happen — if it does, the bag is reserved for that customer and the team must capture manually.
const HELD_STATUSES = new Set(['authorized', 'reserved']);

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ─── Small pure helpers ──────────────────────────────────────────────────────

/** ISO timestamp without milliseconds, like the other timestamps in the product files. */
export function isoNow(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** CHF (number) → cents (integer). Math.round avoids 19.99 * 100 = 1998.9999… */
export function toCents(chf) {
  return Math.round(Number(chf) * 100);
}

/** "12" → "012" (the customer-facing piece number). */
export function pad3(n) {
  return String(n ?? '').padStart(3, '0');
}

/** Accepts "xyz", "xyz.zahls.ch" or "https://xyz.zahls.ch/" and returns "xyz". */
export function normalizeInstance(value) {
  let v = String(value ?? '').trim();
  if (!v) return '';
  v = v.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  return v.replace(/\.zahls\.ch$/i, '');
}

/** SITE_URL + BASE_PATH → "https://host/base/" (always exactly one slash between parts, trailing slash). */
export function siteBase(siteUrl, basePath) {
  const origin = String(siteUrl ?? '').trim().replace(/\/+$/, '');
  let base = String(basePath ?? '').trim();
  base = '/' + base.replace(/^\/+|\/+$/g, '');
  if (!base.endsWith('/')) base += '/';
  return origin + base;
}

/** Success / failure URLs Zahls redirects the customer to after paying. */
export function redirectUrls(siteUrl, basePath, productId) {
  const base = siteBase(siteUrl, basePath);
  const p = encodeURIComponent(productId);
  return {
    successRedirectUrl: `${base}thanks/?p=${p}`,
    failedRedirectUrl: `${base}payment-cancelled/?p=${p}`,
  };
}

/**
 * Encodes an object as application/x-www-form-urlencoded with PHP-style brackets, which is what the
 * Zahls (Payrexx) API documents:  { fields: { email: { mandatory: 1 } } } → "fields%5Bemail%5D%5Bmandatory%5D=1".
 * Arrays become key[0]=…, booleans 1/0, null/undefined are left out.
 */
export function toFormBody(data) {
  const params = new URLSearchParams();
  const add = (key, value) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => add(`${key}[${i}]`, v));
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) add(`${key}[${k}]`, v);
    } else if (typeof value === 'boolean') {
      params.append(key, value ? '1' : '0');
    } else {
      params.append(key, String(value));
    }
  };
  for (const [k, v] of Object.entries(data)) add(k, v);
  return params.toString();
}

/** The switch in site.json. Only an explicit `true` turns online payment on (safe default: off). */
export function checkoutEnabled(site) {
  return site?.checkout?.enabled === true;
}

/** Amounts (in cents) the links of a product must have right now. Throws on invalid data. */
export function desiredAmounts(product, site) {
  const price = Number(product.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`invalid price ${JSON.stringify(product.price)}`);
  const fee = Number(site.shippingFee ?? 0);
  if (!Number.isFinite(fee) || fee < 0) throw new Error(`invalid shippingFee in site.json: ${JSON.stringify(site.shippingFee)}`);
  const amount = toCents(price);
  const shippingFee = toCents(fee);
  return { amount, shippingFee, pickupTotal: amount, shippingTotal: amount + shippingFee };
}

/**
 * Builds the request body for POST /Invoice/ (= "Create a Paylink").
 * ctx: { site, models, colours, siteUrl, basePath }
 */
export function buildPaylinkPayload(product, kind, ctx) {
  const { site = {}, models = [], colours = [] } = ctx;
  const amounts = desiredAmounts(product, site);
  const model = models.find((m) => m.id === product.model);
  const modelName = model?.name ?? capitalize(product.model ?? '');
  const colour = colours.find((c) => c.id === product.colour);
  const col = {
    it: (colour?.it ?? product.colour ?? '').toLowerCase(),
    de: colour?.de ?? product.colour ?? '',
    en: (colour?.en ?? product.colour ?? '').toLowerCase(),
  };
  const place = site.pickupPlace || 'Bellinzona';
  const extra = kind === 'shipping'
    ? { it: 'spedizione inclusa', de: 'inkl. Versand', en: 'shipping included' }
    : { it: `ritiro gratuito a ${place}`, de: `kostenlose Abholung in ${place}`, en: `free pickup in ${place}` };

  const fields = {};
  for (const f of CONTACT_FIELDS[kind]) fields[f] = { mandatory: 1 };
  if (kind === 'shipping') fields.country.defaultValue = site.shippingCountries?.[0] || 'CH';

  return {
    title: `${site.name || 'Chère Pochette'} – ${modelName} N° ${pad3(product.number)}`,
    description: [
      `Pezzo unico, ${col.it} – ${extra.it}`,
      `Unikat, ${col.de} – ${extra.de}`,
      `Unique piece, ${col.en} – ${extra.en}`,
    ].join(' · '),
    referenceId: `${product.id}:${kind}`,
    purpose: product.id,
    name: `${product.id} ${kind}`, // internal name, only visible in the Zahls dashboard
    amount: kind === 'shipping' ? amounts.shippingTotal : amounts.pickupTotal,
    currency: site.currency || 'CHF',
    sku: product.id,
    preAuthorization: false,
    reservation: false,
    fields,
    ...redirectUrls(ctx.siteUrl, ctx.basePath, product.id),
  };
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** PHP APIs sometimes return {"0": {...}} instead of [...] — accept both. */
function asList(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

/** Collects the transactions nested in a Paylink response (invoices[].transactions[]). */
function collectTransactions(paylink) {
  const out = [];
  for (const inv of asList(paylink?.invoices)) {
    if (!inv || typeof inv !== 'object') continue;
    for (const t of asList(inv.transactions)) if (t && typeof t === 'object') out.push(t);
    if (inv.transaction && typeof inv.transaction === 'object') out.push(inv.transaction);
  }
  return out;
}

const lower = (s) => String(s ?? '').toLowerCase();

/**
 * Was this Paylink paid?  Returns null (not paid) or
 *   { state: 'paid' | 'held', transactionId, time }   (transactionId/time may be null)
 * A Paylink counts as paid when its status is "confirmed" or it contains a confirmed transaction.
 */
export function findPayment(paylink) {
  const txs = collectTransactions(paylink);
  const pick = (statuses) =>
    txs
      .filter((t) => statuses.has(lower(t.status)))
      .sort((a, b) => (parseZahlsTime(a.time) ?? '9999').localeCompare(parseZahlsTime(b.time) ?? '9999'))[0];
  for (const [state, statuses] of [['paid', PAID_STATUSES], ['held', HELD_STATUSES]]) {
    const tx = pick(statuses);
    if (tx) return { state, transactionId: tx.id ?? tx.uuid ?? null, time: parseZahlsTime(tx.time) };
  }
  const status = lower(paylink?.status);
  if (PAID_STATUSES.has(status)) return { state: 'paid', transactionId: null, time: null };
  if (HELD_STATUSES.has(status)) return { state: 'held', transactionId: null, time: null };
  return null;
}

/**
 * Converts a Zahls time to an ISO string (UTC, no milliseconds), or null.
 * Accepts unix seconds/milliseconds, ISO strings with a time zone, and the API's
 * "YYYY-MM-DD HH:MM:SS" format, which carries no zone — we read it as Swiss local time.
 */
export function parseZahlsTime(value) {
  if (value === null || value === undefined || value === '') return null;
  let ms;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const n = Number(value);
    ms = n < 1e12 ? n * 1000 : n;
  } else {
    const s = String(value).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    ms = m ? zurichLocalToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0)) : Date.parse(s);
  }
  if (!Number.isFinite(ms)) return null;
  return isoNow(new Date(ms));
}

function zurichLocalToUtc(y, mo, d, h, mi, s) {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  let ts = asUtc - tzOffsetMs('Europe/Zurich', asUtc);
  ts = asUtc - tzOffsetMs('Europe/Zurich', ts); // second pass fixes the DST switch hours
  return ts;
}

function tzOffsetMs(timeZone, ts) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ts));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - ts;
}

/**
 * Returns a copy of `obj` whose keys keep their original order; keys that were not there before
 * are inserted after the closest key that precedes them in `contractOrder` (unknown keys go last).
 */
export function orderKeys(obj, contractOrder, originalKeys = []) {
  const keys = originalKeys.filter((k) => Object.hasOwn(obj, k));
  for (const k of Object.keys(obj)) {
    if (keys.includes(k)) continue;
    const ci = contractOrder.indexOf(k);
    if (ci === -1) { keys.push(k); continue; }
    let pos = -1;
    keys.forEach((existing, i) => {
      const ei = contractOrder.indexOf(existing);
      if (ei !== -1 && ei < ci) pos = i;
    });
    keys.splice(pos + 1, 0, k);
  }
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

/** Product → file content (2-space indent, trailing newline, stable key order). */
export function serializeProduct(product, original = {}) {
  const out = orderKeys(product, PRODUCT_KEY_ORDER, Object.keys(original));
  if (out.zahls && typeof out.zahls === 'object') {
    out.zahls = orderKeys(out.zahls, ZAHLS_KEY_ORDER, Object.keys(original.zahls ?? {}));
  }
  return JSON.stringify(out, null, 2) + '\n';
}

function emptyZahls() {
  return { amount: null, shippingFee: null, shipping: null, pickup: null, syncedAt: null, transactionId: null };
}

/** A usable link object looks like { id, link }. */
function hasLink(l) {
  return Boolean(l && typeof l === 'object' && l.id !== undefined && l.id !== null && l.id !== '');
}

// ─── Zahls API client ────────────────────────────────────────────────────────

export class ZahlsError extends Error {
  constructor(message, { httpStatus = null, retryable = false } = {}) {
    super(message);
    this.name = 'ZahlsError';
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
  /** Wrong API key / instance → stop the whole run (no point trying the other products). */
  get isAuth() {
    return this.httpStatus === 401 || this.httpStatus === 403;
  }
}

/** Short, safe error text from a Zahls error body — never the whole body (it may contain customer data). */
function safeMessage(body) {
  const msg = body && typeof body === 'object' && typeof body.message === 'string' ? body.message : '';
  return msg.replace(/\s+/g, ' ').slice(0, 200) || 'no message';
}

/**
 * Minimal Zahls client with retries (429 / 5xx / network errors / timeouts, exponential backoff).
 * The API key is only ever put in the X-API-KEY header — never in URLs or log lines.
 */
export function createZahlsClient({
  fetch,
  instance,
  apiKey,
  baseUrl = API_BASE,
  sleep = defaultSleep,
  timeoutMs = 20_000,
  maxAttempts = 4,
}) {
  async function request(method, apiPath, { form, query } = {}) {
    const url = new URL(baseUrl.replace(/\/+$/, '') + apiPath);
    url.searchParams.set('instance', instance);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
    const headers = { 'X-API-KEY': apiKey, Accept: 'application/json' };
    let body;
    if (form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = toFormBody(form);
    }
    const label = `${method} ${apiPath}`;

    for (let attempt = 1; ; attempt++) {
      let res;
      let json = null;
      try {
        res = await fetch(url.toString(), { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
        const text = await res.text();
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
      } catch (err) {
        // Network error or timeout: retry, then give up.
        if (attempt < maxAttempts) { await sleep(backoffMs(attempt)); continue; }
        const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code || err?.name || 'network error');
        throw new ZahlsError(`${label}: ${reason} after ${attempt} attempts`, { retryable: true });
      }
      if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
        const retryAfter = Number(res.headers?.get?.('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : backoffMs(attempt));
        continue;
      }
      if (!res.ok || json?.status === 'error') {
        throw new ZahlsError(`${label}: HTTP ${res.status} – ${safeMessage(json)}`, {
          httpStatus: res.ok ? 422 : res.status,
          retryable: res.status === 429 || res.status >= 500,
        });
      }
      if (!json || typeof json !== 'object') {
        throw new ZahlsError(`${label}: unexpected (non-JSON) response, HTTP ${res.status}`, { httpStatus: res.status });
      }
      return json;
    }
  }

  const first = (json) => asList(json?.data)[0] ?? null;
  const idPath = (id) => `/Invoice/${encodeURIComponent(String(id))}/`;

  return {
    /** GET /SignatureCheck/ — succeeds only with a valid instance name + API key. */
    async checkCredentials() {
      await request('GET', '/SignatureCheck/');
    },
    /** POST /Invoice/ → { id, link } */
    async createPaylink(payload) {
      const data = first(await request('POST', '/Invoice/', { form: payload }));
      if (!data || data.id === undefined || !data.link) {
        throw new ZahlsError('POST /Invoice/: response without id/link');
      }
      return { id: data.id, link: data.link };
    },
    /** GET /Invoice/{id}/ → Paylink object, or null when it no longer exists (404). */
    async getPaylink(id) {
      try {
        return first(await request('GET', idPath(id)));
      } catch (err) {
        if (err instanceof ZahlsError && err.httpStatus === 404) return null;
        throw err;
      }
    },
    /** DELETE /Invoice/{id}/ → true (deleted) / false (was already gone). */
    async deletePaylink(id) {
      try {
        await request('DELETE', idPath(id));
        return true;
      } catch (err) {
        if (err instanceof ZahlsError && err.httpStatus === 404) return false;
        throw err;
      }
    },
    /**
     * Fallback only: GET /Transaction/ and return { id, time } of the first confirmed
     * transaction with this referenceId. The response contains customer data — we read
     * only id/status/time/referenceId and drop everything else immediately.
     */
    async findTransactionByReference(referenceId) {
      // Newest first: the default order is oldest first, and a long list may be cut off.
      const json = await request('GET', '/Transaction/', { query: { orderByTime: 'DESC', limit: 200 } });
      const hit = asList(json?.data)
        .filter((t) => t?.referenceId === referenceId && (PAID_STATUSES.has(lower(t.status)) || HELD_STATUSES.has(lower(t.status))))
        .sort((a, b) => (parseZahlsTime(a.time) ?? '').localeCompare(parseZahlsTime(b.time) ?? ''))[0];
      return hit ? { id: hit.id ?? hit.uuid ?? null, time: parseZahlsTime(hit.time) } : null;
    },
  };
}

/**
 * Connection check: GET /SignatureCheck/ succeeds only with a valid instance name + API key.
 * Returns null when Zahls accepted them, otherwise { message, retryable } (never contains the key).
 */
async function connectionProblem(client) {
  try {
    await client.checkCredentials();
    return null;
  } catch (err) {
    if (err instanceof ZahlsError && err.retryable) {
      return { retryable: true, message: `Zahls is not reachable right now (${err.message})` };
    }
    return { retryable: false, message: `Zahls refused the credentials (${err.message}). Check ZAHLS_INSTANCE and ZAHLS_API_KEY.` };
  }
}

function backoffMs(attempt) {
  return Math.min(30_000, 1000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** In DRY_RUN mode mutating calls are only logged. */
function dryRunClient(client) {
  let fakeId = 0;
  return {
    ...client,
    async createPaylink() { fakeId -= 1; return { id: fakeId, link: '(dry-run)' }; },
    async deletePaylink() { return true; },
  };
}

// ─── Ledger of open links (scripts/zahls-links.json) ─────────────────────────
//
// Product files are the source of truth, but a product file can disappear (bag deleted in the
// admin) while its two Zahls links are still payable. The ledger remembers every link the sync
// left open, so the next run can still find and close links no product file mentions any more.

/** Remembers that a link was closed / used up during this run (so it is not treated as orphan). */
function retire(ctx, linkId) {
  ctx.retired?.add(String(linkId));
}

/** Ledger text → [{ product, kind, id }] (invalid entries are skipped). */
export function parseLedger(text) {
  const data = JSON.parse(text);
  return asList(data?.links).filter(
    (e) => e && typeof e.product === 'string' && LINK_KINDS.includes(e.kind) && e.id !== undefined && e.id !== null && e.id !== '',
  );
}

/** [{ product, kind, id }] → ledger text: one link per line, sorted, so git diffs stay readable. */
export function serializeLedger(entries) {
  const seen = new Set();
  const lines = entries
    .filter((e) => {
      const key = `${e.product}|${e.kind}|${e.id}`;
      return seen.has(key) ? false : seen.add(key);
    })
    .sort((a, b) => a.product.localeCompare(b.product) || a.kind.localeCompare(b.kind) || String(a.id).localeCompare(String(b.id)))
    .map((e) => `    ${JSON.stringify({ product: e.product, kind: e.kind, id: e.id })}`);
  return [
    '{',
    '  "about": "Written by scripts/zahls-sync.mjs - do not edit. Zahls payment links that are still open, so links of deleted bags can be closed too.",',
    lines.length ? `  "links": [\n${lines.join(',\n')}\n  ]` : '  "links": []',
    '}',
    '',
  ].join('\n');
}

/** Links currently written in a product's `zahls` field → [{ product, kind, id }]. */
function linksOf(product) {
  const z = product?.zahls;
  if (!z || typeof z !== 'object' || typeof product.id !== 'string') return [];
  return LINK_KINDS.filter((k) => hasLink(z[k])).map((kind) => ({ product: product.id, kind, id: z[kind].id }));
}

/**
 * Closes a link that no product file uses any more: if it was paid meanwhile, raise an alert
 * (the bag was deleted but somebody paid for it) and keep the payment; otherwise delete it.
 */
async function closeOrphanLink(entry, ctx) {
  const { client, log, warn } = ctx;
  const label = `${entry.product}: ${entry.kind} link #${entry.id} (bag deleted or link replaced)`;
  const paylink = await client.getPaylink(entry.id);
  if (paylink === null) {
    log(`${label} is already gone – forgetting it`);
    return;
  }
  const payment = findPayment(paylink);
  if (payment) {
    warn(`PAYMENT FOR A DELETED BAG – check the order and refund if needed: ${label} was paid ` +
      `(transaction ${payment.transactionId ?? '?'}). Find it in the Zahls dashboard.`, true);
    return; // used up: keep the payment record in Zahls, just forget the link
  }
  const existed = await client.deletePaylink(entry.id);
  ctx.stats.deleted += existed ? 1 : 0;
  log(`${label}: ${existed ? 'deleted' : 'already gone'}`);
}

// ─── Sync logic for one product ──────────────────────────────────────────────

/**
 * Brings one product in line with Zahls.
 * ctx: { client, site, models, colours, siteUrl, basePath, nowIso, recreate, log, warn }
 * Returns { product, error } — `product` always reflects what really happened in Zahls,
 * even when an error stopped the work halfway (so created links are never forgotten).
 */
export async function syncProduct(original, ctx) {
  const { client, log, warn } = ctx;
  const p = structuredClone(original);
  const id = p.id;
  if (!id || typeof id !== 'string') return { product: original, error: new Error('product without "id"') };

  let z = p.zahls && typeof p.zahls === 'object' ? { ...emptyZahls(), ...p.zahls } : null;
  const commit = () => { p.zahls = z; };

  try {
    // 1) Existing links: was one of them paid? Always checked BEFORE anything gets deleted,
    //    so a payment made a minute before a price change is never lost.
    if (z && LINK_KINDS.some((k) => hasLink(z[k]))) {
      const kinds = LINK_KINDS.filter((k) => hasLink(z[k]));
      // Both links are fetched in parallel; the responses may contain customer data,
      // so only findPayment()'s small result is kept.
      const results = await Promise.allSettled(kinds.map((k) => client.getPaylink(z[k].id)));
      const failed = results.find((r) => r.status === 'rejected');
      if (failed) throw failed.reason;
      const payments = [];
      kinds.forEach((kind, i) => {
        const paylink = results[i].value;
        if (paylink === null) {
          // 404: someone deleted it in the Zahls dashboard. (Credentials were verified at the start.)
          log(`${id}: ${kind} link #${z[kind].id} no longer exists in Zahls – forgetting it`);
          retire(ctx, z[kind].id);
          z[kind] = null;
          return;
        }
        const payment = findPayment(paylink);
        if (payment) payments.push({ kind, ...payment });
      });
      commit();

      if (payments.length) {
        // Missing transaction id? Try the transaction list (best effort).
        for (const pay of payments) {
          if (pay.transactionId !== null) continue;
          try {
            const tx = await client.findTransactionByReference(`${id}:${pay.kind}`);
            if (tx) { pay.transactionId = tx.id; pay.time ??= tx.time; }
          } catch (err) {
            if (err instanceof ZahlsError && err.isAuth) throw err;
            warn(`${id}: could not look up the transaction id (${err.message})`);
          }
        }
        payments.sort((a, b) => (a.time ?? '9999').localeCompare(b.time ?? '9999'));
        applyPayments(p, z, payments, ctx);
        commit();
      }
    }

    // 2) Sold or hidden → close every remaining link.
    if (p.status !== 'available') {
      if (z) {
        for (const kind of LINK_KINDS) {
          if (!hasLink(z[kind])) continue;
          const existed = await client.deletePaylink(z[kind].id);
          log(`${id}: ${existed ? 'deleted' : 'forgot (already gone)'} ${kind} link #${z[kind].id} (status ${p.status})`);
          ctx.stats.deleted += existed ? 1 : 0;
          retire(ctx, z[kind].id);
          z[kind] = null;
          commit();
        }
      }
      return { product: p, error: null };
    }

    // 3) Available → make sure both links exist for the current amounts.
    const want = desiredAmounts(p, ctx.site);
    z ??= emptyZahls();
    const stale = z.amount !== want.amount || z.shippingFee !== want.shippingFee || ctx.recreate;
    if (stale && LINK_KINDS.some((k) => hasLink(z[k]))) {
      const why = ctx.recreate ? 'RECREATE_LINKS=1' : `amount ${z.amount}→${want.amount}, shipping ${z.shippingFee}→${want.shippingFee}`;
      for (const kind of LINK_KINDS) {
        if (!hasLink(z[kind])) continue;
        const existed = await client.deletePaylink(z[kind].id);
        log(`${id}: deleted old ${kind} link #${z[kind].id} (${why})`);
        ctx.stats.deleted += existed ? 1 : 0;
        retire(ctx, z[kind].id);
        z[kind] = null;
        commit();
      }
    }
    if (stale) {
      z.amount = want.amount;
      z.shippingFee = want.shippingFee;
    }
    for (const kind of LINK_KINDS) {
      if (hasLink(z[kind])) continue;
      const payload = buildPaylinkPayload(p, kind, ctx);
      const created = await client.createPaylink(payload);
      z[kind] = { id: created.id, link: created.link };
      z.syncedAt = ctx.nowIso;
      z.transactionId = null;
      commit();
      ctx.stats.created += 1;
      log(`${id}: created ${kind} link #${created.id} (CHF ${(payload.amount / 100).toFixed(2)})`);
    }
    return { product: p, error: null };
  } catch (error) {
    commit();
    return { product: p, error };
  }
}

/** Applies the payments found for a product (sorted, earliest first). Mutates p and z. */
function applyPayments(p, z, payments, ctx) {
  const { warn } = ctx;
  const id = p.id;
  const ids = payments.map((x) => `${x.kind} #${x.transactionId ?? '?'}`).join(', ');

  // Paid links are used up: forget them (they are not deleted, Zahls keeps the payment record).
  for (const pay of payments) {
    if (hasLink(z[pay.kind])) retire(ctx, z[pay.kind].id);
    z[pay.kind] = null;
  }

  if (p.status === 'sold') {
    // Already sold (by hand, or by an earlier payment) — any payment now is a second sale.
    warn(`DOUBLE PAYMENT – refund needed: ${id} was already sold (${p.soldChannel ?? 'unknown channel'}, ` +
      `transaction ${z.transactionId ?? 'none'}) but was paid again: ${ids}`, true);
    z.syncedAt = ctx.nowIso;
    return;
  }

  const first = payments[0];
  if (p.status === 'hidden') warn(`${id} was hidden but has been paid – marking it as sold`);
  p.status = 'sold';
  // Transaction time if known (never later than "now", in case of a time-zone surprise).
  p.soldAt = first.time && first.time < ctx.nowIso ? first.time : ctx.nowIso;
  p.soldChannel = first.kind === 'shipping' ? 'online-shipping' : 'online-pickup';
  z.transactionId = first.transactionId;
  z.syncedAt = ctx.nowIso;
  ctx.stats.sold.push(`${id} (${p.soldChannel}, transaction ${first.transactionId ?? '?'})`);
  ctx.log(`${id}: PAID via ${first.kind} link → status "sold" (transaction ${first.transactionId ?? '?'})`);

  if (first.state === 'held') {
    warn(`${id}: payment ${first.transactionId ?? '?'} is only authorised – capture it in the Zahls dashboard`);
  }
  if (payments.length > 1) {
    warn(`DOUBLE PAYMENT – refund needed: ${id} was paid twice (${ids}). ` +
      `Kept the earlier one (${first.kind} #${first.transactionId ?? '?'}); refund the other in the Zahls dashboard.`, true);
  }
}

// ─── Checkout disabled (read-only) ───────────────────────────────────────────

/**
 * What the full sync WOULD do with the links once checkout is enabled — worked out from the
 * product files only (no Zahls calls, so existing links are assumed unpaid).
 * Returns { lines: ["cp-001: create shipping link CHF 49.00, …", …], create: links to create }.
 */
export function planLinks(products, site) {
  const lines = [];
  let create = 0;
  for (const p of products) {
    if (typeof p?.id !== 'string') continue;
    const z = p.zahls && typeof p.zahls === 'object' ? p.zahls : {};
    if (p.status !== 'available') {
      const open = LINK_KINDS.filter((k) => hasLink(z[k])).map((k) => `${k} link #${z[k].id}`);
      if (open.length) lines.push(`${p.id}: close ${open.join(', ')} (status ${p.status})`);
      continue;
    }
    let want;
    try {
      want = desiredAmounts(p, site);
    } catch (err) {
      lines.push(`${p.id}: ERROR ${err.message} – no links`);
      continue;
    }
    const stale = z.amount !== want.amount || z.shippingFee !== want.shippingFee;
    const actions = LINK_KINDS.map((kind) => {
      const chf = `CHF ${((kind === 'shipping' ? want.shippingTotal : want.pickupTotal) / 100).toFixed(2)}`;
      if (hasLink(z[kind]) && !stale) return `keep ${kind} link #${z[kind].id} (${chf})`;
      create += 1;
      return `${hasLink(z[kind]) ? 'replace' : 'create'} ${kind} link ${chf}`;
    });
    lines.push(`${p.id}: ${actions.join(', ')}`);
  }
  return { lines, create };
}

/**
 * Checkout is disabled: change nothing in Zahls and nothing in the repository. Only test the
 * connection, warn about links still open from when checkout was enabled, and print the plan.
 * Problems are warnings only — this never fails the run, so the website is always published.
 */
async function runCheckoutDisabled({ client, instance, site, files, productsDir, ledger, fs, log, warn }) {
  log('Zahls: checkout is disabled in src/data/site.json – only testing the connection, nothing is created, deleted or written');
  const problem = await connectionProblem(client);
  if (problem) {
    warn(`Zahls connection FAILED (instance "${instance}"), the website is published anyway: ${problem.message}`);
  } else {
    log(`Zahls connection OK (instance "${instance}") – checkout disabled, no links created`);
  }

  const products = [];
  for (const file of files) {
    try {
      products.push(JSON.parse(await fs.readFile(path.join(productsDir, file), 'utf8')));
    } catch (err) {
      warn(`${file}: cannot read/parse – ${err.message}`);
    }
  }

  // Checkout switched from enabled back to disabled: the links created back then are still payable
  // in Zahls, but nobody looks for payments now. They are NOT deleted automatically (a human decides);
  // once checkout is enabled again, the first run checks them for payments before anything else.
  const open = new Map();
  for (const e of [...products.flatMap(linksOf), ...ledger]) open.set(String(e.id), e);
  if (open.size) {
    const list = [...open.values()].map((e) => `${e.product} ${e.kind} #${e.id}`).join(', ');
    warn(`checkout is disabled, but ${open.size} Zahls payment link(s) are still open: ${list}. ` +
      'They are left alone, and payments on them are NOT detected while checkout is disabled – ' +
      'delete them in the Zahls dashboard, or set checkout.enabled back to true.');
  }

  const plan = planLinks(products, site);
  log('With checkout enabled, the sync would:');
  for (const line of plan.lines) log(`  ${line}`);
  if (!plan.lines.length) log('  nothing (no available bags)');
  log(`  → ${plan.create} payment link(s) to create`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Runs the whole sync. Everything outside is injectable so tests can use a fake Zahls:
 *   fetch  – fetch implementation           fs    – object with readFile/writeFile/readdir/appendFile
 *   env    – environment variables          now   – () => Date
 *   sleep  – (ms) => Promise                rootDir – project root
 *   logger – { log, warn, error }           argv  – command-line arguments (only "--check")
 * Returns { exitCode, changed, skipped, stats }.
 */
export async function run({
  fetch = globalThis.fetch,
  fs = fsPromises,
  env = process.env,
  now = () => new Date(),
  sleep = defaultSleep,
  rootDir = ROOT_DIR,
  logger = console,
  argv = [],
} = {}) {
  const checkOnly = argv.includes('--check');
  const title = checkOnly ? 'Zahls check' : 'Zahls sync';
  const stats = { created: 0, deleted: 0, sold: [], warnings: [], alerts: [], errors: [], changedFiles: [] };
  const inActions = env.GITHUB_ACTIONS === 'true';
  const log = (msg) => logger.log(msg);
  // loud = needs a human (double payment…): counted as an alert → exit code 1.
  const warn = (msg, loud = false) => {
    stats.warnings.push(msg);
    if (loud) stats.alerts.push(msg);
    logger.warn(inActions ? `::${loud ? 'error' : 'warning'} title=${title}::${msg}` : `WARNING: ${msg}`);
  };
  const fail = (msg) => logger.error(inActions ? `::error title=${title}::${msg}` : `ERROR: ${msg}`);

  const finish = async (exitCode, { skipped = false } = {}) => {
    const changed = stats.changedFiles.length > 0;
    if (env.GITHUB_OUTPUT) await fs.appendFile(env.GITHUB_OUTPUT, `changed=${changed}\n`);
    return { exitCode, changed, skipped, stats };
  };

  // A typo like "--chek" must never fall through to the full sync.
  const unknown = argv.filter((a) => a !== '--check');
  if (unknown.length) {
    fail(`unknown argument "${unknown.join(' ')}" – usage: node scripts/zahls-sync.mjs [--check]`);
    return finish(1);
  }

  const instance = normalizeInstance(env.ZAHLS_INSTANCE);
  const apiKey = String(env.ZAHLS_API_KEY ?? '').trim();
  if (!instance || !apiKey) {
    if (checkOnly) {
      fail('ZAHLS_INSTANCE and ZAHLS_API_KEY must both be set – nothing to check');
      return finish(1);
    }
    log('Zahls not configured – skipping');
    return finish(0, { skipped: true });
  }
  let client = createZahlsClient({ fetch, instance, apiKey, sleep });

  // --check: only test instance name + API key (workflow "Zahls check"). Reads and writes nothing.
  if (checkOnly) {
    const problem = await connectionProblem(client);
    if (problem) {
      fail(`Zahls connection FAILED (instance "${instance}"): ${problem.message}`);
      return finish(1);
    }
    log(`Zahls connection OK (instance "${instance}")`);
    return finish(0);
  }

  const dataDir = path.join(rootDir, 'src', 'data');
  const productsDir = path.join(dataDir, 'products');
  let site, models, colours;
  let files;
  try {
    site = JSON.parse(await fs.readFile(path.join(dataDir, 'site.json'), 'utf8'));
    models = JSON.parse(await fs.readFile(path.join(dataDir, 'models.json'), 'utf8'));
    colours = await fs.readFile(path.join(dataDir, 'taxonomy.json'), 'utf8')
      .then((t) => JSON.parse(t).colours ?? [], () => []); // optional, only for nicer descriptions
    files = (await fs.readdir(productsDir)).filter((f) => f.endsWith('.json')).sort();
  } catch (err) {
    fail(`cannot read the data files: ${err.message}`);
    return finish(1);
  }

  // Ledger of open links (see "Ledger" above). Missing on the very first run → empty.
  const ledgerPath = path.join(rootDir, LEDGER_FILE);
  let ledgerText = null;
  let ledger = [];
  try {
    ledgerText = await fs.readFile(ledgerPath, 'utf8');
    ledger = parseLedger(ledgerText);
  } catch (err) {
    if (err?.code !== 'ENOENT') warn(`${LEDGER_FILE} is unreadable (${err.message}) – starting a new one`);
  }

  if (!checkoutEnabled(site)) {
    await runCheckoutDisabled({ client, instance, site, files, productsDir, ledger, fs, log, warn });
    return finish(0);
  }

  // ── Full sync (checkout enabled) ──
  const siteUrl = String(env.SITE_URL ?? '').trim();
  if (!/^https?:\/\//i.test(siteUrl)) {
    fail('SITE_URL is missing or invalid (expected e.g. https://user.github.io) – needed for the payment redirect URLs');
    return finish(1);
  }
  const dryRun = /^(1|true|yes)$/i.test(String(env.DRY_RUN ?? ''));
  const recreate = /^(1|true|yes)$/i.test(String(env.RECREATE_LINKS ?? ''));
  if (dryRun) client = dryRunClient(client);
  const nowIso = isoNow(now());
  const ctx = {
    client, site, models, colours, siteUrl, basePath: env.BASE_PATH ?? '/', nowIso, recreate, stats,
    retired: new Set(), // ids of links closed / used up during this run
    log: (m) => log(dryRun ? `[dry-run] ${m}` : m),
    warn,
  };

  log(`Zahls sync: instance "${instance}", ${files.length} product file(s)${dryRun ? ', DRY RUN (nothing is changed)' : ''}`);

  // Pre-flight: are instance name and API key valid? A wrong instance must never make us
  // "forget" existing links (their GET would return 404 too).
  const problem = await connectionProblem(client);
  if (problem?.retryable) {
    warn(`${problem.message} – skipping this run, the next one retries`);
    return finish(0);
  }
  if (problem) {
    fail(problem.message);
    return finish(1);
  }

  let exitCode = 0;
  let stopped = false; // credentials refused halfway → do not touch anything else
  const openLinks = []; // links the product files use after this run
  const unreadable = new Set(); // product ids whose file could not be read: keep their ledger entries

  for (const file of files) {
    const filePath = path.join(productsDir, file);
    let original;
    try {
      original = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (err) {
      stats.errors.push(`${file}: ${err.message}`);
      fail(`${file}: cannot read/parse – ${err.message}`);
      unreadable.add(file.replace(/\.json$/, ''));
      continue;
    }

    const { product, error } = await syncProduct(original, ctx);
    openLinks.push(...linksOf(product));
    if (typeof original?.id !== 'string') unreadable.add(file.replace(/\.json$/, ''));

    // Persist whatever really happened (also after a partial failure).
    const before = serializeProduct(original, original);
    let after = serializeProduct(product, original);
    if (after !== before) {
      product.updatedAt = nowIso;
      after = serializeProduct(product, original);
      stats.changedFiles.push(file);
      if (!dryRun) await fs.writeFile(filePath, after);
    }

    if (error) {
      if (error instanceof ZahlsError && error.isAuth) {
        fail(`Zahls refused the credentials (${error.message}). Check ZAHLS_INSTANCE and ZAHLS_API_KEY. Stopping.`);
        stats.errors.push(`auth: ${error.message}`);
        exitCode = 1;
        stopped = true;
        break;
      }
      stats.errors.push(`${original.id ?? file}: ${error.message}`);
      fail(`${original.id ?? file}: ${error.message}`);
    }
  }

  // Links in the ledger that no product file uses any more (bag deleted, link replaced…).
  const inUse = new Set(openLinks.map((e) => String(e.id)));
  const keep = [];
  for (const entry of ledger) {
    const id = String(entry.id);
    if (inUse.has(id) || ctx.retired.has(id)) continue; // still listed below / closed in this run
    if (stopped || unreadable.has(entry.product)) { keep.push(entry); continue; } // decide next run
    try {
      await closeOrphanLink(entry, ctx);
    } catch (err) {
      keep.push(entry); // try again next run
      stats.errors.push(`${entry.product}: ${err.message}`);
      fail(`${entry.product}: could not close ${entry.kind} link #${entry.id} – ${err.message}`);
      if (err instanceof ZahlsError && err.isAuth) stopped = true;
    }
  }
  const newLedger = [...openLinks, ...keep];
  const newLedgerText = serializeLedger(newLedger);
  if (newLedgerText !== ledgerText && (ledgerText !== null || newLedger.length)) {
    stats.changedFiles.push(LEDGER_FILE);
    if (!dryRun) {
      await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
      await fs.writeFile(ledgerPath, newLedgerText);
    }
  }

  // Summary (ids only, no customer data).
  log('─'.repeat(60));
  log(`Links created: ${stats.created}   links deleted: ${stats.deleted}   newly sold: ${stats.sold.length}`);
  for (const s of stats.sold) log(`  sold: ${s}`);
  log(`Files ${dryRun ? 'that would change' : 'changed'}: ${stats.changedFiles.length ? stats.changedFiles.join(', ') : 'none'}`);
  if (stats.warnings.length) log(`Warnings: ${stats.warnings.length}`);
  if (stats.errors.length) log(`Errors: ${stats.errors.length} (see above)`);
  for (const a of stats.alerts) log(`  NEEDS A HUMAN: ${a}`);
  // Red run (GitHub e-mails the repository owner) when something needs attention.
  if (stats.errors.length || stats.alerts.length) exitCode = 1;

  if (dryRun) stats.changedFiles = []; // nothing was written, so nothing to commit
  return finish(exitCode);
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  // Local convenience: load .env from the project root (real environment variables win).
  try { process.loadEnvFile(path.join(ROOT_DIR, '.env')); } catch { /* no .env file – fine */ }
  try {
    const { exitCode } = await run({ argv: process.argv.slice(2) });
    process.exitCode = exitCode;
  } catch (err) {
    console.error(`Zahls sync crashed: ${err?.message ?? err}`);
    process.exitCode = 1;
  }
}

/** True when this file is run directly (`node scripts/zahls-sync.mjs`), false when imported by tests. */
function isMainModule() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  await main();
}
