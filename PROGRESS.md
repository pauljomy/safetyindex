# Safety Index build-out: progress

Plain-English log of the build-out on the `build-out` branch (brief: `safetyindex-build-brief.md`). Newest status first; the audit and decisions follow.

## Status

- **Step 1 (audit, schedule off, CLAUDE.md, topic sheet): done.**
- **Step 2 (fixes to the existing site): done.** See "Step 2" below.
- **Step 3 (US data and keywords): in progress.** eCFR text indexed; topic sheet keyword data done; the DOL enforcement pull is running (the API rate-limits hard, so it takes a few hours); standard and industry pages are planned once it finishes.
- **Step 4 (engine): built; testing on 10 pages.**

## Things for Paul to do

1. **Start the full run** in a separate terminal (command in the final summary) and leave it running. Check progress with `npm run engine:status`.
2. **Cloudflare dashboard** (Security → Bots and AI Crawl Control): make sure AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, Applebot-Extended, OAI-SearchBot) are **allowed**, and that "Block AI bots", "AI Labyrinth" and any managed robots.txt are off for safetyindex.blog. Cloudflare's 2026 defaults can block them at the edge even though our robots.txt allows them. Today the live robots.txt is ours and isn't being rewritten.
3. **Cloudflare Workers Analytics Engine**: the Worker writes download, app-button and store-click events to the dataset `safetyindex_events` (binding `EVENTS` in `wrangler.jsonc`). Enable Analytics Engine on the account if it isn't on yet. Until then the events are dropped quietly and the site works normally.
4. **GitHub secrets for the weekly workflow** (`.github/workflows/weekly.yml`), all optional, and each step logs what's missing:
   - `GSC_CREDENTIALS_JSON` (the service account's JSON key) and `GSC_PROPERTY` (e.g. `sc-domain:safetyindex.blog`). Give the service account read access to the Search Console property (Settings → Users and permissions).
   - `GOOGLE_CLOUD_API_KEY` (already there, for cover images).
   - Deploying: `CLOUDFLARE_DEPLOY_HOOK`, or `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`. Without either, the push to main deploys through Cloudflare's git integration, as now.
5. **Local `.env`** for `npm run weekly`: `GSC_CREDENTIALS=/path/to/key.json` and `GSC_PROPERTY=sc-domain:safetyindex.blog`. Without them the weekly run falls back to manual Search Console exports in `data/gsc/<date>/pages.csv`.
6. **Crontab** for the weekly local run (improve loop + new pages): see the final summary.
7. **Remove `ANTHROPIC_API_KEY` from `.env`** if you don't need the old API pipeline. The engine strips it anyway, but leaving it there makes accidental API billing possible.
8. **Merge `build-out`** once you've looked over the built site (`npm run build:preview && npm run preview` shows every page, released or not). After the merge, the weekly workflow releases the first wave.
9. **Monthly AI-answer tracking**: run `npm run ai-answers` once a month (140 web-search Claude calls; `npm run ai-answers -- --market us --limit 5` for a quick check). Results go to `data/ai-answers/<date>.json`, with a per-market count of answers that name or link safetyindex.blog.
10. **App store IDs**: when the apps are live, set `android_package`, `ios_app_id`, `ios_provider_token` and `apps_live: true` in `scripts/config.yml`. The button switches to the official badges, device detection and the QR code with no other code changes. Until then, checklist pages show "Coming soon on Android and iOS."
11. **BLS data**: SOII 2025 comes out on 18 November 2026. Run `npm run bls` then; it writes the 2025 injury statistics page. CFOI 2025 (planned for 16 December 2026) has been postponed by BLS with no new date yet.
12. **Optional**: ask a French and a German speaker to spot-check the French and German pages.
13. **Future stage, not in this build**: a directory of inspection companies. Email capture and outreach were also out of scope.

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

## Step 4: The writing engine (built; 10-page test in progress)

- **CLI writer** (`scripts/lib/claude.mjs`, `complete()`): headless `claude -p`, prompt on stdin, JSON output against a schema. Writing and checking run with all tools off; the search step allows only WebSearch; keyword lookups allow only the OpenSEO keyword tool. Usage or rate limits wait and retry with backoff (up to 60 minutes between tries). `WRITER=api` uses the existing Anthropic API code with the same prompts and schemas.
- **Important: Anthropic API billing during my tests.** `.env` contains `ANTHROPIC_API_KEY`. When that variable is set, `claude -p` bills the Anthropic API instead of your Claude subscription, and it also can't see the claude.ai OpenSEO connector. My first engine tests (12 Nov, 19:04–19:44) ran with it loaded: the LOTO guide twice, safety glasses, the UK safety-glasses search and one German search. The CLI's own cost reports add up to about **$6.50 of API usage**. Fixed: every `claude` child process now gets an environment without `ANTHROPIC_API_KEY`, the engine refuses to run if a session isn't on the subscription login, and `npm run engine` no longer loads `.env`. Since the fix, every call is on the subscription. The brief's "no Anthropic API calls" holds from here on.
- **Orchestrator** (`scripts/engine/run.mjs`): the queue in the brief's order (`scripts/engine/queue.mjs`); resumable state in `data/jobs/state.jsonl`; 3 parallel workers (`workers` in config); each finished page committed on the current branch; a template is paused if more than 10% of its pages are dropped (counted over at least 10). Each job writes a prompt bundle to `data/jobs/{market}/{slug}/` (git-ignored: instructions, source text, stats, schema).
- **Independent checking pass**: a second `claude -p` call that sees only the sources and the draft (it runs from a folder with no CLAUDE.md, so it never sees the writing instructions). If it finds problems, the page is rewritten once and checked again; a page that still fails is dropped and logged. After the first test I added a severity grade: "major" problems (anything that changes what a rule requires, unsupported claims, wrong clauses or numbers, missing safety steps, anything misleading) block a page; "minor" wording points don't.
- **Fact rule for rewrites**: after a rewrite, every changed line is compared with the original; a line that adds a number, clause or name that's in neither the draft nor the sources goes back to the original wording.
- **Downloads**: the generator now has English, German and French template text (`scripts/downloads/strings/`), the page URL in the PDF and Excel footers, Letter for US/Canada and A4 elsewhere, a clause column, and rebuilds only when a checklist's content hash changes. Verification checks the PDF page count, zero Excel formula errors after a LibreOffice recalculation, that the items match the page, and that conform.so appears nowhere. The fonts (Poppins, OFL) are in the repo. The on-page checklist and the downloads come from the same JSON.

### Test results so far

| Page | Result |
|---|---|
| US guide #7 safety glasses | Written (2,446 words, checklist + PDF/Excel), passed the checking pass first time. Go/no-go: 9 guides and 1 shop page in the top 10. |
| US guide #6 lockout/tagout | First try dropped: the checker rightly found a definition summarised without one of its conditions, and a training row that implied affected employees need no initial training. After the precision rule and severity grading: written and passed. |
| UK guide #7 safety glasses | Correctly skipped by go/no-go: 6 of the UK top 10 are retailer pages. |
| German rewrite of /de/blog/sicherheitszeichen-arbeitsschutz | First tries showed two engine bugs (the rewrite guard reverted whole fields; the number check misread German dates), both fixed. Retesting. |

## Step 6: Data pages and hubs

- **OSHA penalties** (`/us/osha-penalties`): amounts from osha.gov/penalties (effective 15 January 2026), stored once in `scripts/config.yml` and read by every standard page. One URL, updated in place every January by `node scripts/data/reports.mjs --penalties-only`; the year is in the title and the update date is on the page.
- **Workplace injury statistics 2024** (`/us/reports/workplace-injury-statistics-2024`): from BLS SOII 2024 (released 22 Jan 2026) and CFOI 2024 (released 19 Feb 2026). Headline: 2,488,400 nonfatal injuries and illnesses (2.3 per 100 full-time workers) and 5,070 fatal work injuries (3.3 per 100,000). Six static SVG charts, six tables, CSV and Excel downloads. The BLS API refused scripted requests ("website busy"), so `scripts/data/bls.mjs` reads the published tables.
- **Most-cited OSHA standards report** (`/us/reports/most-cited-osha-standards-2026`, topic sheet row 134): built by `scripts/data/reports.mjs` from the DOL data once the pull finishes. It covers the most-cited standards and paragraphs, trends from FY2022 to FY2026, penalties by industry sector and the most-cited standards per industry, with CSV and Excel downloads. The opening sentence can be quoted on its own.
- Reports and the penalties page are built by script, with no AI writing, so every number comes straight from the data. They say so on the page.
- **Hubs**: `/us` (market home), `/us/standards`, `/us/industries`, `/us/guides`, `/us/reports`, `/blog`, `/fr/blog`, `/de/blog`, and `/uk|au|ca|nz` with `/…/guides`. Each lists every live page in its group, grouped by topic. A hub only exists once it has a live page. The home page links the US hubs, the reports and the other markets.

### Who might cite the yearly report (for your own outreach, if you choose)

- Trade publications: EHS Today, Safety+Health (National Safety Council), Occupational Health & Safety (OH&S), ISHN, Construction Dive, ENR, Facilities Dive, Supply Chain Dive.
- Associations: ASSP (American Society of Safety Professionals), NSC, AIHA, AGC and ABC (construction), state safety councils, NAHB, the National Roofing Contractors Association, warehouse and logistics associations.
- Safety blogs and software vendors' blogs that publish "top OSHA violations" posts every October (OSHA's own top-10 list covers one fiscal year; ours covers five years with paragraphs, penalties and industries, which gives them something new to cite).
- University EHS departments, safety consultants and insurance loss-control teams who publish client guidance.
- Local news and business journals covering workplace safety in their state (the data can be split by state on request in a later version).

## Step 7: Release and technical setup

- **Release schedule** (`npm run release`, `scripts/release/release.mjs`): generated pages carry no `releaseDate` until a wave releases them; the build leaves out unreleased pages, and sitemaps, hubs, internal links and IndexNow follow automatically. The first wave is the top 50 US standard pages in queue order, the yearly report, the injury statistics page and the penalties page, with their hubs. After that, 75 pages a week, gated by the impressions gate and the indexing gate. Each wave adds a "Pages for Paul to read this week" list to this file. Waves are logged in `data/release/`. Pages from before the build keep their original dates.
- **Sitemaps**: one per market and section (`sitemap-us-standards.xml`, `sitemap-us-guides.xml`, `sitemap-fr-guides.xml`, …), split at 10,000 URLs, under `/sitemap-index.xml` (named in robots.txt). Only live, indexable, self-canonical pages. `lastmod` is the last upgrade/rewrite or the release date. This replaced `@astrojs/sitemap`.
- **URLs**: a small Worker (`worker/index.js`) 301-redirects any URL with capitals to lowercase and answers 410 for retired URLs (`data/gone.json`). Unknown URLs still get the real 404 page. Page-for-page 301s go in `public/_redirects`.
- **Analytics**: the site had none. I added a cookie-free, Cloudflare-native option: the same Worker writes events to Workers Analytics Engine. It tracks checklist downloads (PDF and Excel separately, plus report CSV/Excel), app-button taps and outbound store clicks, per market. No cookies; no IP or user agent is stored.
- **App button**: one component, shown only on pages with a checklist and only in `app_markets` (US, UK, AU, CA, NZ; off for French and German). While `apps_live` is false it shows the plain "Coming soon on Android and iOS." note, with no badges.
- **IndexNow**: `npm run indexnow` pings new and changed sitemap URLs after a deploy (key file served at `/<key>.txt`, state in `data/indexnow-state.json`). The weekly workflow runs it after deploying.
- **Structured data**: `WebPage` on standard, industry, report and penalty pages, `BlogPosting` on guides, `BreadcrumbList` everywhere, all built as objects and JSON-encoded; the build checks that the name and dates match the page.
- **Page size**: the build fails on HTML over 1 MB or an H1 after the first 100 KB. Charts are static SVG in the HTML.
- **Lighthouse** (`npm run lighthouse`): 10 sample pages across page types, mobile, 3 runs each, median counts; fails under 80 performance or 95 accessibility. Locally it uses a headless Chrome in `~/.cache/si-chrome` (under WSL, Chrome is started directly with a debugging port because chrome-launcher picks Windows paths).
- **Cover images** (`npm run covers`): one image per subject (standard pages use the work the standard covers, industries a worksite, reports a neutral scene), shared by the French and German versions; at most `max_images_per_run` (150) per run; made in the weekly Action. Pages build and look right without one.
- **llms.txt**: now lists the market hubs, the reports and the top standard pages, one line each.
- **Hosting**: the build reports the file count against Cloudflare's static asset limit (20,000 files on the free plan) and warns at 80%.

## Step 8: Search Console loop and maintenance

- `.claude/skills/gsc-seo-autopilot/` copied from github.com/pauljomy/gsc-seo-autopilot (MIT), with the two fixes, `app_url: ""`, the market hubs as link targets, and a note at the top: never run its `auto` or `publish` commands on this site.
- `scripts/gsc/pull.mjs`: Search Console API client (service-account JWT, no LLM). It pulls the last 28 days and the 28 before (query, page, query+page, page+country), saves CSVs and a summary in `data/gsc/<date>/`, and runs URL Inspection for pages released in the last 30 days (stops at 1,800 a day). No credentials → logs it and uses manual exports.
- `scripts/gsc/improve.mjs`: the six rules, at most 20 changes a week. Title/description rewrites go through the engine's checks and are restored after 28 days if CTR dropped. Every change is logged with its size (optimisation / upgrade / rewrite); only upgrades and rewrites move the visible date.
- `scripts/maintenance/impressions.mjs` (zero impressions for 3 months → merge, noindex or, with analytics evidence only, 410), `audit.mjs` (quarterly CSV in `data/audit/`), `rule-changes.mjs` (weekly eCFR amendment check for every cited section; affected pages go to the rewrite queue), `scripts/gsc/report.mjs` (weekly report per market in this file), `ai-answers.mjs` (20 questions per market).
- `npm run weekly` (`scripts/weekly.mjs`) works on the `weekly-improve` branch, rebased on the latest main. It runs the pull, the improve loop, the zero-impression check, rule changes, the monthly recheck of `Waiting` rows, up to 10 new pages through the engine, the report and the full build. If everything passes and `improve_auto_push` is true, it merges into main and pushes; otherwise it leaves the branch and notes why here.
- Not wired yet: legislation change feeds for the UK, Australia, Canada, New Zealand, France and Germany. The weekly report carries a reminder; legislation.gov.uk's Atom feeds would be the first to add.
