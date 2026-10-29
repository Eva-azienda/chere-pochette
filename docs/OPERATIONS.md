# Operations — how the shop runs by itself

The automation behind https://cherepochette.ch: publishing, the preview password, the payment switch, the Zahls
sync, and what to do when something goes wrong. No server is involved — everything runs in **GitHub Actions**
(`.github/workflows/`) and **Zahls.ch**. Accounts and one-time settings: [SETUP.md](SETUP.md).

**State on 29.10.2026:** preview gate **on** (`SITE_PASSWORD` set) · online payment **off**
(`checkout.enabled: false`) · Zahls connection **OK** · admin token valid until **29.10.2027**.

## 1. The big picture

| Piece | What it does |
|---|---|
| `src/data/products/<id>.json` | One file per bag. Source of truth for the shop. |
| `/admin/` | The team adds/edits bags from a phone; each save is one commit through the GitHub API. |
| `.github/workflows/deploy.yml` ("Deploy") | Tests → Zahls sync → commit sync result → build → preview gate → GitHub Pages. |
| `.github/workflows/zahls-check.yml` ("Zahls check") | Manual button: tests the Zahls instance + API key, changes nothing (§5). |
| `scripts/zahls-sync.mjs` | With checkout on: creates two Paylinks per available bag, detects payments, marks bags sold, closes links. With checkout off: connection test only. |
| `scripts/protect-site.mjs` | Preview password gate while the secret `SITE_PASSWORD` exists (§3). |
| `"checkout"` in `src/data/site.json` | The switch: online payment on (`true`) or off (anything else → "Ordina via e-mail"). |
| `scripts/admin-setup.mjs` | Creates the encrypted `public/admin/auth.json` for the admin login (§10). |

## 2. The Deploy workflow

| Trigger | What happens |
|---|---|
| **push to `main`** (admin save, edit on github.com, bot commit not included) | tests → sync → build → gate → deploy (≈ 3–5 min) |
| **every 10 minutes** (cron) | tests → sync; build + deploy **only** if the sync changed something or the latest commit is not online yet |
| **Run workflow** (Actions → Deploy), the admin's **Aggiorna vendite ora**, or `gh workflow run deploy.yml` | like a push |

Steps of the `build` job: checkout of the **latest** `main` → Node 22 → `npm ci` → **`npm test`** → read Pages settings
(`SITE_URL` = `https://cherepochette.ch`, `BASE_PATH` = `/`) → **Zahls sync** (`continue-on-error`) → commit
`chore(inventory): sync with Zahls` if needed (3 push attempts with rebase) → decide → `npm run build` →
**Password gate (preview)** → upload. The `deploy` job publishes to Pages and moves the git tag **`deployed`** to the
published commit (used by the cron to know what is online — do not use that tag for anything else).

- Runs never overlap and are never cancelled halfway (`concurrency: deploy`).
- A broken data file fails the build: the **previous version stays online**.
- A failed Zahls sync never blocks publishing; the run is still marked red at the end so someone looks at it.
- Permissions are minimal per job (`permissions: {}` by default).

## 3. Preview password gate

While the repository secret **`SITE_PASSWORD`** exists, the Deploy step *Password gate (preview)* runs
`scripts/protect-site.mjs` on the built site:

- every HTML page is encrypted with **StatiCrypt** (AES-256; the password is checked in the browser);
  **`/admin/` is excluded** (it has its own login);
- visitors see "Il sito è in anteprima" (design: `scripts/gate/template.html`) and type the password once;
  **"Ricordami su questo dispositivo"** keeps them in for **30 days**;
- `robots.txt` becomes `Disallow: /` and the sitemaps are removed (no search-engine indexing);
- `scripts/gate/staticrypt.json` holds a **fixed, non-secret salt** so "Ricordami" survives redeploys.

| Task | How |
|---|---|
| **Launch the site** | Settings → Secrets and variables → Actions → delete **`SITE_PASSWORD`** → Actions → **Deploy** → *Run workflow*. The log then says "SITE_PASSWORD not set – the website is public"; robots.txt and sitemap are back. |
| Change the preview password | `gh secret set SITE_PASSWORD` (or web → *Update*) → Run Deploy. **Logs everyone out.** |
| Back to preview after launch | Create the secret again → Run Deploy. |

Limits: it hides the **pages**, not the content — the repository is public, and images, CSS and JS are not
encrypted. `/thanks/` is gated too (irrelevant while checkout is off).

## 4. Online payment on/off — the checkout switch

`src/data/site.json`:

```json
"checkout": { "enabled": false, "_comment": "…" }
```

| `checkout.enabled` | Website | Zahls sync (every Deploy run) |
|---|---|---|
| `false` (**today**) | Product pages show **"Ordina via e-mail"** (mailto with subject "Ordine cp-00X – Model"). Only the product pages change: the info page ("Pagamento", FAQ "Come posso pagare?"), the shop/info meta descriptions ("pagamento con TWINT") and the terms (§4–5) still describe payment on Zahls | **Changes nothing.** Tests the connection (*"Zahls connection OK (instance "cherepochette") – checkout disabled, no links created"*) and prints what it **would** create (*"With checkout enabled, the sync would: cp-001: create shipping link CHF 49.00, …"*). A connection problem is only a yellow warning; the run stays green. |
| `true` | "Acquista" with delivery choice (shipping / pickup in Bellinzona) | Full sync (§7): payment links, sold bags, commits. |

Only the exact value `true` switches payment on. The admin shows "Pagamenti online: attivi" / "non ancora attivi".

**Switching off again** (`true` → `false`): existing links are **left alone** and nobody checks them for payments.
Every run warns *"checkout is disabled, but N Zahls payment link(s) are still open: …"*. For a short pause that is
fine (the first run after switching on checks them first). For a long pause, delete those links in the Zahls dashboard.

## 5. Checking the Zahls connection ("Zahls check")

GitHub → **Actions → Zahls check → Run workflow** (or `gh workflow run zahls-check.yml`). Not run yet; the same
connection test ran OK on 29.10.2026 inside the Deploy run (step *Zahls sync*).

- Calls only `GET /SignatureCheck/` with `ZAHLS_INSTANCE` + `ZAHLS_API_KEY`: no link created or deleted, no file changed.
- **Green** = *"Zahls connection OK (instance …)"*.
- **Red** → open the step *"Check the Zahls connection"*: *"refused the credentials"* = wrong instance or key;
  *"not reachable"* = Zahls/network problem, retry later; *"must both be set"* = secret/variable missing ([SETUP.md §5](SETUP.md#5-secrets-and-variables)).
- Locally: `node scripts/zahls-sync.mjs --check` (reads `.env`, §8).

## 6. Going live with payments

Do this only after the **Zahls verification (KYC)** is confirmed and Payrexx Pay is active ([SETUP.md §7](SETUP.md#7-zahls)).

1. **Real prices** in `src/data/models.json` and on each bag in the admin; **shipping fee** in `src/data/site.json`.
2. **Zahls check** → green. Optional: latest Deploy run → step *Zahls sync* → check the "would" list (right bags, amounts).
3. github.com → `src/data/site.json` → pencil → in `"checkout"` change `"enabled": false` to `"enabled": true` →
   *Commit changes* to `main`.
4. Wait for that **Deploy** run (green, ≈ 3–5 min): the sync creates two links per available bag and commits them;
   product pages show "Acquista"; the admin shows "Pagamenti online: attivi". If the gate is still on, open the site
   with the preview password.
5. **Test purchase in CHF on a phone**: e.g. an extra bag at a low price (note `TEST – non acquistare`), or a real bag;
   **pickup** is simplest; pay with TWINT. Check: you land on the thank-you page; the Zahls order e-mail arrives;
   within ≈ 10–20 min (or after "Aggiorna vendite ora") the bag is in **Vendute** ("online, ritiro") and gone from the shop.
6. **Refund** the payment in the Zahls dashboard. Then delete the test bag (or "Rimetti in vendita" a real one — it gets new links).
7. If the bag does not turn sold: §13.

## 7. What the sync does (checkout on)

Every available bag gets **two Zahls Paylinks**: **shipping** = price + `shippingFee` (asks for the postal address),
**pickup** = price only (name, e-mail, phone). Whichever is paid first wins; the other is deleted.

| Product status | Situation | Action |
|---|---|---|
| `available` | no links yet | create shipping + pickup links, store them in `zahls` |
| `available` | links exist | ask Zahls if one was paid → `status: "sold"`, `soldAt`, `soldChannel` (`online-shipping` / `online-pickup`), `zahls.transactionId`; delete the other link |
| `available` | price or shipping fee changed | (after the payment check) delete the old links, create new ones |
| `available` | a link was deleted in Zahls | create it again |
| `sold` / `hidden` | links still exist | last payment check, then delete the links |
| `hidden` | a link was paid anyway | mark `sold` (warning) |
| any | both links paid / paid after a manual sale | **"DOUBLE PAYMENT – refund needed"**: earliest payment wins; refund the other in Zahls |
| file deleted | bag deleted in the admin | links listed in `scripts/zahls-links.json` are checked once more and deleted; paid meanwhile → **"PAYMENT FOR A DELETED BAG"** |

- `scripts/zahls-links.json` is the **ledger** of open links (written and committed by the sync — never edit it).
- Amounts in cents (`zahls.amount`, `zahls.shippingFee`). Paylink title "Chère Pochette – Belle N° 012",
  `referenceId` `cp-012:shipping` / `cp-012:pickup`. After payment Zahls redirects to
  `https://cherepochette.ch/thanks/?p=cp-012` (or `/payment-cancelled/`).
- The site never shows a stale link: if the link amount does not match the price shown, it falls back to "order by e-mail".
- Network errors, 429 and 5xx are retried. Wrong credentials, a bag that cannot be synced, or a payment that needs a
  human turn the run **red** (GitHub e-mails the owner; the admin shows "Problema nell'ultimo aggiornamento").
- **No customer data** is ever written or printed — only Zahls ids. The API key is only sent in the `X-API-KEY` header.

## 8. Running the sync by hand

**On GitHub (normal):** Actions → **Deploy** → **Run workflow**, or the admin's **Aggiorna vendite ora**.

**Locally** (Node 22):

```bash
cp .env.example .env    # fill in ZAHLS_INSTANCE=cherepochette, ZAHLS_API_KEY, SITE_URL=https://cherepochette.ch, BASE_PATH=/
node scripts/zahls-sync.mjs --check   # connection test only
npm run zahls:sync                    # DRY_RUN=1 in .env: prints what it would do (with checkout off it never changes anything)
```

A real local run changes JSON files on your computer only → commit and push them, otherwise the next GitHub run
creates a second pair of links. `RECREATE_LINKS=1` replaces the links of all available bags (only needed if the site
address ever changes). `.env` is git-ignored — never commit it.

## 9. Scheduled runs — caveats

- GitHub runs the cron **"best effort"**: runs can be 10–30 minutes late or skipped. A paid bag may stay visible a bit
  longer; no payment is lost (the next run finds it). Worst case: two people pay the same bag → DOUBLE PAYMENT → refund one.
- **60-day rule:** in public repositories GitHub **disables scheduled workflows after 60 days without repository
  activity** (it e-mails the account a few days before). Every admin save is a commit, so an active shop never hits it;
  long holidays can. **Re-enable:** repository → **Actions** → **Deploy** → banner "This scheduled workflow is
  disabled…" → **Enable workflow** (or `gh workflow enable deploy.yml`) → run it once by hand.
  A simple prevention: save something in the admin (or commit any small change) at least every ~7 weeks.
- With checkout off, the cron only tests the Zahls connection and never commits or redeploys.
- Public repository = unlimited free Actions minutes (a private one would exceed the free plan with this cron).

## 10. Admin access and token expiry

- One admin login: **shop e-mail + admin password**. `public/admin/auth.json` (v2) contains the GitHub token
  **encrypted** (AES-256-GCM; key = PBKDF2-SHA256, 600 000 rounds, from e-mail + password). E-mail and password are
  not stored. Publishing the file is safe **only because the password is long and unique** (the e-mail is public).
- The token is fine-grained (only `chere-pochette`; Contents + Actions read/write) and **expires on 29.10.2027**.
  When it expires the admin shows "La chiave di accesso a GitHub è scaduta o è stata revocata" and cannot save.
- Renew / change password / lost phone / someone leaves: [SETUP.md §6](SETUP.md#6-admin-access-npm-run-adminsetup)
  (new token → `npm run admin:setup` → commit `auth.json` → revoke the old token).
- An `auth.json` in the old v1 format (team password) is refused by the admin: re-run the script.

## 11. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Site asks for a password | Preview gate on (by design) | Give the preview password; launch = §3 |
| Shop shows "Ordina via e-mail" | Checkout off (today, by design) — or, with checkout on, links not created yet / Zahls secrets missing / run failed | §4, §6; open the latest Deploy run → "Zahls sync" |
| Warning *"Zahls connection FAILED … published anyway"* | Checkout off and the connection test failed | Run **Zahls check** (§5), fix the key/instance |
| Run red, *"Zahls refused the credentials"* | Wrong `ZAHLS_INSTANCE` / `ZAHLS_API_KEY`, or key regenerated | Fix the secret/variable, Zahls check, Run workflow |
| Run red, *"Could not push the inventory changes"* | Branch protection blocks the bot, or many parallel pushes | Allow `github-actions[bot]` to push to `main`; re-run |
| Run red at *Password gate (preview)* | StatiCrypt failed (e.g. dependency problem) | Open the step log (the password is masked); `npm ci` + `node scripts/protect-site.mjs` locally |
| *"DOUBLE PAYMENT – refund needed"* | Two payments for one bag, or sold at a market and paid online | Refund the transaction id from the log in Zahls; contact the customer |
| *"PAYMENT FOR A DELETED BAG"* | Paid shortly before deletion | Find it in Zahls; ship (restore the bag) or refund |
| *"payment … is only authorised"* | Authorisation-only payment method | Capture or cancel it in Zahls |
| Bag paid but still "available" after 30+ min | Cron delayed/disabled (§9) or run failed | Run Deploy by hand; re-enable the schedule |
| Scheduled runs stopped | 60-day rule | §9 |
| *"invalid price"* / *"cannot read/parse"* | Broken or edited product file | Fix in the admin, or fix the JSON and push |
| Pages deploy fails: "Get Pages site failed" | Pages source not "GitHub Actions" | [SETUP.md §3](SETUP.md#3-github-pages-and-the-custom-domain) |
| Domain shows a GitHub 404 or certificate error | DNS records changed at Hostpoint, or custom domain removed in Settings → Pages | Compare with [SETUP.md §4](SETUP.md#4-dns-at-hostpoint); re-enter the domain; wait for HTTPS |
| Admin: "E-mail o password non corretti" for everyone | `auth.json` was regenerated with a new password | Use the new password |
| Admin cannot save (401/403) | Token expired, revoked or missing permissions | §10 |

## 12. Tests

`npm test` (94 tests, no network) runs `scripts/test/*.test.mjs`: the sync against a fake Zahls API (checkout switch,
`--check`, links, payments, price changes, ledger, double payment, privacy), `auth.json` compatibility between
`admin-setup.mjs` and the admin's `crypto.js`, the admin's data rules, CSV export and GitHub commits against a fake
GitHub, and a check that the removed demo mode stays gone. Deploy runs the tests before every sync.

## 13. Assumptions to confirm with the first real payment

The Zahls API documentation does not cover every detail, so the sync is defensive:

- a Paylink can be paid once; after payment its status is `confirmed` (also accepted: a confirmed transaction in
  `invoices[].transactions[]`; otherwise it looks the transaction up via `GET /Transaction/` by `referenceId`);
- transaction times without a time zone are read as Swiss time.

If the first test purchase does not turn the bag sold, run the sync locally with `DRY_RUN=1` and check these points.
