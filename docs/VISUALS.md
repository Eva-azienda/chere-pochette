# Visuals — images, logo, icons

Everything the site and the admin show as an image, where it comes from, how to rebuild it, and how to take
better photos. Technical parts are in English; the **photo guide for the team is in Italian** (section 5).

Brand rules (from the brand kit): light, neutral backgrounds; natural light; essential style; bordeaux
`#82001F` only as an accent; ivory `#FAF7F2` everywhere else. Photos only get **gentle global corrections**
(exposure, contrast, white balance). Bags must look exactly like the real items, so we never retouch them.

All files are sRGB with **no metadata** (no EXIF, no GPS, no camera data).

---

## 1. Asset list

### Editorial photos: `src/assets/brand/` (imported in pages, optimised by Astro `astro:assets`)

| File | Size / ratio | Source (original) | Treatment | Suggested use | Focal point (`object-position`) |
|---|---|---|---|---|---|
| `hero-bag-hands.jpg` | 2400×1600 · 3:2 | `bag-belle-bordeaux-hands.jpeg` | full frame, blacks slightly deepened | Home hero (desktop/tablet) | `46% 52%` (the bag) |
| `hero-bag-hands-45.jpg` | 1920×2400 · 4:5 | same | crop on bag + hand with rings | Home hero (mobile) | `50% 50%` |
| `hero-bag-umbrella.jpg` | 1440×2560 · 9:16 | `bag-belle-bordeaux-umbrella.jpeg` | full frame, untouched | "From umbrella to bag" opener, story sections, Instagram-like tall slot | `55% 70%` |
| `hero-bag-umbrella-45.jpg` | 1920×2400 · 4:5 | same | crop: bag, umbrella shaft and handle | Process step 5 "Chère Pochette", About | `53% 60%` |
| `umbrellas-collected.jpg` | 1920×2400 · 4:5 | `umbrellas-collected-a.jpeg` (sharper and brighter than `-b`) | crop: bin + crate, corridor removed as far as possible, tiny lift | Process step 1 "Recupero" | `40% 50%` |
| `umbrellas-fabrics.jpg` | 1920×2400 · 4:5 | `umbrellas-fabrics.jpeg` | crop: most patterns (pois, floral, leopard, rainbow); a third-party logo printed on one umbrella is cropped out | Process step 2 "Selezione", linings section | `50% 50%` |
| `yarn-fettuccia.jpg` | 1920×2400 · 4:5 | `yarn-fettuccia.jpeg` | crop: flowers + spools, bottom row of barcodes removed | Process step 3 "Creazione" / materials | `40% 45%` |
| `women-crochet.jpg` | 2400×1600 · 3:2 | `women-crochet.jpeg` | crop: window + clutter on the sides removed, warm cast slightly cooled | About "Ukrainian women" (desktop) | `50% 45%` |
| `women-crochet-45.jpg` | 1920×2400 · 4:5 | same | crop: two women crocheting by the stove + hands at work | same section (mobile) | `50% 40%` |

Every editorial photo is in a portrait (4:5) and/or landscape (3:2) version, so the site can use **art
direction** (portrait on phones, landscape on desktop). With Astro, call `getImage()` for each version and write
a plain `<picture>` with `<source media="(max-width: 47.99rem)">`. Or use `<Image>` with `object-fit: cover`
and the focal point above.

### Bag cut-outs: `src/assets/brand/model-*.png`

`model-jolie.png`, `model-belle.png`, `model-coquette.png`: 1400×1400, the bag trimmed and centred on
**exactly `#FAF7F2`** (the page background), so the image blends into the page with no visible box. All three use the
same frame. Each bag is at most 1100 px on its longest side, and the squarer Belle is scaled down a little so that it
does not look bigger than the wide models. Use them for the "3 models" section and the shop filter.
Do not add a border or a background colour behind them.

- Belle: the yellow measuring tape is part of the original photo and was **kept** (removing it would mean
  inventing the crochet underneath).
- Coquette: the photo shows the yellow fringed bag in front of a brown/black bag. Both were kept for the same reason.

### Logo (transparent): `src/assets/brand/logo-*.png`, `public/brand/logo-*.png`

| File | Size | Use |
|---|---|---|
| `src/assets/brand/logo-bordeaux.png` | 1306×685, 2× upscaled | on ivory/white/powder backgrounds (header, hero, footer on light) |
| `src/assets/brand/logo-ivory.png` | 1306×685 | on bordeaux/plum/photos (dark footer, overlays) |
| `public/brand/logo-bordeaux.png`, `public/brand/logo-ivory.png` | 800×420 | admin, e-mails, anything outside Astro |

They were rebuilt from `logo-on-white.jpeg`. Alpha = how far each pixel's luminance is from the paper towards the
ink, and RGB = the exact brand colour. The result has clean edges and no white halo. Do not stretch it, recolour it,
or move its elements (brand kit rule). The slogan "Made to carry on" is readable from about **260 px** logo width.
Below that it still works as texture (fine for a ~160 px header logo).

### Icons and sharing: `public/`

| File | What |
|---|---|
| `favicon.svg` | Monogram: a Bodoni-style **C** crossed by the logo's needle, with the thread looping at the needle's foot (drawn as paths, no fonts). Ivory rounded tile, so it reads on light and dark tabs. Below 24 px the thread and needle eye are hidden by a media query inside the SVG. |
| `favicon.ico` | 16 px (C + needle only) + 32 px, PNG-compressed entries |
| `apple-touch-icon.png` | 180×180, opaque ivory, bordeaux mark (iOS rounds the corners) |
| `brand/icon-192.png`, `brand/icon-512.png` | Admin PWA icons: bordeaux background, ivory mark inside the maskable safe zone (central 80 % circle). Use `"purpose": "any maskable"`. |
| `og-image.jpg` | 1200×630 social preview: logo on ivory (left) + the bordeaux Belle in hand (right). No text other than the logo, so it works in all 3 languages. |

Suggested `<head>` (prefix every path with `import.meta.env.BASE_URL`; `og:image` must be an absolute URL):

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:image" content="https://<domain>/og-image.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="theme-color" content="#FAF7F2">
```

### Sample product photos: `public/media/products/<id>/<n>-{400,900,1600}.jpg`

4:5 portrait, widths 400/900/1600 (→ 400×500, 900×1125, 1600×2000). JPEG q82, progressive, sRGB, no metadata.
`w`/`h` in the product JSON = size of the `-1600` file. They are served as-is (not processed by Astro).

| Photo | Source | Note |
|---|---|---|
| `cp-001/1` | bordeaux Belle in hand, 4:5 crop on the bag | the bag is slightly cut on the left (the original is landscape) |
| `cp-001/2` | bordeaux Belle on the red umbrella | whole bag + umbrella handle |
| `cp-002/1` | `model-jolie` on ivory | |
| `cp-003/1` | `model-coquette` on ivory | 2 bags visible, see above |
| `cp-004/1` | `model-belle` on ivory | measuring tape visible |

These four products (`cp-001`…`cp-004`) are demo bags (their files no longer carry `"sample": true`). **Replace them
with real bags and real photos** through the admin (section 5), and delete them before online payment is switched on.

**Admin photos:** photos taken with a phone contain **GPS coordinates** in EXIF. The admin
(`public/admin/js/images.js`) re-draws every photo in the browser (canvas → JPEG, which drops all metadata) at
the same 400/900/1600 widths, quality 0.82, **keeping the original aspect ratio** (no crop; the site shows product
photos in a 4:5 frame with `object-fit: cover`). The repo is public, so no original phone file is ever committed.

---

## 2. Original files

The originals are **not** committed (the repo is public and they weigh about 17 MB). They live in the team's
shared Drive folder `Website Eva/03_Media/originals` (WhatsApp exports). The script expects one folder holding
copies renamed as follows (suggested place: `Website Eva/03_Media/originals/named/`):
`bag-belle-bordeaux-hands.jpeg`, `bag-belle-bordeaux-umbrella.jpeg`, `umbrellas-collected-a.jpeg`,
`umbrellas-collected-b.jpeg`, `umbrellas-fabrics.jpeg`, `yarn-fettuccia.jpeg`, `women-crochet.jpeg`,
`model-jolie.png`, `model-belle.png`, `model-coquette.png`, `logo-on-white.jpeg`, `logo-on-ivory.jpeg`.

## 3. How to regenerate

All assets above are produced by one script, `scripts/build-visuals.mjs` (Node + `sharp`, already a project
dependency; no other tools needed). If the script is not in `scripts/` yet, ask the lead for it: it was written
next to this doc and handed over for commit. Crops, corrections and sizes are plain constants at the top of each section
of the script, with comments.

```bash
# from the site root; --src = folder with the original photos
node scripts/build-visuals.mjs --src ../originals
node scripts/build-visuals.mjs --src ../originals --only brand            # just src/assets/brand
node scripts/build-visuals.mjs --src ../originals --only icons            # favicon, touch/PWA icons, og-image
node scripts/build-visuals.mjs --src ../originals --review ../review      # + contact sheet of all outputs
```

`--only` accepts `brand`, `products`, `icons`, `sheet` (comma-separated). The `products` step also updates the
`w`/`h` of the matching photos in `src/data/products/*.json`, and does nothing else to those files.

To change a crop: open the original, note the rectangle in pixels (`[left, top, width, height]`), edit the
matching line in `EDITORIAL` or `PRODUCTS`, re-run, and look at the result before committing.

## 4. Sizes and formats at a glance

| Kind | Ratio | Master size | Format |
|---|---|---|---|
| Editorial landscape | 3:2 | 2400×1600 | JPEG q85 (Astro re-encodes to WebP/AVIF) |
| Editorial portrait | 4:5 | 1920×2400 | JPEG q85 |
| Product photos | 4:5 | 1600×2000 (+900, +400) | JPEG q82 progressive |
| Cut-outs | 1:1 | 1400×1400 | PNG on `#FAF7F2` |
| Logos | — | 1306 px wide (src) / 800 px (public) | PNG, transparent |

---

## 5. Guida foto per il team (prodotti, team, processo)

### Prodotti: ogni borsa è un pezzo unico, quindi ogni borsa ha le sue foto
- **Telefono** va benissimo (fotocamera principale 1×, mai lo zoom digitale). Pulisci l'obiettivo.
- **Luce naturale**, vicino a una finestra, di giorno, **senza sole diretto** (niente ombre dure, niente
  riflessi bruciati). Spegni le luci della stanza e il flash.
- **Sfondo semplice avorio o bianco**: un foglio grande di cartoncino, un lenzuolo stirato, un muro chiaro.
  Lo stesso sfondo per tutte le borse, così il negozio è uniforme.
- **Formato verticale** (sul telefono: formato 3:4 o 4:5). L'admin non ritaglia le foto, ma il sito le mostra in un riquadro
  4:5 e taglia i bordi: tieni la borsa al centro, con un po' d'aria intorno (circa il 70 % della larghezza).
- **3-4 foto per borsa, sempre in questo ordine** (la prima è la copertina nel negozio):
  1. **Fronte**: borsa appoggiata dritta, vista frontale, all'altezza della borsa (non dall'alto).
  2. **Interno / fodera**: borsa aperta, si vede il tessuto dell'ombrello. È il nostro punto forte!
  3. **Dettaglio del punto**: primo piano della lavorazione all'uncinetto e del manico (riempi l'inquadratura).
  4. **Indossata**: a mano o a spalla, su una maglia tinta unita in colori neutri. Basta busto e mani,
     il viso non serve.
- **Colori veri**: niente filtri, niente "bellezza", niente HDR esagerato. Chi compra deve ricevere esattamente
  la borsa che ha visto. Se il colore sullo schermo non corrisponde alla borsa vera, rifai la foto con luce diversa.
- **Niente oggetti estranei** (metro, altre borse, etichette, mani in primo piano nella foto di copertina).
  Le misure le scriviamo nel testo.
- Controlla prima di caricare: è a fuoco? È dritta? Lo sfondo è pulito?

### Ritratti del team (organigramma)
- Tutte e 7 con **lo stesso schema**: mezzo busto, verticale 4:5, sfondo chiaro uniforme (lo stesso muro per
  tutte), luce naturale di fronte o leggermente laterale, sguardo in camera, sorriso naturale.
- Abbigliamento semplice, meglio in tinta unita: un tocco di bordeaux o rosa cipria è perfetto.
- Una seconda foto "al lavoro" (con l'uncinetto, una borsa, un ombrello) per la pagina personale.
- Inviare il file originale (non lo screenshot di WhatsApp, che riduce la qualità).

### Processo "dall'ombrello alla borsa"
Servono foto per ogni passo, tutte verticali 4:5, con luce naturale e sfondo ordinato:
1. **Recupero**: il punto di raccolta degli ombrelli (con un cartello Chère Pochette se c'è).
2. **Selezione**: mani che separano il tessuto dalle stecche, i tessuti piegati per colore.
3. **Creazione**: primo piano delle mani che lavorano all'uncinetto con la fettuccia.
4. **Fodera**: il tessuto dell'ombrello tagliato e cucito dentro la borsa.
5. **Chère Pochette**: la borsa finita accanto all'ombrello da cui viene la fodera.

### Privacy
- Chiedere **sempre il consenso scritto** a chi appare in foto riconoscibile (in particolare le signore che
  lavorano con noi) prima di pubblicare.
- Per minorenni serve il consenso dei genitori.

---

## 6. Missing or weak visuals today (to-do for the team)

| Priority | What | Why |
|---|---|---|
| High | **Clean product photos for each bag** (front, lining, detail, worn) | Today only 3 cut-outs of the 3 models exist. Belle has a measuring tape over it, Coquette shows two bags overlapping, Jolie has a blown-out highlight on the right side. None shows the inside. |
| High | **Lining / interior photos** | The umbrella lining is the story and the main selling point, but no photo shows it. Process step 4 "Fodera" has no image (temporary: `umbrellas-fabrics.jpg`). |
| High | **Team portraits (7)** | The interactive org chart needs a photo per member. None exist yet. |
| High | **Logo as vector** (original Canva file, or a Canva export as **SVG** or **PDF**) | The logo exists only as a ~600 px JPEG. The transparent PNGs are a careful 2× rebuild, but a vector file stays sharp at any size (print, packaging, large hero). Please also share the exact **Bodoni FLF** font file the logo uses. |
| High | **Consent of the women in `women-crochet`** | Their faces are clearly recognisable. Publish only with their written OK, otherwise use a hands-only shot. |
| Medium | Process photos (selezione, creazione close-up, fodera, cucitura) | The process page has only 4 real photos for 5 steps. |
| Medium | Detail / macro shots of the stitches and handles | They make the craftsmanship tangible on product pages. |
| Medium | Jolie and Coquette worn (hand / shoulder) | Only the bordeaux Belle has a lifestyle photo. |
| Medium | A nicer "collected umbrellas" shot | The current one is documentary (office floor, bin, crate). Umbrellas laid out on a light surface, or the school collection box, would fit the brand better. |
| Low | `yarn-fettuccia` shows **new, store-bought spools** with brand labels | The copy says the yarn comes from old clothes. Check that the text does not claim these spools are recovered, or replace the photo with yarn cut from t-shirts. |
| Low | Third-party brands in photos (a printed logo on an umbrella, branded pouch/tray in `women-crochet`) | Minor, but avoid them in new photos. |
