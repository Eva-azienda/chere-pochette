# Shared contracts (read before editing anything)

Project: e-commerce site for **Chère Pochette**, a YES mini-company of 7 students at SCC Bellinzona
(Ticino, Switzerland). Crochet bags made from t-shirt yarn ("fettuccia") recovered from old clothes,
lined with fabric from broken umbrellas, crocheted together with Ukrainian women. Slogan "Made to carry on".
Every bag is a **unique piece** (different exterior and interior) → inventory = individual items, not SKUs.

Stack: **Astro 7 (static output)** hosted on **GitHub Pages**, built by GitHub Actions.
Payments: **Zahls.ch** (Payrexx-compatible API) one-time **Paylinks** per bag.
Admin: static page at `/admin/` (vanilla JS) that commits to the GitHub repo through the GitHub REST API.
Node 22. No backend server exists — everything must work statically.

## Languages & routes
`it` (default, no prefix), `de` (`/de/`), `en` (`/en/`). Slugs are shared across languages.

| Route | Page |
|---|---|
| `/` `/de/` `/en/` | Home |
| `/shop/` | All available bags (filter by model) |
| `/shop/<product-id>/` | Product page (unique bag) |
| `/about/` | Our story (YES, idea, materials, Ukrainian women, values, slogan meaning) |
| `/process/` | From umbrella to bag (5 steps) |
| `/team/` | Interactive org chart (7 members) |
| `/team/<member-slug>/` | Personal page |
| `/info/` | Shipping, pickup, returns, care, FAQ |
| `/legal/` | Impressum + privacy + terms (one page, anchors) |
| `/thanks/` | Zahls success redirect |
| `/payment-cancelled/` | Zahls failed/cancel redirect |
| `/admin/` | Admin app (Italian UI only, `noindex`) — static files in `public/admin/` |

The site may be served under a base path (GitHub Pages project site, e.g. `/repo-name/`) until a custom
domain is attached. **Every internal URL must respect `import.meta.env.BASE_URL`**; the admin must use
relative URLs only.

## Data files (source of truth, all JSON, committed to git)
- `src/data/site.json` — brand/contact/config (email, instagram, shippingFee CHF, newsletter action, github owner/repo).
- `src/data/models.json` — the 3 official models (jolie, belle, coquette): default price CHF, dimensions in cm, localized type name, `image` key.
- `src/data/taxonomy.json` — `colours[]` (id, hex or CSS gradient, it/de/en), `linings[]` (id, it/de/en), `statuses[]`.
- `src/data/products/<id>.json` — **one file per unique bag**, written by the admin and by the Zahls sync:

```jsonc
{
  "id": "cp-012",              // "cp-" + zero-padded number; also the URL slug and file name
  "number": 12,                // shown to customers as "Pezzo unico N° 012"
  "model": "belle",            // models.json id
  "status": "available",       // "available" | "sold" | "hidden"  — only "available" is shown in the shop
  "price": 40,                 // CHF, number (bag only, shipping added at checkout)
  "colour": "bordeaux",        // taxonomy.colours id (exterior)
  "lining": "pois",            // taxonomy.linings id (interior umbrella fabric)
  "note": "",                  // optional short free text in Italian (may be empty)
  "photos": [                  // first = cover. src is relative to site root WITHOUT extension/size
    { "src": "media/products/cp-012/1", "w": 1600, "h": 2000 }   // files: <src>-400.jpg, <src>-900.jpg, <src>-1600.jpg  (w/h = size of the -1600 file)
  ],
  "createdAt": "2026-10-29T15:00:00Z",
  "updatedAt": "2026-10-29T15:00:00Z",
  "soldAt": null,              // ISO timestamp when sold
  "soldChannel": null,         // "online-shipping" | "online-pickup" | "manual"
  "zahls": null,               // managed ONLY by scripts/zahls-sync.mjs (see below)
  "sample": true               // optional: seed/demo item, team should replace it
}
```

`zahls` object (written by the sync, read by the site):
```jsonc
{
  "amount": 4000,          // price in cents the links were created for
  "shippingFee": 900,      // shipping in cents the shipping link includes
  "shipping": { "id": 123, "link": "https://….zahls.ch/?payment=…" },  // bag + shipping, asks postal address
  "pickup":   { "id": 124, "link": "https://…" },                      // bag only, pickup in Bellinzona
  "syncedAt": "2026-10-29T15:10:00Z",
  "transactionId": null    // set when paid (NO customer personal data is ever stored — the repo is public)
}
```
If `zahls` is null or has no links (Zahls not configured yet), the product page must fall back to an
"order by e-mail" button (`mailto:` site.email with subject "Ordine <id>").

## Images
- Brand/editorial images (optimised by Astro `astro:assets`): `src/assets/brand/*.jpg|png`:
  `hero-bag-hands.jpg` (landscape, woman holding bordeaux Belle), `hero-bag-umbrella.jpg` (portrait, bag on red umbrella),
  `umbrellas-collected.jpg`, `umbrellas-fabrics.jpg`, `yarn-fettuccia.jpg`, `women-crochet.jpg`,
  `model-jolie.png`, `model-belle.png`, `model-coquette.png` (cut-outs on ivory),
  `logo-bordeaux.png`, `logo-ivory.png` (transparent).
- Product photos (pre-sized, NOT processed by Astro): `public/media/products/<id>/<n>-{400,900,1600}.jpg`.
- Public brand files: `public/favicon.svg`, `public/favicon.ico`, `public/apple-touch-icon.png`, `public/og-image.jpg`,
  `public/brand/logo-bordeaux.png`, `public/brand/logo-ivory.png` (used by admin + emails).

## Design
Tokens in `src/styles/tokens.css` (palette #82001F bordeaux, #761F26, #54152C plum, #E8D1D8 powder, #FAF7F2 ivory,
#292929 anthracite; Bodoni Moda display + Red Hat Display body, self-hosted via @fontsource-variable).
Look: elegant, feminine, essential, lots of ivory, bordeaux only for key accents ("not too red or heavy"),
thin lines / thread motif inspired by the logo's needle and thread. Mobile-first: design at 375px first,
16px gutters, 48px tap targets, no horizontal scroll, sticky buy bar on product pages.
Brand voice: elegant, feminine, positive, authentic, close to the customer; simple language; values =
craftsmanship, sustainability, reuse, collaboration between women.

## File ownership (parallel agents — never edit files you don't own)
| Area | Owner |
|---|---|
| `src/assets/brand/**`, `public/media/**`, `public/brand/**`, `public/favicon*`, `public/apple-touch-icon.png`, `public/og-image.jpg` | visuals |
| `src/i18n/*.json`, `src/data/team.json`, `src/content/**` (long-form/legal markdown) | copy (then site after copy is done) |
| everything else in `src/**`, `astro.config.mjs`, `public/robots.txt`, `public/404` assets | site |
| `public/admin/**` | admin |
| `scripts/**`, `.github/**` | ops |
| `package.json`, `CONTRACTS.md`, `src/data/{site,models,taxonomy}.json`, `src/styles/tokens.css` | lead (ask in your final report if you need a change) |

`package.json` scripts already provided: `dev`, `build`, `preview`, `test` (node --test scripts/test), `zahls:sync`, `admin:setup`.
