// Posts live in src/content/posts/<slug>.md (English) and
// src/content/posts/{fr,de}/<local-slug>.md (translations).
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { categorySlugs } from "./data/categories.mjs";
import { faq, keyTakeaways, sources, summary } from "./lib/schemas";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: ({ image }) => z.object({
    title: z.string(),
    seoTitle: z.string().max(60).optional(),
    /** One line under the title. */
    subtitle: z.string(),
    description: z.string().max(155),
    date: z.coerce.date(),
    /** Bump only when the content changes in substance. */
    updated: z.coerce.date().optional(),
    /** Categories from the topic sheet; the first is the main one. */
    categories: z.array(z.enum(categorySlugs as [string, ...string[]])).min(1),
    tags: z.array(z.string()).default([]),
    /** The one search query this post targets. Unique per language. */
    keyword: z.string(),
    /** Translations only: the English post's slug, so the file can carry a slug in its own language. */
    translationOf: z.string().optional(),
    summary,
    keyTakeaways,
    faq: faq.default([]),
    sources: sources.min(3),
    /** English slugs of related guides; the site maps them to the page's language. */
    relatedPosts: z.array(z.string()).default([]),
    /** Featured image (AI-generated photograph); translations reuse the English file. */
    coverImage: image().optional(),
    coverAlt: z.string().optional(),
    noindex: z.boolean().default(false),
  }).refine((p) => !p.coverImage || p.coverAlt, { message: "coverImage needs coverAlt" }),
});

export const collections = { posts };
