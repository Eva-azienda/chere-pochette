// Tests for scripts/zahls-sync.mjs with a fake Zahls API (no network).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fsPromises from 'node:fs/promises';
import { readFile, writeFile, rm, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import {
  run, toFormBody, parseZahlsTime, orderKeys, siteBase, normalizeInstance, findPayment,
  parseLedger, serializeLedger, planLinks, checkoutEnabled, PRODUCT_KEY_ORDER, LEDGER_FILE,
} from '../zahls-sync.mjs';
import { createFakeZahls, makeProject, product, INSTANCE, API_KEY, PII, SITE } from './fake-zahls.mjs';

const NOW = new Date('2026-10-29T15:10:00.000Z');
const NOW_ISO = '2026-10-29T15:10:00Z';

/** Runs the sync against the fake, capturing log lines. `options`: { argv, fs } passed to run(). */
async function sync(project, zahls, envOverrides = {}, options = {}) {
  const lines = [];
  const capture = (...a) => lines.push(a.join(' '));
  const sleeps = [];
  const result = await run({
    fetch: zahls ? zahls.fetch : () => { throw new Error('fetch must not be called'); },
    env: {
      ZAHLS_INSTANCE: INSTANCE,
      ZAHLS_API_KEY: API_KEY,
      SITE_URL: 'https://chere-pochette.github.io',
      BASE_PATH: '/website/',
      GITHUB_OUTPUT: project.githubOutput,
      ...envOverrides,
    },
    now: () => NOW,
    sleep: async (ms) => { sleeps.push(ms); },
    rootDir: project.root,
    logger: { log: capture, warn: capture, error: capture },
    ...options,
  });
  return { ...result, lines, output: lines.join('\n'), sleeps };
}

/** Real fs that records every file/folder the sync writes (appends to GITHUB_OUTPUT are not counted). */
function spyFs() {
  const writes = [];
  const fs = {
    ...fsPromises,
    writeFile: (file, ...rest) => { writes.push(String(file)); return fsPromises.writeFile(file, ...rest); },
    mkdir: (dir, ...rest) => { writes.push(String(dir)); return fsPromises.mkdir(dir, ...rest); },
  };
  return { fs, writes };
}

/** Zahls calls as "GET /SignatureCheck/" strings. */
const callList = (zahls, from = 0) => zahls.calls.slice(from).map((c) => `${c.method} ${c.path}`);

const DISABLED = { ...SITE, checkout: { enabled: false } };

async function githubOutput(project) {
  return readFile(project.githubOutput, 'utf8').catch(() => '');
}

/** Ledger entries (scripts/zahls-links.json) as "cp-012 shipping 1000" strings, or null if missing. */
async function ledger(project) {
  const text = await readFile(path.join(project.root, LEDGER_FILE), 'utf8').catch(() => null);
  return text === null ? null : parseLedger(text).map((e) => `${e.product} ${e.kind} ${e.id}`);
}

describe('zahls-sync: configuration', () => {
  test('skips cleanly when Zahls is not configured', async () => {
    const project = await makeProject([product()]);
    const before = await project.readText('cp-012');
    const r = await sync(project, null, { ZAHLS_API_KEY: '' });
    assert.equal(r.exitCode, 0);
    assert.equal(r.skipped, true);
    assert.match(r.output, /Zahls not configured – skipping/);
    assert.equal(await project.readText('cp-012'), before);
    assert.equal(await githubOutput(project), 'changed=false\n');
    await rm(project.root, { recursive: true });
  });

  test('wrong API key → exit code 1, nothing written, key never printed', async () => {
    const project = await makeProject([product()]);
    const before = await project.readText('cp-012');
    const zahls = createFakeZahls();
    const r = await sync(project, zahls, { ZAHLS_API_KEY: 'wrong-key' });
    assert.equal(r.exitCode, 1);
    assert.equal(zahls.count('POST'), 0);
    assert.equal(await project.readText('cp-012'), before);
    assert.doesNotMatch(r.output, /wrong-key/);
    await rm(project.root, { recursive: true });
  });

  test('Zahls unreachable → skip the run without failing', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    zahls.failNext('GET', /SignatureCheck/, { network: true, times: 10 });
    const r = await sync(project, zahls);
    assert.equal(r.exitCode, 0);
    assert.equal(r.changed, false);
    assert.match(r.output, /not reachable/);
    await rm(project.root, { recursive: true });
  });
});

describe('zahls-sync: checkout disabled in site.json', () => {
  test('only the connection check: no links created or deleted, no file written, plan printed', async () => {
    const project = await makeProject([
      product(),
      product({ id: 'cp-013', number: 13, model: 'jolie', price: 45 }),
      product({ id: 'cp-014', number: 14, status: 'sold', soldChannel: 'manual' }),
    ], { site: DISABLED });
    const before = await project.readText('cp-012');
    const zahls = createFakeZahls();
    const spy = spyFs();
    const r = await sync(project, zahls, { SITE_URL: '' }, { fs: spy.fs }); // SITE_URL is not needed
    assert.equal(r.exitCode, 0);
    assert.equal(r.changed, false);
    assert.deepEqual(callList(zahls), ['GET /SignatureCheck/']);
    assert.deepEqual(spy.writes, [], 'no product file and no ledger written');
    assert.equal(await project.readText('cp-012'), before);
    assert.equal(await ledger(project), null);
    assert.equal(await githubOutput(project), 'changed=false\n');
    assert.match(r.output, /Zahls connection OK \(instance "chere-test"\) – checkout disabled, no links created/);
    assert.match(r.output, /cp-012: create shipping link CHF 49\.00, create pickup link CHF 40\.00/);
    assert.match(r.output, /cp-013: create shipping link CHF 54\.00, create pickup link CHF 45\.00/);
    assert.doesNotMatch(r.output, /cp-014/);
    assert.match(r.output, /→ 4 payment link\(s\) to create/);
    assert.ok(!r.output.includes(API_KEY));
    await rm(project.root, { recursive: true });
  });

  test('only an explicit "enabled": true switches payments on', async () => {
    assert.equal(checkoutEnabled({ checkout: { enabled: true } }), true);
    for (const site of [{}, { checkout: {} }, { checkout: { enabled: 'true' } }, { checkout: { enabled: 1 } }, null]) {
      assert.equal(checkoutEnabled(site), false, JSON.stringify(site));
    }
    const { checkout, ...noSwitch } = SITE;
    const project = await makeProject([product()], { site: noSwitch });
    const zahls = createFakeZahls();
    const r = await sync(project, zahls);
    assert.equal(r.exitCode, 0);
    assert.deepEqual(callList(zahls), ['GET /SignatureCheck/']);
    await rm(project.root, { recursive: true });
  });

  test('connection refused → GitHub warning, exit code 0 (the site is still published)', async () => {
    const project = await makeProject([product()], { site: DISABLED });
    const zahls = createFakeZahls();
    const r = await sync(project, zahls, { ZAHLS_API_KEY: 'wrong-key', GITHUB_ACTIONS: 'true' });
    assert.equal(r.exitCode, 0);
    assert.match(r.output, /::warning title=Zahls sync::Zahls connection FAILED \(instance "chere-test"\).*refused the credentials/);
    assert.doesNotMatch(r.output, /::error/);
    assert.doesNotMatch(r.output, /wrong-key/);
    assert.match(r.output, /cp-012: create shipping link/, 'the plan is printed anyway');
    assert.equal(zahls.count('POST'), 0);
    await rm(project.root, { recursive: true });
  });

  test('Zahls unreachable → warning, exit code 0', async () => {
    const project = await makeProject([product()], { site: DISABLED });
    const zahls = createFakeZahls();
    zahls.failNext('GET', /SignatureCheck/, { network: true, times: 10 });
    const r = await sync(project, zahls, { GITHUB_ACTIONS: 'true' });
    assert.equal(r.exitCode, 0);
    assert.match(r.output, /::warning title=Zahls sync::Zahls connection FAILED.*not reachable/);
    await rm(project.root, { recursive: true });
  });

  test('switched off after links existed: links are left alone and listed; switched on again: payments are found', async () => {
    const project = await makeProject([product(), product({ id: 'cp-013', number: 13 })]);
    const zahls = createFakeZahls();
    await sync(project, zahls); // checkout enabled: 4 links
    const z12 = (await project.read('cp-012')).zahls;
    const z13 = (await project.read('cp-013')).zahls;
    const ledgerBefore = await ledger(project);

    await project.writeSite(DISABLED);
    await unlink(project.file('cp-013')); // bag deleted while checkout is off
    zahls.pay(z12.pickup.id, { txId: 55 }); // somebody still pays an old link
    const textBefore = await project.readText('cp-012');
    const from = zahls.calls.length;
    const spy = spyFs();
    const r = await sync(project, zahls, { GITHUB_ACTIONS: 'true' }, { fs: spy.fs });
    assert.equal(r.exitCode, 0);
    assert.equal(r.changed, false);
    assert.deepEqual(callList(zahls, from), ['GET /SignatureCheck/'], 'no link read, created or deleted');
    assert.deepEqual(spy.writes, []);
    assert.equal(zahls.paylinks.size, 4);
    assert.equal(await project.readText('cp-012'), textBefore);
    assert.deepEqual(await ledger(project), ledgerBefore);
    assert.match(r.output, /::warning title=Zahls sync::checkout is disabled, but 4 Zahls payment link\(s\) are still open: .*cp-012 shipping #\d+.*cp-013 pickup #\d+/);
    assert.match(r.output, /cp-012: keep shipping link #\d+ \(CHF 49\.00\), keep pickup link #\d+ \(CHF 40\.00\)/);

    // Switched on again: the payment made meanwhile is found, the deleted bag's links are closed.
    await project.writeSite(SITE);
    const r2 = await sync(project, zahls);
    assert.equal(r2.exitCode, 0);
    const p = await project.read('cp-012');
    assert.equal(p.status, 'sold');
    assert.equal(p.zahls.transactionId, 55);
    assert.equal(zahls.paylinks.has(z13.shipping.id), false);
    assert.equal(zahls.paylinks.has(z13.pickup.id), false);
    await rm(project.root, { recursive: true });
  });

  test('planLinks: keep, replace, close, invalid price', () => {
    const linked = (amount) => ({
      amount, shippingFee: 900, shipping: { id: 1, link: 'x' }, pickup: { id: 2, link: 'y' }, syncedAt: null, transactionId: null,
    });
    const { lines, create } = planLinks([
      product({ id: 'cp-001', zahls: linked(4000) }),
      product({ id: 'cp-002', price: 45, zahls: linked(4000) }),
      product({ id: 'cp-003', status: 'hidden', zahls: linked(4000) }),
      product({ id: 'cp-004', price: 'quaranta' }),
      product({ id: 'cp-005', status: 'sold' }),
    ], SITE);
    assert.deepEqual(lines, [
      'cp-001: keep shipping link #1 (CHF 49.00), keep pickup link #2 (CHF 40.00)',
      'cp-002: replace shipping link CHF 54.00, replace pickup link CHF 45.00',
      'cp-003: close shipping link #1, pickup link #2 (status hidden)',
      'cp-004: ERROR invalid price "quaranta" – no links',
    ]);
    assert.equal(create, 2);
  });
});

describe('zahls-sync: --check (workflow "Zahls check")', () => {
  test('only GET /SignatureCheck/, even with checkout enabled; needs no SITE_URL', async () => {
    const project = await makeProject([product()]);
    const before = await project.readText('cp-012');
    const zahls = createFakeZahls();
    const spy = spyFs();
    const r = await sync(project, zahls, { SITE_URL: '' }, { argv: ['--check'], fs: spy.fs });
    assert.equal(r.exitCode, 0);
    assert.deepEqual(callList(zahls), ['GET /SignatureCheck/']);
    assert.deepEqual(spy.writes, []);
    assert.equal(await project.readText('cp-012'), before);
    assert.match(r.output, /Zahls connection OK \(instance "chere-test"\)/);
    assert.ok(!r.output.includes(API_KEY));
    await rm(project.root, { recursive: true });
  });

  test('wrong key → exit code 1 with a clear error, key never printed', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    const r = await sync(project, zahls, { ZAHLS_API_KEY: 'wrong-key', GITHUB_ACTIONS: 'true' }, { argv: ['--check'] });
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /::error title=Zahls check::Zahls connection FAILED \(instance "chere-test"\).*Check ZAHLS_INSTANCE and ZAHLS_API_KEY/);
    assert.doesNotMatch(r.output, /wrong-key/);
    await rm(project.root, { recursive: true });
  });

  test('Zahls unreachable → exit code 1', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    zahls.failNext('GET', /SignatureCheck/, { status: 503, times: 10 });
    const r = await sync(project, zahls, {}, { argv: ['--check'] });
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /not reachable/);
    await rm(project.root, { recursive: true });
  });

  test('missing credentials → exit code 1 (nothing to check)', async () => {
    const project = await makeProject([product()]);
    const r = await sync(project, null, { ZAHLS_INSTANCE: '' }, { argv: ['--check'] });
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /ZAHLS_INSTANCE and ZAHLS_API_KEY must both be set/);
    await rm(project.root, { recursive: true });
  });

  test('an unknown argument stops before anything happens', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    const r = await sync(project, zahls, {}, { argv: ['--chek'] });
    assert.equal(r.exitCode, 1);
    assert.equal(zahls.calls.length, 0);
    assert.match(r.output, /unknown argument "--chek"/);
    await rm(project.root, { recursive: true });
  });
});

describe('zahls-sync: available products', () => {
  test('creates a shipping and a pickup link with the right amounts, fields and redirects', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    const r = await sync(project, zahls);
    assert.equal(r.exitCode, 0);
    assert.equal(r.changed, true);
    assert.equal(await githubOutput(project), 'changed=true\n');

    const posts = zahls.calls.filter((c) => c.method === 'POST');
    assert.equal(posts.length, 2);
    const shipping = posts.find((c) => c.form.referenceId === 'cp-012:shipping').form;
    const pickup = posts.find((c) => c.form.referenceId === 'cp-012:pickup').form;

    assert.equal(shipping.amount, '4900'); // CHF 40 + CHF 9 shipping
    assert.equal(pickup.amount, '4000');
    for (const f of [shipping, pickup]) {
      assert.equal(f.currency, 'CHF');
      assert.equal(f.purpose, 'cp-012');
      assert.equal(f.sku, 'cp-012');
      assert.equal(f.title, 'Chère Pochette – Belle N° 012');
      assert.match(f.description, /Pezzo unico.*Unikat.*Unique piece/);
      assert.equal(f.successRedirectUrl, 'https://chere-pochette.github.io/website/thanks/?p=cp-012');
      assert.equal(f.failedRedirectUrl, 'https://chere-pochette.github.io/website/payment-cancelled/?p=cp-012');
      for (const field of ['forename', 'surname', 'email', 'phone']) assert.equal(f[`fields[${field}][mandatory]`], '1');
    }
    for (const field of ['street', 'postcode', 'place', 'country']) {
      assert.equal(shipping[`fields[${field}][mandatory]`], '1');
      assert.equal(pickup[`fields[${field}][mandatory]`], undefined);
    }
    assert.equal(shipping['fields[country][defaultValue]'], 'CH');

    // API key only in the header, never in the URL or the log.
    for (const c of zahls.calls) {
      assert.equal(c.headers['X-API-KEY'], API_KEY);
      assert.ok(!c.url.includes(API_KEY));
      assert.ok(c.url.includes(`instance=${INSTANCE}`));
    }
    assert.ok(!r.output.includes(API_KEY));

    const p = await project.read('cp-012');
    const shipId = [...zahls.paylinks.values()].find((x) => x.referenceId === 'cp-012:shipping').id;
    const pickId = [...zahls.paylinks.values()].find((x) => x.referenceId === 'cp-012:pickup').id;
    assert.deepEqual(p.zahls, {
      amount: 4000,
      shippingFee: 900,
      shipping: { id: shipId, link: `https://${INSTANCE}.zahls.ch/?payment=hash${shipId}` },
      pickup: { id: pickId, link: `https://${INSTANCE}.zahls.ch/?payment=hash${pickId}` },
      syncedAt: NOW_ISO,
      transactionId: null,
    });
    assert.equal(p.updatedAt, NOW_ISO);
    assert.equal(p.status, 'available');
    // Stable formatting: original key order, 2-space indent, trailing newline.
    const text = await project.readText('cp-012');
    assert.deepEqual(Object.keys(p), Object.keys(product()));
    assert.ok(text.endsWith('}\n'));
    assert.ok(text.startsWith('{\n  "id": "cp-012",'));
    await rm(project.root, { recursive: true });
  });

  test('a second run with nothing to do changes nothing', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    await sync(project, zahls);
    const after1 = await project.readText('cp-012');
    const postsBefore = zahls.count('POST');

    const r2 = await sync(project, zahls);
    assert.equal(r2.changed, false);
    assert.equal(zahls.count('POST'), postsBefore);
    assert.equal(zahls.count('DELETE'), 0);
    assert.equal(await project.readText('cp-012'), after1);
    assert.match(await githubOutput(project), /changed=false\n$/);
    await rm(project.root, { recursive: true });
  });

  test('price change → old links deleted, new links with the new amount', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    await sync(project, zahls);
    const old = (await project.read('cp-012')).zahls;

    await project.write({ ...(await project.read('cp-012')), price: 45 });
    const r = await sync(project, zahls);
    assert.equal(r.changed, true);
    assert.ok(!zahls.paylinks.has(old.shipping.id), 'old shipping link deleted');
    assert.ok(!zahls.paylinks.has(old.pickup.id), 'old pickup link deleted');

    const z = (await project.read('cp-012')).zahls;
    assert.equal(z.amount, 4500);
    assert.equal(zahls.paylinks.get(z.shipping.id).amount, 5400);
    assert.equal(zahls.paylinks.get(z.pickup.id).amount, 4500);
    assert.notEqual(z.shipping.id, old.shipping.id);
    await rm(project.root, { recursive: true });
  });

  test('shipping fee change in site.json → links recreated', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    await sync(project, zahls);
    await project.writeSite({ ...SITE, shippingFee: 12 });
    await sync(project, zahls);
    const z = (await project.read('cp-012')).zahls;
    assert.equal(z.shippingFee, 1200);
    assert.equal(zahls.paylinks.get(z.shipping.id).amount, 5200);
    assert.equal(zahls.count('DELETE'), 2);
    await rm(project.root, { recursive: true });
  });

  test('a link deleted in the Zahls dashboard is recreated', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    await sync(project, zahls);
    const old = (await project.read('cp-012')).zahls;
    zahls.paylinks.delete(old.pickup.id);
    await sync(project, zahls);
    const z = (await project.read('cp-012')).zahls;
    assert.equal(z.shipping.id, old.shipping.id);
    assert.notEqual(z.pickup.id, old.pickup.id);
    assert.ok(zahls.paylinks.has(z.pickup.id));
    await rm(project.root, { recursive: true });
  });

  test('retries on HTTP 500, 429 and network errors', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    zahls.failNext('POST', /Invoice/, { status: 500 });
    zahls.failNext('POST', /Invoice/, { status: 429 });
    zahls.failNext('POST', /Invoice/, { network: true });
    const r = await sync(project, zahls);
    assert.equal(r.exitCode, 0);
    assert.equal(r.sleeps.length, 3);
    const z = (await project.read('cp-012')).zahls;
    assert.ok(z.shipping && z.pickup);
    await rm(project.root, { recursive: true });
  });

  test('DRY_RUN=1 reads only: no links created, no files written', async () => {
    const project = await makeProject([product()]);
    const before = await project.readText('cp-012');
    const zahls = createFakeZahls();
    const r = await sync(project, zahls, { DRY_RUN: '1' });
    assert.equal(r.exitCode, 0);
    assert.equal(zahls.count('POST'), 0);
    assert.equal(zahls.count('DELETE'), 0);
    assert.equal(await project.readText('cp-012'), before);
    assert.equal(await githubOutput(project), 'changed=false\n');
    assert.equal(await ledger(project), null, 'no ledger written in a dry run');
    assert.match(r.output, /\[dry-run\] cp-012: created shipping link/);
    await rm(project.root, { recursive: true });
  });

  test('one broken product file does not stop the others', async () => {
    const project = await makeProject(['{ this is not json', product({ id: 'cp-013', number: 13 })]);
    const zahls = createFakeZahls();
    const r = await sync(project, zahls);
    assert.equal(r.exitCode, 1, 'red run so somebody looks at the broken file');
    assert.equal(r.stats.errors.length, 1);
    assert.ok((await project.read('cp-013')).zahls.shipping);
    await rm(project.root, { recursive: true });
  });

  test('invalid price → error for that product only', async () => {
    const project = await makeProject([product({ price: 'quaranta' }), product({ id: 'cp-013', number: 13 })]);
    const zahls = createFakeZahls();
    const r = await sync(project, zahls);
    assert.equal(r.exitCode, 1, 'red run so somebody fixes the price');
    assert.match(r.output, /cp-012: invalid price/);
    assert.equal((await project.read('cp-012')).zahls, null);
    assert.ok((await project.read('cp-013')).zahls.pickup);
    await rm(project.root, { recursive: true });
  });
});

describe('zahls-sync: payments', () => {
  test('paid shipping link → sold, pickup link deleted, no personal data stored', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    await sync(project, zahls);
    const { shipping, pickup } = (await project.read('cp-012')).zahls;

    zahls.pay(shipping.id, { txId: 777, time: '2026-10-29 16:05:00' }); // Swiss time (CET, UTC+1)
    const r = await sync(project, zahls);
    assert.equal(r.exitCode, 0);
    assert.match(await githubOutput(project), /changed=true\n$/); // appended after run 1's line

    const p = await project.read('cp-012');
    assert.equal(p.status, 'sold');
    assert.equal(p.soldChannel, 'online-shipping');
    assert.equal(p.soldAt, '2026-10-29T15:05:00Z');
    assert.equal(p.updatedAt, NOW_ISO);
    assert.equal(p.zahls.transactionId, 777);
    assert.equal(p.zahls.shipping, null);
    assert.equal(p.zahls.pickup, null);
    assert.ok(!zahls.paylinks.has(pickup.id), 'unpaid pickup link deleted');
    assert.ok(zahls.paylinks.has(shipping.id), 'paid link is kept in Zahls');

    const text = await project.readText('cp-012');
    for (const value of Object.values(PII)) {
      assert.ok(!text.includes(value), `product file must not contain "${value}"`);
      assert.ok(!r.output.includes(value), `log must not contain "${value}"`);
    }

    // The used-up links are not mistaken for links of a deleted bag.
    assert.equal(r.exitCode, 0);
    assert.deepEqual(await ledger(project), []);

    // Next run: nothing more to do.
    const r3 = await sync(project, zahls);
    assert.equal(r3.changed, false);
    await rm(project.root, { recursive: true });
  });

  test('paid pickup link whose transaction is only in /Transaction/ → id found there', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    await sync(project, zahls);
    const { pickup } = (await project.read('cp-012')).zahls;
    zahls.pay(pickup.id, { txId: 4242, nested: false });
    await sync(project, zahls);
    const p = await project.read('cp-012');
    assert.equal(p.status, 'sold');
    assert.equal(p.soldChannel, 'online-pickup');
    assert.equal(p.zahls.transactionId, 4242);
    await rm(project.root, { recursive: true });
  });

  test('payment is detected BEFORE a price change deletes the links', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    await sync(project, zahls);
    const p1 = await project.read('cp-012');
    zahls.pay(p1.zahls.pickup.id, { txId: 99 });
    await project.write({ ...p1, price: 50 }); // admin changed the price meanwhile
    await sync(project, zahls);
    const p = await project.read('cp-012');
    assert.equal(p.status, 'sold');
    assert.equal(p.zahls.transactionId, 99);
    assert.equal(zahls.count('POST'), 2, 'no new links created');
    await rm(project.root, { recursive: true });
  });

  test('both links paid → DOUBLE PAYMENT warning, earlier payment wins', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    await sync(project, zahls);
    const { shipping, pickup } = (await project.read('cp-012')).zahls;
    zahls.pay(shipping.id, { txId: 501, time: '2026-10-29 16:03:00' });
    zahls.pay(pickup.id, { txId: 502, time: '2026-10-29 16:01:00' });

    const r = await sync(project, zahls, { GITHUB_ACTIONS: 'true' });
    assert.equal(r.exitCode, 1, 'red run: GitHub e-mails the owner, a refund is needed');
    assert.equal(r.changed, true, 'the sale is still committed');
    assert.match(r.output, /DOUBLE PAYMENT – refund needed/);
    assert.match(r.output, /::error title=Zahls sync::DOUBLE PAYMENT/);
    assert.match(r.output, /#501/);
    assert.match(r.output, /#502/);

    const p = await project.read('cp-012');
    assert.equal(p.status, 'sold');
    assert.equal(p.soldChannel, 'online-pickup');
    assert.equal(p.zahls.transactionId, 502);
    assert.equal(p.soldAt, '2026-10-29T15:01:00Z');
    assert.equal(p.zahls.shipping, null);
    assert.equal(p.zahls.pickup, null);
    await rm(project.root, { recursive: true });
  });

  test('a transaction time in the future is replaced by "now"', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    await sync(project, zahls);
    zahls.pay((await project.read('cp-012')).zahls.pickup.id, { txId: 8, time: '2030-01-01 10:00:00' });
    await sync(project, zahls);
    assert.equal((await project.read('cp-012')).soldAt, NOW_ISO);
    await rm(project.root, { recursive: true });
  });

  test('hidden product that got paid → sold (with a warning)', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    await sync(project, zahls);
    const p1 = await project.read('cp-012');
    await project.write({ ...p1, status: 'hidden' });
    zahls.pay(p1.zahls.shipping.id, { txId: 31 });
    const r = await sync(project, zahls);
    const p = await project.read('cp-012');
    assert.equal(p.status, 'sold');
    assert.equal(p.soldChannel, 'online-shipping');
    assert.match(r.output, /was hidden but has been paid/);
    await rm(project.root, { recursive: true });
  });
});

describe('zahls-sync: sold / hidden products', () => {
  test('sold and hidden products get their links closed (404 ignored)', async () => {
    const links = (a, b) => ({
      amount: 4000, shippingFee: 900,
      shipping: { id: a, link: `https://x/?payment=${a}` },
      pickup: { id: b, link: `https://x/?payment=${b}` },
      syncedAt: '2026-10-29T15:00:00Z', transactionId: null,
    });
    const sold = product({ id: 'cp-020', number: 20, status: 'sold', soldAt: '2026-10-29T14:00:00Z', soldChannel: 'manual', zahls: links(1, 2) });
    const hidden = product({ id: 'cp-021', number: 21, status: 'hidden', zahls: links(3, 4) });
    const project = await makeProject([sold, hidden]);
    const zahls = createFakeZahls();
    zahls.addPaylink(1, 'cp-020:shipping', 4900);
    zahls.addPaylink(2, 'cp-020:pickup', 4000);
    zahls.addPaylink(3, 'cp-021:shipping', 4900);
    // paylink 4 does not exist any more → must simply be forgotten

    const r = await sync(project, zahls);
    assert.equal(r.exitCode, 0);
    assert.equal(zahls.paylinks.size, 0);
    assert.equal(zahls.count('POST'), 0);
    for (const id of ['cp-020', 'cp-021']) {
      const p = await project.read(id);
      assert.equal(p.zahls.shipping, null);
      assert.equal(p.zahls.pickup, null);
      assert.equal(p.updatedAt, NOW_ISO);
    }
    const p20 = await project.read('cp-020');
    assert.equal(p20.status, 'sold');
    assert.equal(p20.soldChannel, 'manual');
    assert.equal((await project.read('cp-021')).status, 'hidden');
    await rm(project.root, { recursive: true });
  });

  test('sold products without links are left untouched', async () => {
    const project = await makeProject([product({ status: 'sold', soldChannel: 'manual', soldAt: '2026-10-29T14:00:00Z' })]);
    const before = await project.readText('cp-012');
    const zahls = createFakeZahls();
    const r = await sync(project, zahls);
    assert.equal(r.changed, false);
    assert.equal(await project.readText('cp-012'), before);
    await rm(project.root, { recursive: true });
  });
});

describe('zahls-sync: helpers', () => {
  test('toFormBody uses PHP-style brackets', () => {
    const body = toFormBody({ amount: 4900, fields: { email: { mandatory: 1 } }, pm: ['twint'], preAuthorization: false, x: null });
    assert.equal(
      decodeURIComponent(body),
      'amount=4900&fields[email][mandatory]=1&pm[0]=twint&preAuthorization=0',
    );
  });

  test('parseZahlsTime handles Swiss local time, ISO and unix timestamps', () => {
    assert.equal(parseZahlsTime('2026-07-01 12:00:00'), '2026-07-01T10:00:00Z'); // summer, UTC+2
    assert.equal(parseZahlsTime('2026-12-01 12:00:00'), '2026-12-01T11:00:00Z'); // winter, UTC+1
    assert.equal(parseZahlsTime('2026-10-29T15:05:00Z'), '2026-10-29T15:05:00Z');
    assert.equal(parseZahlsTime(1418392958), '2014-12-12T14:02:38Z');
    assert.equal(parseZahlsTime(''), null);
    assert.equal(parseZahlsTime('nonsense'), null);
  });

  test('orderKeys keeps the original order and inserts missing keys in contract order', () => {
    const original = { id: 'cp-1', status: 'available', price: 40, updatedAt: 'x', sample: true };
    const updated = { ...original, zahls: {}, soldAt: null };
    const ordered = orderKeys(updated, PRODUCT_KEY_ORDER, Object.keys(original));
    assert.deepEqual(Object.keys(ordered), ['id', 'status', 'price', 'updatedAt', 'soldAt', 'zahls', 'sample']);
  });

  test('siteBase / normalizeInstance are forgiving', () => {
    assert.equal(siteBase('https://a.github.io/', '/repo'), 'https://a.github.io/repo/');
    assert.equal(siteBase('https://a.github.io', ''), 'https://a.github.io/');
    assert.equal(siteBase('https://www.example.ch', '/'), 'https://www.example.ch/');
    assert.equal(normalizeInstance('https://chere.zahls.ch/'), 'chere');
    assert.equal(normalizeInstance(' chere '), 'chere');
  });

  test('findPayment: waiting → null, confirmed → paid, authorized → held', () => {
    assert.equal(findPayment({ status: 'waiting', invoices: [] }), null);
    assert.deepEqual(findPayment({ status: 'confirmed', invoices: [] }), { state: 'paid', transactionId: null, time: null });
    const held = findPayment({ status: 'waiting', invoices: [{ transactions: [{ id: 5, status: 'authorized', time: '2026-10-29 10:00:00' }] }] });
    assert.equal(held.state, 'held');
    assert.equal(held.transactionId, 5);
    const declined = findPayment({ status: 'waiting', invoices: [{ transactions: [{ id: 6, status: 'declined' }] }] });
    assert.equal(declined, null);
  });
});

describe('zahls-sync: links of deleted bags (ledger)', () => {
  test('the ledger lists every open link; a bag deleted in the admin gets its links closed', async () => {
    const project = await makeProject([product(), product({ id: 'cp-013', number: 13 })]);
    const zahls = createFakeZahls();
    await sync(project, zahls);
    const z12 = (await project.read('cp-012')).zahls;
    const z13 = (await project.read('cp-013')).zahls;
    assert.deepEqual(await ledger(project), [
      `cp-012 pickup ${z12.pickup.id}`, `cp-012 shipping ${z12.shipping.id}`,
      `cp-013 pickup ${z13.pickup.id}`, `cp-013 shipping ${z13.shipping.id}`,
    ]);

    await unlink(project.file('cp-012')); // "Elimina" in the admin
    const r = await sync(project, zahls);
    assert.equal(r.exitCode, 0);
    assert.equal(r.changed, true);
    assert.equal(zahls.paylinks.has(z12.shipping.id), false);
    assert.equal(zahls.paylinks.has(z12.pickup.id), false);
    assert.equal(zahls.paylinks.has(z13.shipping.id), true);
    assert.deepEqual(await ledger(project), [`cp-013 pickup ${z13.pickup.id}`, `cp-013 shipping ${z13.shipping.id}`]);

    const r2 = await sync(project, zahls); // nothing left to do
    assert.equal(r2.changed, false);
    assert.equal(zahls.count('DELETE'), 2);
    await rm(project.root, { recursive: true });
  });

  test('a deleted bag that was paid meanwhile → alert (red run), the payment is kept', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    await sync(project, zahls);
    const { shipping, pickup } = (await project.read('cp-012')).zahls;
    zahls.pay(shipping.id, { txId: 4242 });
    await unlink(project.file('cp-012'));

    const r = await sync(project, zahls, { GITHUB_ACTIONS: 'true' });
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /::error title=Zahls sync::PAYMENT FOR A DELETED BAG.*cp-012: shipping link #\d+.*transaction 4242/);
    assert.equal(zahls.paylinks.has(shipping.id), true, 'a paid link is never deleted');
    assert.equal(zahls.paylinks.has(pickup.id), false);
    assert.deepEqual(await ledger(project), []);
    for (const value of Object.values(PII)) assert.ok(!r.output.includes(value));

    const r2 = await sync(project, zahls); // alerted once, not on every run
    assert.equal(r2.exitCode, 0);
    await rm(project.root, { recursive: true });
  });

  test('links lost from a product file (e.g. overwritten) are closed, not left payable', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    await sync(project, zahls);
    const old = (await project.read('cp-012')).zahls;
    await project.write(product()); // zahls: null again
    const r = await sync(project, zahls);
    assert.equal(r.exitCode, 0);
    assert.equal(zahls.paylinks.has(old.shipping.id), false);
    assert.equal(zahls.paylinks.has(old.pickup.id), false);
    const now = (await project.read('cp-012')).zahls;
    assert.deepEqual(await ledger(project), [`cp-012 pickup ${now.pickup.id}`, `cp-012 shipping ${now.shipping.id}`]);
    assert.equal(zahls.paylinks.size, 2);
    await rm(project.root, { recursive: true });
  });

  test('an unreadable product file keeps its links (nothing is deleted by mistake)', async () => {
    const project = await makeProject([product()]);
    const zahls = createFakeZahls();
    await sync(project, zahls);
    const before = await ledger(project);
    await writeFile(project.file('cp-012'), '{ "id": "cp-012", oops');
    const r = await sync(project, zahls);
    assert.equal(r.exitCode, 1);
    assert.equal(zahls.count('DELETE'), 0);
    assert.deepEqual(await ledger(project), before);
    await rm(project.root, { recursive: true });
  });

  test('wrong credentials halfway: the ledger is kept as it was', async () => {
    const project = await makeProject([product(), product({ id: 'cp-013', number: 13 })]);
    const zahls = createFakeZahls();
    await sync(project, zahls);
    const before = await ledger(project);
    await unlink(project.file('cp-012'));
    zahls.failNext('GET', /^\/Invoice\//, { status: 401, times: 10 });
    const r = await sync(project, zahls);
    assert.equal(r.exitCode, 1);
    assert.equal(zahls.count('DELETE'), 0);
    assert.deepEqual(await ledger(project), before);
    await rm(project.root, { recursive: true });
  });

  test('no products with links → no ledger file is created', async () => {
    const project = await makeProject([product({ status: 'hidden' })]);
    const r = await sync(project, createFakeZahls());
    assert.equal(r.changed, false);
    await assert.rejects(access(path.join(project.root, LEDGER_FILE)));
    await rm(project.root, { recursive: true });
  });

  test('ledger format: one link per line, sorted, duplicates removed', () => {
    const text = serializeLedger([
      { product: 'cp-013', kind: 'shipping', id: 7 },
      { product: 'cp-002', kind: 'pickup', id: 9 },
      { product: 'cp-013', kind: 'shipping', id: 7 },
    ]);
    assert.match(text, /\n {4}\{"product":"cp-002","kind":"pickup","id":9\},\n {4}\{"product":"cp-013","kind":"shipping","id":7\}\n {2}\]\n\}\n$/);
    assert.deepEqual(parseLedger(text).map((e) => e.id), [9, 7]);
    assert.deepEqual(parseLedger(serializeLedger([])), []);
  });
});
