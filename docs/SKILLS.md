# Skills needed to run and extend the site

What each person needs to know, per role, with learning material and a rough effort for a motivated beginner.
Nobody needs everything.

## Overview

| Role / task | Skills | Effort |
|---|---|---|
| **Everyone using the admin** (add bags, mark sold, CSV) | Using a phone. Read [GUIDA-ADMIN.md](GUIDA-ADMIN.md) once | 15 min |
| **Content editor** (texts, CVs, prices, shipping fee, Instagram link) | GitHub web editor, basic JSON, a little Markdown | 1–2 h |
| **CFO — payments** (Zahls verification, plan, orders, refunds, accounting) | Zahls dashboard, CSV in Excel | 2–3 h |
| **CMO — brand and photos** (product/team photos, Instagram, newsletter) | Phone photography, Canva, the photo guide | 1–2 h |
| **CTO — site maintainer** (Eva: launch, secrets, token renewal, domain, red runs) | GitHub settings, Actions logs, secrets, DNS basics, two npm commands | half a day with [SETUP.md](SETUP.md) |
| **Developer** (new pages, design changes, team photos, features) | HTML/CSS, Astro, JavaScript, Git, GitHub Actions, REST APIs | weeks |

## 1. Admin users — no technical skills

Install the admin on the home screen, log in with the shop e-mail + admin password, follow the screens (Italian).
Learn: [GUIDA-ADMIN.md](GUIDA-ADMIN.md) and the photo guide in [VISUALS.md §5](VISUALS.md#5-guida-foto-per-il-team-prodotti-team-processo).

## 2. Content editing — GitHub web editor + JSON

| Skill | Why | Learn | Effort |
|---|---|---|---|
| Editing files on github.com | Every text change is a commit | [GitHub Docs: Editing files](https://docs.github.com/en/repositories/working-with-files/managing-files/editing-files) | 20 min |
| JSON syntax (quotes, commas, `{}` / `[]`) | All texts and settings are JSON | [MDN: Working with JSON](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/JSON) | 30 min |
| Markdown | Legal texts | [GitHub Docs: Basic formatting syntax](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax) | 20 min |
| Reading an Actions run (green / red) | Know when a change is online, or why not | [GitHub Docs: Viewing workflow run history](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/monitoring-workflows/viewing-workflow-run-history) | 15 min |

Then read [CONTENT.md](CONTENT.md) and [`src/i18n/README.md`](../src/i18n/README.md).

## 3. CFO — payments (Zahls)

| Skill | Why | Learn | Effort |
|---|---|---|---|
| Account verification (KYC) | Payment methods activate only after it | Zahls dashboard checklist, Zahls support, [SETUP.md §7](SETUP.md#7-zahls) | 1 h + waiting |
| Choosing a plan | The trial ends ~28.11.2026 | [zahls.ch prices](https://www.zahls.ch/de/preise-kreditkarten-und-twint) | 30 min |
| Finding a payment, its customer data and status; refunds | Ship or arrange pickup; test purchase; double payment | Zahls dashboard (transactions) | 30 min |
| Reading the CSV export in Excel | Inventory and sales for the accounts | [GUIDA-ADMIN.md §10](GUIDA-ADMIN.md#10-esportare-lelenco-csv-e-aggiorna-vendite-ora) | 15 min |

## 4. CMO — brand, photos, social

| Skill | Why | Learn |
|---|---|---|
| Product and portrait photos with a phone | Every bag needs its own photos; team portraits | [VISUALS.md §5](VISUALS.md#5-guida-foto-per-il-team-prodotti-team-processo) |
| Canva export as SVG/PDF | Logo vector file for print | [Canva Help Center](https://www.canva.com/help/) (search "download SVG") |
| Newsletter tool with double opt-in | Replace the e-mail fallback | [Brevo help](https://help.brevo.com/), [Mailchimp help](https://mailchimp.com/help/) + [SETUP.md §8](SETUP.md#8-later-newsletter-provider) |

## 5. CTO — site maintainer

| Skill | Why | Learn | Effort |
|---|---|---|---|
| Repository settings: Pages, Secrets and variables, Actions | Launch (delete `SITE_PASSWORD`), preview password, Zahls credentials, re-enabling the schedule | [GitHub Pages](https://docs.github.com/en/pages), [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions) | 1–2 h |
| Account security: password, 2FA, authorised apps | Shared passwords to change; revoke the GitHub CLI | [Securing your account with 2FA](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa) | 30 min |
| Fine-grained personal access tokens | Admin token, renewal before 29.10.2027 | [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) | 30 min |
| Terminal, Node.js/npm, GitHub CLI | `npm ci`, `npm run admin:setup`, `gh secret set` | [Node.js: Learn](https://nodejs.org/en/learn), [GitHub CLI manual](https://cli.github.com/manual/) | 1–2 h |
| DNS basics (A, AAAA, CNAME, TXT) at Hostpoint | The domain must keep pointing to GitHub Pages | [GitHub Docs: Custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site), [Hostpoint support](https://support.hostpoint.ch/) | 1 h |
| Reading the Deploy / sync log | Red runs, double payments | [OPERATIONS.md](OPERATIONS.md) §2, §7, §11 | 1 h |

## 6. Developer

| Skill | Used for | Learn | Effort |
|---|---|---|---|
| HTML & CSS (grid/flex, custom properties, responsive, accessibility) | All pages; tokens in `src/styles/tokens.css` | [MDN: Learn web development](https://developer.mozilla.org/en-US/docs/Learn_web_development), [W3C WAI fundamentals](https://www.w3.org/WAI/fundamentals/) | 2–4 weeks |
| Astro (components, routing, `getStaticPaths`, content collections, `astro:assets`, i18n) | The site in `src/` | [Astro tutorial](https://docs.astro.build/en/tutorial/0-introduction/), [Routing](https://docs.astro.build/en/guides/routing/), [i18n](https://docs.astro.build/en/guides/internationalization/) | 1–2 weeks |
| JavaScript (ES modules, `async`/`await`, `fetch`, DOM), a little TypeScript | Admin (`public/admin/js/`), scripts, `src/lib/*.ts` | [MDN: JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide) | 2–4 weeks |
| Git & GitHub | Every change; admin and sync also commit | [Pro Git](https://git-scm.com/book/en/v2), [GitHub Skills](https://skills.github.com/) | 1 week |
| GitHub Actions (YAML, cron, permissions, concurrency, Pages deploy) | `deploy.yml`, `zahls-check.yml` | [GitHub Actions docs](https://docs.github.com/en/actions) | 2–3 days |
| REST APIs | GitHub API (admin), Zahls API (sync) | [MDN: HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP), [GitHub REST API](https://docs.github.com/en/rest), [Payrexx API](https://developers.payrexx.com/) (Zahls uses it) | 2–3 days |
| StatiCrypt | Preview gate (`scripts/protect-site.mjs`) | [StatiCrypt README](https://github.com/robinmoisson/staticrypt) | 1 h |
| Web Crypto (PBKDF2, AES-GCM) | `auth.json` (only when changing the login) | [MDN: SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto) | 1 day |
| sharp (image processing) | `scripts/build-visuals.mjs` | [sharp docs](https://sharp.pixelplumbing.com/) | 1 day |
| Node test runner | `npm test` | [Node.js test runner](https://nodejs.org/api/test.html) | 1 day |

Start with [README.md](../README.md), [CONTRACTS.md](../CONTRACTS.md), [`src/README.md`](../src/README.md),
[ARCHITECTURE.md](ARCHITECTURE.md). `npm test` and `npm run build` must pass before pushing.

## When to call a developer

- a **new model**, **new page**, **new language**, or a layout/design change;
- showing **team photos** (small code change);
- changing how **payment** works (cart, discounts, other delivery options or countries);
- a **red Deploy run** the table in [OPERATIONS.md §11](OPERATIONS.md#11-troubleshooting) does not solve, or a paid bag
  that stays "available" after "Aggiorna vendite ora";
- a **security incident** (leaked token/password, unknown commits, strange payment link) — first revoke the token /
  regenerate the Zahls key yourself ([SETUP.md](SETUP.md));
- **upgrading** Astro or Node, or when GitHub warns that an action is deprecated;
- a different hosting or domain setup.

You do **not** need a developer to: add, edit, sell or delete bags; change texts, prices, shipping fee, colours, CVs,
legal texts; switch online payment on/off; launch (delete `SITE_PASSWORD`); change the preview password; renew the
token or the admin password; re-enable the schedule.
