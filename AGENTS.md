# Guide for AI assistants (ChatGPT, Codex, Claude, Copilot …)

This repository is the website and online shop of **Chère Pochette**, a YES mini-company of seven students in
Bellinzona (Ticino, Switzerland) selling unique crochet bags. Live site: **https://cherepochette.ch**
(Italian `/`, German `/de/`, English `/en/`). The people asking you for changes are usually not developers:
explain what you change in plain words and keep changes small.

**Stack**: [Astro 7](https://astro.build), static output, no server and no database. GitHub Pages hosts it;
GitHub Actions builds and publishes it. Bags are JSON files written by a phone admin (`public/admin/`), payments go
through Zahls.ch payment links.

## 1. Before you change anything

- **Every commit on `main` goes live by itself in about 1–2 minutes** (workflow `.github/workflows/deploy.yml`).
  Prefer a pull request for anything bigger than a text fix, so someone can look at it first. If the build fails,
  the previous version stays online.
- **The repository is public.** Never add passwords, API keys, tokens, or customer data (names, e-mails,
  addresses, orders).
- **Three languages, always.** Every visible text exists in `src/i18n/it.json`, `de.json` and `en.json` with the
  same keys. Change all three together. Italian is the main language; German is Swiss Standard German ("ss",
  never "ß"); English is British ("colour").
- **The bags for sale are not edited in code.** Adding a bag, changing its price, marking it sold or deleting it is
  done in the admin at https://cherepochette.ch/admin/ (guide: [docs/GUIDA-ADMIN.md](docs/GUIDA-ADMIN.md)).

## 2. Files you must not edit

| File | Why |
|---|---|
| `src/data/products/*.json` | Written by the admin and by the Zahls sync (status, payment links, sold date). Hand edits can break payments. Use the admin. |
| `scripts/zahls-links.json` | Record of the payment links created at Zahls. |
| `public/admin/auth.json` | Encrypted admin login. Changing it locks the whole team out. |
| `public/media/products/**` | Bag photos uploaded by the admin. |
| `.github/workflows/*.yml`, `scripts/zahls-sync.mjs`, `scripts/protect-site.mjs`, `scripts/gate/**` | Publishing, payments and the preview password. Only with Eva (CTO) and after reading [docs/OPERATIONS.md](docs/OPERATIONS.md). |
| git tag `deployed` | Moved by the workflow to the commit that is online. |

## 3. Where to change what

| I want to change … | File(s) |
|---|---|
| Any text on the site (titles, buttons, home, about, process, FAQ, footer, image descriptions) | `src/i18n/it.json`, `de.json`, `en.json` (rules: [src/i18n/README.md](src/i18n/README.md)) |
| Home page layout and sections | `src/pages/[...lang]/index.astro` |
| Other pages | `src/pages/[...lang]/{shop,about,process,team,info,legal,thanks,payment-cancelled}/` |
| Header menu / footer | `src/components/SiteHeader.astro` / `src/components/SiteFooter.astro` |
| Product card, product page buy box, gallery | `src/components/ProductCard.astro`, `BuyBox.astro`, `ProductGallery.astro` |
| Colours, fonts, spacing | `src/styles/tokens.css` (design tokens), `src/styles/global.css` |
| Brand / editorial photos | `src/assets/brand/` (+ alt text in `images.*` of the i18n files; see [docs/VISUALS.md](docs/VISUALS.md)) |
| Team members, roles, bios, portraits | `src/data/team.json`, `src/assets/team/` |
| The three models (Jolie, Belle, Coquette): type, sizes, default price | `src/data/models.json` |
| Colour and lining names for bags | `src/data/taxonomy.json` |
| Shop e-mail, Instagram, shipping fee, online payment on/off | `src/data/site.json` |
| Impressum, privacy policy, terms of sale | `src/content/legal/{it,de,en}.md` |

More detail: [docs/CONTENT.md](docs/CONTENT.md) (every text, price and setting) and [src/README.md](src/README.md)
(map of the source code).

## 4. Rules for code

- Build every internal link with `localePath(lang, 'shop/')` from `src/lib/urls.ts`, never a hard-coded `/shop/`.
- Brand photos go through `<BrandPicture>` / `<ArtPicture>` (Astro optimises them); always give an alt text from
  the `images` keys.
- **Mobile first**: design at 375 px, 16 px side margins, buttons at least 48 px high, never horizontal scrolling.
  Check 360, 390 and 430 px and a desktop width.
- Brand look: ivory backgrounds, bordeaux (`#82001F`) only for accents, Bodoni Moda for titles, Red Hat Display
  for text. Use the colours in `tokens.css`; no new fonts.
- Product cards and product pages show **real photos** of each bag only. The two generated mood photos
  (`hero-lifestyle.jpg`, `belle-oak-chair.jpg`) are only for the home page.
- Prices are fixed CHF amounts written "CHF 45.–".
- No trackers, analytics or third-party scripts (privacy).
- `CONTRACTS.md` describes the data formats. Its "File ownership" table dates from the first build and can be
  ignored.

## 5. Checking a change

```bash
npm ci          # install (Node.js 22)
npm test        # tests of the admin and payment scripts (no network)
npm run build   # builds dist/ and runs the SEO check; must finish without errors
npm run dev     # local preview at http://localhost:4321
```

After a commit on `main`: GitHub → **Actions** → **Deploy** turns green in about 1–2 minutes. Until the official
launch the site asks for a preview password (the team has it).

## 6. Development server (for coding agents)

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.
