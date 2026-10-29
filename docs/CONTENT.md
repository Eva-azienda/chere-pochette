# Editing content

Where every text, price and setting lives, and how to change it without installing anything.
**Bags (products) are never edited here**: use the admin page ([GUIDA-ADMIN.md](GUIDA-ADMIN.md)).
*Riassunto in italiano in fondo alla pagina.*

## 1. Where things live

| What you see on the site | File | Notes |
|---|---|---|
| Every text (menus, buttons, home, about, process, info/FAQ, thanks page, 404, newsletter, footer, image alt texts) | `src/i18n/it.json`, `de.json`, `en.json` | Same keys in all three files; only the values differ. Full rules: [`src/i18n/README.md`](../src/i18n/README.md). |
| Team: names, roles, bios, responsibilities, skills, experience, education | `src/data/team.json` | One entry per member, texts in it/de/en. |
| Legal notice (Impressum), privacy policy, terms of sale | `src/content/legal/it.md`, `de.md`, `en.md` | Markdown. Keep the `<h2 id="impressum">`, `id="privacy"`, `id="terms"` headings. Also update `LAST_UPDATED` in `src/pages/[...lang]/legal/index.astro` (developer, one line). |
| Contact e-mail, Instagram link, shipping fee, pickup place, shipping countries, online payment on/off, newsletter form | `src/data/site.json` | The e-mail is also written in the three legal files. |
| Models (Jolie, Belle, Coquette): name, type, dimensions, **default price** | `src/data/models.json` | Adding a 4th model needs a developer (cut-out image + code). |
| Colours (name in 3 languages + swatch colour) and linings | `src/data/taxonomy.json` | New entries appear in the admin and on the site automatically. |
| Brand photos, logo | `src/assets/brand/`, `public/brand/` | See [VISUALS.md](VISUALS.md). |
| Bags, their prices and photos | `src/data/products/*.json`, `public/media/products/` | **Admin page only.** |

## 2. Editing a file on github.com (no installation needed)

1. Log in to github.com and open the repository (e.g. `github.com/Eva-azienda/chere-pochette`).
2. Click through the folders to the file, e.g. `src` → `i18n` → `it.json`.
3. Click the **pencil icon** ("Edit this file").
4. Change only the text **between the quotes** after the colon. Never change the key on the left.
   `"title": "Il nostro team",` → `"title": "Il team",`
5. Click **Commit changes…** → message, e.g. "Testo pagina team" → *Commit directly to the `main` branch* →
   **Commit changes**.
6. Open the **Actions** tab: the **Deploy** run starts. Green after ≈ 3–5 minutes = online.
   Reload the website (sometimes twice: GitHub Pages caches for a few minutes).

**JSON survival rules** (the most common mistakes):
- Text always between straight double quotes `"…"`. Inside a text, use «…» or ’ instead of `"`.
- A comma between items, **no comma after the last one** in a `{ }` or `[ ]` block.
- Do not delete `{price}`, `{fee}`, `{email}` or other words in curly braces: the site fills them in.
- Change it, de and en together (same key, same place).
- If unsure, paste the whole file into a JSON validator (e.g. jsonlint.com) before committing.

**If something goes wrong:** the build refuses broken files, the Deploy run turns **red**, and the **old
version stays online** — nothing breaks for visitors. Open the file again, fix it (or undo: open the commit
in the repository history and copy back the old text), commit again.

## 3. Common tasks

### Change a text
Find it with the search box of github.com (press `t` in the repository and type `it.json`, then use the
browser's find on the page) → edit as in §2 in `it.json`, `de.json` and `en.json`.
German: Swiss spelling (`ss`, never `ß`). Prices are written by the site (`CHF 40.–`), never by hand.

### Change the price of a model
`src/data/models.json` → `"price": 45`. This is the **default price** shown as "Prezzo indicativo" in the
models section and pre-filled when a new bag is added in the admin.
**Existing bags keep their own price**: change those one by one in the admin page (open the bag → Prezzo →
"Salva modifiche"). The payment links are re-created automatically.

### Change the shipping fee
`src/data/site.json` → `"shippingFee": 9` (whole francs or e.g. `9.5`). After the commit, the Deploy run
re-creates the shipping payment link of every available bag (when online payment is on) and the info page,
product pages and totals show the new fee. A product page never offers a link with an old amount: until
the sync has run it shows "order by e-mail" instead.

### Change the contact e-mail or Instagram link
`src/data/site.json` → `"email"` / `"instagram"` (today the Instagram value is a **post** link; replace it
with the profile URL, e.g. `https://www.instagram.com/<profile>/`). If the e-mail changes, also edit it in
the three legal files.

### Add a colour or a lining
`src/data/taxonomy.json` → copy an existing line inside `"colours"` (or `"linings"`) and change it:
`{ "id": "verde-bosco", "hex": "#2F4A3A", "it": "Verde bosco", "de": "Waldgrün", "en": "Forest green" },`
The `id` is technical: lowercase, no spaces or accents, never changed later (bags refer to it).
`hex` is the swatch colour (pick it with any online colour picker). Do not delete a colour that a bag uses.

### Team member: CV and profile
`src/data/team.json` → the member's entry. Fill the empty lists, in all three languages:
```json
"skills":     { "it": ["Canva", "Uncinetto"], "de": ["Canva", "Häkeln"], "en": ["Canva", "Crochet"] },
"experience": { "it": ["Stage presso …, 2025"], "de": ["Praktikum bei …, 2025"], "en": ["Internship at …, 2025"] },
```
Empty lists are simply not shown on the personal page. Keep it professional: no age,
home address, phone number or private details. `bio` = two sentences, `responsibilities` = short bullet points.

### Team photos
**Not implemented yet.** `team.json` has a `"photo": null` field, but the org chart and personal pages always
show the member's initials (component `src/components/Monogram.astro`). Showing portraits needs a small
developer change (the component's comment explains it). Prepare the photos now, following the photo guide in
[VISUALS.md §5](VISUALS.md), and collect written consent.

### Legal texts
Edit `src/content/legal/<lang>.md` in the three languages. Before launch a coach or the school must review
them (see the `BOZZA` comment at the top of each file; remove it afterwards). The Impressum gives the school
and `6500 Bellinzona` without a street: check with the coach whether a full postal address is needed.
Section 5 (newsletter) says the team keeps the subscriber list itself: change it when a newsletter provider is used.

### Newsletter
`src/data/site.json` → `"newsletter"`. Empty `action` = the form opens an e-mail to the shop. To use a provider,
follow the instructions at the top of `src/components/NewsletterForm.astro` ([SETUP.md §9](SETUP.md)).

### Online payment on/off
`src/data/site.json` → `"checkout": { "enabled": true }` — only after the Zahls setup
([SETUP.md §7](SETUP.md), [OPERATIONS.md §2](OPERATIONS.md)).

---

## Riassunto in italiano

- **Le borse si gestiscono solo dall'admin** (vedi [GUIDA-ADMIN.md](GUIDA-ADMIN.md)), mai modificando i file.
- **Testi del sito**: `src/i18n/it.json`, `de.json`, `en.json` (stessa chiave nei tre file, si cambia solo il
  testo tra virgolette). **Team**: `src/data/team.json`. **Testi legali**: `src/content/legal/*.md`.
- **Impostazioni** (e-mail, Instagram, costo di spedizione, pagamento online sì/no, newsletter):
  `src/data/site.json`. **Prezzo indicativo dei modelli**: `src/data/models.json` (le borse già in vendita
  mantengono il loro prezzo: si cambia nell'admin). **Colori e fodere**: `src/data/taxonomy.json`.
- **Come modificare**: su github.com apri il file → matita → cambia il testo → *Commit changes* → aspetta
  3–5 minuti (scheda *Actions*, pallino verde). Se il file contiene un errore, la pubblicazione si ferma
  (pallino rosso) e resta online la versione precedente: correggi e riprova.
- **Foto del team**: non ancora visualizzate dal sito (servono le iniziali); serve una piccola modifica di uno
  sviluppatore. **CV**: compila `skills` ed `experience` nelle tre lingue (le liste vuote non compaiono).
