// Tests for the admin's CSV export (public/admin/js/csv.js): UTF-8 BOM, ";" separator, CRLF,
// RFC 4180 quoting, formula-injection protection, Italian labels, Swiss time, file names.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as csv from '../../public/admin/js/csv.js';

const DATA = {
  models: [
    { id: 'jolie', name: 'Jolie', type: { it: 'Bauletto' }, price: 45 },
    { id: 'belle', name: 'Belle', type: { it: 'Carolina senza frange' }, price: 40 },
  ],
  taxonomy: {
    colours: [{ id: 'bordeaux', it: 'Bordeaux' }, { id: 'rosa-cipria', it: 'Rosa cipria' }],
    linings: [{ id: 'pois', it: 'A pois' }, { id: 'floreale', it: 'Floreale' }],
    statuses: [
      { id: 'available', it: 'In vendita' },
      { id: 'sold', it: 'Venduta' },
      { id: 'hidden', it: 'Nascosta' },
    ],
  },
};

const HEADER = 'N°;ID;Modello;Tipo;Colore esterno;Interno (fodera);Prezzo CHF;Stato;Creata il;Aggiornata il;Venduta il;Canale di vendita;Nota;Link pagina;Foto';

function product(n, overrides = {}) {
  const id = `cp-${String(n).padStart(3, '0')}`;
  return {
    id, number: n, model: 'belle', status: 'available', price: 40, colour: 'bordeaux', lining: 'pois', note: '',
    photos: [{ src: `media/products/${id}/1`, w: 1600, h: 2000 }, { src: `media/products/${id}/2`, w: 1600, h: 2000 }],
    createdAt: '2026-10-29T15:00:00Z', updatedAt: '2026-10-29T15:30:00Z', soldAt: null, soldChannel: null, zahls: null,
    ...overrides,
  };
}

/** Splits the CSV text (without BOM) into lines, checking CRLF everywhere. */
function lines(text) {
  assert.ok(text.startsWith('﻿'), 'starts with the UTF-8 BOM');
  const body = text.slice(1);
  assert.ok(body.endsWith('\r\n'), 'ends with CRLF');
  assert.ok(!/[^\r]\n/.test(body.replace(/"[^"]*"/g, '')), 'no bare LF outside quotes');
  return body.slice(0, -2).split('\r\n');
}

describe('admin CSV: fields', () => {
  test('RFC 4180 quoting: ; " CR LF are quoted, inner quotes doubled', () => {
    assert.equal(csv.csvField('semplice'), 'semplice');
    assert.equal(csv.csvField('a;b'), '"a;b"');
    assert.equal(csv.csvField('la "Belle"'), '"la ""Belle"""');
    assert.equal(csv.csvField('riga 1\nriga 2'), '"riga 1\nriga 2"');
    assert.equal(csv.csvField('a\r\nb'), '"a\r\nb"');
    assert.equal(csv.csvField('virgola, ok'), 'virgola, ok', 'commas need no quotes with ";"');
    assert.equal(csv.csvField(null), '');
    assert.equal(csv.csvField(undefined), '');
    assert.equal(csv.csvField(12), '12');
    assert.equal(csv.csvField(0), '0');
  });

  test('formula injection: = + - @ TAB CR at the start get an apostrophe', () => {
    assert.equal(csv.csvField('=HYPERLINK("http://x","clic")'), '"\'=HYPERLINK(""http://x"",""clic"")"');
    assert.equal(csv.csvField('+41 79 000 00 00'), "'+41 79 000 00 00");
    assert.equal(csv.csvField('-5'), "'-5");
    assert.equal(csv.csvField('@SUM(A1)'), "'@SUM(A1)");
    assert.equal(csv.csvField('\tcmd'), "'\tcmd");
    assert.equal(csv.csvField('\rcmd'), '"\'\rcmd"');
    assert.equal(csv.csvField('a=b'), 'a=b', 'only the first character matters');
    assert.equal(csv.csvField('– nessuna'), '– nessuna', 'the en dash is not a minus');
  });

  test('accents and emoji survive (UTF-8 + BOM)', () => {
    const text = csv.toCsv([['Chère Pochette', 'è unica 🧶', 'Grüezi']]);
    assert.equal(text, '﻿Chère Pochette;è unica 🧶;Grüezi\r\n');
    const bytes = new TextEncoder().encode(text);
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  });

  test('dates in Swiss time ("YYYY-MM-DD HH:mm"), summer and winter', () => {
    assert.equal(csv.formatDateTime('2026-10-29T15:00:00Z'), '2026-10-29 16:00'); // CET (UTC+1)
    assert.equal(csv.formatDateTime('2026-07-01T22:30:00Z'), '2026-07-02 00:30'); // CEST (UTC+2), next day
    assert.equal(csv.formatDateTime(null), '');
    assert.equal(csv.formatDateTime('not a date'), '');
    assert.equal(csv.formatDay(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  });

  test('prices with two decimals, file names, page links', () => {
    assert.equal(csv.formatPriceCsv(40), '40.00');
    assert.equal(csv.formatPriceCsv(42.5), '42.50');
    assert.equal(csv.formatPriceCsv(0), '');
    const day = new Date('2026-10-29T10:00:00Z');
    assert.equal(csv.csvFilename('available', day), 'chere-pochette_in-vendita_2026-10-29.csv');
    assert.equal(csv.csvFilename('sold', day), 'chere-pochette_vendute_2026-10-29.csv');
    assert.equal(csv.csvFilename('hidden', day), 'chere-pochette_nascoste_2026-10-29.csv');
    assert.equal(csv.csvFilename('all', day), 'chere-pochette_inventario_2026-10-29.csv');
    assert.equal(csv.LIVE_SITE_URL, 'https://cherepochette.ch/');
    assert.equal(csv.productPageUrl(product(12)), 'https://cherepochette.ch/shop/cp-012/');
    assert.equal(csv.productPageUrl(product(12), 'https://example.org/sub'), 'https://example.org/sub/shop/cp-012/');
    assert.equal(csv.productPageUrl(product(12, { status: 'hidden' })), '', 'hidden bags have no page');
  });
});

describe('admin CSV: inventory export', () => {
  test('empty list → header only', () => {
    const text = csv.inventoryCsv([], DATA);
    assert.equal(text, `﻿${HEADER}\r\n`);
    assert.deepEqual(lines(text), [HEADER]);
    assert.equal(csv.CSV_HEADERS.length, 15);
  });

  test('one row per bag with Italian labels', () => {
    const products = [
      product(1),
      product(2, {
        model: 'jolie', price: 45, colour: 'rosa-cipria', lining: 'floreale', status: 'sold',
        soldAt: '2026-11-02T09:05:00Z', soldChannel: 'online-shipping', note: 'Manici color panna; “unica”',
        photos: [{ src: 'media/products/cp-002/1', w: 1, h: 1 }],
      }),
      product(3, { status: 'sold', soldAt: '2026-11-03T12:00:00Z', soldChannel: 'online-pickup' }),
      product(4, { status: 'sold', soldAt: '2026-11-04T12:00:00Z', soldChannel: 'manual', price: 42.5 }),
      product(5, { status: 'hidden', note: '=1+1', photos: [] }),
    ];
    const rows = lines(csv.inventoryCsv(products, DATA));
    assert.equal(rows.length, 6);
    assert.equal(rows[0], HEADER);
    assert.equal(
      rows[1],
      '1;cp-001;Belle;Carolina senza frange;Bordeaux;A pois;40.00;In vendita;2026-10-29 16:00;2026-10-29 16:30;;–;;https://cherepochette.ch/shop/cp-001/;2',
    );
    assert.equal(
      rows[2],
      '2;cp-002;Jolie;Bauletto;Rosa cipria;Floreale;45.00;Venduta;2026-10-29 16:00;2026-10-29 16:30;2026-11-02 10:05;online – spedizione;"Manici color panna; “unica”";https://cherepochette.ch/shop/cp-002/;1',
    );
    assert.match(rows[3], /;Venduta;.*;online – ritiro;/);
    assert.match(rows[4], /;42\.50;Venduta;.*;manuale;/);
    assert.equal(rows[5], "5;cp-005;Belle;Carolina senza frange;Bordeaux;A pois;40.00;Nascosta;2026-10-29 16:00;2026-10-29 16:30;;–;'=1+1;;0");
    for (const row of rows.slice(1)) assert.equal(row.split(';').length >= 15, true);
  });

  test('unknown ids are shown as they are (a new colour not yet in taxonomy.json)', () => {
    const [, row] = csv.inventoryRows([product(9, { colour: 'oro', model: 'nuovo', soldChannel: 'x' })], DATA);
    assert.equal(row[2], 'nuovo');
    assert.equal(row[3], '');
    assert.equal(row[4], 'oro');
    assert.equal(row[11], '–', 'channel only for sold bags');
  });
});
