# Launch checklist

Everything still open before the shop goes public. Tick a box by editing this file on github.com
(`- [ ]` → `- [x]`). Owner suggestions in brackets. Setup steps refer to [SETUP.md](SETUP.md).

## Accounts and access
- [ ] Solve the **GitHub account login issue** for `Eva-azienda`; Eva can log in on her own device (CTO) — SETUP §1
- [ ] **Change the shared account password** (it was shared in a chat) and turn on **2FA**; store the recovery codes safely (CTO)
- [ ] Check the GitHub account e-mail: failed-run alerts and the "schedule disabled" warning go there (CTO)
- [ ] Repository `Eva-azienda/chere-pochette` created (public), code pushed, Pages source = **GitHub Actions**, site online — SETUP §2–3
- [ ] Fine-grained **token** (only this repo; Contents + Actions read/write; 1-year expiry) + calendar reminder to renew — SETUP §4
- [ ] **Admin e-mail + password** chosen (unique passphrase, ≥ 12 characters), `npm run admin:setup` run, `public/admin/auth.json` committed — SETUP §5
- [ ] Admin installed and tested on every teammate's phone ([GUIDA-ADMIN.md](GUIDA-ADMIN.md)); credentials shared in person only

## Payments (Zahls)
- [ ] Zahls account **verified** (KYC, bank account for payouts) (CFO) — SETUP §6
- [ ] Payment methods: **TWINT, cards, PostFinance** on; prepayment / invoice off (CFO)
- [ ] Payment page look & feel: logo, #82001F / #FAF7F2; order notification e-mail set (CFO + CTO)
- [ ] **API key + instance name** saved as GitHub secret `ZAHLS_API_KEY` / variable `ZAHLS_INSTANCE`; **Zahls check** green — SETUP §7
- [ ] Demo bags `cp-001`…`cp-004` deleted (or replaced) **before** checkout is switched on
- [ ] `"checkout": { "enabled": true }` in `src/data/site.json`; admin shows "Pagamenti online: attivi"
- [ ] **End-to-end test purchase on a phone** (CHF 1 bag, TWINT, pickup): thank-you page, Zahls e-mail, bag "sold" within ~20 min, refund, test bag deleted — SETUP §8
- [ ] Confirm the sync's assumptions with that purchase ([OPERATIONS.md §13](OPERATIONS.md)): status `confirmed`, transaction id found, Swiss time
- [ ] Decide who reads the order e-mails and ships within 5 working days (as promised on the info page)

## Content
- [ ] **Real prices per model** in `src/data/models.json` (today 45 / 40 / 45 are placeholders) (CFO)
- [ ] **Shipping fee** confirmed in `src/data/site.json` (today CHF 9, a placeholder) (CFO)
- [ ] **Instagram profile URL** in `src/data/site.json` (today it links to a single post) (CMO)
- [ ] **Postal address**: the Impressum shows only "SCC Bellinzona, 6500 Bellinzona" — confirm with the coach whether a street address is needed (`src/content/legal/{it,de,en}.md`); `"address": "TODO: indirizzo postale"` in `src/data/site.json` is still open (not shown on the site) (CEO/CAO)
- [ ] **Legal texts** (Impressum, privacy, terms, 14-day returns) reviewed by a coach or the school; remove the `BOZZA` comment; update `LAST_UPDATED` in `src/pages/[...lang]/legal/index.astro`
- [ ] **Real product photos**: every bag photographed per [VISUALS.md §5](VISUALS.md) and added through the admin, replacing the 4 demo bags (their photos are brand photos and cut-outs, not real items)
- [ ] **Team**: CV data (`skills`, `experience`) for all 7 members in `src/data/team.json`, in it/de/en — empty lists are simply hidden ([CONTENT.md](CONTENT.md))
- [ ] **Team photos** taken (7 portraits, same setup) and consent collected — showing them needs a developer change (the site shows initials today)
- [ ] **Written consent** of the women visible in `women-crochet` (About page) — otherwise replace the photo ([VISUALS.md §6](VISUALS.md))
- [ ] Check the copy does not claim the store-bought spools in `yarn-fettuccia.jpg` are recovered yarn ([VISUALS.md §6](VISUALS.md))
- [ ] Logo as vector file (SVG/PDF from Canva) and the Bodoni FLF font file handed over (nice to have)
- [ ] All texts proofread by the team in Italian, German and English on a phone

## Newsletter
- [ ] Provider chosen (e.g. Brevo/Mailchimp) with double opt-in; `newsletter.action` set in `site.json` — SETUP §10
- [ ] Privacy policy section 5 updated with the provider's name (today: "we keep the list ourselves") in the three legal files
- [ ] Until then: someone collects the "Iscrizione newsletter" e-mails

## Domain
- [ ] Custom domain bought/confirmed (the admin's CSV export assumes `https://cherepochette.ch/`, see `public/admin/js/csv.js`)
- [ ] DNS records + domain verification + **Enforce HTTPS**; Deploy re-run; admin re-added to phones; Instagram bio and Zahls shop URL updated — SETUP §9

## Go-live
- [ ] Accessibility and legal check by a coach (keyboard, screen reader basics, contrast, legal pages)
- [ ] Test on at least one iPhone and one Android phone: shop, product, buy, info, team, language switch
- [ ] Preview password removed: delete the `SITE_PASSWORD` secret (if used) and run Deploy — SETUP §3
- [ ] Last Deploy run green; `npm test` passes

## Known small issues (developer, optional)
- [ ] The 404 page switches its message to German/English, but its header and footer stay Italian
- [ ] Order-by-e-mail subject is translated ("Bestellung cp-001 – Belle") while CONTRACTS.md says "Ordine <id>"; decide and align
- [ ] Very old browsers without AVIF/WebP get large JPEGs (up to ~1 MB) on the About page
- [ ] `docs/VISUALS.md` refers to `scripts/build-visuals.mjs`, which is not in the repository yet
- [ ] Optional: move the link ledger `scripts/zahls-links.json` to `src/data/` (contract decision)
