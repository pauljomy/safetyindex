// Reads scripts/config.yml: the one settings file for the pipeline, the engine,
// releases, the weekly loop and the app button. Shared by Node scripts and the
// Astro build (both run in Node), so there is no second copy of any setting.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

// Resolved from the repo root: scripts and the Astro build both run there, and bundling moves import.meta.url.
export const CONFIG_FILE = join(process.env.SAFETYINDEX_ROOT ?? process.cwd(), "scripts/config.yml");

function load() {
  const c = YAML.parse(readFileSync(CONFIG_FILE, "utf8"));
  const env = process.env;
  if (env.WRITER) c.writer = env.WRITER;
  if (env.WRITER_MODEL) c.writer_model = env.WRITER_MODEL;
  if (env.WORKERS) c.workers = Number(env.WORKERS);
  return c;
}

export const config = load();

/** Updates one top-level key in config.yml, keeping the file's comments and order. */
export function setConfig(key, value) {
  const doc = YAML.parseDocument(readFileSync(CONFIG_FILE, "utf8"));
  doc.set(key, value);
  writeFileSync(CONFIG_FILE, doc.toString({ lineWidth: 0 }));
  config[key] = value;
}

/** Markets the site serves, with their URL prefix, language and paper size. */
export const MARKETS = {
  us: { name: "United States", lang: "en", hreflang: "en-US", paper: "letter", guides: "/blog" },
  uk: { name: "United Kingdom", lang: "en", hreflang: "en-GB", paper: "a4", guides: "/uk/guides" },
  de: { name: "Germany", lang: "de", hreflang: "de-DE", paper: "a4", guides: "/de/blog" },
  fr: { name: "France", lang: "fr", hreflang: "fr-FR", paper: "a4", guides: "/fr/blog" },
  au: { name: "Australia", lang: "en", hreflang: "en-AU", paper: "a4", guides: "/au/guides" },
  ca: { name: "Canada", lang: "en", hreflang: "en-CA", paper: "letter", guides: "/ca/guides" },
  nz: { name: "New Zealand", lang: "en", hreflang: "en-NZ", paper: "a4", guides: "/nz/guides" },
};
