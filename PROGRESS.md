# Safety Index build-out: progress

Plain-English log of the build-out on the `build-out` branch (brief: `safetyindex-build-brief.md`). Newest status first; the audit and decisions follow.

## Status

- **Step 1 (audit, schedule off, CLAUDE.md, topic sheet): done.**

## Things for Paul to do

(Collected as the build goes; see the final summary at the end.)

---

## Step 1: Audit (12 November 2026)

### How the site is built

- **Astro 6.4.8**, static output, the astro-micro theme, Tailwind 4, Pagefind search. Node 24.
- **One content collection, `posts`**: English guides in `src/content/posts/*.md`, French and German versions in `src/content/posts/fr/` and `src/content/posts/de/` (each with `translationOf` pointing at the English slug). The schema is in `src/content.config.ts`.
- **Routes**: home, `/blog` (all guides), `/blog/{slug}`, `/category/{slug}`, `/tags`, `/about`, `/contact`, `/privacy`, `/terms`, and the same set under `/fr/` and `/de/`. Every page type has one template in `src/views/`; the files in `src/pages/` are thin routes. Trailing slashes are off (`/blog/x`, not `/blog/x/`), and the build writes `x.html` files.
- **One layout** (`src/layouts/Layout.astro`) with the SEO head (`Head.astro`: canonical, hreflang, Open Graph, robots) and JSON-LD (`src/lib/schema.ts`: BlogPosting, BreadcrumbList, FAQPage, Organization).
- **Guide pipeline**: `scripts/generate-post.mjs` takes the next unpublished row of the topic sheet, searches with the Anthropic API's server-side web search, downloads official pages itself (`scripts/lib/sources.mjs`, official domains only), writes the English post, validates it (`scripts/lib/validate.mjs`, up to 2 repairs), makes a Gemini cover image (`scripts/lib/cover.mjs`), then writes French and German versions from local sources, builds the site, and marks the sheet row Published. It always wrote all three languages.
- **Build checks** (`scripts/check-dist.mjs`): title length and uniqueness, description length, canonical, one H1, answer-first summary, hreflang reciprocity and x-default, JSON-LD parses, BreadcrumbList on inner pages, no orphan pages, no broken internal links, robots.txt names AI crawlers, llms.txt, llms-full.txt, sitemap with lastmod, markdown mirrors.

### Existing guides (8 live pages before the build; all keep their URLs)

| Market / language | Guide | Main sources | Decision |
|---|---|---|---|
| US, English | /blog/what-does-ppe-stand-for | OSHA, eCFR, CDC | Live. Answers its title. |
| US, English | /blog/safety-signals-signs-symbols-colours | eCFR, OSHA | Live. Answers its title. |
| US, English | /blog/hard-hat-types-and-classes | OSHA, eCFR | Live. Answers its title. |
| US, English | /blog/what-does-osha-stand-for | OSHA, USA.gov, CDC | Live. Answers its title. |
| France | /fr/blog/que-veut-dire-epi | INRS (30 links), 2 labelled US comparisons | Live. French sources. |
| France | /fr/blog/panneaux-de-signalisation-de-securite-au-travail | INRS, code.travail.gouv.fr; labelled US comparison | Live. French sources. |
| France | /fr/blog/osha-c-est-quoi | INRS (26 links); OSHA (10) for the acronym itself | Live. Explains the French equivalent from INRS. |
| France | /fr/blog/casque-de-chantier | **Only OSHA and eCFR** (no French source) | **Noindexed** (step 2). To be rewritten from INRS sources. |
| Germany | /de/blog/psa-arbeitsschutz | gesetze-im-internet.de, BAuA, BGHM, VBG, BG RCI, UKH | Live. German sources. |
| Germany | /de/blog/schutzhelm-arbeitsschutz | DGUV (11 links) | Live. German sources. |
| Germany | /de/blog/osha-bedeutung | **Mostly OSHA** (13 links vs 5 DGUV; 5 of 6 sources US) | **Noindexed** (step 2). To be rewritten from DGUV/BAuA sources. |
| Germany | /de/blog/sicherheitszeichen-arbeitsschutz | **Only OSHA and eCFR**; it tells readers where the German rules are but cites none | **Noindexed** (step 2). To be rewritten from ASR A1.3 / DGUV sources. |

All four English guides answer the question in their title, so none needs a rewrite for that reason.

### What already exists from sections 13–15

- Static Astro on Cloudflare: yes.
- Sitemap: one `@astrojs/sitemap` index with lastmod and hreflang alternates, noindexed pages filtered out. **Not** split per market and section yet.
- robots.txt: names 12 AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot and others) and links the sitemap index.
- Lowercase URLs: slugs are lowercase, but **`/Blog` returns 404 instead of a 301 to `/blog`** (fixed in step 7).
- Unknown URLs: a real 404 page with a 404 status (`not_found_handling: 404-page`). No 410 handling yet.
- JSON-LD: built as objects and serialised with `JSON.stringify` (good). No `WebPage` type yet.
- llms.txt and llms-full.txt and `.md` mirrors: yes.
- IndexNow: `npm run indexnow` is listed in package.json but **the script `scripts/indexnow.mjs` doesn't exist**.
- Lighthouse checks, page-size checks, release dates, app button, analytics: none.
- Analytics: **none on the site**.

### Live robots.txt (curl https://safetyindex.blog/robots.txt, 12 Nov 2026)

Identical to the repo's: `User-agent: *` Allow, the 12 named AI crawlers allowed, the sitemap linked. Cloudflare isn't adding its own AI-crawler block in front of it at the moment. Cloudflare can still block AI crawlers at the edge with a 403 even when robots.txt allows them, so please check the dashboard settings listed in "Things for Paul to do".

### conform.so

Searched the repo (`src`, `scripts`, `public`, `docs`, config files) and the last `dist/` build: **no occurrence of conform.so anywhere.** (The Google Cloud project for the cover images is called `conform-blog-513213`; that's an internal project ID used in an API call, never shown on the site.)

### How the site deploys

Cloudflare **Workers static assets** with git integration (`wrangler.jsonc`, assets from `dist/`): Cloudflare builds with `npm run build` and runs `npx wrangler deploy` on every push to `main`. There's no deploy hook in the repo. The live site answers through Cloudflare (`server: cloudflare`, HSTS on).

### Changes made in step 1

- **Old publish schedule off.** `.github/workflows/publish-post.yml` no longer has its hourly `schedule` trigger; `workflow_dispatch` still works. It can't publish or spend API credit alongside the CLI run. The weekly workflow (step 7) replaces it.
- **CLAUDE.md updated**: the nine non-negotiable rules added at the top; rule 8 ("one topic per run, never a batch") replaced by the release schedule with the impressions and indexing gates; the translations section replaced by the Markets rules (topic types, which markets get versions, hreflang only for regional topics); topic sheet statuses and the guide/standard keyword split described. Everything else kept.
- **One config file**: `scripts/config.yml` (there was no pipeline config file before; settings were env variables and constants). Every setting in brief section 20 is in it, read through `scripts/lib/config.mjs`.
- **Topic sheet updated** (`docs/Safety_Blog_Topics.xlsx`, migration script `scripts/topics/migrate-sheet.mjs`):
  - 11 new columns: Topic type, Markets, Main page for keyword, Overlaps, Cluster volume, KD, Intent, Checked on, Keyword source, Go/no-go, Notes. The "How to Use" sheet explains them.
  - **Dropped (11 rows)**: the 10 rows in the brief (18, 25, 28, 29, 36, 45, 46, 49, 83, 119), plus **row 105 (ISO 45001)**, because its main source is the paid ISO standard (brief section 7a). It was also on the high-competition list (KD 26).
  - **Waiting: high competition (39 rows)**, KD in Notes. That's the brief's 42 minus row 134 (stays as the yearly report), "what does osha stand for" (already published) and ISO 45001 (dropped).
  - **Not started: 83 rows**, matching the brief's count of rows with KD under 15.
  - Topic types: 51 regional, 59 same everywhere, 28 country-only. Food safety rows are US-only (FDA/FSIS/CDC sources). Row 138 (COR) is Canada-only and row 101 (PEEPs) is UK-only.
  - The 14 guide/standard overlaps are recorded (section numbers for now; the URLs are filled in once the standard pages are planned in step 3).
  - `scripts/lib/topics.mjs` now skips every status except "Not started", and skips row 134 (the report).
- **Row numbers**: the brief's row numbers are the sheet's `#` column. Four rows (1–4) were published before the build, not three.
