#!/usr/bin/env node
/**
 * build-visuals.mjs — regenerates every brand image of the Chère Pochette website
 * from the original photos (see docs/VISUALS.md for the list and the reasons behind each crop).
 *
 * Usage (from the site root, sharp is already a project dependency):
 *   node scripts/build-visuals.mjs --src <folder with the original photos> [--site .] [--review <folder>] [--only brand,products,icons,sheet]
 *
 * What it writes:
 *   src/assets/brand/*           editorial photos, bag cut-outs, transparent logos (optimised later by Astro)
 *   public/media/products/<id>/  sample product photos <n>-{400,900,1600}.jpg (+ updates w/h in src/data/products/<id>.json)
 *   public/brand/*               logos for admin/e-mails, PWA icons
 *   public/favicon.svg|ico, public/apple-touch-icon.png, public/og-image.jpg
 *   <review>/visuals-contact-sheet.jpg (only if --review is given)
 *
 * Rules we follow (brand kit): light neutral backgrounds, natural light, only gentle global corrections —
 * the bags must look exactly like the real items. Every output is sRGB with all metadata stripped
 * (sharp does that by default as long as we never call .withMetadata()).
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- CLI / paths
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const SITE = path.resolve(args.site || '.');
const SRC = path.resolve(args.src || path.join(SITE, 'design/originals'));
const REVIEW = args.review ? path.resolve(args.review) : null;
const ONLY = args.only ? new Set(args.only.split(',')) : null;
const want = (step) => !ONLY || ONLY.has(step);

// sharp is resolved from the site's node_modules, so the script also works when kept outside the repo.
const require = createRequire(path.join(SITE, 'package.json'));
const sharp = require('sharp');

const out = (...p) => {
  const file = path.join(SITE, ...p);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
};
const src = (name) => {
  const file = path.join(SRC, name);
  if (!fs.existsSync(file)) throw new Error(`Missing original photo: ${file}`);
  return file;
};

// ---------------------------------------------------------------- brand constants
const BORDEAUX = '#82001F';
const IVORY = '#FAF7F2';
const IVORY_RGB = [250, 247, 242];
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const JPEG_BRAND = { quality: 85, progressive: true, mozjpeg: true }; // re-encoded by Astro anyway
const JPEG_PRODUCT = { quality: 82, progressive: true, mozjpeg: true }; // served as-is
const PRODUCT_WIDTHS = [400, 900, 1600]; // product photos are 4:5 → 400x500, 900x1125, 1600x2000

/**
 * Gentle, global-only corrections. Each value is optional:
 *   linear: [a, b]   out = a * in + b on all channels (tiny contrast / black point)
 *   recomb: [r, g, b] per-channel gain (tiny white-balance shift)
 */
function adjust(pipeline, corr = {}) {
  if (corr.recomb) {
    const [r, g, b] = corr.recomb;
    pipeline = pipeline.recomb([[r, 0, 0], [0, g, 0], [0, 0, b]]);
  }
  if (corr.linear) pipeline = pipeline.linear(corr.linear[0], corr.linear[1]);
  return pipeline;
}

// Per-photo corrections, decided by eye (see docs/VISUALS.md). Bag photos are left (almost) untouched.
const CORR = {
  'bag-belle-bordeaux-hands.jpeg': { linear: [1.04, -9] }, // slightly deeper blacks, colours unchanged
  'bag-belle-bordeaux-umbrella.jpeg': {}, // already punchy: untouched
  'umbrellas-collected-a.jpeg': { linear: [1.05, -4] }, // a bit dull: tiny lift
  'umbrellas-fabrics.jpeg': {},
  'yarn-fettuccia.jpeg': {},
  'women-crochet.jpeg': { recomb: [0.975, 1, 1.04] }, // warm indoor light: cool it down a touch
  'lifestyle-belle-bordeaux-ticino.png': {},
  'belle-bordeaux-oak-chair.png': {},
};

/** Crop (in original pixels), apply the gentle correction, resize, light output sharpening. */
function photo(file, crop, width, height) {
  let p = sharp(src(file)).rotate(); // .rotate() = respect EXIF orientation, then forget it
  if (crop) p = p.extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] });
  p = p.resize(width, height, { fit: 'cover', kernel: 'lanczos3' });
  p = adjust(p, CORR[file]);
  return p.sharpen({ sigma: 0.5 }).toColourspace('srgb');
}

// ---------------------------------------------------------------- 1. editorial photos
// crop = [left, top, width, height] in pixels of the original file; null = whole frame.
const EDITORIAL = [
  { name: 'hero-bag-hands.jpg', file: 'bag-belle-bordeaux-hands.jpeg', crop: null, size: [2400, 1600] },
  { name: 'hero-bag-hands-45.jpg', file: 'bag-belle-bordeaux-hands.jpeg', crop: [1450, 0, 2406, 3008], size: [1920, 2400] },
  { name: 'hero-bag-umbrella.jpg', file: 'bag-belle-bordeaux-umbrella.jpeg', crop: null, size: [1440, 2560] },
  { name: 'hero-bag-umbrella-45.jpg', file: 'bag-belle-bordeaux-umbrella.jpeg', crop: [400, 1850, 2480, 3100], size: [1920, 2400] },
  { name: 'umbrellas-collected.jpg', file: 'umbrellas-collected-a.jpeg', crop: [0, 1300, 2700, 3375], size: [1920, 2400] },
  { name: 'umbrellas-fabrics.jpg', file: 'umbrellas-fabrics.jpeg', crop: [340, 300, 2540, 3175], size: [1920, 2400] },
  { name: 'yarn-fettuccia.jpg', file: 'yarn-fettuccia.jpeg', crop: [0, 100, 2880, 3600], size: [1920, 2400] },
  { name: 'women-crochet.jpg', file: 'women-crochet.jpeg', crop: [300, 0, 4320, 2880], size: [2400, 1600] },
  { name: 'women-crochet-45.jpg', file: 'women-crochet.jpeg', crop: [800, 180, 2160, 2700], size: [1920, 2400] },
  // Generated lifestyle images (supplied 30.10.2026, already 4:5): only on editorial sections, never on a product card.
  { name: 'hero-lifestyle.jpg', file: 'lifestyle-belle-bordeaux-ticino.png', crop: null, size: [1120, 1400] },
  { name: 'belle-oak-chair.jpg', file: 'belle-bordeaux-oak-chair.png', crop: null, size: [1120, 1400] },
];

async function buildEditorial() {
  for (const e of EDITORIAL) {
    await photo(e.file, e.crop, ...e.size).jpeg(JPEG_BRAND).toFile(out('src/assets/brand', e.name));
    console.log('  brand/' + e.name);
  }
}

// ---------------------------------------------------------------- 2. bag cut-outs on ivory
// The model-*.png originals are bags cut out and placed on #FAF7F2. We trim them, then place every bag
// in the same frame so the three models look consistent (same padding and similar visual weight).
const MODELS = ['jolie', 'belle', 'coquette'];

/** Bounding box of everything that differs from the ivory background (ignores single stray pixels). */
async function subjectBox(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const rows = new Uint32Array(H), cols = new Uint32Array(W);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const d = Math.max(Math.abs(data[i] - IVORY_RGB[0]), Math.abs(data[i + 1] - IVORY_RGB[1]), Math.abs(data[i + 2] - IVORY_RGB[2]));
      if (d > 14) { rows[y]++; cols[x]++; }
    }
  }
  const first = (a) => a.findIndex((v) => v > 2);
  const last = (a) => a.length - 1 - [...a].reverse().findIndex((v) => v > 2);
  const left = first(cols), right = last(cols), top = first(rows), bottom = last(rows);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Snap every near-ivory pixel to exactly #FAF7F2 so the image melts into the page background. */
async function snapBackground(buffer) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 3) {
    if (Math.abs(data[i] - IVORY_RGB[0]) <= 3 && Math.abs(data[i + 1] - IVORY_RGB[1]) <= 3 && Math.abs(data[i + 2] - IVORY_RGB[2]) <= 3) {
      data[i] = IVORY_RGB[0]; data[i + 1] = IVORY_RGB[1]; data[i + 2] = IVORY_RGB[2];
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } });
}

/**
 * Place a trimmed bag on an ivory canvas.
 * maxSide: longest side of the bag in px; geoMean: cap on sqrt(w*h) so that a squarish bag does not look
 * bigger than a wide one. cy: vertical centre of the bag as a fraction of the canvas height.
 */
async function cutoutOnIvory(model, canvasW, canvasH, maxSide, geoMean, cy = 0.5) {
  const file = src(`model-${model}.png`);
  const box = await subjectBox(file);
  const scale = Math.min(maxSide / Math.max(box.width, box.height), geoMean / Math.sqrt(box.width * box.height));
  const w = Math.round(box.width * scale), h = Math.round(box.height * scale);
  const bag = await sharp(file).removeAlpha().extract(box).resize(w, h, { kernel: 'lanczos3' }).toBuffer();
  const composed = await sharp({ create: { width: canvasW, height: canvasH, channels: 3, background: IVORY } })
    .composite([{ input: bag, left: Math.round((canvasW - w) / 2), top: Math.round(canvasH * cy - h / 2) }])
    .png()
    .toBuffer();
  return { image: await snapBackground(composed), box, scale };
}

async function buildModels() {
  for (const m of MODELS) {
    const { image, box, scale } = await cutoutOnIvory(m, 1400, 1400, 1100, 950);
    await image.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(out('src/assets/brand', `model-${m}.png`));
    console.log(`  brand/model-${m}.png (bag ${box.width}x${box.height} → x${scale.toFixed(2)})`);
  }
}

// ---------------------------------------------------------------- 3. logos (transparent)
// The logo only exists as a JPEG on white. We rebuild a clean transparent version:
// alpha = how far each pixel's luminance is from the paper towards the ink, RGB = exact brand colour.
const LOGO = { file: 'logo-on-white.jpeg', region: [240, 820, 720, 400], paperY: 254, inkY: 35, pad: 0.04 };

async function logoAlpha(scale = 2) {
  const [left, top, width, height] = LOGO.region;
  const { data, info } = await sharp(src(LOGO.file))
    .toColourspace('srgb')
    .extract({ left, top, width, height })
    .resize(width * scale, height * scale, { kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const alpha = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    const y = 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2];
    let a = (LOGO.paperY - y) / (LOGO.paperY - LOGO.inkY);
    a = (a - 0.06) / 0.88; // levels: drop JPEG noise on the paper, make the strokes fully opaque
    alpha[i] = Math.round(255 * Math.min(1, Math.max(0, a)));
  }
  // tight crop around the ink + small transparent margin
  let minX = info.width, minY = info.height, maxX = 0, maxY = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (alpha[y * info.width + x] > 24) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  const m = Math.round((maxX - minX) * LOGO.pad);
  const box = { left: Math.max(0, minX - m), top: Math.max(0, minY - m) };
  box.width = Math.min(info.width, maxX + m + 1) - box.left;
  box.height = Math.min(info.height, maxY + m + 1) - box.top;
  return sharp(alpha, { raw: { width: info.width, height: info.height, channels: 1 } })
    .extract(box)
    .toColourspace('b-w') // keep a single channel (sharp would otherwise expand to RGB)
    .raw()
    .toBuffer({ resolveWithObject: true });
}

/** RGBA PNG buffer of the logo in a flat colour, optionally resized to `width`. */
async function logoPng(color, width) {
  const { data: a, info } = await logoAlpha();
  const [r, g, b] = hexToRgb(color);
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a[i];
  }
  let p = sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } });
  if (width) p = p.resize(width, null, { kernel: 'lanczos3' });
  return p.png({ compressionLevel: 9 }).toBuffer();
}

async function buildLogos() {
  for (const [name, color] of [['logo-bordeaux.png', BORDEAUX], ['logo-ivory.png', IVORY]]) {
    fs.writeFileSync(out('src/assets/brand', name), await logoPng(color));
    fs.writeFileSync(out('public/brand', name), await logoPng(color, 800));
    console.log(`  brand/${name} + public/brand/${name}`);
  }
}

// ---------------------------------------------------------------- 4. sample product photos (4:5)
const PRODUCTS = [
  { id: 'cp-001', n: 1, make: () => photo('bag-belle-bordeaux-hands.jpeg', [1200, 0, 2406, 3008], 1600, 2000) },
  { id: 'cp-001', n: 2, make: () => photo('bag-belle-bordeaux-umbrella.jpeg', [400, 1850, 2480, 3100], 1600, 2000) },
  { id: 'cp-002', n: 1, make: async () => (await cutoutOnIvory('jolie', 1600, 2000, 1340, 1080, 0.49)).image },
  { id: 'cp-003', n: 1, make: async () => (await cutoutOnIvory('coquette', 1600, 2000, 1340, 1080, 0.49)).image },
  { id: 'cp-004', n: 1, make: async () => (await cutoutOnIvory('belle', 1600, 2000, 1340, 1080, 0.49)).image },
];

async function buildProducts() {
  const sizes = {};
  for (const p of PRODUCTS) {
    const master = await (await p.make()).png().toBuffer(); // 1600x2000 master, then the three widths
    for (const w of PRODUCT_WIDTHS) {
      const file = out('public/media/products', p.id, `${p.n}-${w}.jpg`);
      await sharp(master).resize(w, Math.round(w * 1.25), { kernel: 'lanczos3' }).jpeg(JPEG_PRODUCT).toFile(file);
    }
    const meta = await sharp(out('public/media/products', p.id, `${p.n}-1600.jpg`)).metadata();
    sizes[`media/products/${p.id}/${p.n}`] = [meta.width, meta.height];
    console.log(`  media/products/${p.id}/${p.n}-{${PRODUCT_WIDTHS}}.jpg`);
  }
  // Update ONLY the w/h of matching photo entries in the seed product JSON files.
  for (const id of new Set(PRODUCTS.map((p) => p.id))) {
    const file = path.join(SITE, 'src/data/products', `${id}.json`);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(text);
    let changed = false;
    for (const ph of json.photos || []) {
      const s = sizes[ph.src];
      if (s && (ph.w !== s[0] || ph.h !== s[1])) { ph.w = s[0]; ph.h = s[1]; changed = true; }
    }
    if (changed) {
      fs.writeFileSync(file, JSON.stringify(json, null, 2) + (text.endsWith('\n') ? '\n' : ''));
      console.log(`  updated w/h in src/data/products/${id}.json`);
    }
  }
}

// ---------------------------------------------------------------- 5. icons, favicon, OG image
const f2 = (n) => +n.toFixed(2);

/**
 * The monogram, drawn in a 64x64 box: a Bodoni-style "C" (thick left stroke, hairline top/bottom,
 * ball terminal), crossed by the logo's needle, with the thread looping at the needle's foot and
 * running under the C like the line under the wordmark. Pure paths, no fonts.
 * The thread and needle eye carry class "fine" so the favicon can hide them at 16px.
 */
function markSvg(color) {
  const O = { cx: 29, cy: 31, rx: 18.5, ry: 21 }; // outer ellipse of the C
  const I = { cx: 32.2, cy: 31, rx: 12.6, ry: 17.6 }; // inner ellipse, shifted right → contrast
  const at = (E, deg) => { const a = (deg * Math.PI) / 180; return [E.cx + E.rx * Math.cos(a), E.cy + E.ry * Math.sin(a)]; };
  const [o1x, o1y] = at(O, -48), [o2x, o2y] = at(O, 50), [i2x, i2y] = at(I, 50), [i1x, i1y] = at(I, -48);
  const c = `M${f2(o1x)} ${f2(o1y)}A${O.rx} ${O.ry} 0 1 0 ${f2(o2x)} ${f2(o2y)}L${f2(i2x)} ${f2(i2y)}A${I.rx} ${I.ry} 0 1 1 ${f2(i1x)} ${f2(i1y)}Z`;
  const ball = `<circle cx="${f2(i1x - 0.2)}" cy="${f2(i1y + 2.6)}" r="3.3"/>`;

  // needle: tip (lower left) → rounded head (upper right)
  const T = [36, 58], Hd = [56, 8], w = 1.9;
  const L = Math.hypot(Hd[0] - T[0], Hd[1] - T[1]);
  const u = [(Hd[0] - T[0]) / L, (Hd[1] - T[1]) / L], n = [-u[1], u[0]];
  const p = (base, along, across) => [base[0] + u[0] * along + n[0] * across, base[1] + u[1] * along + n[1] * across];
  const hl = p(Hd, 0, w), hr = p(Hd, 0, -w), sl = p(T, 14, w * 0.8), sr = p(T, 14, -w * 0.8);
  const needle = `M${T[0]} ${T[1]}L${f2(sl[0])} ${f2(sl[1])}L${f2(hl[0])} ${f2(hl[1])}A${w} ${w} 0 0 0 ${f2(hr[0])} ${f2(hr[1])}L${f2(sr[0])} ${f2(sr[1])}Z`;
  const e1 = p(Hd, -1.6, 0), e2 = p(Hd, -7.2, 0), ew = 0.75;
  const [ea, eb, ec, ed] = [p(e1, 0, ew), p(e1, 0, -ew), p(e2, 0, -ew), p(e2, 0, ew)];
  const eye = `M${f2(ea[0])} ${f2(ea[1])}A${ew} ${ew} 0 0 1 ${f2(eb[0])} ${f2(eb[1])}L${f2(ec[0])} ${f2(ec[1])}A${ew} ${ew} 0 0 1 ${f2(ed[0])} ${f2(ed[1])}Z`;
  const eyeMid = p(Hd, -4.4, 0);
  const thread = `M7 54.5C19 59.5 33 59.5 41.5 55.5C47.5 52.5 47 46 43 47.2C39.2 48.4 40.6 54.6 46 52.6C53.5 49.5 57.5 30 ${f2(eyeMid[0])} ${f2(eyeMid[1])}`;

  return (
    `<g fill="${color}"><path d="${c}"/>${ball}<path d="${needle}"/></g>` +
    `<path class="fine" d="${eye}" fill="${color === BORDEAUX ? IVORY : BORDEAUX}"/>` +
    `<path class="fine" d="${thread}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`
  );
}

/** Full icon: background + mark scaled into a centred square of `markFrac` of the size. */
function iconSvg({ size = 64, bg, fg, markFrac = 1, radius = 0, smallStyle = false }) {
  const s = (size * markFrac) / 64, off = (size - size * markFrac) / 2;
  const style = smallStyle
    ? '<style>@media (max-width: 24px) { .fine { display: none; } }</style>' // 16px tabs: keep only C + needle
    : '';
  const rect = bg ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${style}${rect}<g transform="translate(${f2(off)} ${f2(off)}) scale(${f2(s)})">${markSvg(fg)}</g></svg>`;
}

/** Rasterise a 64-unit SVG icon to px×px. opaque = drop the alpha channel (home-screen icons must be opaque). */
const renderSvg = (svg, px, opaque = false) => {
  let p = sharp(Buffer.from(svg), { density: 72 * (px / 64) }).resize(px, px);
  if (opaque) p = p.removeAlpha();
  return p.png({ compressionLevel: 9 }).toBuffer();
};

/** Minimal .ico writer: PNG-compressed entries (supported by every current browser). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e); header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

async function buildIcons() {
  // favicon.svg — ivory tile so it reads on light AND dark browser tabs
  const fav = iconSvg({ bg: IVORY, fg: BORDEAUX, markFrac: 0.96, radius: 14, smallStyle: true });
  fs.writeFileSync(out('public/favicon.svg'), fav + '\n');
  // favicon.ico — 16 (simplified, no hairlines) + 32
  const fav16 = iconSvg({ bg: IVORY, fg: BORDEAUX, markFrac: 0.96, radius: 14 }).replace(/<path class="fine"[^>]*\/>/g, '');
  fs.writeFileSync(out('public/favicon.ico'), ico([
    { size: 16, data: await renderSvg(fav16, 16) },
    { size: 32, data: await renderSvg(iconSvg({ bg: IVORY, fg: BORDEAUX, markFrac: 0.96, radius: 14 }), 32) },
  ]));
  // apple-touch-icon — square, opaque ivory (iOS rounds the corners itself)
  fs.writeFileSync(out('public/apple-touch-icon.png'), await renderSvg(iconSvg({ bg: IVORY, fg: BORDEAUX, markFrac: 0.74 }), 180, true));
  // PWA icons for the admin — bordeaux, ivory mark inside the maskable safe zone (central 80% circle)
  for (const px of [192, 512]) {
    fs.writeFileSync(out('public/brand', `icon-${px}.png`), await renderSvg(iconSvg({ bg: BORDEAUX, fg: IVORY, markFrac: 0.6 }), px, true));
  }
  console.log('  favicon.svg, favicon.ico, apple-touch-icon.png, brand/icon-192.png, brand/icon-512.png');

  // og-image — 1200x630: logo on ivory (left), bag photo (right), thin bordeaux thread line between.
  const W = 1200, H = 630, photoW = 600;
  const bag = await photo('bag-belle-bordeaux-hands.jpeg', [920, 0, 2864, 3008], photoW, H).png().toBuffer();
  const logo = await logoPng(BORDEAUX, 440);
  const lm = await sharp(logo).metadata();
  const line = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><line x1="${W - photoW - 1}" y1="0" x2="${W - photoW - 1}" y2="${H}" stroke="${BORDEAUX}" stroke-width="2" opacity="0.85"/></svg>`);
  await sharp({ create: { width: W, height: H, channels: 3, background: IVORY } })
    .composite([
      { input: logo, left: Math.round((W - photoW - lm.width) / 2), top: Math.round((H - lm.height) / 2) },
      { input: bag, left: W - photoW, top: 0 },
      { input: line, left: 0, top: 0 },
    ])
    .jpeg({ quality: 86, progressive: true, mozjpeg: true })
    .toFile(out('public/og-image.jpg'));
  console.log('  og-image.jpg');
}

// ---------------------------------------------------------------- 6. contact sheet for review
async function buildContactSheet() {
  if (!REVIEW) return;
  const items = [
    ...EDITORIAL.map((e) => ['src/assets/brand/' + e.name]),
    ...MODELS.map((m) => [`src/assets/brand/model-${m}.png`]),
    ['src/assets/brand/logo-bordeaux.png', IVORY],
    ['src/assets/brand/logo-ivory.png', BORDEAUX],
    ...PRODUCTS.map((p) => [`public/media/products/${p.id}/${p.n}-900.jpg`]),
    ['public/og-image.jpg'],
    ['public/apple-touch-icon.png'],
    ['public/brand/icon-512.png'],
    ['public/favicon.svg'],
  ];
  const cell = 300, label = 34, gap = 14, cols = 6;
  const rows = Math.ceil(items.length / cols);
  const W = cols * (cell + gap) + gap, H = rows * (cell + label + gap) + gap + 50;
  const tiles = [];
  for (const [i, [rel, bg]] of items.entries()) {
    const x = gap + (i % cols) * (cell + gap), y = 50 + gap + Math.floor(i / cols) * (cell + label + gap);
    const file = path.join(SITE, rel);
    const meta = await sharp(file).metadata();
    const thumb = await sharp(file, { density: 300 }).resize(cell, cell, { fit: 'contain', background: bg || '#e4e0db' }).flatten({ background: bg || '#e4e0db' }).png().toBuffer();
    const kb = Math.round(fs.statSync(file).size / 1024);
    const caption = `${rel.replace(/^(src\/assets\/|public\/)/, '')}  ${meta.width}×${meta.height}  ${kb} KB`;
    tiles.push({ input: thumb, left: x, top: y });
    tiles.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${label}"><text x="0" y="20" font-family="Helvetica, Arial, sans-serif" font-size="12.5" fill="#292929">${caption}</text></svg>`), left: x, top: y + cell + 4 });
  }
  tiles.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="50"><text x="${gap}" y="34" font-family="Georgia, serif" font-size="24" fill="${BORDEAUX}">Chère Pochette — visual assets (${new Date().toISOString().slice(0, 10)})</text></svg>`), left: 0, top: 0 });
  fs.mkdirSync(REVIEW, { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite(tiles).jpeg({ quality: 84 }).toFile(path.join(REVIEW, 'visuals-contact-sheet.jpg'));
  console.log('  contact sheet → ' + path.join(REVIEW, 'visuals-contact-sheet.jpg'));
}

// ---------------------------------------------------------------- run
console.log(`Originals: ${SRC}\nSite:      ${SITE}`);
if (want('brand')) { await buildEditorial(); await buildModels(); await buildLogos(); }
if (want('products')) await buildProducts();
if (want('icons')) await buildIcons();
if (want('sheet')) await buildContactSheet();
console.log('Done.');
