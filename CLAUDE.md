# Safety Index blog

Static Astro site on the [astro-micro](https://github.com/trevortylerlee/astro-micro) theme (MIT). Pages are written by Claude Code running headless (`claude -p`, `WRITER=cli`, the default) through the engine in `scripts/engine/`, which reuses the guide pipeline in `scripts/generate-post.mjs`; `WRITER=api` uses the Anthropic API instead. Every setting lives in `scripts/config.yml`. The old hourly GitHub Action (`publish-post.yml`) is manual-only now; the weekly workflow (`weekly.yml`) pulls Search Console data, runs the release gates, makes cover images, builds, deploys and pings IndexNow. See README.md for where things live and PROGRESS.md for the build-out log.

## Non-negotiable rules (these win over everything else here)

1. Safety Index is a standalone safety reference for the US, UK, Germany, France, Australia, Canada and New Zealand.
2. **Never link or redirect to conform.so**, anywhere: pages, downloads, metadata, structured data or redirects. The only app links are the store links built from `scripts/config.yml`.
3. Every page must be fully useful to someone who never installs the app. Checklists work on the page, print cleanly, and download as PDF and Excel with no sign-up.
4. Content is written **only** from the regulation text and data supplied for that page, never from memory. Any clause number or figure that isn't in the supplied material makes the page fail.
5. Never reproduce text from ANSI, NFPA, ISO, EN, BS, DIN or other paid standards. Refer to them by number only. DGUV and INRS publications: cite and paraphrase, never copy.
6. No "safety checklist in {city}" pages, no pages where only a name or country changes, no translated pages, no Conform comparisons, no link networks.
7. Every page shows a "data as of" date and a not-legal-advice note. The visible "updated" date changes only for an upgrade (15–70% of the main content changed) or a rewrite (over 70%). Small edits never change it.
8. German and French pages are written directly in German and French for that country, from that country's own regulators. They're never US or UK content translated.
9. No named reviewer, no "reviewed by" claims and no invented credentials or authors anywhere on the site.

`temp/` (local reference copy of conform-blog) and `.env` are git-ignored; never commit them.

## Writing a post

Guides are markdown in `src/content/posts/<slug>.md` (US English, `/blog/<slug>`), `src/content/posts/{fr,de}/<local-slug>.md` and `src/content/posts/{uk,au,ca,nz}/<slug>.md` (other market versions, with `translationOf: <us-slug>` when they belong to a regional cluster). US standard, industry and report pages are JSON in `src/content/{standards,industries,reports}/`; checklists are JSON in `src/content/checklists/<market>/<slug>.json` and feed both the on-page checklist and the PDF/Excel downloads. The schemas are in `src/content.config.ts`. A guide is a title, a subtitle, one featured image, then the guide. There are no other images (charts and exact diagrams are static SVG, never generated). Generated pages carry `generatedOn` and are only built once the release schedule gives them a `releaseDate`.

### Featured image

The writer returns `coverPrompt` (English, the scene only: no text, labels, numbers or logos, equipment used correctly) and `coverAlt` (10–125 characters, in the post's language). `scripts/lib/cover.mjs` (the one image helper) makes one realistic photograph per subject with a Gemini Flash Image model on Vertex AI (`GOOGLE_CLOUD_API_KEY`), with the IPTC `trainedAlgorithmicMedia` label Google asks for. Pages store the subject in `cover` and the prompt in `coverPrompt`; `npm run covers` (weekly Action, capped at `max_images_per_run`) saves missing ones to `src/assets/covers/<subject>.webp`. Pages on the same subject and the French/German versions share the file with their own alt text; a page builds and looks right without one. The four original guides keep `src/content/posts/images/<english-slug>.webp`. The page shows it under the subtitle and uses a 1200×630 crop as the social card and `BlogPosting.image`. To add or replace one for an existing post: `npm run cover -- <slug> [--replace]`.

### Topic sheet and categories

`docs/Safety_Blog_Topics.xlsx` (sheet "Blog Topics") is the guide queue, in publishing order: Category, Blog Post Title, Primary Keyword, Supporting Keywords, Status, Published URL, then Topic type, Markets, Main page for keyword, Overlaps, Cluster volume, KD, Intent, Checked on, Keyword source, Go/no-go and Notes (explained on the "How to Use" sheet). Only `Not started` rows are written; `Published`, `Dropped`, `Waiting: low demand`, `Waiting: high competition` and `Skipped: search results` are skipped, and the weekly run rechecks the two `Waiting` statuses monthly. A guide needs real demand (cluster volume and KD under 15, thresholds per market in `scripts/config.yml`) and a passing go/no-go check of the search results before it is written. Where a guide and a standard page cover the same subject, the guide owns the how-to search and the standard page owns the requirements and regulation-number searches (`Main page for keyword`, `Overlaps`). The generator sets `keyword` to the Primary Keyword and `categories` to the row's Category mapped through `src/data/categories.mjs`, and after publishing sets Status to Published and fills Published URL.

### Writing with AI without getting penalised

Google ranks content on whether it helps people, not on how it was made. What it penalises is pages made mainly to rank that add nothing, especially at volume ([AI content guidance](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content), the [scaled content abuse policy](https://developers.google.com/search/docs/essentials/spam-policies#scaled-content-abuse), the [helpful content self-assessment](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)). A post's value comes from its primary sources, worked examples and tables, never from claimed expertise. These rules are in the prompts (`scripts/lib/prompts.mjs`) and, where a machine can check them, in `scripts/lib/validate.mjs`; keep the three in step.

1. **One post per search intent.** `keyword` is unique per language (validator). If a topic answers the same question as an existing post, improve that post instead.
2. **Don't rewrite the competitor page.** Search results show intent; they are never a source. No copied structure, headings, examples or wording.
3. **Facts only from downloaded primary sources.** The script downloads the official pages the search step picked (`scripts/lib/sources.mjs`, official domains only) and the writer sees only those extracts; the validator rejects a post that cites or links any URL the script did not download. Numbers are copied exactly. Keep the model away from server-side page fetching: it re-reads every page on every step (the first post cost about $20 that way); the hard cap is $2 a post (`MAX_POST_USD`); a typical post costs under $1.
4. **No invented experience or authors.** No "we inspected", case studies, quotes, testimonials or statistics that didn't happen (validator catches the common phrasings). Worked examples are labelled as examples. The byline is the site, never an invented person.
5. **Write for the reader, not a word count.** No filler or stock AI phrasing. The validator's 1,200-word floor only stops thin pages.
6. **YMYL.** Name the country/regulator for every rule, link it, don't go beyond the source, and point readers to their regulator or a competent person (the disclaimer under every post says so too).
7. **Dates are honest.** `date` is the publish day; set `updated` only when content changes in substance.
8. **Release schedule.** Generating a page and releasing it are separate. Each page gets a `releaseDate`; the build only includes pages whose date has passed (sitemaps, hubs, internal links and IndexNow follow). `release_per_week` (default 75) pages go out per weekly wave, after a `first_wave` (top 50 US standard pages, the reports, the penalties page, the hubs). **Impressions gate:** the weekly run looks at the latest wave released at least `release_gate_min_age_days` (21) before the last day of Search Console data, and releases the next wave only if at least `release_gate_min_share` (0.6) of its URLs have impressions; otherwise it holds and logs. No old-enough wave or no data: release and log that the gate was skipped. **Indexing gate:** if more than 30% of a wave isn't indexed 4 weeks after release, hold and improve the template. Pages live before the build keep their original date as `releaseDate`.
9. **Disclosure stays true.** The site says AI writes the posts and makes the featured images and that they are not reviewed line by line (`howMade` in `src/i18n/ui.ts`, `/about#how-we-write`). If a person starts reviewing posts, change those words; if the process changes, change them too.

### Markets (topic types, versions and hreflang)

Before anything is written, every topic in the sheet gets a `Topic type` and a `Markets` list:

1. **Country-only**: the topic exists under one country's law (an OSHA standard, a specific HSE regulation). One page in that market only, no hreflang cluster, no French or German version.
2. **Same everywhere**: the safe practice doesn't depend on the law. One English page in the most relevant market, no copies in other English markets (they link to it). A German or French version only when it cites that country's own rules; if the local search finds no local regulator source, that version is not made.
3. **Regional**: the duty, interval, record or legal reference differs by country. A separate page per market, each built from that market's own law, with a short "In [country]" line near the top giving the rule and its reference. Only these pages get hreflang clusters.

- `generate-post.mjs` writes only the markets in the `Markets` column. Similarity backstop: if two market versions come out more than 80% similar, keep the one with richer sources, don't make the other, and log the topic as mis-sorted.
- hreflang links only regional equivalents plus `x-default` (English), reciprocal and self-referencing, each version canonical to itself. Noindexed and unreleased pages are never in a cluster.
- French and German pages are written directly for France and Germany from local sources (France: INRS, Code du travail on Légifrance, Ministère du Travail; Germany: DGUV, BAuA, ArbSchG/BetrSichV on gesetze-im-internet.de). Research the local keyword first and use it in the title, first 100 words, one H2 and the slug. Where a rule is US-only, say so and label English sources "(en anglais)" / "(auf Englisch)". Same categories as the English post; `relatedPosts` uses English slugs; internal links stay in the same language and market.
- A French or German page whose **main** sources are from another country is noindexed and rewritten from local sources (mentioning OSHA in a labelled comparison is fine).

### Structure of a post

Answer-first `summary` (40–60 words), then the body: a direct answer and a quick-answer table, H2s phrased as searched questions with H3s beneath, at least one labelled worked example, inline links to primary sources, and a closing "what to check at your workplace" H2. FAQ (4–8) and sources (3+) live in the frontmatter and are rendered by the page; the body never repeats them.

## SEO standard (checked by `npm run build` → `scripts/check-dist.mjs`)

| Area | Standard | Enforced |
| --- | --- | --- |
| Title | ≤60 characters, unique, keyword near the start | Build |
| Description | 120–155 characters | Generator (≥120), build (≤155) |
| Headings | One H1 (the title), H2s as questions, no skipped levels | Build (one H1) |
| Answer-first | 40–60 word summary marked `data-answer` | Schema + build |
| Canonical | Every page canonical to itself | Build |
| Hreflang | Reciprocal sets, self-listed, x-default, `<html lang>` matches | Build |
| Structured data | JSON-LD only: `BlogPosting`, `BreadcrumbList`, `FAQPage`, `Organization`. No `HowTo` | Build |
| Internal links | No orphans, no broken links | Build |
| Sitemap | Every indexable page with lastmod and hreflang alternates | Build |
| AI search | robots.txt names AI crawlers; `llms.txt`, `llms-full.txt` and `.md` mirrors are generated | Build |

## Committing

The workflow commits posts itself. For manual changes, commit on `main` only when the user asks.
