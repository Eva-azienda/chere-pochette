# Accounts and one-time setup

What was set up on **29 October 2026**, with which settings, and how to redo or change each part.
For Eva (CTO) or a developer. Day-to-day automation: [OPERATIONS.md](OPERATIONS.md).
What is still open: [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md).

> Never paste a password, token or API key into a file in the repository, the Drive folder, a chat or an e-mail.
> They go only into GitHub Secrets, the setup script, or a password manager. None is written in these docs.

## 0. Accounts at a glance

| Service | Account / address | Used for | Status |
|---|---|---|---|
| GitHub | account **`Eva-azienda`** → repository **`Eva-azienda/chere-pochette`** (public) | code, data, automation, hosting, secrets | done |
| Hostpoint | domain **`cherepochette.ch`** (registration + DNS) | the web address; yearly renewal | done |
| Zahls | instance **`cherepochette`** → https://cherepochette.zahls.ch | online payments (Payrexx-based) | set up; **verification (KYC) open**; trial since 29.10.2026 |
| Shop mailbox | `chere.pochette@sccbellinzona.ch` (school mailbox) | contact address on the site, Zahls order e-mails, admin login e-mail | in use |
| Admin | https://cherepochette.ch/admin/ — shop e-mail + admin password | managing bags from phones | done |
| Google Drive | folder "Website Eva" (01_Brief … 05_Handover) | brief, branding, original photos, code snapshot, docs | done |

Passwords of GitHub, Zahls and Hostpoint were shared in a chat during setup → **change them** (§1, checklist).

## 1. GitHub account `Eva-azienda`

Done: the repository, Pages, secrets and the admin token all belong to this account.

To do (security):
1. **Change the account password** (Settings → Password and authentication) and turn on **two-factor
   authentication**; keep the recovery codes outside the repository.
2. Settings → Emails: make sure the address is read by the team — GitHub sends failed-run alerts and the
   "scheduled workflow disabled" warning there.
3. The **GitHub CLI** on the setup developer's Mac was authorised for this account (used for `gh secret set`
   and checks). When no longer needed: Settings → **Applications** → *Authorized OAuth Apps* → **GitHub CLI** →
   *Revoke*.

## 2. Repository

Done: `https://github.com/Eva-azienda/chere-pochette`, **public** (free Pages + unlimited Actions minutes),
default branch `main`, no branch protection (the Deploy workflow's bot must be able to push to `main`).
These values are also in `src/data/site.json` → `"github"` and in `public/admin/auth.json`.

To redo from scratch: create the repository (public, empty) → `git remote add origin …` → `git push -u origin main`
→ continue with §3.

## 3. GitHub Pages and the custom domain

Done (repository → **Settings → Pages**):

| Setting | Value |
|---|---|
| Build and deployment → Source | **GitHub Actions** (workflow `.github/workflows/deploy.yml`) |
| Custom domain | **`cherepochette.ch`** (DNS check successful) |
| Enforce HTTPS | **on** |
| `www.cherepochette.ch` | redirected by GitHub to `https://cherepochette.ch` |
| Domain verification | `cherepochette.ch` verified for the **`Eva-azienda` account** (account Settings → Pages → Verified domains) — protects the domain from takeover |

No `CNAME` file is needed (GitHub ignores it with Actions deployments). The workflow reads the address from the Pages
settings, so `SITE_URL` = `https://cherepochette.ch` and `BASE_PATH` = `/` automatically.

To redo (e.g. new repository): Settings → Pages → Source **GitHub Actions** → Custom domain `cherepochette.ch` → Save
→ wait for the DNS check → tick **Enforce HTTPS** → Actions → **Deploy** → *Run workflow*.

## 4. DNS at Hostpoint

Done (Hostpoint control panel → domain `cherepochette.ch` → DNS):

| Type | Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (4 records) |
| AAAA | `@` | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` (4 records) |
| CNAME | `www` | `eva-azienda.github.io` |
| TXT | `_github-pages-challenge-Eva-azienda` | the verification code GitHub showed (account Settings → Pages) |
| MX / mail records | — | Hostpoint's e-mail records were **kept unchanged** |

Check from a terminal: `dig +short cherepochette.ch A` (the four GitHub addresses) and
`dig +short www.cherepochette.ch CNAME` (`eva-azienda.github.io.`). Current GitHub values:
[Managing a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
Do not delete the TXT record. Renew the domain at Hostpoint every year (whoever holds the Hostpoint account).

## 5. Secrets and variables

Repository → **Settings → Secrets and variables → Actions**:

| Name | Kind | Status | Purpose |
|---|---|---|---|
| `ZAHLS_API_KEY` | secret | **set** | Zahls API secret (Zahls → *API & Integration*) |
| `ZAHLS_INSTANCE` | variable | **set** = `cherepochette` | Zahls instance name (the `xyz` of `xyz.zahls.ch`) |
| `SITE_PASSWORD` | secret | **set** (preview phase) | while it exists every page is password-protected. **Launch = delete it** and re-run Deploy |
| `GITHUB_TOKEN` | automatic | — | provided by GitHub to the workflows |

Change a value: web → the secret → *Update*, or with the GitHub CLI `gh secret set SITE_PASSWORD` /
`gh secret set ZAHLS_API_KEY` (it asks for the value; nothing is shown or logged) → then **Actions → Deploy →
Run workflow**. Changing `SITE_PASSWORD` logs every visitor out of the preview.

## 6. Admin access (`npm run admin:setup`)

Done: one admin login — e-mail **`chere.pochette@sccbellinzona.ch`** + admin password — and
`public/admin/auth.json` (format v2) committed.

| Item | Value |
|---|---|
| Token type | GitHub **fine-grained** personal access token, owner `Eva-azienda` |
| Repository access | **only** `chere-pochette` |
| Permissions | **Contents: Read and write**, **Actions: Read and write** (Metadata read-only is automatic) |
| Expires | **29 October 2027** → renew before (calendar reminder 2 weeks earlier) |
| Storage | encrypted inside `auth.json` (AES-256-GCM, key = PBKDF2-SHA256, 600 000 rounds, from e-mail + password). The e-mail and password are **not** stored |

**Redo / renew / change the password** (on a computer with the project, `npm ci` done):

1. If a new token is needed: github.com (as `Eva-azienda`) → Settings → Developer settings → Personal access tokens →
   **Fine-grained tokens → Generate new token** → name `chere-pochette-admin`, resource owner `Eva-azienda`,
   *Only select repositories* → `chere-pochette`, permissions as above, expiry up to 1 year → copy it (shown once).
2. `npm run admin:setup` — asks, in this order: GitHub **owner / repository / branch** (Enter accepts
   `Eva-azienda` / `chere-pochette` / `main`), the **admin e-mail** (default: the shop address), the **admin password
   twice** (hidden; ≥ 12 characters, must not contain the e-mail; use a passphrase not used anywhere else — not the
   GitHub, Zahls or Hostpoint password), then the **token** (hidden), which it checks with GitHub.
   Options go after `--`, e.g. `npm run admin:setup -- --force` (overwrite without asking); also `--skip-verify`,
   `--out <file>`.
3. `git add public/admin/auth.json && git commit -m "chore(admin): admin access" && git push`
4. After the deploy (≈ 3 minutes) log in at https://cherepochette.ch/admin/. Give the password to the team
   **in person**. Then revoke the old token on GitHub (if you replaced it).

Do the same immediately if a phone with the admin is lost, the password leaks, or someone who knew it leaves the team.

## 7. Zahls

Done (dashboard https://cherepochette.zahls.ch):

- Instance **`cherepochette`** created; **30-day trial started 29.10.2026** → **choose a plan before ~28.11.2026** (CFO).
- **Company profile** filled in.
- **Look & Feel** profile **"Chère Pochette"** set as default: logo, background `#FAF7F2`, header `#E8D1D8`,
  buttons `#82001F`, font Lato.
- **API key** saved as `ZAHLS_API_KEY`, instance as `ZAHLS_INSTANCE` (§5); connection test OK on 29.10.2026 in the
  Deploy run (step *Zahls sync*: "Zahls connection OK (instance "cherepochette")"). The separate **Zahls check**
  workflow has not been run yet (optional, [OPERATIONS.md §5](OPERATIONS.md#5-checking-the-zahls-connection-zahls-check)).

Open — **account verification (KYC)**, done by the **CFO**: company data, identity documents and residence of the
legal representatives, business data (including the website `https://cherepochette.ch` and the terms of sale),
**IBAN** for payouts. Only after Zahls confirms the account does **Payrexx Pay** activate the payment methods
(**TWINT, cards, PostFinance, Apple Pay / Google Pay**). Do not activate invoice/prepayment: while such a payment is
pending the bag stays on sale. Also check in Zahls that order notifications go to the shop mailbox.

Then switch online payment on: [OPERATIONS.md §4–6](OPERATIONS.md#6-going-live-with-payments) (set
`checkout.enabled` to `true`, wait for the links, a CHF test purchase, refund).

If the API key leaks: generate a new one in Zahls (the old one stops working) and update the `ZAHLS_API_KEY` secret.

## 8. Later: newsletter provider

Today the form opens an e-mail to the shop (subject "Iscrizione newsletter"); those addresses are added by hand.

1. Create an account at a provider (e.g. Brevo or Mailchimp) with a **double opt-in** sign-up form.
2. `src/data/site.json` → `"newsletter"`: form URL in `"action"`, `"method": "post"`, the provider's e-mail field name
   in `"emailField"` (`"EMAIL"` for both). Exact clicks: comment at the top of `src/components/NewsletterForm.astro`.
3. Update section 5 of the privacy policy in `src/content/legal/{it,de,en}.md` with the provider's name.

## 9. Yearly / when people change

| When | What |
|---|---|
| Before **29.10.2027** (token expiry) | New token → §6 |
| Phone lost, password leaked, member leaves | Revoke the token, new token + new admin password → §6 |
| Every year | Renew `cherepochette.ch` at Hostpoint; check the Zahls plan |
| Long break (> 60 days without commits) | GitHub pauses the 10-minute schedule → [OPERATIONS.md §9](OPERATIONS.md#9-scheduled-runs--caveats) |
| CTO changes | Hand over the GitHub, Hostpoint and Zahls access (change the passwords afterwards) |
