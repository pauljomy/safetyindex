// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import pagefind from "astro-pagefind";
import tailwindcss from "@tailwindcss/vite";
import { site } from "./src/config/site.mjs";
import { sitemapFilter, sitemapSerialize } from "./scripts/lib/sitemap.mjs";

export default defineConfig({
  site: site.url,
  trailingSlash: "never",
  build: { format: "file", inlineStylesheets: "auto" },
  // Locales are listed in src/config/site.mjs; routes carry the /fr and /de prefixes themselves.
  integrations: [sitemap({ filter: sitemapFilter, serialize: sitemapSerialize }), pagefind()],
  vite: { plugins: [tailwindcss()] },
  markdown: { shikiConfig: { theme: "css-variables" } },
});
