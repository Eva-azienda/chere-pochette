# One-time setup with the real accounts

Step by step, for Eva (CTO) or the developer, with the Chère Pochette accounts. Do the steps in order;
each one says how to check it worked. Background and troubleshooting: [OPERATIONS.md](OPERATIONS.md).
Tick the boxes in [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md) as you go.

Values used below (from `src/data/site.json` → `"github"`): owner **`Eva-azienda`**, repository
**`chere-pochette`**, branch **`main`**. If you choose other names, change them in `site.json` too.

> Never paste a password, token or API key into a file in the repository, a chat or an e-mail.
> They go only into GitHub Secrets, the setup script or a password manager.

## 1. GitHub account

1. Log in to github.com with the Chère Pochette account (`Eva-azienda`). If the login does not work, use
   "Forgot password?" with the account's e-mail address first.
2. **Change the account password** (it was shared in a chat): Settings → Password and authentication.
   Use a password manager.
3. **Turn on two-factor authentication** (same page) and store the recovery codes somewhere safe (not in the repo).
4. Settings → Emails: check that the e-mail address is one the team reads — GitHub sends failed-run alerts
   (double payments!) and the "schedule disabled" warning there.

## 2. Repository and first push

1. github.com → **+** → *New repository* → name `chere-pochette`, owner `Eva-azienda`, **Public**
   (free GitHub Pages and unlimited Actions minutes need a public repository), **no** README/licence/.gitignore.
2. On the computer with the project (Node 22, see [README.md](../README.md#quick-start-developers)):
   ```bash
   git remote add origin https://github.com/Eva-azienda/chere-pochette.git
   git push -u origin main
   ```
   Git asks you to log in; the easiest way is the GitHub CLI (`gh auth login`) or GitHub Desktop.
3. Check: the files are visible on github.com. The **Actions** tab shows a first **Deploy** run that fails at
   *"Read GitHub Pages settings"* — expected until step 3.
4. Settings → **Branches**: make sure no branch protection rule blocks pushes to `main` by
   `github-actions[bot]` (the sync commits sold bags).

## 3. GitHub Pages

1. Repository → **Settings → Pages** → *Build and deployment* → Source: **GitHub Actions**.
2. **Actions → Deploy → Run workflow** (branch `main`). Green after ≈ 3–5 minutes.
3. Check: the site is online at **https://eva-azienda.github.io/chere-pochette/** (also shown in Settings → Pages).

### Optional: preview password while the shop is not launched
The Deploy workflow can lock every page (not `/admin/`) behind one password (StatiCrypt, `scripts/protect-site.mjs`):

- Settings → Secrets and variables → Actions → *Secrets* → **New repository secret** `SITE_PASSWORD` = the
  preview password → Actions → Deploy → Run workflow. Visitors see a "Il sito è in anteprima" page; "Ricordami"
  keeps them in for 30 days. Search engines are blocked (robots `Disallow: /`, no sitemap).
- **Launch** = delete the `SITE_PASSWORD` secret and run Deploy again.
- It hides the pages from visitors, **not** the content: the repository is public, so every text is readable there.
  Images, CSS and JS files are not encrypted. The `/thanks/` page is behind the gate too, so test purchases
  during the preview show the password page first.

## 4. Admin access token (fine-grained)

1. github.com (logged in as `Eva-azienda`) → avatar → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. Fill in:
   - **Token name**: `chere-pochette-admin`
   - **Expiration**: 1 year (custom date) → put a **calendar reminder two weeks before**: when it expires the
     admin stops saving.
   - **Resource owner**: `Eva-azienda`
   - **Repository access**: *Only select repositories* → `chere-pochette`
   - **Repository permissions**: **Contents → Read and write**, **Actions → Read and write**.
     *Metadata → Read-only* is added automatically. Nothing else.
3. **Generate token** → copy it (it is shown once). Do not save it anywhere: it goes straight into step 5.

## 5. Admin login file (`npm run admin:setup`)

On the computer with the project (after `npm ci`):

```bash
npm run admin:setup
```

It asks, in this order (press Enter to accept the value in brackets):
1. GitHub owner / repository / branch — `Eva-azienda` / `chere-pochette` / `main`;
2. **admin e-mail** — default `chere.pochette@sccbellinzona.ch` (used only to log in, not stored);
3. **admin password**, twice, hidden — at least 12 characters, not containing the e-mail, **used nowhere
   else** (not the GitHub, Zahls or e-mail password). A 4-word passphrase is suggested;
4. the **token** from step 4 (hidden) — checked with GitHub (repo access, write permission, Actions).

It writes `public/admin/auth.json` (the token, encrypted with the e-mail + password). Then:

```bash
git add public/admin/auth.json
git commit -m "chore(admin): admin access"
git push
```

Check: after the deploy open **https://eva-azienda.github.io/chere-pochette/admin/** on a phone and log in with the
e-mail and password. Give them to the team **in person** (or via a password manager), never in a group chat.
To change the password or replace the token later: run the script again (`--force` overwrites without asking),
commit, push. Options: `--skip-verify` (no GitHub check), `--out <file>`; non-interactive with the environment
variables `ADMIN_OWNER`, `ADMIN_REPO`, `ADMIN_BRANCH`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_TOKEN`.

## 6. Zahls account

Menu names in the Zahls dashboard can differ slightly; ask Zahls support if something is not where described.

1. **Account and verification (KYC)** — CFO + legal representative: complete the company profile, upload the
   documents Zahls asks for (identity of the responsible persons, organisation, bank account for payouts) and
   wait for Zahls to confirm the account.
2. **Payment methods**: activate **TWINT**, **cards** (Visa, Mastercard) and **PostFinance** — the website's info
   page promises exactly these. **Do not activate** prepayment / invoice or other slow methods: while such a
   payment is pending the bag stays on sale.
3. **Look & feel** of the payment page: shop name *Chère Pochette*, logo `public/brand/logo-bordeaux.png`, main
   colour **#82001F** (bordeaux), background **#FAF7F2** (ivory).
4. **Notifications**: the e-mail address that receives each order (customer name, address, phone) — the shop
   address `chere.pochette@sccbellinzona.ch`, read by the people who ship.
5. **API key**: *API & Integration* → copy the **API secret**. The **instance name** is the `xyz` in
   `https://xyz.zahls.ch` (the address of your dashboard). Note both for step 7 only.

## 7. Connect Zahls to GitHub and go live

1. Repository → **Settings → Secrets and variables → Actions**:
   - *Secrets* → **New repository secret** `ZAHLS_API_KEY` = the API secret;
   - *Variables* → **New repository variable** `ZAHLS_INSTANCE` = the instance name.
2. **Actions → Zahls check → Run workflow** → must be **green** ("Zahls connection OK"). Red: see
   [OPERATIONS.md §5](OPERATIONS.md).
3. **Remove the 4 demo bags** `cp-001`…`cp-004` (brand photos, not real bags) in the admin — *Elimina* — or replace
   them with real bags first. Otherwise they get real payment links.
4. Optional check: latest **Deploy** run → step *Zahls sync* → list "With checkout enabled, the sync would: …"
   (right bags, right amounts).
5. **Switch payment on**: github.com → `src/data/site.json` → pencil → in `"checkout"` change `"enabled": false`
   to `"enabled": true` → *Commit changes* to `main`. The Deploy run creates two links per available bag.
   The admin shows "Pagamenti online: attivi".

## 8. Test purchase (CHF 1) on a phone

1. Admin → **Nuova borsa**: one photo, any model/colour, price **1**, note `TEST – non acquistare`.
   (If Zahls refuses such a small amount, use a few francs.)
2. After ≈ 3 minutes open the bag on the site on a phone → choose **Ritiro a Bellinzona** (CHF 1; shipping would
   add the fee) → **Acquista** → pay with **TWINT**.
3. Check, in this order:
   - you land on the **thank-you page** (in the language you used);
   - the order e-mail from Zahls arrives (and the payment appears in the dashboard);
   - within ≈ 10–20 minutes (or after "Aggiorna vendite ora") the bag is in **Vendute** in the admin with
     "online, ritiro", and has disappeared from the shop; the Deploy run is green.
4. **Refund** the payment in the Zahls dashboard, then **delete** the test bag in the admin.
5. If the bag does not turn sold, see [OPERATIONS.md §13](OPERATIONS.md) ("Assumptions to confirm").

## 9. Later: custom domain

The admin's CSV export already builds page links for **`https://cherepochette.ch/`**
(`LIVE_SITE_URL` in `public/admin/js/csv.js`); change it there if the domain is different.

1. Buy/keep the domain at a registrar. Recommended first: github.com → your **account** Settings → Pages →
   *Add a domain* → add the TXT record it shows (protects the domain from takeover).
2. Repository → Settings → Pages → **Custom domain** → `cherepochette.ch` (or `www.cherepochette.ch`) → Save.
   No `CNAME` file is needed: with GitHub Actions deployments GitHub ignores it.
3. At the registrar's DNS (keep the existing **MX** records if e-mail runs on the domain):

   | Type | Name | Value |
   |---|---|---|
   | A | `@` | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (4 records) |
   | AAAA | `@` | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |
   | CNAME | `www` | `eva-azienda.github.io` |

   Check the current values in [GitHub's guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
4. Wait for the DNS check (minutes to hours) → tick **Enforce HTTPS** (available once the certificate is issued).
5. **Actions → Deploy → Run workflow**. The workflow reads the address and base path from the Pages settings,
   so `SITE_URL`/`BASE_PATH` switch to `https://cherepochette.ch` and `/` automatically. No change in
   `site.json` or the workflow is needed.
6. After it: re-add the admin to the phones' home screens (new address `…/admin/`); update the link in the
   Instagram bio and in Zahls (shop website). Existing payment links still return customers to the old
   `github.io` address, which GitHub redirects; to renew them run the sync locally once with `RECREATE_LINKS=1`
   ([OPERATIONS.md §8](OPERATIONS.md)).

## 10. Later: newsletter provider

1. Create a free account at a provider (e.g. Brevo or Mailchimp) and a sign-up form with **double opt-in**.
2. Copy the form's URL into `src/data/site.json` → `"newsletter"` → `"action"`, with `"method": "post"` and the
   provider's e-mail field name in `"emailField"` (`"EMAIL"` for both). Exact clicks: comment at the top of
   `src/components/NewsletterForm.astro`.
3. Update section 5 of the privacy policy in `src/content/legal/{it,de,en}.md`: today it says the team keeps the
   subscriber list itself, without an external service — name the provider instead.
4. Until then the form opens an e-mail to the shop (subject "Iscrizione newsletter"); add those addresses by hand.

## Yearly / when people change

- **Token**: before it expires (or if a phone with the admin is lost, or someone leaves the team): revoke it
  (Settings → Developer settings → Fine-grained tokens), create a new one (step 4), run step 5 again.
- **Admin password**: change it by running step 5 again when someone who knew it leaves.
- **Zahls API key**: if it leaks, generate a new one in Zahls and update the `ZAHLS_API_KEY` secret.
- **Long breaks** (> 60 days without commits): GitHub pauses the 10-minute schedule → Actions → Deploy →
  *Enable workflow* ([OPERATIONS.md §10](OPERATIONS.md)).
