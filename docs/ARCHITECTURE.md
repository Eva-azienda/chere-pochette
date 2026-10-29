# Architecture

How the Chère Pochette website is built, how data moves through it, what protects it, and its limits.
For day-to-day operation see [OPERATIONS.md](OPERATIONS.md); for the data formats the source of truth is
[CONTRACTS.md](../CONTRACTS.md).

## 1. Components

There is **no server and no database**. The GitHub repository is the database. GitHub Actions runs the
automation, and Zahls.ch handles the money.

```
                    ┌──────────────────────── GitHub (free plan, public repository) ───────────────────────┐
  Team phone        │                                                                                       │
  /admin/ page ─────┼─ GitHub REST API ─▶  repository  ──push──▶  Actions "Deploy" (deploy.yml)            │
  (static JS,       │   (token from the     src/data/*.json        1. npm test                             │
   one commit       │    encrypted          public/media/…         2. scripts/zahls-sync.mjs ──────────────┼──▶ Zahls API
   per save)        │    auth.json)            ▲                   3. commit sync result                   │    (Paylinks,
                    │                          └── bot commit ──── 4. astro build (+ preview gate) → dist/  │     payments)
                    │                                              5. deploy ──▶ GitHub Pages ─────────────┼──▶ visitors
                    │   every 10 min (cron) ──▶ same workflow: sync; build + deploy only if something changed │
                    └───────────────────────────────────────────────────────────────────────────────────────┘
  Customer: product page ──"Buy"──▶ Zahls payment page (TWINT, card, PostFinance) ──▶ /thanks/ on the site
  Team: order details (name, address, phone) arrive by e-mail / Zahls dashboard — never in GitHub.
```

| Component | Where | Technology |
|---|---|---|
| Public website (it/de/en) | `src/` → built into `dist/` | Astro 7, static output, no client framework; a few small inline scripts (menu, gallery, filter, newsletter, return-language) |
| Admin (inventory manager, Italian only) | `public/admin/` (served at `/admin/`) | Vanilla JS modules, no build step; GitHub REST API; WebCrypto |
| Admin access file | `public/admin/auth.json` (created by `npm run admin:setup`) | AES-256-GCM, key from PBKDF2-SHA256 (600 000 rounds) |
| Zahls sync | `scripts/zahls-sync.mjs` | Node 22, built-ins only |
| Link ledger | `scripts/zahls-links.json` (created and committed by the sync) | JSON list of every open Zahls link |
| Deploy workflow | `.github/workflows/deploy.yml` | push to `main`, cron every 10 min, manual "Run workflow" |
| Zahls check workflow | `.github/workflows/zahls-check.yml` | manual only; tests instance name + API key |
| Preview password (optional) | `scripts/protect-site.mjs`, `scripts/gate/` | StatiCrypt (npm dev dependency); active only while the secret `SITE_PASSWORD` exists; encrypts every built page except `/admin/` |
| Tests | `scripts/test/*.test.mjs` | `node --test` (no network: fake Zahls and fake GitHub) |
| Hosting | GitHub Pages | Source "GitHub Actions"; base path `/chere-pochette/` until a custom domain is set |
| Payments | Zahls.ch (Payrexx-based API `https://api.zahls.ch/v1.18`) | One-time Paylinks per bag |

## 2. Data model

All data is JSON committed to git (details and field comments: [CONTRACTS.md](../CONTRACTS.md)).

| File | Content | Written by |
|---|---|---|
| `src/data/products/<id>.json` | **One file per unique bag** (`cp-012`): model, status, price, colour, lining, note, photos, timestamps, `soldChannel`, `zahls` | admin (all fields except `zahls`), sync (`status`, `soldAt`, `soldChannel`, `zahls`) |
| `public/media/products/<id>/<n>-{400,900,1600}.jpg` | Product photos, pre-sized in the browser | admin |
| `src/data/site.json` | E-mail, Instagram, `shippingFee`, pickup place, **`checkout.enabled`**, newsletter, GitHub owner/repo | people (GitHub web editor) |
| `src/data/models.json` | The 3 models: name, type, default price, dimensions, image key | people |
| `src/data/taxonomy.json` | Colours (id, hex, it/de/en), linings, statuses | people |
| `src/data/team.json` | 7 members: role, bio, responsibilities, skills, experience, education | people |
| `src/i18n/{it,de,en}.json` | Every website text | people |
| `src/content/legal/{it,de,en}.md` | Impressum, privacy, terms | people (after review) |
| `scripts/zahls-links.json` | Ledger of open Zahls links (ids only) | sync only — never edit |

Product lifecycle:

```
            admin "Metti in vendita"
                     │
                     ▼
   ┌──────────── available ◀──── "Rimetti in vendita" / "Mostra sul sito" ────┐
   │      (shop + 2 Paylinks)                                                  │
   │  paid online (sync) │ "Segna come venduta" (manual)   "Nascondi"          │
   │                     ▼                                    ▼                │
   │                   sold ─────────────────────────────── hidden ────────────┘
   │   (page stays, "found its home",          (no page, not in shop; links closed)
   │    noindex, links closed)
   └── "Elimina": file + photos removed; the sync closes the links through the ledger
```

`soldChannel` is `online-shipping`, `online-pickup` (set by the sync) or `manual` (set by the admin).
The repository is public, so **no customer data is ever stored** — only the Zahls transaction id.

## 3. Flows

### 3.1 Add a bag → live (≈ 2–4 minutes)
1. Admin page: photos are resized on the phone (1600/900/400 px JPEG, EXIF and GPS removed).
2. One commit through the GitHub API: product JSON + photos (blobs → tree → commit → move `main`;
   retried up to 3 times if someone pushed in the meantime).
3. The push starts **Deploy**: tests → sync creates two Paylinks (shipping = price + fee, pickup = price)
   and writes them into `zahls` → bot commit `chore(inventory): sync with Zahls` → `astro build` → Pages.
4. The product page shows the delivery choice and "Buy". With checkout off or links missing it shows
   "order by e-mail" (`mailto:` with the bag id in the subject).

### 3.2 Online sale → sold (≈ 10–20 minutes)
1. The customer pays on Zahls and is sent back to `/thanks/?p=<id>` (Italian page; it switches to the
   visitor's language, remembered by the buy button).
2. Zahls e-mails the order to the team (name, address, phone — only there).
3. The next Deploy run (cron, every 10 min) asks Zahls about each open link → paid: `status: "sold"`,
   `soldAt`, `soldChannel`, `zahls.transactionId`; the other link is deleted → commit → rebuild.
4. The bag leaves the shop; its page stays with a "found its home" note (`noindex`, not in the sitemap).
   The admin's "Aggiorna vendite ora" starts the same run immediately.

### 3.3 Manual sale (market stall)
Admin "Segna come venduta" → commit with `status: "sold"`, `soldChannel: "manual"` → Deploy: the sync
checks the links one last time (a payment made meanwhile = **DOUBLE PAYMENT** alert) and deletes them →
rebuild.

### 3.4 Price or shipping-fee change
The sync sees that `zahls.amount` / `zahls.shippingFee` no longer match, checks the old links for payments,
deletes them and creates new ones in the same run. Until then the site never shows a stale link: it falls
back to "order by e-mail" (`paymentLink()` in `src/lib/catalog.ts`).

### 3.5 Checkout switch
`"checkout": { "enabled": true }` in `site.json` turns online payment on. Anything else = off: the site shows
only "order by e-mail" and the sync only tests the connection (see [OPERATIONS.md §2](OPERATIONS.md)).

## 4. Security model

| Asset | Protection |
|---|---|
| GitHub write access for the admin | Fine-grained token limited to **this one repository** (Contents + Actions read/write). Stored only encrypted in `auth.json` (AES-256-GCM; key = PBKDF2-SHA256, 600 000 rounds, random salt, from the admin e-mail + password). The e-mail and password are not stored anywhere in the repo. |
| Admin page | Strict Content-Security-Policy (own files + `api.github.com` + `raw.githubusercontent.com` only), no third-party code, refuses to run inside a frame, `noindex`, token never displayed or logged. |
| Zahls API key | Only in GitHub **Secrets** (`ZAHLS_API_KEY`) or a local, git-ignored `.env`; sent only in the `X-API-KEY` header; never printed. |
| Customer data | Stays in Zahls. The sync never writes or prints names, e-mails or addresses (tests check this). |
| Photo privacy | Photos are re-drawn on a canvas before upload → no EXIF/GPS in the public repo. |
| Workflows | `permissions: {}` by default, minimal rights per job; tests run before the sync touches anything; runs never overlap (`concurrency`). |
| Payment correctness | Links are created for the exact amount shown; stale links are hidden; double payments and payments for deleted bags turn the run red and GitHub e-mails the owner. |

**Residual risks** (accepted, to be known by the team):

- **`auth.json` is public.** Anyone can download it and try passwords offline; the shop e-mail is public too.
  Its safety rests on a long, unique passphrase. If in doubt: revoke the token, run `npm run admin:setup`
  again with a new password.
- **Logged-in phones.** After login the token stays in that phone's browser storage until "Esci". A lost
  phone = revoke the token on GitHub and create a new `auth.json`.
- **The GitHub account is the master key** (code, data, Pages, secrets). Use 2FA and a password nobody else
  knows; the account password that was shared in chat must be changed.
- **No stock reservation.** Two customers can pay for the same bag in the 10–20 minutes before the sync
  marks it sold, or a bag can be sold at a market and paid online at the same time → refund one payment.
- **Unconfirmed Zahls details** (status names, transaction lookup, time zone) are written defensively and
  must be confirmed by one real test purchase ([OPERATIONS.md §13](OPERATIONS.md)).
- **Public history.** Everything ever committed (prices, notes, deleted photos) stays in the git history.
- **The preview password is not secrecy.** It keeps casual visitors and search engines out before launch,
  but all texts and photos are readable in the public repository, and images/CSS/JS are not encrypted.

## 5. Limits

| Limit | Consequence |
|---|---|
| Sync every **10 minutes**, "best effort" | Paid bags disappear 10–20 min (sometimes 30+) after payment. |
| GitHub disables cron after **60 days without repository activity** | During long breaks the sync stops; re-enable in Actions → Deploy ([OPERATIONS.md §10](OPERATIONS.md)). |
| **Public repository** (needed for free Pages and unlimited Actions minutes) | Inventory, prices and history are visible; never commit secrets or customer data. A private repo would need a paid plan for Pages and would exceed the free Actions minutes. |
| One bag per payment, no cart, no customer accounts | By design (every bag is unique). |
| Shipping to CH and LI only, one flat fee | `shippingCountries`, `shippingFee` in `site.json`. |
| Zahls always returns customers to the Italian `/thanks/` page | The page switches to the visitor's language with a small script. |
| Newsletter | Until a provider is set, the form opens an e-mail to the shop (`mailto:`). |
| Team photos | `team.json` has a `photo` field but the pages do not use it yet: the org chart shows initials. |
| Repository size | Photos accumulate (also deleted ones, in history). GitHub Pages sites are limited to 1 GB; fine for hundreds of bags. |

## 6. Costs

| Item | Cost |
|---|---|
| GitHub (repository, Actions, Pages) | **Free** (public repository: unlimited Actions minutes, Pages included). |
| Zahls.ch | No monthly fee and no setup fee on the entry plan; **from 2.0 % + CHF 0.20 per transaction** ([zahls.ch pricing](https://www.zahls.ch/de/preise-kreditkarten-und-twint), checked October 2026 — confirm the exact rate per payment method in your contract). Example: a CHF 40 bag with pickup ≈ CHF 1.00 fee; CHF 40 + CHF 9 shipping ≈ CHF 1.18. Refunded payments may not get the fee back. |
| Custom domain (later) | Yearly registrar fee (a `.ch` domain is typically in the low tens of francs per year). |
| Newsletter provider (later) | Free tiers exist (e.g. Brevo, Mailchimp); check their current limits. |
| Fonts, icons, libraries | Free (self-hosted open-source fonts; no paid services). |
