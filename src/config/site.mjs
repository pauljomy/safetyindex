// The one place that names the site. Pages, nav, footer, sitemap, llms.txt,
// JSON-LD, the build checks and the post generator all read from here.
// CHECK before launch: `url` (or set SITE_URL) and `contactEmail`.

export const site = {
  name: "Safety Index",
  /** Production URL, no trailing slash. Override with the SITE_URL env var. */
  url: (process.env.SITE_URL?.trim() || "https://safetyindex.blog").replace(/\/$/, ""),
  /** Shown on /contact and in the Organization schema. */
  contactEmail: "hello@safetyindex.blog",
  /** The date About, Privacy and Terms were last reviewed (also used for their sitemap lastmod). */
  updated: "2026-11-06",
};

/** Always the same wording: used on the home page, /about, llms.txt and the Organization schema. */
export const entity = {
  definition:
    "Safety Index is a workplace safety reference for the US, UK, Germany, France, Australia, Canada and New Zealand: plain-language guides, standards and checklists, each linked to the official sources it was written from. Made by the team behind the Conform app.",
};

/**
 * Languages. English is the default and lives at the root; a translation of a
 * post lives at /<code>/blog/<local-slug>. Keep this list and the strings in
 * src/i18n/ui.ts and src/data/categories.mjs in step. Adding a language
 * (e.g. "es") needs: an entry here, its strings, its category names, and
 * `LANGS` in scripts/generate-post.mjs picks it up from this list.
 */
export const locales = [
  { code: "en", hreflang: "en-US", og: "en_US", intl: "en-US", label: "English", name: "English" },
  { code: "fr", hreflang: "fr-FR", og: "fr_FR", intl: "fr-FR", label: "Français", name: "French (France)", country: "France" },
  { code: "de", hreflang: "de-DE", og: "de_DE", intl: "de-DE", label: "Deutsch", name: "German (Germany)", country: "Germany" },
];
export const defaultLocale = "en";

/**
 * Markets. US English lives at the root (/blog, /us/...), French and German at /fr and /de,
 * the other English markets at /uk, /au, /ca, /nz. hreflang uses the market's code; x-default is US English.
 */
export const markets = [
  { code: "us", lang: "en", hreflang: "en-US", og: "en_US", intl: "en-US", name: "United States", inText: "the United States", short: "US", prefix: "" },
  { code: "uk", lang: "en", hreflang: "en-GB", og: "en_GB", intl: "en-GB", name: "United Kingdom", inText: "the United Kingdom", short: "UK", prefix: "/uk" },
  { code: "au", lang: "en", hreflang: "en-AU", og: "en_AU", intl: "en-AU", name: "Australia", inText: "Australia", short: "AU", prefix: "/au" },
  { code: "ca", lang: "en", hreflang: "en-CA", og: "en_CA", intl: "en-CA", name: "Canada", inText: "Canada", short: "CA", prefix: "/ca" },
  { code: "nz", lang: "en", hreflang: "en-NZ", og: "en_NZ", intl: "en-NZ", name: "New Zealand", inText: "New Zealand", short: "NZ", prefix: "/nz" },
  { code: "fr", lang: "fr", hreflang: "fr-FR", og: "fr_FR", intl: "fr-FR", name: "France", inText: "France", short: "FR", prefix: "/fr" },
  { code: "de", lang: "de", hreflang: "de-DE", og: "de_DE", intl: "de-DE", name: "Deutschland", inText: "Deutschland", short: "DE", prefix: "/de" },
];

/** Where the post generator writes and how many posts it may publish per run. */
export const postsPerRun = 1;
