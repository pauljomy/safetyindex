// Content collections. The build reads only these files (never the writer), so
// rebuilds don't call Claude again.
//   posts       guides: src/content/posts/<slug>.md (US English, /blog/<slug>),
//               src/content/posts/{fr,de}/<local-slug>.md (/fr/blog, /de/blog),
//               src/content/posts/{uk,au,ca,nz}/<slug>.md (/uk/guides/<slug>, …)
//   standards   US standard pages: src/content/standards/<slug>.json (/us/standards/<slug>)
//   industries  US industry pages: src/content/industries/<slug>.json (/us/industries/<slug>)
//   checklists  one JSON per checklist: src/content/checklists/<market>/<slug>.json, shared by
//               the on-page checklist and the PDF/Excel downloads (scripts/downloads/)
//   reports     data pages built by script: src/content/reports/<slug>.json (/us/reports/<slug>)
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { categorySlugs } from "./data/categories.mjs";
import { faq, keyTakeaways, sources, summary } from "./lib/schemas";

const markets = ["us", "uk", "au", "ca", "nz", "fr", "de"] as const;
const change = z.object({ date: z.coerce.date(), kind: z.enum(["optimisation", "upgrade", "rewrite"]), share: z.number(), note: z.string().optional() });

/** Fields every generated page carries (release, keyword record, checking pass). */
const pageMeta = {
  /** The day the engine wrote it. A page with `generatedOn` and no `releaseDate` is not built yet. */
  generatedOn: z.coerce.date().optional(),
  /** Set by the release schedule (scripts/release/release.mjs). Pages from before the build use their `date`. */
  releaseDate: z.coerce.date().optional(),
  /** Date of the data and sources the page was written from. */
  dataAsOf: z.coerce.date().optional(),
  topicType: z.enum(["country-only", "same everywhere", "regional"]).optional(),
  keywordSource: z.enum(["OpenSEO", "Search Console", "topic sheet", "enforcement data"]).optional(),
  clusterVolume: z.number().nullable().optional(),
  kd: z.number().nullable().optional(),
  goNoGo: z.string().optional(),
  /** "passed" once the independent checking pass found no problems. */
  checkPass: z.enum(["passed"]).optional(),
  /** Change log: only upgrades and rewrites move `updated`. */
  changes: z.array(change).default([]),
  /** Phrases that, when another page mentions them, link here (generated in-body links). */
  linkPhrases: z.array(z.string()).default([]),
  /** Shared cover image subject: src/assets/covers/<cover>.webp (pages on the same subject share one file). */
  cover: z.string().optional(),
  /** Scene for the cover image, made later by `npm run covers` (no text, logos or close-up faces). */
  coverPrompt: z.string().optional(),
  coverAlt: z.string().optional(),
  noindex: z.boolean().default(false),
};

const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: ({ image }) => z.object({
    title: z.string(),
    seoTitle: z.string().max(60).optional(),
    /** One line under the title. */
    subtitle: z.string(),
    description: z.string().max(155),
    date: z.coerce.date(),
    /** Bump only for an upgrade (15–70% of the main content) or a rewrite (over 70%). */
    updated: z.coerce.date().optional(),
    /** Categories from the topic sheet; the first is the main one. */
    categories: z.array(z.enum(categorySlugs as [string, ...string[]])).min(1),
    tags: z.array(z.string()).default([]),
    /** The one search query this post targets. Unique per language and market. */
    keyword: z.string(),
    /** Other market versions: the US English post's slug (hreflang cluster for regional topics). */
    translationOf: z.string().optional(),
    summary,
    keyTakeaways,
    faq: faq.default([]),
    sources: sources.min(3),
    /** English slugs of related guides; the site maps them to the page's language. */
    relatedPosts: z.array(z.string()).default([]),
    /** Featured image (AI-generated photograph); translations reuse the English file. */
    coverImage: image().optional(),
    /** Checklist id (<market>/<slug>) when the guide has a downloadable checklist. */
    checklist: z.string().optional(),
    /** Topic sheet row (#) this guide was written for. */
    topicN: z.number().optional(),
    /** "In [country]" line near the top of regional pages: the rule and its reference. */
    localRule: z.string().optional(),
    ...pageMeta,
  }).refine((p) => !(p.coverImage || p.cover) || p.coverAlt, { message: "a cover image needs coverAlt" }),
});

const ranked = z.object({ count: z.number() }).catchall(z.union([z.string(), z.number(), z.null()]));
const penalties = z.object({ n: z.number(), median: z.number().nullable(), p25: z.number().nullable(), p75: z.number().nullable(), total: z.number() });
const typeShares = z.object({ serious: z.number(), willful: z.number(), repeat: z.number(), otherThanSerious: z.number(), unclassified: z.number() });
const clauseText = z.object({ text: z.string(), clause: z.string() });

const standards = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/standards" }),
  schema: z.object({
    section: z.string(),
    part: z.string(),
    heading: z.string(),
    subpart: z.string().optional(),
    subpartTitle: z.string().optional(),
    title: z.string(),
    seoTitle: z.string().max(60),
    description: z.string().max(155),
    /** One sentence that answers the page's main question. */
    opening: z.string(),
    keyword: z.string(),
    cluster: z.array(z.object({ keyword: z.string(), volume: z.number().nullable(), kd: z.number().nullable() })).default([]),
    stats: z.object({
      fiscalYears: z.array(z.number()), fiscalYearCount: z.number(), citations: z.number(), inspections: z.number(),
      byFy: z.record(z.string(), z.number()), topParagraphs: z.array(ranked), penalties, typeShares, typeCounts: z.record(z.string(), z.number()),
      topIndustries: z.array(ranked),
    }),
    /** Writer's reading of the enforcement data (numbers only from stats). */
    enforcementSummary: z.string(),
    requirementsIntro: z.string(),
    requirements: z.array(z.object({ heading: z.string(), intro: z.string(), items: z.array(clauseText) })),
    checklistIntro: z.string(),
    checklist: z.string(),
    faq: faq.default([]),
    sources,
    ecfrDate: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    ...pageMeta,
  }),
});

const industries = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/industries" }),
  schema: z.object({
    naics: z.string(),
    naicsTitle: z.string(),
    title: z.string(),
    seoTitle: z.string().max(60),
    description: z.string().max(155),
    opening: z.string(),
    keyword: z.string(),
    stats: z.object({
      fiscalYears: z.array(z.number()), fiscalYearCount: z.number(), inspections: z.number(), citations: z.number(),
      topStandards: z.array(ranked), topParagraphs: z.array(ranked), penalties, typeShares, standardsCited5Plus: z.number(),
    }),
    /** Writer's reading of the standards cited most in this industry (numbers only from stats). */
    patternsSummary: z.string(),
    penaltiesSummary: z.string(),
    standardNotes: z.array(z.object({ section: z.string(), note: z.string() })).default([]),
    faq: faq.default([]),
    sources,
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    ...pageMeta,
  }),
});

const checklists = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/checklists" }),
  schema: z.object({
    slug: z.string(),
    market: z.string(),
    lang: z.enum(["en", "de", "fr"]).default("en"),
    paper: z.enum(["letter", "a4"]),
    page_url: z.string().url(),
    doc_ref: z.string().optional(),
    revision: z.string().optional(),
    info_fields: z.array(z.array(z.string())).optional(),
    title: z.string(),
    subtitle: z.string().optional(),
    regulation_line: z.string().optional(),
    data_as_of: z.string(),
    instructions: z.array(z.string()).default([]),
    sections: z.array(z.object({ code: z.string(), title: z.string(), items: z.array(z.array(z.string()).min(2).max(3)) })),
    references: z.array(z.string()).default([]),
    disclaimer: z.string(),
  }).passthrough(),
});

const reports = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/reports" }),
  schema: z.object({
    kind: z.enum(["most-cited", "injury-statistics", "penalties"]),
    title: z.string(),
    seoTitle: z.string().max(60),
    description: z.string().max(155),
    summary: z.string(),
    year: z.number().optional(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    data: z.any(),
    sources,
    method: z.string(),
    ...pageMeta,
  }),
});

export const collections = { posts, standards, industries, checklists, reports };
export const MARKETS = markets;
