# Architecture

How the Chère Pochette website is built, how data moves through it, what protects it, and its limits.
Day-to-day operation: [OPERATIONS.md](OPERATIONS.md). Data formats (source of truth): [CONTRACTS.md](../CONTRACTS.md).

## 1. Components

There is **no server and no database**. The GitHub repository is the database, GitHub Actions runs the automation,
GitHub Pages serves the site under the domain registered at Hostpoint, and Zahls.ch handles the money.

```
                    ┌──────────────────────── GitHub (free plan, public repository Eva-azienda/chere-pochette) ──────────┐
  Team phone        │                                                                                                  │
  /admin/ page ─────┼─ GitHub REST API ─▶  repository  ──push──▶  Actions "Deploy" (deploy.yml)                       │
  (static JS,       │   (token from the     src/data/*.json        1. npm test                                        │
   one commit       │    encrypted          public/media/…         2. zahls-sync.mjs (checkout on: links/sold;  ──────┼──▶ Zahls API
   per save)        │    auth.json)            ▲                      checkout off: connection test only)             │
                    │                          └── bot commit ──── 3. commit sync result (if any)                     │
                    │                                              4. astro build → dist/                             │
                    │                                              5. protect-site.mjs (while SITE_PASSWORD exists)   │
                    │                                              6. deploy ──▶ GitHub Pages ────────────────────────┼──▶ https://cherepochette.ch
                    │   every 10 min (cron) ──▶ same workflow; build + deploy only if something changed               │    (DNS at Hostpoint)
                    └──────────────────────────────────────────────────────────────────────────────────────────────────┘
  Customer today:   product page ──"Ordina via e-mail"──▶ e-mail to the shop
  Customer later:   product page ──"Acquista"──▶ Zahls payment page (TWINT, cards, PostFinance, Apple/Google Pay) ──▶ /thanks/
  Team: order details (name, address, phone) arrive by e-mail / Zahls dashboard — never in GitHub.
```

| Component | Where | Technology |
|---|---|---|
| Public website (it/de/en) | `src/` → `dist/` | Astro 7, static output, no client framework; small inline scripts (menu, header, gallery, filter, newsletter, return language) |
| Admin (inventory, Italian only) | `public/admin/` → `/admin/` | Vanilla JS modules, no build step; GitHub REST API; WebCrypto; installable on the home screen (manifest "CP Admin") |
| Admin access file | `public/admin/auth.json` (`npm run admin:setup`) | v2: AES-256-GCM, key from PBKDF2-SHA256 (600 000 rounds) of e-mail + password |
| Zahls sync | `scripts/zahls-sync.mjs` | Node 22, built-ins only; Zahls API `https://api.zahls.ch/v1.18` (Payrexx-based) |
| Link ledger | `scripts/zahls-links.json` (created by the sync once checkout is on) | ids of every open Zahls link |
| Deploy workflow | `.github/workflows/deploy.yml` | push to `main`, cron every 10 min, manual |
| Zahls check workflow | `.github/workflows/zahls-check.yml` | manual; tests instance + API key |
| Preview gate | `scripts/protect-site.mjs`, `scripts/gate/` | StatiCrypt (dev dependency); active while the secret `SITE_PASSWORD` exists; `/admin/` excluded |
| Hosting | GitHub Pages, source "GitHub Actions" | custom domain `cherepochette.ch` (HTTPS enforced, `www` → apex); base path `/` |
| DNS | Hostpoint | 4×A + 4×AAAA (GitHub Pages), CNAME `www`, TXT domain verification; Hostpoint mail records kept |
| Payments | Zahls.ch instance `cherepochette` | one-time Paylinks per bag and delivery option |
| Tests | `scripts/test/*.test.mjs` | `node --test`, fake Zahls and fake GitHub, 94 tests |

### Front-end at a glance

- **Header**: one-line wordmark "Chère Pochette" (`src/assets/brand/wordmark.svg`, Bodoni Moda italic converted to
  outlines, coloured with `currentColor`) top-left; compact **IT/DE/EN** selector (`LanguageSwitcher.astro`).
- **Home**: short and shop-first. Hero = short headline (`home.hero.title`), one sentence (`home.hero.lead`) and one
  button to the shop, next to the Jolie bag in rosa antico on a powder circle (transparent cut-out
  `src/assets/brand/hero-jolie.png`) with an animated thread, needle and handwritten notes
  (`src/components/BagSketch.astro`; `variant="sketch"` in `index.astro` brings back the line drawing `bag-sketch.svg`).
  On phones the bag, headline, sentence and button fit on the first screen (the drawing's size follows the screen
  height; the notes are hidden, the thread is thin). Then: the bags on sale (grid, 2 columns on phones, up to 6 bags,
  with prices), the scrolling marquee band, one story block (bag held by a woman, materials + the Ukrainian women →
  `/about/`), a compact team strip and an Instagram block (a plain link, no embedded feed). Process, models and values
  are on their own pages. The header wordmark is always visible.
- **Team**: group photo on the home team section and the team page; round portraits in the org chart and a 4:5 portrait
  on each member page (`src/assets/team/`, `src/lib/team-photos.ts`, `TeamAvatar.astro`; initials as fallback).
- **SEO**: hreflang/x-default sitemap (`astro.config.mjs`), JSON-LD (`src/lib/structured-data.ts`), `npm run seo:check`
  (also as warn-only `postbuild`).
- **Icons**: thin "thread" line icons (`Icon.astro`), e.g. reuse / needle-and-thread (handmade) / thread heart
  (together).
- **Prices**: firm prices, Swiss format — `CHF 40.–` on bag cards and pages. The "I modelli" section shows no price; the model price in `models.json` is only the default the admin fills in for a new bag.
- Design tokens: `src/styles/tokens.css` (bordeaux `#82001F`, ivory `#FAF7F2`, powder `#E8D1D8`…; Bodoni Moda + Red Hat
  Display, self-hosted). Mobile-first: 375 px, 16 px gutters, 48 px tap targets.

## 2. Data model

All data is JSON committed to git (fields: [CONTRACTS.md](../CONTRACTS.md)).

| File | Content | Written by |
|---|---|---|
| `src/data/products/<id>.json` | **one file per unique bag** (`cp-001`…): model, status, price, colour, lining, note, photos, timestamps, `soldChannel`, `zahls` | admin (all except `zahls`), sync (`status`, `soldAt`, `soldChannel`, `zahls`) |
| `public/media/products/<id>/<n>-{400,900,1600}.jpg` | bag photos, resized in the browser | admin |
| `src/data/site.json` | e-mail, Instagram, `shippingFee`, pickup place, **`checkout.enabled`**, organisation/address, newsletter, GitHub owner/repo | people (github.com editor) |
| `src/data/models.json` | Jolie, Belle, Coquette: type, **price**, dimensions, image key | people |
| `src/data/taxonomy.json` | colours (id, hex, it/de/en), linings, statuses | people |
| `src/data/team.json` | 7 members: role, bio, responsibilities, skills, experience, education, `photo` (unused) | people |
| `src/i18n/{it,de,en}.json` | every website text | people |
| `src/content/legal/{it,de,en}.md` | Impressum, privacy, terms (marked BOZZA) | people, after review |
| `scripts/zahls-links.json` | ledger of open Zahls links | sync only |

Today: 4 bags for sale — `cp-001` Belle Bordeaux CHF 40, `cp-002` Jolie Rosa antico CHF 45, `cp-003` Coquette Giallo
CHF 45, `cp-004` Belle Grigio perla CHF 40. Model prices (45/40/45) and the shipping fee (CHF 9) are placeholders.

Product lifecycle:

```
            admin "Metti in vendita"
                     │
                     ▼
   ┌──────────── available ◀──── "Rimetti in vendita" / "Mostra sul sito" ────┐
   │      (in the shop; 2 Paylinks when checkout is on)                        │
   │  paid online (sync) │ "Segna come venduta" (manual)   "Nascondi"          │
   │                     ▼                                    ▼                │
   │                   sold ─────────────────────────────── hidden ────────────┘
   │   (page stays, "found its home",          (no page, not in shop; links closed)
   │    noindex, links closed)
   └── "Elimina": file + photos removed; the sync closes any links through the ledger
```

`soldChannel` is `online-shipping`, `online-pickup` (sync) or `manual` (admin). No customer data is ever stored.

## 3. Flows

**3.1 Add a bag → live (≈ 2–4 min).** The admin resizes photos on the phone (1600/900/400 px JPEG, EXIF/GPS removed),
then makes one commit through the GitHub API (blobs → tree → commit → move `main`; retried if someone pushed meanwhile).
The push starts Deploy → build → gate → Pages.

**3.2 Order today (checkout off).** "Ordina via e-mail" opens the visitor's mail app with subject "Ordine cp-002 – Jolie"
and the chosen delivery. The team replies, agrees payment and delivery, and marks the bag sold in the admin.

**3.3 Online sale (checkout on, ≈ 10–20 min).** The sync has created a shipping and a pickup Paylink for the bag. The
customer pays on Zahls → redirected to `/thanks/?p=<id>` (switches to the visitor's language). Zahls e-mails the order
to the team. The next Deploy run finds the payment → `status: "sold"`, deletes the other link → commit → rebuild.

**3.4 Manual sale.** "Segna come venduta" → commit with `soldChannel: "manual"` → the sync (checkout on) checks the links
one last time (payment meanwhile = DOUBLE PAYMENT alert) and deletes them.

**3.5 Price or shipping-fee change.** The sync replaces links whose amount no longer matches; until then the site shows
"order by e-mail" for that bag (`paymentLink()` in `src/lib/catalog.ts`).

## 4. Security model

| Asset | Protection |
|---|---|
| GitHub account `Eva-azienda` (master key: code, data, Pages, secrets) | own password + 2FA (to do: change the password shared in chat) |
| Admin write access | fine-grained token limited to **this repository** (Contents + Actions RW), expires 29.10.2027, stored only encrypted in `auth.json` |
| Admin page | strict Content-Security-Policy (own files + `api.github.com` + `raw.githubusercontent.com`), no third-party code, refuses to run in a frame, `noindex`, token never shown or logged |
| Zahls API key | only in GitHub Secrets (or a local git-ignored `.env`); only in the `X-API-KEY` header; never printed |
| Customer data | stays in Zahls; the sync never writes or prints names, e-mails or addresses (tested) |
| Photo privacy | photos re-drawn on a canvas before upload → no EXIF/GPS in the public repository |
| Domain | verified for the GitHub account (TXT record) → nobody else can attach it to their Pages site; HTTPS enforced |
| Preview | StatiCrypt gate keeps visitors and search engines out before launch |
| Workflows | `permissions: {}` by default, minimal per job; tests before the sync; no overlapping runs |

Residual risks (accepted, to be known by the team):

- **`auth.json` is public**: anyone can try passwords offline; the e-mail is public. Safety rests on a long, unique
  admin password. In doubt: new token + new password ([SETUP.md §6](SETUP.md#6-admin-access-npm-run-adminsetup)).
- **Logged-in phones** keep the token in browser storage until "Esci". Lost phone = revoke the token.
- **The preview gate is not secrecy**: texts and photos are readable in the public repository; images/CSS/JS are not encrypted.
- **No stock reservation**: two customers can pay the same bag before the sync marks it sold → refund one.
- **Unconfirmed Zahls details** must be confirmed by the first real test purchase ([OPERATIONS.md §13](OPERATIONS.md#13-assumptions-to-confirm-with-the-first-real-payment)).
- **Public history**: everything ever committed (prices, notes, deleted photos) stays in the git history.

## 5. Limits

| Limit | Consequence |
|---|---|
| Sync every 10 min, "best effort" | paid bags disappear 10–20 min (sometimes 30+) after payment |
| GitHub disables cron after 60 days without repository activity | re-enable in Actions → Deploy ([OPERATIONS.md §9](OPERATIONS.md#9-scheduled-runs--caveats)) |
| Public repository (free Pages + Actions minutes) | inventory, prices and history are visible; never commit secrets or customer data |
| One bag per payment, no cart, no customer accounts | by design (every bag is unique) |
| Shipping to CH and LI, one flat fee | `shippingCountries`, `shippingFee` in `site.json` |
| Newsletter | until a provider is set, the form opens an e-mail to the shop |
| Team photos | `team.json` has `photo`, but pages show initials; showing photos needs a small code change |
| Repository / Pages size | photos accumulate; Pages sites are limited to 1 GB — fine for hundreds of bags |

## 6. Costs

| Item | Cost |
|---|---|
| GitHub (repository, Actions, Pages) | **free** (public repository) |
| Domain `cherepochette.ch` at Hostpoint | yearly registration fee (Hostpoint invoice) |
| Zahls.ch | 30-day trial since 29.10.2026; then the **plan chosen by the CFO**; fixed and per-transaction fees depend on the plan and the payment method — see [zahls.ch prices](https://www.zahls.ch/de/preise-kreditkarten-und-twint). Refunds may not return the fee |
| Newsletter provider (later) | free tiers exist (Brevo, Mailchimp) |
| Fonts, icons, libraries | free (self-hosted open-source fonts) |
