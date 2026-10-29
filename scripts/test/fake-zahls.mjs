// In-memory fake of the parts of the Zahls API the sync uses, plus a throw-away project folder.
// Used by zahls-sync.test.mjs — never talks to the network.
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const INSTANCE = 'chere-test';
// Obviously fake (not shaped like a real key, so GitHub push protection stays quiet), but unique
// enough that the tests can check it never appears in a log line or URL.
export const API_KEY = 'FAKE-zahls-key-for-tests-only';

/** Customer data the fake puts into paid transactions — must never end up in product files. */
export const PII = {
  firstname: 'Hanna',
  lastname: 'Mustermann',
  email: 'hanna.mustermann@example.com',
  street: 'Seestrasse 39',
  zip: '6500',
  place: 'Bellinzona',
  phone: '+41791234567',
};

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export function createFakeZahls() {
  const paylinks = new Map();
  const transactions = [];
  const calls = [];
  const failures = [];
  let nextId = 1000;

  async function fetch(url, init = {}) {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const apiPath = u.pathname.replace(/^\/v1\.18/, '');
    const form = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : null;
    const call = { method, path: apiPath, url: String(url), headers: init.headers ?? {}, form };
    calls.push(call);

    const failure = failures.find((f) => f.remaining > 0 && f.method === method && f.path.test(apiPath));
    if (failure) {
      failure.remaining -= 1;
      if (failure.network) throw new TypeError('fetch failed');
      return json(failure.status, { status: 'error', message: 'injected failure' });
    }
    if (u.searchParams.get('instance') !== INSTANCE || call.headers['X-API-KEY'] !== API_KEY) {
      return json(401, { status: 'error', message: 'Invalid API key' });
    }
    if (apiPath === '/SignatureCheck/' && method === 'GET') return json(200, { status: 'success', data: [{ id: 1 }] });

    if (apiPath === '/Invoice/' && method === 'POST') {
      const id = nextId++;
      const pl = {
        id,
        status: 'waiting',
        hash: `hash${id}`,
        referenceId: form.referenceId,
        link: `https://${INSTANCE}.zahls.ch/?payment=hash${id}`,
        invoices: [],
        amount: Number(form.amount),
        currency: form.currency,
        createdAt: 1761750000,
      };
      paylinks.set(id, pl);
      return json(200, { status: 'success', data: [pl] });
    }
    const m = apiPath.match(/^\/Invoice\/(\d+)\/$/);
    if (m) {
      const pl = paylinks.get(Number(m[1]));
      if (!pl) return json(404, { status: 'error', message: `No Invoice found with id ${m[1]}` });
      if (method === 'GET') return json(200, { status: 'success', data: [pl] });
      if (method === 'DELETE') {
        paylinks.delete(pl.id);
        return json(200, { status: 'success', data: [{ id: pl.id }] });
      }
    }
    if (apiPath === '/Transaction/' && method === 'GET') return json(200, { status: 'success', data: transactions });
    return json(404, { status: 'error', message: 'unknown endpoint' });
  }

  return {
    fetch,
    calls,
    paylinks,
    /** Adds a paylink that already exists in Zahls (for products whose JSON already has links). */
    addPaylink(id, referenceId, amount) {
      paylinks.set(id, { id, status: 'waiting', referenceId, link: `https://${INSTANCE}.zahls.ch/?payment=x${id}`, invoices: [], amount });
    },
    /** Simulates a customer paying a paylink. `nested: false` → transaction only in /Transaction/. */
    pay(id, { txId, time = '2026-10-29 16:05:00', status = 'confirmed', nested = true } = {}) {
      const pl = paylinks.get(id);
      if (!pl) throw new Error(`fake: no paylink ${id}`);
      const tx = {
        id: txId, uuid: `u${txId}`, status, time, referenceId: pl.referenceId, lang: 'it',
        invoice: { totalAmount: pl.amount, currencyAlpha3: 'CHF' },
        contact: { ...PII, country: 'Schweiz', countryISO: 'CH' },
      };
      if (status === 'confirmed') pl.status = 'confirmed';
      if (nested) pl.invoices = [{ referenceId: pl.referenceId, amount: pl.amount, transactions: [tx] }];
      transactions.push(tx);
    },
    /** The next `times` calls matching method + path regexp fail with HTTP `status` (or a network error). */
    failNext(method, pathRegexp, { status = 500, times = 1, network = false } = {}) {
      failures.push({ method, path: pathRegexp, status, remaining: times, network });
    },
    count(method, pathRegexp = /./) {
      return calls.filter((c) => c.method === method && pathRegexp.test(c.path)).length;
    },
  };
}

// ─── Throw-away project folder ───────────────────────────────────────────────

export const SITE = {
  name: 'Chère Pochette',
  currency: 'CHF',
  shippingFee: 9,
  shippingCountries: ['CH', 'LI'],
  pickupPlace: 'Bellinzona',
  checkout: { enabled: true }, // the full sync; tests for "disabled" override it
  github: { owner: '', repo: '', branch: 'main' },
};
export const MODELS = [
  { id: 'jolie', name: 'Jolie', price: 45 },
  { id: 'belle', name: 'Belle', price: 40 },
  { id: 'coquette', name: 'Coquette', price: 45 },
];
export const TAXONOMY = {
  colours: [{ id: 'bordeaux', hex: '#82001F', it: 'Bordeaux', de: 'Bordeaux', en: 'Burgundy' }],
  linings: [{ id: 'pois', it: 'A pois', de: 'Gepunktet', en: 'Polka dot' }],
};

/** A product exactly as the admin would write it (CONTRACTS.md). */
export function product(overrides = {}) {
  return {
    id: 'cp-012',
    number: 12,
    model: 'belle',
    status: 'available',
    price: 40,
    colour: 'bordeaux',
    lining: 'pois',
    note: '',
    photos: [{ src: 'media/products/cp-012/1', w: 1600, h: 2000 }],
    createdAt: '2026-10-29T15:00:00Z',
    updatedAt: '2026-10-29T15:00:00Z',
    soldAt: null,
    soldChannel: null,
    zahls: null,
    ...overrides,
  };
}

/** Creates a project folder with src/data/{site,models,taxonomy}.json and the given products. */
export async function makeProject(products, { site = SITE } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zahls-sync-test-'));
  const data = path.join(root, 'src', 'data');
  await mkdir(path.join(data, 'products'), { recursive: true });
  await writeFile(path.join(data, 'site.json'), JSON.stringify(site, null, 2) + '\n');
  await writeFile(path.join(data, 'models.json'), JSON.stringify(MODELS, null, 2) + '\n');
  await writeFile(path.join(data, 'taxonomy.json'), JSON.stringify(TAXONOMY, null, 2) + '\n');
  for (const p of products) {
    const text = typeof p === 'string' ? p : JSON.stringify(p, null, 2) + '\n';
    const name = typeof p === 'string' ? 'broken.json' : `${p.id}.json`;
    await writeFile(path.join(data, 'products', name), text);
  }
  const file = (id) => path.join(data, 'products', `${id}.json`);
  return {
    root,
    file,
    readText: (id) => readFile(file(id), 'utf8'),
    read: async (id) => JSON.parse(await readFile(file(id), 'utf8')),
    write: (p) => writeFile(file(p.id), JSON.stringify(p, null, 2) + '\n'),
    writeSite: (s) => writeFile(path.join(data, 'site.json'), JSON.stringify(s, null, 2) + '\n'),
    githubOutput: path.join(root, 'github-output.txt'),
  };
}
