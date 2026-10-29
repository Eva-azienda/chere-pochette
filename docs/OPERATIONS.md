# Operations — how the shop runs by itself

This page explains the automation behind the Chère Pochette shop: payment links, "sold" bags,
publishing, and what to do when something goes wrong. No server is involved — everything runs
in **GitHub Actions** (`.github/workflows/`) and **Zahls.ch**. Online payment is switched on and off
with **one line** in `src/data/site.json` (§2).

## 1. The big picture

| Piece | What it does |
|---|---|
| `src/data/products/<id>.json` | One file per bag. Source of truth for the shop. |
| `/admin/` page | The team adds/edits bags from a phone; it commits the JSON files through the GitHub API. |
| `scripts/zahls-sync.mjs` | Creates the two Zahls payment links per available bag, detects payments, marks bags as sold, closes links. |
| `.github/workflows/deploy.yml` ("Deploy") | Runs the sync, commits its result, builds the site and publishes it on GitHub Pages. |
| `.github/workflows/zahls-check.yml` ("Zahls check") | Manual button: tests the Zahls instance name + API key, changes nothing (§5). |
| `"checkout"` in `src/data/site.json` | The switch: online payment on (`true`) or off (`false`, "order by e-mail"). |
| `scripts/admin-setup.mjs` | One-time: creates the encrypted `public/admin/auth.json` for the admin page (login: admin e-mail + password). |
| `scripts/protect-site.mjs` | Optional preview password for the whole site while the secret `SITE_PASSWORD` exists (§3). |

Every available bag gets **two Zahls Paylinks** (one-time payment pages):

- **shipping** — bag price + shipping fee (`shippingFee` in `src/data/site.json`); asks for the postal address;
- **pickup** — bag price only; free pickup in Bellinzona; asks only name, e-mail, phone.

The product page shows both buttons. Whichever is paid first wins; the other link is deleted.
(All of this only while checkout is enabled — see §2.)

### Adding a bag

```
Admin (phone)          GitHub repo                 GitHub Actions "Deploy"          Zahls
     |  save bag in /admin/  |                              |                           |
     |---------------------->| commit cp-013.json           |                           |
     |                       |--- push event -------------->|                           |
     |                       |                              |-- POST /Invoice/ (x2) --->|  shipping + pickup links
     |                       |<-- commit "chore(inventory)" |<-- { id, link } ----------|
     |                       |                              |-- build + deploy Pages    |
     |  bag is online with "Buy" buttons (≈ 2–4 minutes)    |                           |
```

### A customer buys a bag

```
Customer            Website (Pages)        Zahls                     GitHub Actions "Deploy"      GitHub repo
   | product page        |                   |                               |                         |
   |-------------------->|                   |                               |                         |
   | "Buy – shipping"  (zahls.shipping.link) |                               |                         |
   |---------------------------------------->|                               |                         |
   | pays (TWINT, card…) |                   |                               |                         |
   |<-- redirect to /thanks/?p=cp-012 -------|                               |                         |
   |                     |                   |   every 10 minutes (cron):    |                         |
   |                     |                   |<-- GET /Invoice/{id}/ --------|                         |
   |                     |                   |--- status "confirmed" ------->|                         |
   |                     |                   |<-- DELETE the pickup link ----|                         |
   |                     |                   |                               |-- commit cp-012 "sold"->|
   |                     |                   |                               |-- build + deploy        |
   | bag disappears from the shop (≈ 10–20 minutes after payment)            |                         |
```

The team receives the order (name, address, e-mail) from **Zahls** (e-mail notification / dashboard),
never from GitHub: **no customer data is ever written to the repository** — it is public. The product
file only stores the Zahls transaction id.

## 2. Online payment on/off — the checkout switch

`src/data/site.json` contains:

```json
"checkout": {
  "enabled": false,
  ...
}
```

| `checkout.enabled` | Website | Zahls sync (every run of "Deploy") |
|---|---|---|
| `false` (or missing) | "order by e-mail" buttons, no payment buttons | **Changes nothing**: creates/deletes no payment link, writes no file. It only tests the Zahls connection, logs *"Zahls connection OK (instance …) – checkout disabled, no links created"* and lists what it **would** create (*"With checkout enabled, the sync would: cp-001: create shipping link CHF 49.00, …"*). A connection problem is only a yellow **warning** — the run stays green and the website is published. |
| `true` | "Buy" buttons (shipping / pickup) | Full sync (§7): payment links, sold bags, commits. |

Only the exact value `true` switches payment on; anything else counts as off (safe default).

**Switching off again** (`true` → `false`): the payment links that already exist are **left alone** — they
are not deleted automatically, and while checkout is off nobody checks them for payments. Every run then
shows the warning *"checkout is disabled, but N Zahls payment link(s) are still open: cp-001 shipping #123, …"*.
For a short pause that is fine: when checkout is switched on again, the first run checks those links for
payments **before** anything else, so a payment made meanwhile is still found. For a long pause, delete the
listed links in the Zahls dashboard (the next enabled run notices they are gone and creates new ones).

## 3. One-time setup checklist

1. **Zahls credentials** (see §4): repository → Settings → Secrets and variables → Actions
   - *Secrets* tab → **New repository secret** `ZAHLS_API_KEY`
   - *Variables* tab → **New repository variable** `ZAHLS_INSTANCE` (a secret with that name also works)
2. **Test them**: Actions → **Zahls check** → Run workflow → must be green (§5). Works in a private
   repository and before GitHub Pages exists.
3. **GitHub Pages**: repository → Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
   On the free GitHub plan Pages needs a **public** repository. Until Pages is set up, every "Deploy" run
   fails at *"Read GitHub Pages settings"* — that is expected (or disable the Deploy workflow until then:
   Actions → Deploy → ⋯ → *Disable workflow*).
4. **Zahls dashboard**: set the e-mail address that receives payment notifications, and check the shop
   name / logo shown on the payment page.
5. **Admin access**: run `npm run admin:setup` (see §9) and commit `public/admin/auth.json`.
6. Push to `main` (or Actions → Deploy → **Run workflow**) and check that the run is green.
7. Online payment stays **off** until the Zahls account is verified: then follow §6.

| Name | Kind | Required | Value |
|---|---|---|---|
| `ZAHLS_API_KEY` | secret | for online payment | API secret of the Zahls instance |
| `ZAHLS_INSTANCE` | variable (or secret) | for online payment | instance name, e.g. `cherepochette` |
| `SITE_PASSWORD` | secret | optional, preview only | while it exists, every page except `/admin/` is behind this password (StatiCrypt, `scripts/protect-site.mjs`); robots blocked, no sitemap. **Launch = delete the secret** and run Deploy |
| `GITHUB_TOKEN` | automatic | — | provided by GitHub; the workflow's `permissions:` block gives it the rights it needs |

Without the two Zahls values the sync logs *"Zahls not configured – skipping"* and the shop shows
**"order by e-mail"** buttons instead of payment buttons. Everything else works normally.

`SITE_URL` and `BASE_PATH` are filled in automatically by the workflow from the Pages settings.

## 4. Getting the Zahls API key and instance name

1. Log in to Zahls. The address in the browser is `https://<instance>.zahls.ch/…` — that `<instance>` is
   the **instance name** (`ZAHLS_INSTANCE`).
2. Open **API & Integration** in the Zahls dashboard. Copy the **API secret** (`ZAHLS_API_KEY`).
   Treat it like a password: it can create and delete payment links. Never paste it in a file in the repo,
   a chat or an e-mail — only in GitHub Secrets or your local `.env`.
3. If the key ever leaks: generate a new one in Zahls (the old one stops working) and update the GitHub secret.

## 5. Checking the Zahls connection ("Zahls check")

GitHub → repository → **Actions** → **Zahls check** → **Run workflow** (or `gh workflow run zahls-check.yml`).

- It calls only `GET /SignatureCheck/` with `ZAHLS_INSTANCE` + `ZAHLS_API_KEY` — no payment link is created or
  deleted, no file changes. It needs no GitHub Pages and only read access, so it works in a private repository.
- **Green**, log *"Zahls connection OK (instance …)"*: Zahls accepted instance name and key.
- **Red**: open the step *"Check the Zahls connection"*: *"refused the credentials"* = wrong instance name or key
  (§4); *"not reachable"* = Zahls/network problem, try again later; *"must both be set"* = secret/variable missing (§3).
- Locally: `node scripts/zahls-sync.mjs --check` (reads `.env`, see §8).

The "Deploy" workflow runs the same check on every run while checkout is disabled (§2), as a warning only.

## 6. Going live with payments

1. **CFO: complete the Zahls verification** (identity / company documents / bank account, as Zahls asks)
   and wait until Zahls confirms the account.
2. **Activate Payrexx Pay in Zahls** (Zahls dashboard) and switch on the payment methods you want to offer
   (e.g. TWINT, cards).
3. Run **Zahls check** (§5) → green. Optional: open the latest "Deploy" run → step *"Zahls sync"* → check the
   list *"With checkout enabled, the sync would: …"* (right bags, right prices).
4. **Switch checkout on** with the GitHub web editor: github.com → the repository → `src/data/site.json` →
   pencil icon (*Edit this file*) → change `"enabled": false` to `"enabled": true` (inside `"checkout"`) →
   **Commit changes…** → *Commit directly to the `main` branch* → **Commit changes**.
5. **Wait for the deploy**: Actions → **Deploy** run of that commit → green (≈ 3–5 minutes). The "Zahls sync"
   step creates two links per available bag and commits them (*"chore(inventory): sync with Zahls"*); the
   product pages now show the "Buy" buttons.
6. **Test with a real purchase in CHF** (or with a CHF 1 test bag, see [SETUP.md §8](SETUP.md)): buy the cheapest bag yourself (pickup is simplest), check the e-mail
   from Zahls and that the bag turns *sold* after the next run (≈ 10–20 minutes). Then **refund** the payment
   in the Zahls dashboard and set the bag back to *available* in the admin page (it gets new links).

To pause online payment later: set `"enabled": false` the same way (§2: "Switching off again").

## 7. What the sync does exactly

Only while checkout is enabled (§2). For each `src/data/products/*.json` (a problem with one bag never stops the others):

| Product status | Situation | Action |
|---|---|---|
| `available` | no links yet | create shipping + pickup Paylinks, store them in `zahls` |
| `available` | links exist | ask Zahls if one was paid → if yes: `status: "sold"`, `soldAt`, `soldChannel` (`online-shipping` / `online-pickup`), `zahls.transactionId`; the other link is deleted |
| `available` | price or shipping fee changed | (after the payment check!) delete the old links and create new ones |
| `available` | a link was deleted in the Zahls dashboard | create it again |
| `sold` / `hidden` | links still exist | last payment check, then delete the links |
| `hidden` | a link was paid anyway | mark as `sold` (warning in the log) |
| any | **both** links paid / paid after a manual sale | **"DOUBLE PAYMENT – refund needed"** error annotation; earliest payment wins; refund the other in Zahls |
| file deleted | bag deleted in the admin (or its links lost from the file) | links still listed in `scripts/zahls-links.json` are checked one last time and deleted; if one was paid meanwhile: **"PAYMENT FOR A DELETED BAG"** alert |

`scripts/zahls-links.json` (the "ledger", written and committed by the sync — never edit it) lists every
Zahls link that is still open. It exists because the admin's "Elimina" removes the product file, and with it
the only place the link ids were written: without the ledger those links would stay payable forever.

Details:

- Amounts are in cents: `zahls.amount` = price × 100, `zahls.shippingFee` = fee × 100.
- Paylink title "Chère Pochette – Belle N° 012", short IT/DE/EN description, `referenceId`
  `cp-012:shipping` / `cp-012:pickup`, `purpose`/`sku` = `cp-012`.
- After payment Zahls redirects to `<site>/thanks/?p=cp-012` (or `/payment-cancelled/?p=cp-012`).
- A file is only rewritten when something really changed; `updatedAt` is updated then. Formatting stays
  stable (2-space JSON, same key order, final newline) so git diffs stay small.
- Network errors, HTTP 429 and 5xx are retried with increasing pauses. If Zahls is unreachable the run is
  skipped without error and the next run tries again. Wrong credentials stop the sync and the run turns red,
  **but the site is still built and published**.
- The run also turns red (exit code 1 → GitHub e-mails the repository owner, the admin page shows
  "Problema nell'ultimo aggiornamento") when a bag could not be synced or a payment needs a human
  (double payment, payment for a deleted bag). Whatever was done is still committed and published.
- The workflow always checks out the **latest** commit of `main` (not the commit that started the run), so a
  run that waited in the queue sees the links the previous run created and never creates a second pair.
- The API key is sent only in the `X-API-KEY` header and never printed. API responses (which contain
  customer data) are never printed either.

## 8. Running the sync by hand

**On GitHub (normal way):** repository → **Actions** → **Deploy** → **Run workflow** → branch `main`.
The admin page's "Aggiorna vendite ora" button does the same. With the GitHub CLI: `gh workflow run deploy.yml`.

**Locally** (Node 22):

```bash
cp .env.example .env          # fill in ZAHLS_INSTANCE, ZAHLS_API_KEY, SITE_URL, BASE_PATH
node scripts/zahls-sync.mjs --check   # only tests the connection
npm run zahls:sync            # .env has DRY_RUN=1: only reads and prints what it would do
                              # (with checkout disabled it never changes anything anyway, §2)
# when the output looks right: set DRY_RUN= (empty) in .env, run again, then commit + push the changed files
```

Running locally changes the JSON files on your computer only — commit and push them, otherwise the next
GitHub run will not know about the links you created (it would create new ones; the old ones stay orphaned
in Zahls and can be deleted there).

Useful switches: `DRY_RUN=1` (read only), `RECREATE_LINKS=1` (replace the links of all available bags —
use it once after moving to a custom domain so the redirects point to the new address; GitHub also redirects
the old `github.io` address automatically, so this is optional).

## 9. Admin access (`npm run admin:setup`)

The admin page needs a GitHub token to save products. There is **one admin login: e-mail + password**.
The script stores the token **encrypted** in `public/admin/auth.json` (format v2: AES-256-GCM, key derived from
the normalised e-mail + password with PBKDF2-SHA256, 600 000 rounds). Neither the e-mail nor the password is
stored. Step-by-step version: [SETUP.md §4–5](SETUP.md).

1. Create a **fine-grained token**: github.com → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → *Generate new token*. Resource owner: the Chère Pochette account; Repository access:
   *Only select repositories* → the website repo; Permissions: **Contents: Read and write**,
   **Actions: Read and write**. Expiration: up to 1 year.
2. `npm run admin:setup` — confirms owner/repo/branch, asks for the admin e-mail (default: the shop address),
   the admin password twice (min. 12 characters, must not contain the e-mail; a 4-word passphrase is suggested)
   and the token (hidden), which it checks with GitHub. Options: `--force` (overwrite without asking),
   `--skip-verify`, `--out <file>`; non-interactive with `ADMIN_OWNER`, `ADMIN_REPO`, `ADMIN_BRANCH`,
   `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_TOKEN`.
3. Commit and push `public/admin/auth.json`. Share e-mail and password with the team privately.
   An `auth.json` from the earlier format (v1, team password only) is refused by the admin page: re-run the script.

Publishing `auth.json` is safe because the token inside is encrypted — **its safety depends entirely on the
password** (the shop e-mail is public). If the password leaks, or a member leaves the team: revoke the token on GitHub, create a new one,
re-run the script with a new password. Put a calendar reminder to **rotate the token every year** (before it
expires, otherwise the admin page stops saving).

## 10. Scheduled runs — caveats

- GitHub starts scheduled runs **"best effort"**: at busy times a run can be delayed by 10–30 minutes or
  occasionally skipped. A sold bag may therefore stay visible a little longer. A payment is never lost —
  the next run picks it up. The worst case is that two customers pay for the same bag in that window:
  the log then shows *DOUBLE PAYMENT – refund needed* and one payment must be refunded in Zahls.
- In public repositories GitHub **disables scheduled workflows after 60 days without repository activity**
  (it e-mails the owner a few days before). Every product saved in the admin page is a commit, so an active
  shop normally never hits this; during long breaks (summer holidays) it can. To re-enable: repository → **Actions** → **Deploy**
  → banner "This scheduled workflow is disabled…" → **Enable workflow** (or `gh workflow enable deploy.yml`).
  Then run it once by hand.
- Scheduled runs only run on the default branch (`main`) and only do the cheap part (sync) unless something
  changed; they never redeploy an unchanged site. "Changed" includes a commit that is not online yet: the
  deploy job moves the git tag **`deployed`** to the commit it published, and a scheduled run whose `main`
  differs from that tag deploys. (Needed because GitHub replaces a *waiting* push run with a newer
  scheduled run when both queue behind a running one.) Do not use that tag for anything else; if it is
  deleted, the next scheduled run simply deploys once more.
- While checkout is disabled, a scheduled run only tests the Zahls connection and never commits or
  redeploys (unless a commit is not online yet, see above).
- Public repositories have unlimited free Actions minutes. In a private repository the 10-minute schedule
  would use ≈ 3 000 minutes/month, more than the free plan includes. "Zahls check" is manual only and costs
  about a minute per run.

## 11. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Shop shows "order by e-mail" instead of "Buy" | Checkout disabled (§2) — normal until going live; or Zahls secrets missing → sync skipped; or the run failed | §2 / §6; check §3; open the latest Deploy run → "Zahls sync" step |
| Run red, *"Zahls refused the credentials"* | Wrong `ZAHLS_INSTANCE` / `ZAHLS_API_KEY`, or key regenerated in Zahls | Fix the secret/variable, run **Zahls check** (§5), then Run workflow |
| Warning *"Zahls connection FAILED … the website is published anyway"* | Checkout disabled and the connection test failed (wrong key/instance, or Zahls down) | Run **Zahls check** (§5) for details; fix before going live |
| Warning *"checkout is disabled, but N Zahls payment link(s) are still open"* | Checkout was switched off after links existed | §2 "Switching off again": delete them in Zahls, or switch checkout on again |
| "Zahls check" red: *"must both be set"* | Secret `ZAHLS_API_KEY` or variable `ZAHLS_INSTANCE` missing | §3 step 1 |
| Run red, *"Could not push the inventory changes"* | Branch protection blocks github-actions[bot], or many parallel pushes | Allow the bot to push to `main`; re-run |
| *"DOUBLE PAYMENT – refund needed"* | Two customers paid the same bag (or it was sold at a market and paid online) | Contact the second customer, refund the transaction id from the log in Zahls |
| *"PAYMENT FOR A DELETED BAG"* | Somebody paid a bag shortly before it was deleted in the admin | Find the payment in Zahls; ship the bag (restore it) or refund |
| *"payment … is only authorised"* | Payment method made an authorisation only | Capture (or cancel) it in the Zahls dashboard |
| Bag paid but still "available" after 30+ min | Checkout disabled (§2), scheduled runs delayed or disabled (§10), or the run failed | Actions → Deploy → Run workflow; re-enable schedule |
| Paid bag still shows after the run turned it "sold" | Browser / CDN cache (up to ~10 min) | Reload; GitHub Pages caches for a few minutes |
| *"invalid price"* for a bag | Price missing or not a number in the product file | Fix it in the admin page |
| *"cannot read/parse"* for a file | Broken JSON (manual edit) | Fix the file (e.g. with an online JSON validator) and push |
| Pages deploy fails: "Get Pages site failed" | Pages not set up / source not set to GitHub Actions | §3 step 3 |
| Scheduled runs stopped completely | 60-day inactivity rule | §10: Enable workflow |
| Admin page: "E-mail o password non corretti" for everyone | `auth.json` was regenerated with another e-mail/password | Use the new credentials or re-run `npm run admin:setup` |
| Admin page: "auth.json … versione precedente" | `auth.json` still in the old v1 format | Re-run `npm run admin:setup`, commit `auth.json` |
| Admin page cannot save (401/403) | Token expired, revoked or missing permissions | New token → `npm run admin:setup` → commit `auth.json` |

## 12. Tests

`npm test` runs `scripts/test/*.test.mjs` (Node's built-in test runner, no network): the sync against a fake
Zahls API (checkout switch, `--check`, link creation, payment detection, price changes, closing links, double
payment, ledger, privacy),
`auth.json` compatibility between `admin-setup.mjs` and the admin page's `crypto.js` (both directions), and
the admin page's data rules, CSV export and GitHub commits against a fake GitHub (`admin-*.test.mjs`). The Deploy workflow runs
the tests before every sync, so a broken script never touches the inventory.

## 13. Assumptions to confirm with the first real payment

The Zahls OpenAPI description does not document every detail, so the sync is written defensively:

- A Paylink can be paid only once; after payment its status is `confirmed` (also accepted: a confirmed
  transaction inside `invoices[].transactions[]`). If the transaction id is not found there, it is looked up
  in `GET /Transaction/` by `referenceId`.
- Transaction times like `2026-10-29 16:05:00` carry no time zone; they are read as Swiss time.

If the first test purchase does not turn the bag "sold", run the sync locally with `DRY_RUN=1` and check
these points.
