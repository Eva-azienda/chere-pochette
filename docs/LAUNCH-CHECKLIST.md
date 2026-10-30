# Launch checklist

State on **29 October 2026**. Tick a box by editing this file on github.com (`- [ ]` → `- [x]`).
Suggested owner in brackets. Details: [SETUP.md](SETUP.md), [OPERATIONS.md](OPERATIONS.md), [CONTENT.md](CONTENT.md).

**Launch = delete the repository secret `SITE_PASSWORD` and re-run Deploy** (last section).
Online payment can be switched on before or after the launch; until then the shop works with "Ordina via e-mail".

## Done

- [x] Repository `Eva-azienda/chere-pochette` (public, `main`), all code and docs pushed
- [x] GitHub Pages from GitHub Actions, live at **https://cherepochette.ch**; custom domain verified for the
      `Eva-azienda` account; **HTTPS enforced**; `www` → apex redirect
- [x] DNS at Hostpoint: 4×A, 4×AAAA, CNAME `www`, TXT `_github-pages-challenge-Eva-azienda`; Hostpoint mail records kept
- [x] **Preview password gate** on (secret `SITE_PASSWORD`): all pages encrypted, robots `Disallow: /`, no sitemap,
      `/admin/` excluded, "Ricordami" 30 days
- [x] Admin at https://cherepochette.ch/admin/: one login (shop e-mail + password), `auth.json` v2 committed,
      demo mode removed, CSV export per tab + "Esporta tutto"
- [x] Admin token: fine-grained, only `chere-pochette`, Contents + Actions read/write, **expires 29.10.2027**
- [x] Checkout switch **on since 30.10.2026** (`checkout.enabled: true`, site still behind the password): the sync creates the
      Zahls links and bag pages show "Paga con Zahls"; payments go through once the Zahls verification is approved
- [x] Zahls instance `cherepochette`: company profile filled; Look & Feel "Chère Pochette" (logo, `#FAF7F2`,
      `#E8D1D8`, `#82001F`, Lato) set as default; 30-day trial started 29.10.2026
- [x] Variable `ZAHLS_INSTANCE` + secret `ZAHLS_API_KEY` set; connection check OK in the Deploy run's *Zahls sync*
      step (the manual **Zahls check** workflow has not been run yet — optional)
- [x] Design: one-line wordmark header; home hero with the headline in the page's language, animated bag line-drawing
      (`BagSketch.astro`) and marquee band; compact IT/DE/EN selector; needle/thread icons; firm prices on shop cards and bag pages ("CHF 45.–"); no prices in "I modelli"
- [x] Team photos from the Instagram post of 26.10.2026: group photo (home + team page), 7 portraits (org chart +
      member pages, `src/assets/team/`); bios = the members' own texts; Romina = CPO, Chief Product Officer
- [x] Instagram links → profile https://www.instagram.com/chere.pochette/
- [x] Impressum address confirmed: c/o SCC Bellinzona, Viale Stefano Franscini 32, 6500 Bellinzona
- [x] SEO: hreflang/x-default sitemap, structured data (`src/lib/structured-data.ts`), meta texts, `npm run seo:check`
- [x] While checkout is off, info/FAQ texts describe ordering by e-mail
- [x] 4 bags for sale: cp-001 Belle Bordeaux 40 · cp-002 Jolie Rosa antico 45 · cp-003 Coquette Giallo 45 · cp-004 Belle Grigio perla 40
- [x] `npm test` 94/94; brand images reproducible with `scripts/build-visuals.mjs`
- [x] Drive handover folder: 01_Brief, 02_Branding, 03_Media, 04_Website, 05_Handover

## Open — accounts and security

- [ ] **Change the passwords shared in chat**: GitHub `Eva-azienda`, Zahls, Hostpoint; turn on 2FA on GitHub;
      store them in a password manager (CTO + CFO)
- [ ] Check the GitHub account e-mail is read by the team (failed-run and "schedule disabled" alerts) (CTO)
- [ ] Revoke the **GitHub CLI** authorisation on the setup developer's Mac when no longer needed:
      GitHub → Settings → Applications → Authorized OAuth Apps → GitHub CLI → Revoke (CTO)
- [ ] Admin installed and tested on every teammate's phone ([GUIDA-ADMIN.md](GUIDA-ADMIN.md)); password given in person (CTO)
- [ ] Calendar reminder: **renew the admin token before 29.10.2027** ([SETUP.md §6](SETUP.md#6-admin-access-npm-run-adminsetup)) (CTO)
- [ ] Know the **60-day rule**: without commits for 60 days GitHub disables the 10-minute schedule → Actions → Deploy →
      *Enable workflow* ([OPERATIONS.md §9](OPERATIONS.md#9-scheduled-runs--caveats)) (CTO)

## Open — payments (Zahls)

- [ ] **Account verification (KYC)**: company data, ID + residence of the legal representatives, business data
      (website, terms of sale), IBAN (CFO) — [SETUP.md §7](SETUP.md#7-zahls)
- [ ] **Choose a Zahls plan before the trial ends (~28.11.2026)** (CFO)
- [ ] After KYC: Payrexx Pay active (TWINT, cards, PostFinance, Apple/Google Pay); order notifications to the shop mailbox (CFO)
- [ ] **After KYC: CHF test purchase on a phone + refund** in Zahls → bag shown as sold ([OPERATIONS.md §6](OPERATIONS.md#6-going-live-with-payments)) (CTO + CFO)
- [ ] Confirm the sync's assumptions with that purchase ([OPERATIONS.md §13](OPERATIONS.md#13-assumptions-to-confirm-with-the-first-real-payment)) (CTO)
- [ ] Decide who reads the order e-mails and ships within 5 working days (as promised on the info page) (team)

## Open — content

- [ ] **Real prices per model** in `src/data/models.json` (45 / 40 / 45 are placeholders) and on the 4 bags (CFO)
- [ ] **Shipping fee** in `src/data/site.json` (CHF 9 flat is a placeholder) (CFO)
- [ ] **Legal texts** (Impressum, privacy, terms — marked BOZZA) reviewed by the coach/school; remove `BOZZA`;
      update `LAST_UPDATED` (CEO/CAO)
- [ ] **Written consent** of the women recognisable in the crochet photo (`women-crochet`, home/about/process) — or
      replace it with a hands-only shot ([VISUALS.md §6](VISUALS.md#6-missing-or-weak-visuals-today-to-do-for-the-team)) (CPO)
- [ ] **Yarn claim vs photo**: `yarn-fettuccia.jpg` (About page) shows store-bought fettuccia spools — confirm the
      wording does not call them recovered yarn, or replace the photo (CMO)
- [ ] **Team**: consent of all 7 for their photos on the site; CVs/skills in `src/data/team.json` (it/de/en) — profiles
      without skills/experience stay `noindex` (all; CAO collects). Optional: higher-resolution originals of the
      portraits (today 296×370 px from Instagram) — replace the files in `src/assets/team/` with the same names
- [ ] **Newsletter provider** (today the form opens an e-mail): choose one with double opt-in, set `newsletter.action`,
      update privacy section 5 ([SETUP.md §8](SETUP.md#8-later-newsletter-provider)) (CMO)
- [ ] **Logo vector file** (SVG/PDF from Canva) + Bodoni FLF font file into Drive `02_Branding` (CMO)
- [ ] Check the remaining payment wording while checkout is off (shop/info meta descriptions, terms §4–5) (CMO + CEO/CAO)
- [ ] Proper per-bag photos (front, lining, detail, worn) for the 4 bags ([VISUALS.md §5](VISUALS.md#5-guida-foto-per-il-team-prodotti-team-processo)) (CPO)
- [ ] All texts proofread in Italian, German and English on a phone (team)

## Go-live

> **Decision (30.10.2026): launch only when online payments work.** The preview password stays on until the Zahls
> verification is approved, a plan is chosen and the CHF test purchase + refund has passed. Checkout is already on
> (since 30.10.2026), so launching = deleting `SITE_PASSWORD`; the public site starts with "Paga con Zahls".


- [ ] Test on an iPhone and an Android phone: home, shop, product, order, info, team, language switch (team)
- [ ] Accessibility and legal check by a coach (keyboard, contrast, legal pages) (CEO)
- [ ] **Launch: delete `SITE_PASSWORD`** (Settings → Secrets and variables → Actions) → Actions → **Deploy** →
      *Run workflow* → check https://cherepochette.ch opens without password (CTO)
- [ ] Update the Instagram bio link to https://cherepochette.ch (CMO)

## Search engines (after launch)

- [ ] Once `SITE_PASSWORD` is deleted: check https://cherepochette.ch/robots.txt and the canonical tags (CTO)
- [ ] Google Search Console: add a **Domain** property (TXT record at Hostpoint), submit `sitemap-index.xml` (CTO)
- [ ] Bing Webmaster Tools: import from Search Console (CTO)
- [ ] Rich Results Test on one bag page (Product + Offer) (CTO)

## Known small issues (developer, optional)

- [ ] The 404 page switches its message to German/English, but header and footer stay Italian
- [ ] Order-by-e-mail subject is translated ("Bestellung cp-001 – Belle") while CONTRACTS.md says "Ordine <id>"; align
- [ ] Very old browsers without AVIF/WebP get large JPEGs (up to ~1 MB) on the About page
- [ ] `team.json` → `photo` is not used by the pages yet (initials only)
