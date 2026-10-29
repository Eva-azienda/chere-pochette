/**
 * Content collections (Astro content layer).
 *
 * - `products`: one JSON file per unique bag in src/data/products/ (written by the admin page
 *   and by scripts/zahls-sync.mjs). The schema below checks every file at build time, so a
 *   broken file stops the build with a clear message instead of publishing a broken page.
 * - `legal`: the legal notice / privacy / terms in src/content/legal/<lang>.md.
 *
 * Format of a product file: see CONTRACTS.md ("Data files").
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** One payment link created by the Zahls sync (may be missing until Zahls is configured). */
const zahlsLink = z
  .object({
    id: z.union([z.number(), z.string()]).nullish(),
    link: z.string().nullish(),
  })
  .loose()
  .nullish();

const products = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/data/products' }),
  schema: z.object({
    id: z.string().regex(/^cp-\d{3,}$/, 'id must look like "cp-012"'),
    number: z.number().int().positive(),
    model: z.string(),
    status: z.enum(['available', 'sold', 'hidden']),
    price: z.number().nonnegative(),
    colour: z.string(),
    lining: z.string(),
    note: z.string().nullish(),
    photos: z
      .array(z.object({ src: z.string(), w: z.number(), h: z.number() }))
      .default([]),
    createdAt: z.string(),
    updatedAt: z.string().nullish(),
    soldAt: z.string().nullish(),
    soldChannel: z.string().nullish(),
    // Managed only by scripts/zahls-sync.mjs. Extra fields are kept (loose) so the sync can grow.
    zahls: z
      .object({
        amount: z.number().nullish(), // cents the links were made for (bag only)
        shippingFee: z.number().nullish(), // cents of shipping included in the shipping link
        shipping: zahlsLink,
        pickup: zahlsLink,
      })
      .loose()
      .nullish(),
    sample: z.boolean().optional(),
  }),
});

// The legal files have no frontmatter (their first line is the "BOZZA" review comment).
const legal = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/legal' }),
});

export const collections = { products, legal };
