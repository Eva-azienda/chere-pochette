# Editing content

Where every text, price and setting lives, and how to change it on github.com without installing anything.
**Bags are never edited here**: use the admin ([GUIDA-ADMIN.md](GUIDA-ADMIN.md)).
*Riassunto in italiano in fondo alla pagina.*

## 1. Where things live

| What you see on the site | File | Notes |
|---|---|---|
| Every text (menus, buttons, home, about, process, info/FAQ, thanks page, 404, newsletter, footer, image alt texts) | `src/i18n/it.json`, `de.json`, `en.json` | Same keys in all three; only the values differ. Rules: [`src/i18n/README.md`](../src/i18n/README.md) |
| Team: names, roles, bios, responsibilities, skills, experience, education | `src/data/team.json` | One entry per member, texts in it/de/en |
| Impressum, privacy policy, terms of sale | `src/content/legal/it.md`, `de.md`, `en.md` | Markdown, marked **BOZZA** (review pending). Keep the `id="impressum"`, `id="privacy"`, `id="terms"` headings |
| Contact e-mail, Instagram link, shipping fee, pickup place, shipping countries, online payment on/off, organisation/address, newsletter | `src/data/site.json` | The e-mail is also written in the three legal files |
| Models (Jolie, Belle, Coquette): type, dimensions, **price** | `src/data/models.json` | A 4th model needs a developer (cut-out image + code) |
| Colours (name in 3 languages + swatch) and linings | `src/data/taxonomy.json` | New entries appear in the admin and on the site automatically |
| Logo, wordmark, brand photos | `src/assets/brand/`, `public/brand/` | See [VISUALS.md](VISUALS.md) |
| Bags, their prices and photos | `src/data/products/*.json`, `public/media/products/` | **Admin only** |

### Current values (29.10.2026)

| Setting | Value | Status |
|---|---|---|
| Model prices (`models.json`) | Jolie 45, Belle 40, Coquette 45 | **placeholders** — CFO to confirm |
| Shipping fee (`site.json` → `shippingFee`) | 9 (CHF, flat, CH + LI) | **placeholder** |
| Pickup | Bellinzona, free | ok |
| Bags for sale | cp-001 Belle Bordeaux 40 · cp-002 Jolie Rosa antico 45 · cp-003 Coquette Giallo 45 · cp-004 Belle Grigio perla 40 | real bags |
| `instagram` | a link to a single **post** | **replace with the profile URL** |
| `organisation.address` | `"TODO: indirizzo postale"` (not shown on the site) | street address open |
| `checkout.enabled` | `false` ("Ordina via e-mail") | on after Zahls KYC |
| `newsletter.action` | empty (form opens an e-mail) | provider open |

## 2. Editing a file on github.com

1. Log in to github.com and open **https://github.com/Eva-azienda/chere-pochette**.
2. Click through the folders to the file, e.g. `src` → `i18n` → `it.json` (or press `t` and type the file name).
3. Click the **pencil icon** ("Edit this file").
4. Change only the text **between the quotes** after the colon. Never change the key on the left.
   `"title": "Il team",` → `"title": "Il nostro team",`
5. **Commit changes…** → short message (e.g. "Testo pagina team") → *Commit directly to the `main` branch* → **Commit changes**.
6. **Actions** tab: the **Deploy** run starts. Green after ≈ 3–5 minutes = online at https://cherepochette.ch
   (preview password still needed before launch). Reload, sometimes twice (GitHub Pages caches for a few minutes).

**JSON survival rules:**
- Text between straight double quotes `"…"`. Inside a text use «…» or ’ instead of `"`.
- A comma between items, **none after the last one** in a `{ }` or `[ ]` block.
- Do not delete `{price}`, `{fee}`, `{email}` or other words in curly braces: the site fills them in.
- Change it, de and en together (same key, same place). German: Swiss spelling (`ss`, never `ß`).
- In doubt, paste the whole file into a JSON validator (e.g. jsonlint.com) before committing.

**If something goes wrong:** the build refuses broken files, the run turns **red**, and the **old version stays
online**. Fix the file (or copy back the old text from the commit history) and commit again.

## 3. Common tasks

**Change a text** → edit the same key in `it.json`, `de.json`, `en.json`. Prices are formatted by the site
(`CHF 40.–`), never typed by hand.

**Change the price of a model** → `src/data/models.json` → `"price": 45`. It is not shown on the site
(the "I modelli" section has no price); it is pre-filled when a new bag is added in the admin. **Bags already for sale keep their
own price**: change those one by one in the admin (open the bag → Prezzo → Salva modifiche).

**Change the shipping fee** → `src/data/site.json` → `"shippingFee": 9`. Product pages and the info page show the new
fee. With online payment on, the next Deploy run also re-creates the shipping links (until then: "order by e-mail").

**Instagram** → `src/data/site.json` → `"instagram"` = `https://www.instagram.com/chere.pochette/` (used by the footer,
header menu, home and shop).

**Home hero** → `src/i18n/*.json`: `home.hero.title` (headline), `home.hero.lead` (the sentence under it),
`home.hero.notes` (sketch notes, larger screens only), `home.hero.marquee` (words in the scrolling band);
bags → `home.featured.*`; story block → `home.story.*`; team strip → `home.team.*`; Instagram → `home.social.*`
(the handle comes from `site.json` → `"instagram"`).

**Contact e-mail** → `src/data/site.json` → `"email"`, and also in the three legal files.

**Postal address (Impressum)** → once the street address is known: add it to the Impressum in
`src/content/legal/{it,de,en}.md` (today: school name + 6500 Bellinzona) and in `site.json` → `organisation.address`.

**Add a colour or lining** → `src/data/taxonomy.json` → copy a line in `"colours"` (or `"linings"`) and change it:
`{ "id": "verde-bosco", "hex": "#2F4A3A", "it": "Verde bosco", "de": "Waldgrün", "en": "Forest green" },`
The `id` is technical (lowercase, no spaces/accents, never changed later). Do not delete a colour a bag uses.

**Team CV and profile** → `src/data/team.json` → the member's entry, all three languages:
```json
"skills":     { "it": ["Canva", "Uncinetto"], "de": ["Canva", "Häkeln"], "en": ["Canva", "Crochet"] },
"experience": { "it": ["Stage presso …, 2025"], "de": ["Praktikum bei …, 2025"], "en": ["Internship at …, 2025"] },
```
Empty lists are not shown. Keep it professional: no age, home address, phone or private details.

**Team photos** → `src/assets/team/<slug>.jpg` (4:5 portrait) and `src/assets/team/group.jpg`; `team.json` →
`"photo": "<slug>"` (`null` = initials). To improve a photo, replace the file with a larger original under the same name
([VISUALS.md §5](VISUALS.md#5-guida-foto-per-il-team-prodotti-team-processo)). Bios in `team.json` are the members' own texts.

**Legal texts** → `src/content/legal/<lang>.md` in the three languages. After the coach/school review remove the
`BOZZA` comment at the top and update `LAST_UPDATED` in `src/pages/[...lang]/legal/index.astro`. Section 5 (newsletter)
must name the provider once one is used.

**Newsletter** → `src/data/site.json` → `"newsletter"` ([SETUP.md §8](SETUP.md#8-later-newsletter-provider)).

**Online payment on/off** → `src/data/site.json` → `"checkout": { "enabled": true }` — only after the Zahls verification
([OPERATIONS.md §6](OPERATIONS.md#6-going-live-with-payments)).

---

## Riassunto in italiano

- **Le borse si gestiscono solo dall'admin** ([GUIDA-ADMIN.md](GUIDA-ADMIN.md)), mai modificando i file.
- **Testi del sito**: `src/i18n/it.json`, `de.json`, `en.json` (stessa chiave nei tre file, si cambia solo il testo tra
  virgolette). **Team**: `src/data/team.json`. **Testi legali**: `src/content/legal/*.md` (ancora BOZZA).
- **Impostazioni** (e-mail, Instagram, spedizione, pagamento online sì/no, indirizzo, newsletter): `src/data/site.json`.
  **Prezzi dei modelli** (prezzo proposto per una nuova borsa nell'admin, non mostrato sul sito): `src/data/models.json` — oggi sono provvisori; le borse già in vendita
  mantengono il loro prezzo (si cambia nell'admin). **Colori e fodere**: `src/data/taxonomy.json`.
- **Come modificare**: su github.com apri il file → matita → cambia il testo → *Commit changes* → aspetta 3–5 minuti
  (scheda *Actions*, pallino verde). Se il file ha un errore la pubblicazione si ferma (pallino rosso) e resta online la
  versione precedente: correggi e riprova.
- **Da completare**: URL del profilo Instagram, indirizzo postale, prezzi veri e spedizione, CV e foto del team.
