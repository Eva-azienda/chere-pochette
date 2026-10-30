# Visuals — images, logo, wordmark, icons

Every image the site and the admin show, where it comes from, how to rebuild it, and how to take better photos.
Technical parts in English; the **photo guide for the team is in Italian** (section 5).

Brand rules (brand kit in Drive `02_Branding`): light, neutral backgrounds; natural light; essential style; bordeaux
`#82001F` only as an accent; ivory `#FAF7F2` everywhere else. Photos get only **gentle global corrections** (exposure,
contrast, white balance): bags must look exactly like the real items, so they are never retouched.
All files are sRGB with **no metadata** (no EXIF, no GPS).

---

## 1. Asset list

### Editorial photos — `src/assets/brand/` (optimised by Astro: AVIF/WebP/JPEG in several sizes)

| File | Size / ratio | Original (`03_Media/originals/named/`) | Used on |
|---|---|---|---|
| `hero-bag-umbrella-45.jpg` | 1920×2400 · 4:5 | `bag-belle-bordeaux-umbrella.jpeg` (crop: bag, shaft, handle) | About, Process step 4 "Fodera" (no longer in the home hero) |
| `hero-bag-hands-45.jpg` | 1920×2400 · 4:5 | `bag-belle-bordeaux-hands.jpeg` (crop: bag + hand) | Process step 5 "Chère Pochette" |
| `hero-bag-hands.jpg` | 2400×1600 · 3:2 | same, full frame | not used today (spare landscape) |
| `hero-bag-umbrella.jpg` | 1440×2560 · 9:16 | same, full frame | not used today (spare tall format) |
| `umbrellas-collected.jpg` | 1920×2400 · 4:5 | `umbrellas-collected-a.jpeg` | Process step 1 "Recupero" |
| `umbrellas-fabrics.jpg` | 1920×2400 · 4:5 | `umbrellas-fabrics.jpeg` (a third-party logo cropped out) | Home, About, Process step 2 "Selezione" |
| `yarn-fettuccia.jpg` | 1920×2400 · 4:5 | `yarn-fettuccia.jpeg` | About (materials) — shows **store-bought spools**, see §6 |
| `women-crochet.jpg` / `women-crochet-45.jpg` | 3:2 / 4:5 | `women-crochet.jpeg` (warm cast slightly cooled) | Home, About (Ukrainian women), Process step 3 "Creazione" — **consent needed**, see §6 |

Portrait (4:5) and landscape (3:2) versions allow art direction (portrait on phones, landscape on desktop) through
`src/components/BrandPicture.astro` / `ArtPicture.astro`.

### Bag cut-outs — `src/assets/brand/model-{jolie,belle,coquette}.png`

1400×1400, the bag centred on **exactly `#FAF7F2`** so it blends into the page. Used by the models section
(`ModelsShowcase.astro`, home and shop). Belle keeps the yellow measuring tape and Coquette shows a second bag behind
it: both are in the original photos and were not painted out.

### Logo and wordmark

| File | Use |
|---|---|
| `src/assets/brand/wordmark.svg` | **Header and menu**: one-line "Chère Pochette" in Bodoni Moda italic, converted to outlines (no font needed), coloured with `currentColor`. Not produced by the script: the master copies are `02_Branding/logo/wordmark-bordeaux.svg` and `wordmark-ivory.svg` |
| `src/assets/brand/logo-bordeaux.png` (1306×685) | Spare full logo (no longer in the home hero, which now shows `bag-sketch.svg`) |
| `src/assets/brand/hero-lifestyle.jpg` (1120×1400) | **Home hero**: woman carrying a bordeaux Belle by a stone wall. Generated image (supplied 30.10.2026, original `03_Media/originals/named/lifestyle-belle-bordeaux-ticino.png`); shown whole in 4:5 |
| `src/assets/brand/belle-oak-chair.jpg` (1120×1400) | **Home "Jolie, Belle e Coquette"**: bordeaux Belle on an oak chair. Generated image (supplied 30.10.2026, original `03_Media/originals/named/belle-bordeaux-oak-chair.png`) |
| `src/assets/brand/hero-jolie.png` | Not used since 30.10.2026 (was the home hero): Jolie rosa antico, transparent cut-out of `model-jolie.png`, for `BagSketch.astro` |
| `src/assets/brand/bag-sketch.svg` | Not used since 30.10.2026: line drawing of a bag for `BagSketch.astro` (`variant="sketch"`) |
| `src/assets/team/group.jpg`, `src/assets/team/<slug>.jpg` | Team: group photo (home + team page) and 7 portraits 296×370, cut from the Instagram post of 26.10.2026 (originals in Drive `03_Media/originals/instagram-team-post-2026-10-26/`) |
| `src/assets/brand/logo-ivory.png` | Footer (on the dark plum `#54152C` background) |
| `public/brand/logo-bordeaux.png`, `logo-ivory.png` (800×420) | Admin login (`logo-bordeaux.png`); both available for e-mails or anything outside Astro |

The PNG logos were rebuilt from `logo-on-white.jpeg` (clean alpha, exact brand colour). Do not stretch, recolour or
rearrange the logo. The slogan "Made to carry on" is readable from about 260 px logo width.

### Icons and sharing — `public/`

| File | What |
|---|---|
| `favicon.svg`, `favicon.ico` | Monogram: Bodoni-style **C** crossed by the logo's needle with a thread loop, on an ivory tile |
| `apple-touch-icon.png` | 180×180, ivory, bordeaux mark |
| `brand/icon-192.png`, `brand/icon-512.png` | Admin home-screen icons ("CP Admin") |
| `og-image.jpg` | 1200×630 social preview: logo + the bordeaux Belle |

Line icons in the site (pillars reuse / **needle and thread** / thread heart, Instagram, menu…) are drawn in
`src/components/Icon.astro`, not image files.

Copies for the team (print, social, Canva) are in Drive **`02_Branding/logo/`**: transparent logos (bordeaux, ivory),
wordmark SVGs, `monogram-C-needle.svg`, app icons, `social-share-1200x630.jpg`.

### Bag photos — `public/media/products/<id>/<n>-{400,900,1600}.jpg`

Written by the **admin** for every bag (widths 400/900/1600, JPEG 0.82, original aspect ratio, metadata removed;
the site frames them 4:5). The current photos of the 4 bags come from the brand shoot: `cp-001` = the bordeaux Belle
(in hand + on the umbrella), `cp-002`…`cp-004` = the model cut-outs on ivory. Replace them with proper per-bag photos
(§5) through the admin.

---

## 2. Original files

Not in the repository (it is public and they weigh ~17 MB). They are in the Drive folder **"Website Eva"**:

- `03_Media/originals/` — the WhatsApp exports as received (photos + one video);
- `03_Media/originals/named/` — renamed copies the script expects: `bag-belle-bordeaux-hands.jpeg`,
  `bag-belle-bordeaux-umbrella.jpeg`, `umbrellas-collected-a.jpeg`, `umbrellas-collected-b.jpeg`,
  `umbrellas-fabrics.jpeg`, `yarn-fettuccia.jpeg`, `women-crochet.jpeg`, `model-jolie.png`, `model-belle.png`,
  `model-coquette.png`, `logo-on-white.jpeg`, `logo-on-ivory.jpeg`.

## 3. How to regenerate

All assets in §1 except `wordmark.svg` and the admin's bag photos are produced by **`scripts/build-visuals.mjs`**
(Node + `sharp`, already a project dependency). Crops, corrections and sizes are constants at the top of each section
of the script (`EDITORIAL`, `MODELS`, `PRODUCTS`, `CORR`).

```bash
# from the repository root; <Drive> = the synced Drive folder "Website Eva"; quote the path (it contains spaces)
node scripts/build-visuals.mjs --src "<Drive>/03_Media/originals/named" --only brand
node scripts/build-visuals.mjs --src "<Drive>/03_Media/originals/named" --only icons
node scripts/build-visuals.mjs --src "<Drive>/03_Media/originals/named" --only brand,icons,sheet --review ../review   # + contact sheet
```

`--only` accepts `brand`, `products`, `icons`, `sheet` (comma-separated); without it, everything is rebuilt.
The contact sheet (`<review>/visuals-contact-sheet.jpg`) needs both `sheet` in `--only` (or no `--only`) and `--review <folder>`.

> **Do not run the `products` step** (or the script without `--only`) once the team has re-photographed
> `cp-001`…`cp-004` in the admin: it overwrites `public/media/products/cp-00{1-4}/1` (and `cp-001/2`) with the brand-shoot
> images and adjusts their `w`/`h` in the product files.

To change a crop: open the original, note the rectangle `[left, top, width, height]` in pixels, edit the matching line,
re-run, review the result (contact sheet) before committing.

## 4. Sizes and formats at a glance

| Kind | Ratio | Master size | Format |
|---|---|---|---|
| Editorial landscape | 3:2 | 2400×1600 | JPEG q85 (Astro re-encodes) |
| Editorial portrait | 4:5 | 1920×2400 | JPEG q85 |
| Bag photos (admin) | as taken, shown 4:5 | 1600 px wide (+900, +400) | JPEG 0.82 |
| Cut-outs | 1:1 | 1400×1400 | PNG on `#FAF7F2` |
| Logos | — | 1306 px (src) / 800 px (public) | PNG, transparent |
| Wordmark | — | vector | SVG, outlined, `currentColor` |

---

## 5. Guida foto per il team (prodotti, team, processo)

### Prodotti: ogni borsa è un pezzo unico, quindi ogni borsa ha le sue foto
- **Telefono** va benissimo (fotocamera principale 1×, mai lo zoom digitale). Pulisci l'obiettivo.
- **Luce naturale**, vicino a una finestra, di giorno, **senza sole diretto**. Spegni le luci della stanza e il flash.
- **Sfondo semplice avorio o bianco** (cartoncino, lenzuolo stirato, muro chiaro), lo stesso per tutte le borse.
- **Formato verticale**. Il sito mostra le foto in un riquadro 4:5 e taglia i bordi: borsa al centro, con aria intorno
  (circa il 70 % della larghezza).
- **3–4 foto per borsa, sempre in quest'ordine** (la prima è la copertina):
  1. **Fronte**: borsa dritta, vista frontale, all'altezza della borsa.
  2. **Interno / fodera**: borsa aperta, si vede il tessuto dell'ombrello. È il nostro punto forte!
  3. **Dettaglio**: primo piano dell'uncinetto e del manico.
  4. **Indossata**: a mano o a spalla, maglia tinta unita neutra; basta busto e mani, il viso non serve.
- **Colori veri**: niente filtri, niente "bellezza", niente HDR. Se il colore sullo schermo non corrisponde, rifai la foto.
- **Niente oggetti estranei** (metro, altre borse, etichette). Le misure sono nel testo.
- Prima di caricare: è a fuoco? È dritta? Lo sfondo è pulito?

### Ritratti del team (organigramma)
- Tutte e 7 con **lo stesso schema**: mezzo busto, verticale 4:5, stesso muro chiaro, luce naturale, sguardo in camera.
- Abbigliamento semplice in tinta unita; un tocco di bordeaux o rosa cipria è perfetto.
- Una seconda foto "al lavoro" (uncinetto, borsa, ombrello) per la pagina personale.
- Inviare il file originale (non lo screenshot di WhatsApp).

### Processo "dall'ombrello alla borsa"
Foto verticali 4:5 per ogni passo: 1. **Recupero** (raccolta degli ombrelli) · 2. **Selezione** (mani che separano il
tessuto dalle stecche) · 3. **Creazione** (mani all'uncinetto con la fettuccia) · 4. **Fodera** (tessuto tagliato e
cucito dentro la borsa) · 5. **Chère Pochette** (borsa finita accanto al suo ombrello).

### Privacy
- **Consenso scritto** di chi appare riconoscibile (in particolare le signore che lavorano con noi) prima di pubblicare.
- Per minorenni serve il consenso dei genitori.

---

## 6. Missing or weak visuals today (to-do for the team)

| Priority | What | Why |
|---|---|---|
| High | **Consent of the women in `women-crochet`** (home, about, process) | Faces are recognisable. Publish only with their written OK, otherwise replace with a hands-only shot. |
| High | **Per-bag product photos** (front, lining, detail, worn) for cp-001…cp-004 and every new bag | Today the bags use brand-shoot photos and model cut-outs; none shows the lining. |
| High | **Team portraits (7)** | Needed before the org chart can show photos (today: initials). |
| High | **Logo as vector** (Canva **SVG** or **PDF**) + the **Bodoni FLF** font file | The full logo exists only as a rebuilt PNG; a vector stays sharp for print and packaging. Put it in `02_Branding/logo/`. |
| Medium | **`yarn-fettuccia` shows new, store-bought spools** | The copy says the yarn comes from old clothes: confirm the About text does not claim these spools are recovered, or replace the photo with yarn cut from t-shirts. (Process step 3 already uses the crochet photo instead.) |
| Medium | Lining / interior photos, process photos (selezione, fodera, cucitura) | The lining is the story; step 4 uses the bag-on-umbrella photo. |
| Medium | Jolie and Coquette worn | Only the bordeaux Belle has lifestyle photos. |
| Low | A nicer "collected umbrellas" shot | The current one is documentary (office floor, bin, crate). |
| Low | Third-party brands in photos | Avoid printed logos in new photos. |
