// The one place that names the site. Pages, nav, footer, sitemap, llms.txt,
// JSON-LD, the build checks and the post generator all read from here.
// CHECK before launch: `url` (or set SITE_URL) and `contactEmail`.

export const site = {
  name: "Safety First",
  /** Production URL, no trailing slash. Override with the SITE_URL env var. */
  url: (process.env.SITE_URL ?? "https://safetyfirst.site").replace(/\/$/, ""),
  /** Shown on /contact and in the Organization schema. */
  contactEmail: "hello@safetyfirst.site",
  /** The date About, Privacy and Terms were last reviewed (also used for their sitemap lastmod). */
  updated: "2026-11-06",
};

/** Always the same wording: used on the home page, /about, llms.txt and the Organization schema. */
export const entity = {
  definition:
    "Safety First is an independent workplace safety blog: plain-language guides to OSHA, ANSI, NFPA and NIOSH requirements, each linked to the primary sources it was written from.",
};

/**
 * Languages. English is the default and lives at the root; a translation of a
 * post lives at /<code>/blog/<local-slug>. Keep this list and the strings in
 * src/i18n/ui.ts and src/data/categories.mjs in step. Adding a language
 * (e.g. "es") needs: an entry here, its strings, its category names, and
 * `LANGS` in scripts/generate-post.mjs picks it up from this list.
 */
export const locales = [
  { code: "en", hreflang: "en", og: "en_US", intl: "en-US", label: "English", name: "English" },
  { code: "fr", hreflang: "fr", og: "fr_FR", intl: "fr-FR", label: "Français", name: "French (France)", country: "France" },
  { code: "de", hreflang: "de", og: "de_DE", intl: "de-DE", label: "Deutsch", name: "German (Germany)", country: "Germany" },
];
export const defaultLocale = "en";

/** Where the post generator writes and how many posts it may publish per run. */
export const postsPerRun = 1;
