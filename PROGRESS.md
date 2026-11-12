# Safety Index build-out: progress

Plain-English log of the build-out on the `build-out` branch (brief: `safetyindex-build-brief.md`). Newest status first; the audit and decisions follow.

## Status

- **Step 1 (audit, schedule off, CLAUDE.md, topic sheet): done.**
- **Step 2 (fixes to the existing site): done.** See "Step 2" below.
- **Step 3 (US data and keywords): in progress.** eCFR text indexed; topic sheet keyword data done; the DOL enforcement pull is running (the API rate-limits hard, so it takes a few hours); standard and industry pages are planned once it finishes.
- **Step 4 (engine): built; testing on 10 pages.**

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

---

## Step 2: Fixes to the existing site (12 November 2026)

- **"Independent" removed.** The site description (`src/config/site.mjs`, used on the home page, /about, llms.txt and the Organization schema) and the writer's system prompt no longer say "independent". The footer on every page and the About page (English, French and German) now say "Made by the team behind the Conform app." (FR: « Réalisé par l'équipe de l'application Conform. », DE: „Vom Team hinter der Conform-App.“). Name only, no link. No other copies were found in `src/i18n/` or elsewhere (the other hits for "independent", "unabhängig" were ordinary words in guide text).
- **Three French/German guides noindexed** and taken out of the sitemap and hreflang (URLs keep working): `/fr/blog/casque-de-chantier`, `/de/blog/osha-bedeutung`, `/de/blog/sicherheitszeichen-arbeitsschutz` (their main sources are US). They're queued for a rewrite from French and German sources. The other five French/German guides cite INRS, the Code du travail, DGUV, BAuA and the Berufsgenossenschaften and stay live; their OSHA mentions are labelled comparisons.
- **Style rules and checks added** (sections 12 and 17):
  - `scripts/style/banned-phrases.txt` and `scripts/style/patterns.mjs`. The scripted patterns were tested on 29 pages of human-written HSE, OSHA and CCOHS guidance from 2019–2020 (Wayback Machine). Rules that flagged good human writing were narrowed or handed to the checking pass. Scripted (fail automatically): bold action labels that repeat the sentence, "-ing" comment tails, verbless one-line closers, chatbot leftovers, banned phrases. Judged by the checking pass: triads, "not X but Y", inflated significance, sales words, objections nobody raised, self-answered questions, generic openers/closers, bold noun labels, mid-section fragments. Details: `scripts/style/human-sample-report.md`.
  - Per page (`scripts/lib/validate.mjs` and the engine's validators): clause references against the eCFR paragraph index (US) or the downloaded source text (other markets); every number against the page's statistics or sources; 4-word phrase repetition (max 2); FAQ vs body similarity (max 0.8); answer-first openings for the page and each section; no review/credential claims; no placeholders; guides 1,200+ words. The validator's floor was 1,000 words and is now 1,200, matching CLAUDE.md.
  - Per build (`scripts/check-dist.mjs` → `scripts/checks/site.mjs`): conform.so and placeholder store values anywhere in the built site; data-as-of and not-legal-advice notes on every page; licence attribution lines; French/German pages citing only foreign sources; hub links, 3-click depth, at least 3 contextual links, standard mentions linked, standard pages linking back to guides; topic types, English-market copies, 80% similarity; sitemaps; capital letters in URLs; page size and H1 position; JSON-LD matching the page; IPTC labels on covers; downloads (`scripts/downloads/verify.mjs`).
  - **The 8 pages published before the build** report new-check failures as warnings and are listed in `data/rewrite-queue.json` (21 warnings today, mostly sections that open with a list or table, plus one French guide at 1,197 words). The weekly loop works through that queue.
- **hreflang codes are now per market** (`en-US`, `fr-FR`, `de-DE`, and `en-GB`, `en-AU`, `en-CA`, `en-NZ` for the new markets), with `<html lang>` to match. Only regional topics form clusters. The existing hard hat and PPE posts are regional; "What does OSHA stand for" is country-only, so its French page is a standalone French page.
- **New site structure** (nothing existing moved): `/us` (US home), `/us/standards/…`, `/us/industries/…`, `/us/guides` (hub of the `/blog` guides by topic), `/us/reports/…`, `/us/osha-penalties`, `/uk|au|ca|nz` and `/uk|au|ca|nz/guides/…`. Hubs are only built once they list a live page. `/blog`, `/fr/blog` and `/de/blog` now group guides by topic instead of by year. Every page has a visible breadcrumb trail (Home → market → hub → page). URLs keep the site's existing no-trailing-slash style (`/us/standards/1926-501-…`, not `…/`).

## Step 3: US data and keywords (in progress)

### Sources checked

| Source | Used for | Finding |
|---|---|---|
| DOL Open Data Portal API v4 (`apiprod.dol.gov/v4`, OSHA inspection and violation datasets) | Enforcement data | Works with `DOL_API_KEY` as a query parameter (the header form returns 401). 10,000 rows per request. It rate-limits hard (HTTP 429 with no Retry-After), so the pull backs off up to 10 minutes and caches each month in `data/raw/us/dol/` (git-ignored). Joined on activity number. Window: the last 5 complete federal fiscal years, FY2022–FY2026. |
| eCFR versioner API | Regulation text, clause checks | Title 29 parts 1904, 1910, 1915, 1917, 1918, 1926, 1928, as of 9 Nov 2026: 1,105 sections, 30,825 paragraphs indexed (`data/pages/us/ecfr-index.json`). The paragraph index was checked against eCFR's own anchors for 55 sections (9 of 8,223 missing, in odd markup). |
| osha.gov/penalties | Maximum penalties | $16,550 per serious or other-than-serious violation, $16,550 per day for failure to abate, $165,514 per willful or repeated violation, for penalties assessed after 15 January 2026. Stored in `scripts/config.yml`. |
| Census NAICS 2022 codes | Industry names | 2- to 4-digit titles in `data/pages/us/naics.json`. |
| Licences | Attribution | Recorded in `scripts/sources/licences.yml` (OGL v3 for HSE and legislation.gov.uk, Licence Ouverte for Légifrance, CC BY 4.0 for Safe Work Australia, legislation.gov.au, WorkSafe NZ and legislation.govt.nz, the Justice Laws reproduction order for Canada; INRS, DGUV, BAuA and CCOHS cite-and-paraphrase only; paid standards by number only). Pages show the attribution line automatically. |

### Keyword research (OpenSEO, connected)

- **The 12 November topic-sheet check wasn't stored anywhere I could read** (the OpenSEO project had no saved keywords), so the sheet was scored again: 914 keywords (primary plus supporting) for 184 credits. The keyword columns are filled: cluster volume, KD, intent, checked on, source.
- Lookups run as their own headless step that may use only the OpenSEO keyword tool (`scripts/keywords/openseo.mjs`). Every result is saved in `data/keywords/us/2026-11-12.json`, and a credit ledger enforces the per-run cap (1,500) and floor (500). Balance after this: **3,647 credits**.
- **Retargets** (a phrase from the same cluster with the same intent and KD under 15): 10 rows were retargeted and stay `Not started`: #8 respirator → "respirator definition" (KD 11), #33 → "carbon monoxide alarm replacement" (KD 3), #38 → "csp certified safety professional" (KD 9), #44 → "what is hazards" (KD 0), #70 → "prevention of foodborne disease" (KD 9), #86 → "ladder safety training" (KD 7), #87 → "environmental hazard" (KD 9), #110 → "safety and precautions" (KD 9), #129 → "during the osha inspection" (KD 8), #131 → "workplace violence prevention training" (KD 3). The script proposed 11 more that I rejected because the intent differs ("safety data sheet pdf", "fire prevention week", "health risk appraisal" for occupational health and safety, "srl fall protection", a quiz phrase and others). They're in Notes, and the rule is now stricter so the monthly recheck won't propose them again.
- Sheet now: **94 Not started, 29 Waiting: high competition, 0 Waiting: low demand, 11 Dropped, 4 Published.**
