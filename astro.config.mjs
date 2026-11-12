// @ts-check
import { defineConfig } from "astro/config";
import pagefind from "astro-pagefind";
import tailwindcss from "@tailwindcss/vite";
import { site } from "./src/config/site.mjs";

export default defineConfig({
  site: site.url,
  trailingSlash: "never",
  build: { format: "file", inlineStylesheets: "auto" },
  // Locales are listed in src/config/site.mjs; routes carry the /fr and /de prefixes themselves.
  // Sitemaps (one per market and section) are written after the build by scripts/build/postbuild.mjs.
  integrations: [pagefind()],
  vite: { plugins: [tailwindcss()] },
  markdown: { shikiConfig: { theme: "css-variables" } },
});
