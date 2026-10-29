# Website texts (i18n)

All texts on the website live in three files:

| File | Language | Notes |
|---|---|---|
| `it.json` | Italian | **Primary language** (default, no URL prefix). Write new texts here first. |
| `de.json` | German | Swiss Standard German (see rules below). URLs start with `/de/`. |
| `en.json` | English | British spelling (colour, organise). URLs start with `/en/`. |

**The three files must always have exactly the same keys, in the same structure.**
Only the values (the texts) change from one language to another.

Related content (also owned by the copy role):

- `src/data/team.json` – the 7 team members (org chart + personal pages).
- `src/content/legal/{it,de,en}.md` – legal notice, privacy policy and terms of sale.

---

## Key structure

Keys are written in `camelCase` and grouped by page or component.

| Top-level key | What it contains |
|---|---|
| `meta` | `siteName`, `htmlLang`, `ogLocale`, `titleTemplate`, `defaultDescription`, `ogImageAlt` (describes `public/og-image.jpg` for link previews), and `pages.<page>.title` / `.description` for every page: `home`, `shop`, `product`, `about`, `process`, `team`, `info`, `legal`, `thanks`, `cancelled`, `notFound` (`teamMember` has only a `title`: its description is the person's bio from `team.json`) |
| `nav` | Menu labels: `home`, `shop`, `about`, `process`, `team`, `info`, `legal`, `contact` |
| `languageNames` | Name of each language **in its own language** (Italiano, Deutsch, English) – identical in all files |
| `brand` | `slogan`, `tagline` (both stay in English everywhere), `sloganMeaning`, `taglineSupport` (localized) |
| `common` | Shared buttons and labels: buy, order by e-mail, "Pezzo unico N° {number}", sold, available, back, close, menu, price… |
| `a11y` | Screen-reader texts: skip link, menu buttons, gallery, breadcrumb, language switcher… |
| `images` | Alt texts for the brand photos in `src/assets/brand/` (key = file name in camelCase, e.g. `hero-bag-hands.jpg` → `heroBagHands`), plus `teamGroup` for `src/assets/team/group.jpg` |
| `home` | `hero`, `intro`, `pillars` (3 items), `featured`, `models`, `process`, `story`, `team`, `newsletter`, `social` |
| `shop` | Title, intro, `filter`, `count` (plural), `empty`, `emptyFiltered`, `unique` ("every bag is unique"), `models`, `card` |
| `product` | `eyebrow` ("handmade crochet bag" above the title), labels, `dimensions`, `materials` (`schema` = one-line version for search engines), `unique`, `delivery` (shipping / pickup), buy button, payment notes, `orderByEmail` (fallback), `legalNote` (terms + returns links under the buy button), `sold`, `care`, `question`, `related` |
| `about` | Sections `born`, `idea`, `materials`, `women`, `slogan`, `thread`, `values`, `cta` |
| `process` | Intro, `stepLabel`, `steps` (exactly 5), `closing` |
| `team` | Org chart texts (`hint`, `levels`…) and `member` = labels of the personal pages |
| `info` | `shipping`, `pickup`, `payment`, `paymentEmail` (shown instead of `payment` while online payment is off), `returns`, `care` (tips), `faq` (7 questions; the payment question also has `aEmail`, used while online payment is off), `contact` |
| `legal` | Labels of the legal page (title, table of contents, "last updated") – the legal text itself is in `src/content/legal/` |
| `thanks` | Page after a successful payment (Zahls redirect) |
| `cancelled` | Page after a cancelled/failed payment |
| `notFound` | 404 page; `bag` = message for the address of a bag that no longer has a page |
| `newsletter` | Newsletter form: title, text, label, placeholder, button, messages, consent, `comingSoon` |
| `footer` | Footer texts, YES mention, copyright, privacy note (the legal links reuse `legal.toc.*`) |

### Naming conventions for values

- `title`, `eyebrow` (small text above a title), `intro`, `text`, `cta` (button), `label`, `placeholder`.
- `text` = **one** short paragraph (a string).
- `paragraphs` = an **array** of short paragraphs (1–3 sentences each). Render one `<p>` per entry.
- `items` = an array of objects (`{ title, text }`, FAQ uses `{ q, a }`). `tips` = an array of strings.
- `id` inside `home.pillars.items` and `process.steps` is a **technical key, never translate it**.
  It is the same in all languages and lets the site pick the right image or icon:
  - pillars: `reuse`, `handmade`, `together`
  - steps: `recovery`, `selection`, `creation`, `lining`, `final`
- Arrays must have the **same length** in all three languages (same number of paragraphs, FAQ items…).

---

## Placeholders

Dynamic values are written between curly braces. **Never translate or rename a placeholder.**

| Placeholder | Filled with | Example |
|---|---|---|
| `{title}` | Page title (in `meta.titleTemplate`) | `Shop – borse all'uncinetto fatte a mano` |
| `{price}` | Bag price, **already formatted, without "CHF"** | `40.–` (whole francs, Swiss style) or `42.50` |
| `{fee}` | Shipping fee from `site.json`, same format as `{price}` | `9.–` |
| `{number}` | Unique piece number, zero-padded to 3 digits | `012` |
| `{model}` | Model name from `models.json` | `Belle` |
| `{colour}` | Localized colour name from `taxonomy.json` | `bordeaux` |
| `{id}` | Product id | `cp-012` |
| `{email}` | Contact e-mail from `site.json` (ideally rendered as a `mailto:` link) | `chere.pochette@sccbellinzona.ch` |
| `{count}` | Number of bags | `5` |
| `{name}` / `{role}` | Team member name / localized role title | `Eva Dall'Acqua` / `CTO – …` |
| `{n}` / `{total}` | Photo index / number of photos | `2` / `4` |
| `{value}` | A dimension from `models.json` | `22–25` |
| `{language}` | A language name from `languageNames` | `Deutsch` |
| `{year}` | Current year | `2026` |
| `{date}` | A date formatted for the language | `29.10.2026` |
| `{delivery}` | Chosen delivery option, in the e-mail order fallback (`product.orderByEmail.body`) | `Spedizione (+ CHF 9.–)` |
| `{subscriber}` | Address typed in the newsletter form (`newsletter.mailtoBody`) | `anna@esempio.ch` |

Notes:

- `meta.titleTemplate` (`{title} · Chère Pochette`) is used for all pages **except the home page**,
  whose `meta.pages.home.title` is already complete.
- Plurals: `shop.count.one` for exactly 1, `shop.count.other` for every other number.
- `meta.pages.product.title` / `.description`: `{model}` is "Model · Colour", `{number}` the piece
  number and `{price}` the price, so every bag gets its own title and description in search results.
  Keep the words people search for ("borsa all'uncinetto", "Häkeltasche", "crochet bag") in them.
- Search engines show about 60 characters of a title and 155 of a description: keep new texts short.
  `npm run build` runs `scripts/check-seo.mjs` afterwards (titles, canonicals, sitemap, broken links).
- `product.orderByEmail.subject` (`{id} – {model}`) and `.body` are used for the `mailto:` fallback when
  Zahls links are not available yet. In the body, `{model}` is "Model · Colour" and `{delivery}` the option
  the customer picked. `\n` = line break. Both are encoded with `encodeURIComponent()` in the link.
- `newsletter.mailtoNote` / `newsletter.mailtoBody` are used while `newsletter.action` in
  `src/data/site.json` is empty (the form then opens an e-mail with subject "Iscrizione newsletter").
- `thanks.bag` / `cancelled.bag`: the bag mentioned on the payment return pages (read from `?p=`).
- `product.changeDelivery` is screen-reader text only (link from the sticky buy bar to the delivery choice).

---

## Language rules

- **Brand voice**: elegant, feminine, positive, authentic, warm. Short sentences, simple words.
  We speak directly to the customer: `tu` (IT), `du` (DE), `you` (EN).
- **Keep it short**: most visitors read on a phone. 1–3 sentences per paragraph, punchy titles.
- **"Made to carry on"** and **"From forgotten materials to something worth carrying on."** stay in
  English in every language.
- **German**: Swiss Standard German – always `ss`, **never `ß`** (gross, heisst, schliessen, Masse).
  Swiss vocabulary where natural (Tumbler, Total). Quotation marks «…».
- **Italian**: quotation marks «…».
- **Prices**: Swiss format `CHF 40.–`. Do not mention VAT (a YES mini-company is not VAT-registered).
- **Facts**: only write what is true and known (see `inputs/brief.md`). No invented numbers, reviews,
  awards or dates. Write about the Ukrainian women with respect – as partners and friends, never with pity.

---

## How to add or change a text

1. Open `it.json` and add the new key in the right group (e.g. `shop.newLabel`).
2. Add **the same key at the same place** in `de.json` and `en.json`, with the translation.
3. Check that the three files are still valid and identical in structure. From the project root:

   ```sh
   node -e '
   const fs=require("fs"),L=["it","de","en"];
   const shape=v=>Array.isArray(v)?v.map(shape):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,shape(v[k])])):typeof v;
   const s=L.map(l=>JSON.stringify(shape(JSON.parse(fs.readFileSync(`src/i18n/${l}.json`,"utf8")))));
   console.log(s.every(x=>x===s[0])?"OK: same structure":"ERROR: the files differ");'
   ```

4. Use the key in the page through the site's translation helper (e.g. `t("shop.newLabel")`).

To change a text, just edit the value – never the key (the key is what the code uses).

---

## Team (`src/data/team.json`)

An array of 7 members, in org-chart order (CEO first). Each member:

```jsonc
{
  "slug": "eva-dallacqua",        // URL: /team/eva-dallacqua/
  "name": "Eva Dall'Acqua",
  "roleCode": "CTO",
  "level": 2,                      // 1 = CEO, 2 = heads of department
  "reportsTo": "masha-sargenti",   // slug of the manager (null for the CEO)
  "photo": "eva-dallacqua",        // file name (without .jpg) in src/assets/team/; null = show initials
  "roleTitle":        { "it": "…", "de": "…", "en": "…" },   // "CODE – description": the part after " – " is shown under the name
  "bio":              { "it": "…", "de": "…", "en": "…" },   // her own words, first person (it = as she wrote it)
  "responsibilities": { "it": [ … ], "de": [ … ], "en": [ … ] },
  "skills":           { "it": [], "de": [], "en": [] },      // to be filled by the member
  "experience":       { "it": [], "de": [], "en": [] },      // to be filled by the member
  "education":        { "it": [ … ], "de": [ … ], "en": [ … ] }
}
```

Empty arrays mean "not filled in yet": the page simply leaves that section out.

Photos (optimised by Astro, never linked by path in the pages):

- `src/assets/team/<photo>.jpg` – portrait, **4:5**, face in the upper half, plain powder-pink background
  (currently 296 × 370 px, cut from the Instagram team cards). Shown round in the org chart and as an
  arch on the personal page. If `photo` is `null` or the file is missing, the initials are shown instead.
- `src/assets/team/group.jpg` – group photo (900 × 630), on the home page and at the top of `/team/`.
  Its alt text is `images.teamGroup`.
Keep profiles professional and privacy-friendly: no age, home address, phone number or private details.

---

## Legal texts (`src/content/legal/`)

One Markdown file per language with three sections. Their anchors are fixed so that links work in
every language: `#impressum`, `#privacy`, `#terms` (written as `<h2 id="…">` in the files).

Before publishing, a coach or the school must check them (see the `BOZZA` comment at the top) and
the team must replace:

- `[indirizzo da completare]` – postal address (also `organisation.address` in `src/data/site.json`);
- `[servizio newsletter da completare]` – name of the newsletter service, once chosen.
