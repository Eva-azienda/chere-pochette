# Notes for coding agents

Chère Pochette shop: a static Astro site (GitHub Pages), one page file per route for all three
languages (`it` default, `de`, `en`), a static admin in `public/admin/`, and Zahls payment links.

Read before changing anything:

- [`CONTRACTS.md`](CONTRACTS.md): routes, data files, images, design rules and file ownership.
- [`docs/`](docs/): setup, architecture, content, operations (admin, Zahls, deployment) and visuals.
- [`src/README.md`](src/README.md) and [`src/i18n/README.md`](src/i18n/README.md): map of the source and of the texts.

Rules of thumb:

- Every internal URL goes through `localePath()` / `assetPath()` (the site may live under a base path).
- Texts live in `src/i18n/{it,de,en}.json` (same keys in all three); prices are fixed CHF amounts.
- Design at 375px first: 16px gutters, 48px tap targets, no horizontal scroll.
- Check with `npm run build` (and `npm test` for the scripts).

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.
