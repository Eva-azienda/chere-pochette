// Tests for the admin page's data rules (public/admin/js/store.js) and its GitHub backend
// (store-github.js + github.js) against an in-memory fake GitHub (mock-github.mjs).
// Self-contained fixtures: the live product files can change at any time without breaking CI.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../public/admin/js/store.js';
import { GitHubBackend, runState } from '../../public/admin/js/store-github.js';
import { GitHubError } from '../../public/admin/js/github.js';
import { createMockGitHub } from './mock-github.mjs';

const MODELS = [
  { id: 'jolie', name: 'Jolie', price: 45 },
  { id: 'belle', name: 'Belle', price: 40 },
  { id: 'coquette', name: 'Coquette', price: 45 },
];
const TAXONOMY = {
  colours: [{ id: 'bordeaux', hex: '#82001F', it: 'Bordeaux' }, { id: 'nero', hex: '#222', it: 'Nero' }],
  linings: [{ id: 'pois', it: 'A pois' }, { id: 'righe', it: 'A righe' }],
};

/** A product file as written by the admin / the sync (CONTRACTS.md). */
function product(n, overrides = {}) {
  const id = store.productId(n);
  return {
    id, number: n, model: 'belle', status: 'available', price: 40, colour: 'bordeaux', lining: 'pois', note: '',
    photos: [{ src: `media/products/${id}/1`, w: 1600, h: 2000 }, { src: `media/products/${id}/2`, w: 1600, h: 2000 }],
    createdAt: '2026-10-29T15:00:00Z', updatedAt: '2026-10-29T15:00:00Z', soldAt: null, soldChannel: null,
    zahls: null, sample: true, ...overrides,
  };
}

const ZAHLS = {
  amount: 4500, shippingFee: 900,
  shipping: { id: 11, link: 'https://x.zahls.ch/?payment=a' }, pickup: { id: 12, link: 'https://x.zahls.ch/?payment=b' },
  syncedAt: '2026-10-29T15:10:00Z', transactionId: null,
};

function seedFiles() {
  const files = {
    'src/data/models.json': JSON.stringify(MODELS, null, 2) + '\n',
    'src/data/taxonomy.json': JSON.stringify(TAXONOMY, null, 2) + '\n',
    'src/data/site.json': '{ "name": "Chère Pochette", "shippingFee": 9 }\n',
    'README.md': '# site\n',
  };
  const products = [product(1), product(2, { model: 'jolie', price: 45, zahls: ZAHLS }), product(3), product(4)];
  for (const p of products) {
    files[`src/data/products/${p.id}.json`] = store.serializeProduct(p);
    for (const n of [1, 2]) {
      for (const size of store.PHOTO_SIZES) files[`public/media/products/${p.id}/${n}-${size}.jpg`] = new Uint8Array([n, size % 256]);
    }
  }
  return files;
}

const jpeg = (tag) => new Blob([new Uint8Array([0xff, 0xd8, tag, 0xff, 0xd9])], { type: 'image/jpeg' });
const upload = (tag) => ({ w: 1600, h: 2000, blobs: { 1600: jpeg(tag), 900: jpeg(tag + 1), 400: jpeg(tag + 2) } });

function setup() {
  const gh = createMockGitHub({ files: seedFiles() });
  const backend = new GitHubBackend({ owner: 'o', repo: 'r', branch: 'main', token: 'tok' }, { fetchImpl: gh.fetchImpl, cache: null });
  return { gh, backend };
}

describe('admin: data rules (store.js)', () => {
  test('ids, numbers, price parsing', () => {
    assert.equal(store.productId(12), 'cp-012');
    assert.equal(store.productId(1234), 'cp-1234');
    assert.equal(store.numberFromId('cp-007.json'), 7);
    assert.equal(store.nextNumber([{ number: 3 }, { number: 11 }, { id: 'cp-004' }]), 12);
    assert.equal(store.nextNumber([]), 1);
    assert.equal(store.chooseNumber(5, [1, 2, 3, 4]), 5);
    assert.equal(store.chooseNumber(5, [1, 2, 3, 4, 5]), 6);
    assert.equal(store.chooseNumber(5, [1, 2, 3, 4, 5, 6]), 7);
    for (const [input, expected] of [['40', 40], ['42.50', 42.5], ['42,5', 42.5], ['CHF 40.–', 40], [' 45 ', 45], ['40.-', 40]]) {
      assert.equal(store.parsePrice(input), expected, input);
    }
    for (const bad of ['', 'abc', '0', '-5', '40.555', '99999', '4O']) assert.equal(store.parsePrice(bad), null, bad);
  });

  test('serializeProduct: contract key order, 2-space indent, trailing newline, extra keys kept', () => {
    const text = store.serializeProduct({
      zahls: null, extraField: 1, status: 'available', id: 'cp-001', number: 1, model: 'belle', price: 40,
      colour: 'bordeaux', lining: 'pois', photos: [{ h: 2, w: 1, src: 'a' }], createdAt: 'x', updatedAt: 'y', sample: true,
    });
    assert.ok(text.endsWith('}\n'));
    assert.deepEqual(Object.keys(JSON.parse(text)), ['id', 'number', 'model', 'status', 'price', 'colour', 'lining', 'note', 'photos',
      'createdAt', 'updatedAt', 'soldAt', 'soldChannel', 'zahls', 'sample', 'extraField']);
    assert.deepEqual(Object.keys(JSON.parse(text).photos[0]), ['src', 'w', 'h']);
    assert.match(text, /\n {2}"id": "cp-001",\n/);
    // A file written by the admin is written back byte for byte (no noise in git diffs).
    const p = store.serializeProduct(product(7, { zahls: ZAHLS, note: 'Manici color panna – è unica' }));
    assert.equal(store.serializeProduct(JSON.parse(p)), p);
  });

  test('planSave: status rules, the "zahls" field is never written by the admin', () => {
    const latest = product(2, { zahls: { amount: 4500 } });
    const sold = store.planSave({ change: { type: 'update', action: 'sold', status: 'sold' }, latest, id: 'cp-002', number: 2, now: 'NOW' });
    assert.equal(sold.product.status, 'sold');
    assert.equal(sold.product.soldAt, 'NOW');
    assert.equal(sold.product.soldChannel, 'manual');
    assert.deepEqual(sold.product.zahls, { amount: 4500 });
    assert.equal(sold.product.createdAt, '2026-10-29T15:00:00Z');
    const back = store.planSave({ change: { type: 'update', action: 'available', status: 'available' }, latest: sold.product, id: 'cp-002', number: 2 });
    assert.equal(back.product.soldAt, null);
    assert.equal(back.product.soldChannel, null);
    const sneaky = store.planSave({ change: { type: 'update', action: 'edit', fields: { zahls: 'x', note: 'n' } }, latest, id: 'cp-002', number: 2 });
    assert.deepEqual(sneaky.product.zahls, { amount: 4500 });
    assert.equal(sneaky.product.note, 'n');
    assert.throws(() => store.planSave({ change: { type: 'update' }, latest: null, id: 'x', number: 1 }), /non esiste più/);
  });

  test('commit messages', () => {
    assert.equal(store.commitMessage('create', { id: 'cp-012', model: 'belle', colour: 'bordeaux' }), 'admin: nuova borsa cp-012 (belle, bordeaux)');
    assert.equal(store.commitMessage('delete', { id: 'cp-012' }), 'admin: elimina cp-012');
    assert.equal(store.commitMessage('sold', { id: 'cp-012' }), 'admin: cp-012 venduta (di persona)');
  });
});

describe('admin: GitHub backend (one commit per save)', () => {
  test('load reads models, taxonomy and products through the Git Data API', async () => {
    const { gh, backend } = setup();
    await backend.verify();
    const data = await backend.load();
    assert.equal(data.models.length, 3);
    assert.deepEqual(data.products.map((p) => p.id).sort(), ['cp-001', 'cp-002', 'cp-003', 'cp-004']);
    assert.deepEqual(data.problems, []);
    // second load only refetches the ref (trees and blobs are cached by sha)
    const before = gh.log.length;
    await backend.load();
    assert.deepEqual(gh.log.slice(before).map((r) => r.path), ['/repos/o/r/git/ref/heads/main']);
  });

  test('create: one commit with the JSON + 3 sizes per photo; UTF-8 text survives', async () => {
    const { gh, backend } = setup();
    const data = await backend.load();
    const progress = [];
    const res = await backend.save(
      {
        type: 'create', action: 'create', proposedNumber: store.nextNumber(data.products), status: 'available',
        fields: { model: 'belle', colour: 'bordeaux', lining: 'pois', price: 42.5, note: 'Ciao è – “unica” 🧶' },
        photos: [{ upload: upload(10) }, { upload: upload(20) }],
      },
      (e) => progress.push(e),
    );
    assert.equal(res.product.id, 'cp-005');
    assert.equal(gh.commitCount(), 2);
    assert.equal(gh.headMessage(), 'admin: nuova borsa cp-005 (belle, bordeaux)');
    const json = gh.read('src/data/products/cp-005.json');
    assert.ok(json.endsWith('\n'));
    const p = JSON.parse(json);
    assert.equal(p.number, 5);
    assert.equal(p.price, 42.5);
    assert.equal(p.note, 'Ciao è – “unica” 🧶');
    assert.equal(p.zahls, null);
    assert.deepEqual(p.photos, [
      { src: 'media/products/cp-005/1', w: 1600, h: 2000 },
      { src: 'media/products/cp-005/2', w: 1600, h: 2000 },
    ]);
    assert.deepEqual([...gh.readBytes('public/media/products/cp-005/2-900.jpg')], [0xff, 0xd8, 21, 0xff, 0xd9]);
    assert.equal(progress.filter((e) => e.phase === 'upload').at(-1).done, 6);
    assert.equal(progress.at(-1).phase, 'commit');

    // a second phone that still proposes N° 5 gets N° 6 (no overwrite)
    const res2 = await backend.save({
      type: 'create', action: 'create', proposedNumber: 5, status: 'available',
      fields: { model: 'jolie', colour: 'nero', lining: 'righe', price: 45, note: '' }, photos: [{ upload: upload(30) }],
    });
    assert.equal(res2.product.id, 'cp-006');
    assert.ok(gh.read('src/data/products/cp-005.json'));
  });

  test('a save that collides with the Zahls sync is retried and keeps the sync changes', async () => {
    const { gh, backend } = setup();
    await backend.load();
    gh.hooks.beforePatch = () => {
      const p = JSON.parse(gh.read('src/data/products/cp-002.json'));
      p.status = 'sold';
      p.soldAt = '2026-10-29T15:30:00Z';
      p.soldChannel = 'online-pickup';
      p.zahls = { ...ZAHLS, pickup: null, shipping: null, transactionId: 99 };
      gh.externalCommit({ 'src/data/products/cp-002.json': store.serializeProduct(p) }, 'sync: cp-002 sold');
    };
    await backend.save({ type: 'update', action: 'edit', id: 'cp-002', fields: { model: 'jolie', colour: 'nero', lining: 'pois', price: 45, note: 'Nuova nota' } });
    const p = JSON.parse(gh.read('src/data/products/cp-002.json'));
    assert.equal(p.note, 'Nuova nota');
    assert.equal(p.status, 'sold', 'sale detected by the sync is kept');
    assert.equal(p.soldChannel, 'online-pickup');
    assert.equal(p.zahls.transactionId, 99);
    assert.equal(gh.commitCount(), 3); // init + sync + ours
    assert.equal(gh.log.filter((r) => r.method === 'PATCH').length, 2);
    assert.equal(gh.log.filter((r) => r.path.endsWith('/git/blobs') && r.method === 'POST').length, 2, 'only the JSON is re-uploaded');
  });

  test('photo edit: removed photo files are deleted, a new photo gets a fresh number, order kept', async () => {
    const { gh, backend } = setup();
    await backend.load();
    await backend.save({
      type: 'update', action: 'edit', id: 'cp-001',
      photos: [{ upload: upload(40) }, { src: 'media/products/cp-001/2', w: 0, h: 0 }],
    });
    const p = JSON.parse(gh.read('src/data/products/cp-001.json'));
    assert.deepEqual(p.photos.map((x) => x.src), ['media/products/cp-001/3', 'media/products/cp-001/2']);
    for (const size of store.PHOTO_SIZES) {
      assert.equal(gh.read(`public/media/products/cp-001/1-${size}.jpg`), null);
      assert.ok(gh.readBytes(`public/media/products/cp-001/2-${size}.jpg`));
      assert.ok(gh.readBytes(`public/media/products/cp-001/3-${size}.jpg`));
    }
  });

  test('sold / hidden / delete; the payment links stay untouched', async () => {
    const { gh, backend } = setup();
    await backend.load();
    const sold = await backend.save({ type: 'update', action: 'sold', id: 'cp-002', status: 'sold' });
    assert.equal(sold.product.soldChannel, 'manual');
    assert.match(sold.product.soldAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    assert.deepEqual(JSON.parse(gh.read('src/data/products/cp-002.json')).zahls, ZAHLS, 'the sync closes the links, not the admin');
    assert.equal(gh.headMessage(), 'admin: cp-002 venduta (di persona)');
    await backend.save({ type: 'update', action: 'hide', id: 'cp-003', status: 'hidden' });
    assert.equal(JSON.parse(gh.read('src/data/products/cp-003.json')).status, 'hidden');

    const removed = await backend.remove('cp-001');
    assert.equal(removed.product.id, 'cp-001');
    assert.equal([...gh.files().keys()].filter((k) => k.includes('cp-001')).length, 0);
    assert.equal(gh.headMessage(), 'admin: elimina cp-001');
    assert.ok(gh.read('README.md'));
    const count = gh.commitCount();
    await backend.remove('cp-001'); // already gone: no empty commit
    assert.equal(gh.commitCount(), count);
    await assert.rejects(() => backend.save({ type: 'update', action: 'edit', id: 'cp-001', fields: { note: 'x' } }), /non esiste più/);
  });

  test('deploy status, dispatch and error mapping', async () => {
    const { gh, backend } = setup();
    assert.deepEqual(await backend.deployStatus(), { state: 'online', url: 'https://github.com/o/r/actions/runs/1', createdAt: '2026-10-29T10:00:00Z' });
    gh.setRuns([{ id: 2, status: 'in_progress', conclusion: null, created_at: 'x' }]);
    assert.equal((await backend.deployStatus()).state, 'running');
    assert.equal(runState({ status: 'completed', conclusion: 'failure' }), 'error');
    assert.equal(runState({ status: 'completed', conclusion: 'cancelled' }), 'other');
    await backend.triggerSync();
    assert.equal(gh.dispatched, 1);

    const bad = new GitHubBackend({ owner: 'o', repo: 'r', token: 'wrong' }, { fetchImpl: gh.fetchImpl, cache: null });
    await assert.rejects(() => bad.load(), (err) => err instanceof GitHubError && err.kind === 'auth');

    const limited = new GitHubBackend({ owner: 'o', repo: 'r', token: 't' }, {
      cache: null,
      fetchImpl: async () => new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
        status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600) },
      }),
    });
    await assert.rejects(() => limited.load(), (err) => err.kind === 'ratelimit' && /Riprova tra 10 minuti/.test(err.message));

    const offline = new GitHubBackend({ owner: 'o', repo: 'r', token: 't' }, { cache: null, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
    await assert.rejects(() => offline.load(), (err) => err.kind === 'network' && /Connessione/.test(err.message));
  });

  test('the token never appears in errors or serialised objects', async () => {
    const { gh } = setup();
    const backend = new GitHubBackend({ owner: 'o', repo: 'r', token: 'SECRET-TOKEN' }, { fetchImpl: gh.fetchImpl, cache: null });
    assert.ok(!JSON.stringify(backend.gh).includes('SECRET-TOKEN'));
    const err = await backend.load().catch((e) => e);
    assert.ok(!String(err.message).includes('SECRET-TOKEN'));
  });
});

describe('admin: photo thumbnails (public and PRIVATE repository)', () => {
  /** The mock answers GET /repos/o/r with private:false; this wrapper can flip it. */
  function setupVisibility(isPrivate) {
    const gh = createMockGitHub({ files: seedFiles() });
    const fetchImpl = async (url, init = {}) => {
      if ((init.method || 'GET') === 'GET' && new URL(url).pathname === '/repos/o/r') {
        const res = await gh.fetchImpl(url, init);
        if (!res.ok) return res;
        return new Response(JSON.stringify({ ...(await res.json()), private: isPrivate }), { status: 200 });
      }
      return gh.fetchImpl(url, init);
    };
    const backend = new GitHubBackend({ owner: 'o', repo: 'r', branch: 'main', token: 'tok' }, { fetchImpl, cache: null });
    return { gh, backend };
  }

  test('public repository: raw.githubusercontent.com first, API as fallback', async () => {
    const { backend } = setupVisibility(false);
    await backend.load();
    assert.equal(backend.isPrivate, false);
    const t = backend.thumb('media/products/cp-001/1');
    assert.equal(t.url, 'https://raw.githubusercontent.com/o/r/main/public/media/products/cp-001/1-400.jpg');
    assert.equal(typeof t.fallback, 'function');
  });

  test('private repository: no raw URL, the photo comes through the authenticated API', async () => {
    const { gh, backend } = setupVisibility(true);
    await backend.load(); // learns the visibility without a separate verify()
    assert.equal(backend.isPrivate, true);
    const t = backend.thumb('media/products/cp-002/1');
    assert.equal(t.url, null, 'raw.githubusercontent.com would answer 404 without a GitHub login');
    const before = gh.log.length;
    const url = await t.fallback();
    assert.match(url, /^blob:/);
    const blob = await (await fetch(url)).blob(); // object URL → the -400 file of photo 1
    assert.equal(blob.type, 'image/jpeg');
    assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [1, 400 % 256]);
    const calls = gh.log.slice(before);
    assert.ok(calls.some((r) => /\/git\/blobs\/\w+$/.test(r.path)), 'downloaded with the token via the Git Data API');
    assert.equal(await t.fallback(), url, 'cached: one download per photo');
    assert.equal(await backend.thumb('media/products/cp-404/1').fallback(), null, 'missing photo → placeholder');
    backend.dispose();
    assert.equal(backend.apiThumbs.size, 0);
  });

  test('verify() also records the visibility', async () => {
    const { backend } = setupVisibility(true);
    await backend.verify();
    assert.equal(backend.isPrivate, true);
    assert.equal(backend.thumb('media/products/cp-001/1').url, null);
  });
});
