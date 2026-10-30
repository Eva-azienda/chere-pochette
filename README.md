# Chère Pochette — website and online shop

*Made to carry on.* Website of **Chère Pochette**, a YES mini-company of seven students at the Scuola cantonale
di commercio (SCC) Bellinzona. We sell crochet bags made from t-shirt yarn recovered from old clothes and lined
with fabric from broken umbrellas, crocheted together with Ukrainian women. **Every bag is a unique piece.**

| | |
|---|---|
| **Website** | **https://cherepochette.ch** (`www.` redirects here) — Italian `/`, German `/de/`, English `/en/` |
| **Admin (phone)** | **https://cherepochette.ch/admin/** — one login: shop e-mail + admin password |
| **Code** | https://github.com/Eva-azienda/chere-pochette (public, branch `main`) — the source of truth |
| **Payments** | Zahls instance `cherepochette` → https://cherepochette.zahls.ch |
| **Contact** | chere.pochette@sccbellinzona.ch · website lead: Eva Dall'Acqua (CTO) |
| **Handover (Italian)** | [docs/HANDOVER.md](docs/HANDOVER.md) — start here if you are new |
| **Changes with ChatGPT or another AI** | give it the repository link; it should read [AGENTS.md](AGENTS.md) first (what not to touch, where everything is) |

## Status (30 October 2026)

| Area | State |
|---|---|
| Hosting | **Live** on GitHub Pages with the custom domain, HTTPS enforced, DNS at Hostpoint |
| Visibility | **Preview**: every page is behind a password (StatiCrypt) while the repository secret `SITE_PASSWORD` exists. **Launch = delete that secret and re-run Deploy** ([OPERATIONS.md §3](docs/OPERATIONS.md#3-preview-password-gate)) |
| Shop | 3 bags for sale (`cp-002`…`cp-004`). Online payment is **on** (`"checkout": {"enabled": true}`, since 30.10.2026): every bag has its Zahls links, but the Zahls payment page stays offline until the account verification is approved |
| Zahls | Instance, company profile and payment-page design done; connection check green. **Account verification (KYC) still open** (CFO); 30-day trial since 29.10.2026 → choose a plan before ~28.11.2026 |
| Admin | Set up; access token valid until **29.10.2027** |
| Tests | `npm test` → 94/94 passing |

Everything still open before launch: [docs/LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md).

## How it works

No server, no database. The GitHub repository *is* the database; GitHub Actions does the automation.

```
 Team phone                    GitHub                                           Zahls.ch
 ┌──────────┐  1 commit/save  ┌────────────┐ push / every 10 min ┌──────────────────────────┐
 │ /admin/  │ ──────────────▶ │ repository │ ──────────────────▶ │ Actions "Deploy"         │
 │ (static  │  GitHub API +   │ src/data/  │                     │  tests → Zahls sync ─────┼──▶ payment links,
 │  JS page)│  encrypted token│ public/    │ ◀── bot commit ──── │  → astro build           │    payments
 └──────────┘                 └────────────┘                     │  → password gate (preview)│
                                                                 │  → GitHub Pages ─────────┼──▶ cherepochette.ch
                                                                 └──────────────────────────┘
 Today (checkout off): product page → "Ordina via e-mail" (mailto with the bag number).
 After KYC (checkout on): product page → "Acquista" → Zahls payment page → /thanks/; the bag turns "sold" by itself.
 Order details (name, address) reach the team by e-mail from Zahls — never stored in GitHub (the repo is public).
```

- **Website**: [Astro 7](https://astro.build), static output, hosted on **GitHub Pages** with the domain `cherepochette.ch`.
- **Admin**: `public/admin/`, plain JavaScript; saves bags and photos through the GitHub REST API.
- **Payments**: `scripts/zahls-sync.mjs` creates one Zahls Paylink per bag and delivery option and marks paid bags
  as sold — only while `checkout.enabled` is `true` in `src/data/site.json`. Today it only tests the connection.
- **Preview gate**: `scripts/protect-site.mjs` encrypts every page except `/admin/` while `SITE_PASSWORD` is set.
- Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Repository structure

```
.
├── .github/workflows/
│   ├── deploy.yml            # tests → Zahls sync → build → preview gate → GitHub Pages (push, every 10 min, manual)
│   └── zahls-check.yml       # manual: tests the Zahls instance name + API key, changes nothing
├── docs/                     # all documentation (table below)
├── public/                   # copied as-is to the site
│   ├── admin/                # the admin app (index.html, admin.css, js/, manifest) + auth.json (encrypted access)
│   ├── brand/                # logos and admin app icons
│   └── media/products/<id>/  # bag photos <n>-400/900/1600.jpg (written by the admin)
├── scripts/
│   ├── zahls-sync.mjs        # Zahls ↔ bags sync (npm run zahls:sync; --check = connection test only)
│   ├── admin-setup.mjs       # creates public/admin/auth.json (npm run admin:setup)
│   ├── protect-site.mjs      # preview password gate (runs in Deploy while SITE_PASSWORD exists)
│   ├── gate/                 # template.html (gate design) + staticrypt.json (fixed, non-secret salt)
│   ├── build-visuals.mjs     # regenerates brand images from the original photos (docs/VISUALS.md)
│   └── test/                 # npm test (node:test; fake Zahls and fake GitHub, no network)
├── src/
│   ├── data/                 # site.json, models.json, taxonomy.json, team.json, products/<id>.json
│   ├── i18n/                 # it.json, de.json, en.json — every website text (+ README)
│   ├── content/legal/        # Impressum, privacy, terms (it/de/en Markdown, still marked BOZZA)
│   ├── pages/[...lang]/      # one file per page for all three languages
│   ├── components/ layouts/ lib/ styles/   # see src/README.md
│   └── assets/brand/         # editorial photos, logos, wordmark.svg (optimised by Astro)
├── astro.config.mjs          # site/base from SITE_URL / BASE_PATH (set by the workflow), i18n, sitemap
├── CONTRACTS.md              # data formats, routes, image naming, design tokens
└── .env.example              # variables for running the Zahls sync locally
```

## Quick start (developers)

Requirements: **Node.js 22** (`.nvmrc`; `>= 22.12`), npm, git.

```bash
git clone https://github.com/Eva-azienda/chere-pochette.git && cd chere-pochette
npm ci              # install exactly the locked dependencies
npm run dev         # http://localhost:4321
npm run build       # static site in dist/ (must finish without errors before pushing)
npm run preview     # serve dist/ locally
npm test            # sync, admin and setup tests (no network)
```

| Command | What it does |
|---|---|
| `npm run admin:setup` | Admin e-mail + password + GitHub token → `public/admin/auth.json` ([SETUP.md §6](docs/SETUP.md#6-admin-access-npm-run-adminsetup)) |
| `node scripts/zahls-sync.mjs --check` | Test the Zahls credentials from a local `.env` |
| `npm run zahls:sync` | Run the sync locally (`.env`, start with `DRY_RUN=1`) ([OPERATIONS.md §8](docs/OPERATIONS.md#8-running-the-sync-by-hand)) |
| `SITE_PASSWORD=… node scripts/protect-site.mjs` | Try the preview gate on a local `dist/` (after `npm run build`) |
| `node scripts/build-visuals.mjs --src "<Drive>/03_Media/originals/named"` | Rebuild brand images ([VISUALS.md §3](docs/VISUALS.md#3-how-to-regenerate)) |

> The admin always writes to the **real GitHub repository**, also when opened from `localhost`
> (with `npm run dev` it is at `http://localhost:4321/admin/index.html`; `/admin/` alone gives a 404 there).
> There is no test copy: use the live admin, or a bag you delete afterwards.

Code rules: read [CONTRACTS.md](CONTRACTS.md) and [src/README.md](src/README.md); build every internal link with
`localePath()` / `assetPath()`; colours only from `src/styles/tokens.css`; design at 375 px first; never commit
secrets or customer data (the repository is public). Every push to `main` is live in ≈ 1–2 minutes.
AI assistants: see [AGENTS.md](AGENTS.md).

## Editing content

| What | Where | How |
|---|---|---|
| Bags: add, edit, sold, hide, delete, CSV export | admin page | [docs/GUIDA-ADMIN.md](docs/GUIDA-ADMIN.md) (Italian) |
| Texts of the website | `src/i18n/{it,de,en}.json` | github.com web editor, [docs/CONTENT.md](docs/CONTENT.md) |
| Team profiles / CVs | `src/data/team.json` | idem |
| Legal texts | `src/content/legal/{it,de,en}.md` | idem (review by coach/school pending) |
| E-mail, Instagram, shipping fee, payment on/off, newsletter, address | `src/data/site.json` | idem |
| Model prices, colours, linings | `src/data/models.json`, `src/data/taxonomy.json` | idem |

A broken file stops the build; the previous version stays online.

## Documentation

| Document | For | Content |
|---|---|---|
| [docs/HANDOVER.md](docs/HANDOVER.md) | student team (Italian) | One page: what exists, who does what, accounts, first 10 things to do |
| [docs/GUIDA-ADMIN.md](docs/GUIDA-ADMIN.md) | team (Italian) | Using the admin on the phone, step by step |
| [docs/LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md) | everyone | Done vs still open before launch |
| [docs/CONTENT.md](docs/CONTENT.md) | content editors | Where every text, price and setting lives; editing on github.com |
| [docs/SETUP.md](docs/SETUP.md) | CTO / developer | Accounts and one-time setup as done (GitHub, Pages, domain, Hostpoint DNS, secrets, admin, Zahls) + how to redo |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | CTO / developer | Deploy automation, preview gate, checkout switch, Zahls check, cron caveats, token expiry, troubleshooting |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | developer, coaches | Components, data model, flows, security, limits, costs |
| [docs/SKILLS.md](docs/SKILLS.md) | team, coaches | Skills needed per role, learning links, when to call a developer |
| [docs/VISUALS.md](docs/VISUALS.md) | team, developer | Images, logo, wordmark, icons, photo guide (Italian section) |
| [CONTRACTS.md](CONTRACTS.md) · [src/README.md](src/README.md) · [src/i18n/README.md](src/i18n/README.md) | developer, editors | Data formats, source map, translation rules |

## Handover folder (Google Drive "Website Eva")

| Folder | Content |
|---|---|
| `01_Brief` | Project brief and the official model sheet |
| `02_Branding` | Brand kit + logo exports (`logo/`: transparent logos, wordmark SVGs, monogram, app icon, social image) |
| `03_Media` | `originals/` (WhatsApp exports) and `originals/named/` (renamed copies used by `build-visuals.mjs`) |
| `04_Website` | Code snapshot without `node_modules` — for reference only; **GitHub is the source of truth** |
| `05_Handover` | Copies of this README and of `docs/` |

No password, token or API key is written in this repository or in the Drive folder. They are handed over in person
(or through a password manager).
