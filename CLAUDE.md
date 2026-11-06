# Safety Index blog

Static Astro site on the [astro-micro](https://github.com/trevortylerlee/astro-micro) theme (MIT). Posts are researched and written by Claude Opus through `scripts/generate-post.mjs`, which a GitHub Action runs on a random 24–36 hour schedule. See README.md for where things live.

`temp/` (local reference copy of conform-blog) and `.env` are git-ignored; never commit them.

## Writing a post

Posts are markdown in `src/content/posts/<slug>.md` (English) and `src/content/posts/{fr,de}/<local-slug>.md` (translations, with `translationOf: <english-slug>`); the frontmatter schema is in `src/content.config.ts`. A post is a title, a subtitle, one featured image, then the guide. There are no other images (exact diagrams would be inline SVG, never generated).

### Featured image

The writer returns `coverPrompt` (English, the scene only: no text, labels, numbers or logos, equipment used correctly) and `coverAlt` (10–125 characters, in the post's language). `scripts/lib/cover.mjs` makes one realistic photograph per topic with a Gemini Flash Image model on Vertex AI (`GOOGLE_CLOUD_API_KEY`), saved to `src/content/posts/images/<english-slug>.webp` with the IPTC `trainedAlgorithmicMedia` label Google asks for. Translations reuse the file (`../images/<english-slug>.webp`) with their own alt text. The page shows it under the subtitle and uses a 1200×630 crop as the social card and `BlogPosting.image`. To add or replace one for an existing post: `npm run cover -- <slug> [--replace]`.

### Topic sheet and categories

`docs/Safety_Blog_Topics.xlsx` (sheet "Blog Topics") lists the planned posts in publishing order: Category, Blog Post Title, Primary Keyword, Supporting Keywords, Status, Published URL. The generator takes the first row that isn't `Published`, sets `keyword` to the Primary Keyword and `categories` to the row's Category mapped through `src/data/categories.mjs`, and after publishing sets Status to Published and fills Published URL. Supporting keywords are covered inside the same post (headings, FAQ), never as separate posts. Keywords come from US competitor sites, so facts come from current OSHA/ANSI/NFPA/NIOSH sources, never from the keyword list.

### Writing with AI without getting penalised

Google ranks content on whether it helps people, not on how it was made. What it penalises is pages made mainly to rank that add nothing, especially at volume ([AI content guidance](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content), the [scaled content abuse policy](https://developers.google.com/search/docs/essentials/spam-policies#scaled-content-abuse), the [helpful content self-assessment](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)). A post's value comes from its primary sources, worked examples and tables, never from claimed expertise. These rules are in the prompts (`scripts/lib/prompts.mjs`) and, where a machine can check them, in `scripts/lib/validate.mjs`; keep the three in step.

1. **One post per search intent.** `keyword` is unique per language (validator). If a topic answers the same question as an existing post, improve that post instead.
2. **Don't rewrite the competitor page.** Search results show intent; they are never a source. No copied structure, headings, examples or wording.
3. **Facts only from sources opened in the session.** The research step must `web_fetch` every page it cites; the validator rejects a post that cites or links any URL that was not opened. Numbers are copied exactly.
4. **No invented experience or authors.** No "we inspected", case studies, quotes, testimonials or statistics that didn't happen (validator catches the common phrasings). Worked examples are labelled as examples. The byline is the site, never an invented person.
5. **Write for the reader, not a word count.** No filler or stock AI phrasing. The validator's 1,200-word floor only stops thin pages.
6. **YMYL.** Name the country/regulator for every rule, link it, don't go beyond the source, and point readers to their regulator or a competent person (the disclaimer under every post says so too).
7. **Dates are honest.** `date` is the publish day; set `updated` only when content changes in substance.
8. **Pace.** Exactly one topic per run (English + its translations), at random 24–36 hour gaps (`scripts/lib/schedule.mjs`). Never publish a batch. If Search Console shows indexing slowing or pages dropping out ("Crawled – currently not indexed"), pause the workflow and improve existing posts.
9. **Disclosure stays true.** The site says AI writes the posts and makes the featured images and that they are not reviewed line by line (`howMade` in `src/i18n/ui.ts`, `/about#how-we-write`). If a person starts reviewing posts, change those words; if the process changes, change them too.

### Translations (French, German)

Every English post ships with a French (France) and German (Germany) version in the same run. Translations count as scaled content when they add nothing, so each is a rewrite for that market:

- Research the keyword people there actually search (in that language) before writing; use it in the title, first 100 words, one H2 and the slug.
- Write the way a practitioner there talks, keeping the industry terms they really use.
- Localise every field: title, seoTitle, subtitle, description, summary, keyTakeaways, tags, FAQ, headings, table text, slug.
- Cite local regulators (France: INRS, Code du travail on Légifrance, Ministère du Travail; Germany: DGUV, BAuA, ArbSchG/BetrSichV on gesetze-im-internet.de). Where a rule is US-only, say so and label English sources "(en anglais)" / "(auf Englisch)".
- Same categories as the English post; `relatedPosts` uses English slugs; internal links stay in the same language.
- Hreflang follows [Google's rules](https://developers.google.com/search/docs/specialty/international/localized-versions): reciprocal, self-referencing, `x-default` = English, every version canonical to itself (the build fails otherwise).
- Ask a French and a German speaker to spot-check translations when you can; the build checks structure, not language quality.

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
