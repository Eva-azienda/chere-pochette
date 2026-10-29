# Skills needed to run and extend the site

What each person needs to know, by task, with official learning material and a rough effort estimate
(for a motivated beginner). Start at the level you need; nobody needs everything.

## Overview

| Who / task | Skills | Effort to learn |
|---|---|---|
| **Team members using the admin** (add bags, mark sold, ship orders) | None beyond using a phone. Read [GUIDA-ADMIN.md](GUIDA-ADMIN.md) once. | 15 minutes |
| **Content editor** (texts, team CVs, prices, shipping fee, colours) | GitHub web editor, basic JSON, a little Markdown | 1–2 hours |
| **Payments / CFO** (orders, refunds, payouts) | Zahls dashboard | 1–2 hours |
| **Site maintainer** (Eva, CTO: watch runs, rotate the token, go live, custom domain) | GitHub settings, Actions logs, secrets, running two npm commands | half a day with [SETUP.md](SETUP.md) |
| **Developer** (new pages, design changes, team photos, new features) | HTML/CSS, Astro, JavaScript, Git, GitHub Actions, REST APIs | weeks (see below) |

## 1. Team admin users — no technical skills

- Install the admin on the phone's home screen, log in, follow the screens. Everything is in Italian.
- Learn: [GUIDA-ADMIN.md](GUIDA-ADMIN.md) and the photo guide in [VISUALS.md §5](VISUALS.md).

## 2. Content editing — GitHub web editor + JSON basics

| Skill | Why | Learn | Effort |
|---|---|---|---|
| Editing files on github.com | Every text change is a commit | [GitHub Docs: Editing files](https://docs.github.com/en/repositories/working-with-files/managing-files/editing-files) | 20 min |
| JSON syntax (quotes, commas, `{}` / `[]`) | All texts and settings are JSON | [MDN: Working with JSON](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/JSON) | 30 min |
| Markdown | Legal texts | [GitHub Docs: Basic writing and formatting syntax](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax) | 20 min |
| Reading an Actions run (green / red) | Know when a change is online, or why not | [GitHub Docs: Viewing workflow run history](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/monitoring-workflows/viewing-workflow-run-history) | 15 min |

Then read [CONTENT.md](CONTENT.md) and [`src/i18n/README.md`](../src/i18n/README.md).

## 3. Payments — Zahls dashboard

| Skill | Why | Learn | Effort |
|---|---|---|---|
| Finding a payment, its customer data and status | Ship or arrange pickup | Zahls dashboard (Transactions), Zahls support | 30 min |
| Refunding a payment | Double payment, return, test purchase | Zahls dashboard | 15 min |
| Payment methods, look & feel, notification e-mail, API key | One-time setup and changes | [SETUP.md §6](SETUP.md), Zahls support | 1 hour |

## 4. Site maintainer (CTO)

| Skill | Why | Learn | Effort |
|---|---|---|---|
| GitHub repository settings: Pages, Secrets and variables, Actions | Setup, Zahls credentials, re-enabling the schedule | [GitHub Pages](https://docs.github.com/en/pages), [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions) | 1–2 hours |
| Fine-grained personal access tokens | Admin access, yearly rotation | [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) | 30 min |
| Terminal basics + Node.js/npm | `npm ci`, `npm run admin:setup`, `npm run dev` | [Node.js: Learn](https://nodejs.org/en/learn), [npm Docs](https://docs.npmjs.com/) | 1–2 hours |
| Reading the sync log | Double payments, red runs | [OPERATIONS.md](OPERATIONS.md) §7 and §11 | 1 hour |
| Custom domain + DNS | Moving to the own domain | [GitHub Docs: Custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site) | 1–2 hours |

## 5. Developer

| Skill | Used for | Learn | Effort |
|---|---|---|---|
| HTML & CSS (flexbox/grid, `:has()`, custom properties, responsive design, accessibility) | All pages and components; design tokens in `src/styles/tokens.css` | [MDN: Learn web development](https://developer.mozilla.org/en-US/docs/Learn_web_development), [W3C WAI: Accessibility fundamentals](https://www.w3.org/WAI/fundamentals/) | 2–4 weeks |
| Astro (components, routing, `getStaticPaths`, content collections, `astro:assets`, i18n) | The whole site in `src/` | [Astro tutorial](https://docs.astro.build/en/tutorial/0-introduction/), [Routing](https://docs.astro.build/en/guides/routing/), [Content collections](https://docs.astro.build/en/guides/content-collections/), [i18n](https://docs.astro.build/en/guides/internationalization/) | 1–2 weeks |
| JavaScript (ES modules, `async`/`await`, `fetch`, DOM) and a little TypeScript | Admin (`public/admin/js/`), sync script, `src/lib/*.ts` | [MDN: JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide), [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/intro.html) | 2–4 weeks |
| Git & GitHub (commit, branch, pull/push, history) | Every change; the admin and the sync also commit | [Pro Git book](https://git-scm.com/book/en/v2), [GitHub Skills](https://skills.github.com/) | 1 week |
| GitHub Actions (workflow YAML, cron, permissions, concurrency, Pages deploy) | `.github/workflows/deploy.yml`, `zahls-check.yml` | [GitHub Actions docs](https://docs.github.com/en/actions) | 2–3 days |
| REST APIs (HTTP methods, headers, JSON / form bodies, status codes) | GitHub API in the admin, Zahls API in the sync | [MDN: HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP), [GitHub REST API](https://docs.github.com/en/rest), [Payrexx API reference](https://developers.payrexx.com/) (Zahls uses the Payrexx API) | 2–3 days |
| Web Crypto (PBKDF2, AES-GCM) | `auth.json` (only when changing the login) | [MDN: SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto) | 1 day |
| Node test runner | `npm test` (`scripts/test/`) | [Node.js test runner](https://nodejs.org/api/test.html) | 1 day |

Start with [README.md](../README.md), [CONTRACTS.md](../CONTRACTS.md), [`src/README.md`](../src/README.md) and
[ARCHITECTURE.md](ARCHITECTURE.md). Rules of the codebase: every internal link through `localePath()` /
`assetPath()` (the site may live in a sub-folder), colours only from `tokens.css`, no customer data in the
repository, `npm test` and `npm run build` must pass before pushing.

## When to call a developer

Call one (or ask the coaches for a contact) when you need to:

- add a **new model** (needs a cut-out image and a code change), a **new page**, a **new language**, or change the
  page layout or design;
- show **team photos** (not implemented yet);
- change how **payment** works (cart, discount codes, other delivery options, other countries);
- fix a **red Deploy run** that the troubleshooting table in [OPERATIONS.md §11](OPERATIONS.md) does not solve,
  or a bag that stays "available" after a confirmed payment even after "Aggiorna vendite ora";
- handle a **security incident**: leaked token or password, unknown commits in the repository, a strange
  payment link (first revoke the token / regenerate the Zahls key yourself, see [SETUP.md](SETUP.md));
- **upgrade** Astro or Node (e.g. a new major version), or when GitHub warns that an action is deprecated;
- move the site to **another host or domain setup** than the one described in [SETUP.md](SETUP.md).

You do **not** need a developer to: add, edit, sell or delete bags; change texts, prices, the shipping fee,
colours, CVs or legal texts; switch online payment on/off; rotate the token or password; re-enable the schedule.
