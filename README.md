# Chère Pochette — website and online shop

*Made to carry on.* Website of **Chère Pochette**, a YES mini-company of seven students at the Scuola cantonale
di commercio (SCC) Bellinzona. We sell crochet bags made from t-shirt yarn recovered from old clothes and lined
with fabric from broken umbrellas, crocheted together with Ukrainian women. **Every bag is a unique piece.**

- **Live site:** _not online yet_ → after setup `https://eva-azienda.github.io/chere-pochette/`,
  later the custom domain (planned: `https://cherepochette.ch/`)
- **Admin (team, phone):** `<live site>/admin/`
- Languages: Italian (default, `/`), German (`/de/`), English (`/en/`)
- Contact: chere.pochette@sccbellinzona.ch · Website project lead: Eva Dall'Acqua (CTO)

## How it works

No server, no database, no monthly hosting cost. The GitHub repository *is* the database.

```
 Team phone                    GitHub                                            Zahls.ch
 ┌──────────┐  1 commit/save  ┌────────────┐ push / every 10 min ┌───────────────────────────┐
 │ /admin/  │ ──────────────▶ │ repository │ ──────────────────▶ │ Actions "Deploy"          │
 │ (static  │  GitHub API +   │ src/data/  │                     │  tests → Zahls sync ──────┼──▶ payment links,
 │  JS page)│  encrypted token│ public/    │ ◀── bot commit ──── │  (links, sold bags)       │    payments
 └──────────┘                 └────────────┘                     │  → astro build → Pages ───┼──▶ visitors
                                                                 └───────────────────────────┘
 Customer: product page → "Acquista" → Zahls payment page (TWINT, card, PostFinance) → /thanks/
 Order details (name, address) reach the team by e-mail from Zahls — never stored in GitHub.
```

- **Website**: [Astro 7](https://astro.build), static output, hosted on **GitHub Pages**.
- **Admin**: `public/admin/`, plain JavaScript; saves products and photos through the GitHub REST API.
- **Payments**: one Zahls **Paylink** per bag and delivery option (shipping / pickup), created by
  `scripts/zahls-sync.mjs`, which also marks paid bags as sold. Online payment is switched on with
  `"checkout": { "enabled": true }` in `src/data/site.json` (off until Zahls is verified → "order by e-mail").
- Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository structure

```
.
├── .github/workflows/
│   ├── deploy.yml            # tests → Zahls sync → build → (preview password) → GitHub Pages; push, cron 10 min, manual
│   └── zahls-check.yml       # manual: tests the Zahls instance name + API key
├── docs/                     # all documentation (see below)
├── public/                   # copied as-is to the site
│   ├── admin/                # the admin app (index.html, admin.css, js/, manifest) + auth.json after setup
│   ├── brand/                # logos and admin icons
│   └── media/products/<id>/  # product photos <n>-400/900/1600.jpg (written by the admin)
├── scripts/
│   ├── zahls-sync.mjs        # Zahls ↔ products sync (npm run zahls:sync)
│   ├── admin-setup.mjs       # creates public/admin/auth.json (npm run admin:setup)
│   ├── protect-site.mjs      # optional preview password for the built site (secret SITE_PASSWORD)
│   ├── gate/                 # template + settings of the preview password page
│   └── test/                 # npm test (node:test, fake Zahls and fake GitHub, no network)
├── src/
│   ├── data/                 # site.json, models.json, taxonomy.json, team.json, products/<id>.json
│   ├── i18n/                 # it.json, de.json, en.json — every website text (+ README)
│   ├── content/legal/        # Impressum, privacy, terms (it/de/en Markdown)
│   ├── pages/[...lang]/      # one file per page for all three languages
│   ├── components/ layouts/ lib/ styles/   # see src/README.md
│   └── assets/brand/         # editorial photos and logos (optimised by Astro)
├── astro.config.mjs          # site/base from SITE_URL / BASE_PATH, i18n, sitemap
├── CONTRACTS.md              # data formats, routes, image naming, design tokens
└── .env.example              # variables for running the Zahls sync locally
```

## Quick start (developers)

Requirements: **Node.js 22** (`.nvmrc`; `>= 22.12`), npm, git.

```bash
npm ci              # install exactly the locked dependencies
npm run dev         # http://localhost:4321  (admin: http://localhost:4321/admin/)
npm run build       # static site in dist/  (must finish without errors before pushing)
npm run preview     # serve dist/ locally
npm test            # sync, admin and setup tests (no network)
```

| Command | What it does |
|---|---|
| `BASE_PATH=/chere-pochette/ npm run build` | Build as on GitHub Pages before the custom domain (every link must still work) |
| `npm run admin:setup` | One-time: admin e-mail + password + GitHub token → `public/admin/auth.json` ([SETUP.md](docs/SETUP.md)) |
| `node scripts/zahls-sync.mjs --check` | Test the Zahls credentials from `.env` |
| `npm run zahls:sync` | Run the sync locally (`.env`, start with `DRY_RUN=1`) ([OPERATIONS.md §8](docs/OPERATIONS.md)) |

> The admin page always writes to the **real GitHub repository**, also when opened from `localhost`.

Rules for code changes: read [CONTRACTS.md](CONTRACTS.md) and [src/README.md](src/README.md); build every
internal link with `localePath()` / `assetPath()` (the site may live in a sub-folder); colours only from
`src/styles/tokens.css`; never commit secrets or customer data (the repository is public).

## Editing content

| What | Where | How |
|---|---|---|
| Bags: add, edit, sold, hide, delete | admin page | [docs/GUIDA-ADMIN.md](docs/GUIDA-ADMIN.md) (Italian) |
| Texts of the website | `src/i18n/{it,de,en}.json` | github.com web editor, [docs/CONTENT.md](docs/CONTENT.md) |
| Team profiles / CVs | `src/data/team.json` | idem |
| Legal texts | `src/content/legal/{it,de,en}.md` | idem |
| E-mail, Instagram, shipping fee, payment on/off, newsletter | `src/data/site.json` | idem |
| Model default prices, colours, linings | `src/data/models.json`, `src/data/taxonomy.json` | idem |

Every commit to `main` publishes the site automatically in ≈ 3–5 minutes (Actions → Deploy). A broken file
stops the build and the previous version stays online.

## Documentation

| Document | For | Content |
|---|---|---|
| [docs/GUIDA-ADMIN.md](docs/GUIDA-ADMIN.md) | team (Italian) | Using the admin on the phone, step by step |
| [docs/CONTENT.md](docs/CONTENT.md) | content editors | Where every text and setting lives, how to edit it |
| [docs/SETUP.md](docs/SETUP.md) | CTO / developer | One-time setup: GitHub, Pages, token, admin, Zahls, test purchase, domain, newsletter |
| [docs/LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md) | everyone | What is still open before launch |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | CTO / developer | Payments automation, checkout switch, sync details, troubleshooting |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | developer, coaches | Components, data model, flows, security, limits, costs |
| [docs/SKILLS.md](docs/SKILLS.md) | team, coaches | Skills needed per task, learning links, when to call a developer |
| [docs/VISUALS.md](docs/VISUALS.md) | team, developer | Images, logo, icons, photo guide (Italian section) |
| [CONTRACTS.md](CONTRACTS.md) | developer | Data formats, routes, image naming, design tokens |
| [src/README.md](src/README.md) | developer | Map of the source code |
| [src/i18n/README.md](src/i18n/README.md) | content editors | Translation keys, placeholders, language rules |
