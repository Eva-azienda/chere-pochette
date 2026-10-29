# Website source (`src/`)

A quick map for whoever maintains the site. Run it locally with `npm run dev` → http://localhost:4321.

| Folder / file | What it is |
|---|---|
| `pages/[...lang]/…` | The pages. **One file per page for all three languages**: `[...lang]` is empty for Italian (`/shop/`) and `de` / `en` for the others (`/de/shop/`). Each page starts with `getStaticPaths()` → `localeStaticPaths()`. |
| `pages/404.astro` | "Page not found" (one file, shows the right language by itself). |
| `pages/robots.txt.ts` | Generates `robots.txt` with the right sitemap address. |
| `layouts/BaseLayout.astro` | `<head>` (title, description, Google/social tags, languages), header, footer. Every page uses it. |
| `components/` | Reusable pieces: header, footer, product card, gallery, buy box, org chart, newsletter form… |
| `lib/i18n.ts` | Translations: `const { t } = useTranslations(lang); t('shop.title')`. Texts are in `i18n/*.json` (see `i18n/README.md`). |
| `lib/urls.ts` | **Always** build links with `localePath(lang, 'shop/')` and files with `assetPath('…')`: the site may live under a sub-folder (GitHub Pages), so a link written as `"/shop/"` would break. |
| `lib/catalog.ts` | Bags, models, colours, team: everything the pages need from `data/`. `paymentLink()` only uses a Zahls link when `checkout.enabled` is `true` in `data/site.json` and the link was made for the price shown on the site (otherwise: "order by e-mail"). |
| `lib/format.ts` | Swiss prices (`40.–`), piece numbers (`012`), dates, initials. |
| `content.config.ts` | Checks every bag file in `data/products/` when building, and loads the legal texts. |
| `styles/global.css` | Base styles, buttons, layout helpers. Colours and sizes only come from `styles/tokens.css`. |
| `data/` | The content: one JSON file per bag, models, colours, team, site settings. |
| `assets/brand/` | Brand photos and logos (Astro makes AVIF/WebP versions in several sizes). |

## Common tasks

- **Change a text** → edit `i18n/it.json`, `de.json` and `en.json` (same key in all three).
- **Add a page** → create `pages/[...lang]/<name>/index.astro` (copy `team/index.astro` as a model), add its
  title/description under `meta.pages` in the three language files, and a link in `components/SiteHeader.astro`
  and `components/SiteFooter.astro` if it belongs in the menu.
- **Switch the newsletter to Brevo/Mailchimp** → only `newsletter` in `data/site.json`
  (instructions at the top of `components/NewsletterForm.astro`).
- **Check before pushing** → `npm run build` must finish without errors.

JavaScript is kept to a few small scripts inside the components (menu, gallery dots, shop filter,
thanks page, newsletter). Everything important also works without it.

Zahls always returns customers to the Italian `/thanks/` or `/payment-cancelled/` page; the buy button
remembers the visitor's language and `components/ReturnLanguage.astro` switches those two pages to it.
