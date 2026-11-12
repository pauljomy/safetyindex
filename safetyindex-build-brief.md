# Safety Index (safetyindex.blog): build brief for Claude Code

This file is the source of truth for building out safetyindex.blog. Read all of it before you start. Then read the repo's `CLAUDE.md` and `README.md`.

**This build is fully automated.** No person reviews content. Quality comes from the independent checking pass (section 11) and the automated checks (section 17). Claude Code writes all content itself, through the Claude Code CLI. The build makes no Anthropic API calls and uses no Anthropic API key.

**Which wins when things disagree**

1. The rules in section 1 win over everything.
2. This brief wins over the repo's current behaviour. Where the repo does something differently, change the repo to match the brief and log the change in `PROGRESS.md`.
3. The repo's existing structure wins over building new. Where the repo already has code for a job, change that code. Never build a second pipeline, a second config or a second copy of a helper next to an existing one.
4. Section 3 lists the things that must be kept as they are. Those are not to be changed, even to match another part of this brief.

---

## 1. The non-negotiable rules

Put these in the repo's `CLAUDE.md` so every session, including the headless writing sessions, follows them.

1. Safety Index is a standalone safety reference for the US, UK, Germany, France, Australia, Canada and New Zealand.
2. **Never link or redirect to conform.so**, anywhere: pages, downloads, metadata, structured data or redirects. The only app links are the store links in section 15.
3. Every page must be fully useful to someone who never installs the app. Checklists work on the page, print cleanly, and download as PDF and Excel with no sign-up.
4. Content is written **only** from the regulation text and data supplied for that page, never from memory. Any clause number or figure that isn't in the supplied material makes the page fail.
5. Never reproduce text from ANSI, NFPA, ISO, EN, BS, DIN or other paid standards. Refer to them by number only. DGUV and INRS publications: cite and paraphrase, never copy.
6. No "safety checklist in {city}" pages, no pages where only a name or country changes, no translated pages, no Conform comparisons, no link networks.
7. Every page shows a "data as of" date and a not-legal-advice note. The visible "updated" date changes only for an upgrade or a rewrite, as defined in section 16. Small edits never change it.
8. German and French pages are written directly in German and French for that country, from that country's own regulators. They're never US or UK content translated.
9. No named reviewer, no "reviewed by" claims and no invented credentials or authors anywhere on the site.

---

## 2. How to work

- Work on one branch, `build-out`. Commit after each completed step with a clear message. Never push to main and never deploy during this build. I look over the built site myself, then merge and deploy it.
- Run the steps in order (section 18) without stopping for approval. Stop only for the blockers in section 19.
- Keep a running `PROGRESS.md` in plain English: what's done, what's running, how many pages were built, released or dropped (and why), and anything I need to do. Don't paste code into it.
- **One language: Node.** Everything new is written in Node, under `scripts/`, like the existing pipeline: data fetchers, Search Console scripts, checks, release logic and maintenance scripts. The only exception is the download generator `scripts/downloads/build_checklist.py` (section 10), which stays in Python and is called from Node as a command. Don't port it.
- **One config file:** `scripts/config.yml`. If the repo already has a config file for the pipeline, use that one and log where it is. Every setting named in this brief lives there. Section 20 lists them all.
- Code must be DRY: one shared component or helper each for the app button, disclaimer, data-as-of line, breadcrumbs, hreflang, download buttons and cover images.
- Don't break anything that works today. The full Astro build and every check in section 17 must pass before a step counts as done.
- Don't delete published pages. To retire one, set it to `noindex`, take it out of the sitemap and keep the URL working. The only exception is the zero-impression rule in section 16.
- If part of this brief is already built, change the existing code and config to match, without breaking the existing checks, and log each change.
- If a source turns out to be unavailable, or its licence forbids what's planned, skip that piece, log it and carry on with the rest. Don't work around a licence.
- **Not in this build:** a directory of inspection companies (note it in `PROGRESS.md` as a future stage), email capture, and outreach of any kind.

---

## 3. The existing site

The repo already has a working, well-checked pipeline. Extend it.

**The writing pipeline**

- `scripts/generate-post.mjs` picks the next topic from the topic sheet, downloads official sources, writes, validates and builds one post plus French and German versions.
- `scripts/lib/claude.mjs` does the model calls through the Anthropic API.
- `scripts/lib/validate.mjs` (per post) and `scripts/check-dist.mjs` (per build) hold the checks.
- `scripts/lib/topics.mjs` reads the topic sheet and writes back Status and Published URL.
- `scripts/lib/cover.mjs` generates cover images.

Keep all of it, and build the new work into it:

- Add a `cli` backend to `scripts/lib/claude.mjs` (headless `claude -p`) next to the existing API backend, chosen by `WRITER=cli|api`. The default is `cli`.
- Put the queue, resume, backoff and checking-pass logic from section 11 in `scripts/` as Node modules.
- New per-post checks go into `validate.mjs`, and new per-build checks into `check-dist.mjs`. If either file gets too long, split the checks into modules under `scripts/checks/` that those two files import. There is still one entry point for each.

**The GitHub Action** (`.github/workflows/publish-post.yml`) publishes one post every 24–36 hours with the API key. Turn off its schedule trigger at the start of this build and keep `workflow_dispatch`, so it doesn't publish or spend API credit alongside the CLI run. Log this. The weekly workflow in section 14 replaces it.

**URLs stay where they are**

- English guides stay at `/blog/{slug}`, and French and German guides at their current paths. Don't move live URLs.
- US English guides, old and new, live in `/blog/`. The US guides hub lists them.
- New page types get new sections: `/us/standards/`, `/us/industries/`, `/us/reports/`, `/us/osha-penalties/`, and `/uk/`, `/au/`, `/ca/`, `/nz/` for guides written for those markets.
- If anything ever has to move, 301 it page-for-page.

**Keep what's already right.** Where this brief adds a rule, add it to these. Don't replace them.

- the answer-first `summary` field;
- `BlogPosting`, `BreadcrumbList`, `FAQPage` and `Organization` JSON-LD (`BlogPosting` is the `Article` markup for guides);
- `llms.txt`, `llms-full.txt` and the `.md` mirrors;
- robots.txt naming AI crawlers;
- the hreflang checks;
- the source download and URL check;
- the 1,200-word floor, which applies to guides only. Standard, industry, report and penalty pages have no word floor and are never padded;
- cover images.

**The disclosure** (`howMade` in `src/i18n/ui.ts`, `/about#how-we-write`) says AI writes the posts and they aren't reviewed line by line. Keep it true, and update the wording if the process changes.

**Update `CLAUDE.md`**

- Replace rule 8 ("Pace: exactly one topic per run… never publish a batch") with the release schedule and impressions gate in section 14.
- Add the rules in section 1.
- Replace the translations section with the `Markets` rules in section 5.
- Keep everything else in it.

---

## 4. Markets, sources and topic types

| Market | URL | Language | Main sources | Enforcement data |
|---|---|---|---|---|
| US | /us/ and /blog/ | en-US | OSHA, eCFR (29 CFR 1910, 1926) | DOL Open Data Portal API v4 (OSHA Inspection and Violation datasets) |
| UK | /uk/ | en-GB | HSE, legislation.gov.uk | HSE public register of enforcement notices (last 5 years), if its terms allow |
| Germany | current German paths | de-DE | BAuA technical rules (TRBS, TRGS, ASR), DGUV rules, ArbSchG and ordinances (gesetze-im-internet.de) | None |
| France | current French paths | fr-FR | INRS, Code du travail (Légifrance) | None |
| Australia | /au/ | en-AU | Safe Work Australia model WHS laws and codes, state regulators | None at first |
| Canada | /ca/ | en-CA | CCOHS, Canada Labour Code / COHSR (laws-lois.justice.gc.ca), provincial rules | None at first |
| New Zealand | /nz/ | en-NZ | WorkSafe NZ, Health and Safety at Work Act 2015 and regulations (legislation.govt.nz) | None |

Food safety topics (section 5) also allow FDA, USDA FSIS and CDC as sources.

**Check each source before writing its fetcher, and log what you find**

- **US enforcement data:** DOL Open Data Portal API v4 (`apiprod.dol.gov/v4`), using `DOL_API_KEY` from `.env`. Don't use enforcedata.dol.gov, which is being retired. Inspections and violations are separate datasets joined by activity number. Cache the raw pulls.
- **US regulation text:** the eCFR public API. Store the fetch date.
- **UK:** legislation.gov.uk XML (add `/data.xml` to a URL). For HSE's notice register, check HSE's terms and robots.txt. If an automated pull is allowed, pull it politely (rate-limited and cached). If not, skip UK enforcement pages and build UK guides and rule-based checklists only. HSE and legislation.gov.uk content needs the Open Government Licence attribution line.
- **France:** if Légifrance's API needs a registration you don't have, use the official open bulk dataset of French law published by DILA under the Licence Ouverte. Log which one you used.
- **Germany:** gesetze-im-internet.de for laws and ordinances. BAuA and DGUV texts: cite and paraphrase only.
- **Australia, Canada, NZ:** official legislation sites.
- Record each source's licence and attribution text in `scripts/sources/licences.yml`.
- Raw data goes in `data/raw/{market}/` (git-ignored if large). Processed per-page input goes in `data/pages/{market}/{slug}.json`, with source URLs and fetch dates.

**Topic types**

hreflang is meant for small regional differences. It doesn't stop Google merging near-identical copies and showing the wrong country's page. So before anything is written, every topic is sorted into one of three types, and the type is recorded in the topic sheet:

1. **Country-only.** The topic exists under one country's law, such as an OSHA standard or a specific HSE regulation. One page, in that market only. No hreflang cluster.
2. **Same everywhere.** The safe practice doesn't depend on the law, such as how a lockout tag is worded or what a harness inspection looks for physically. One English page in the most relevant market, with no copies in other English markets. Other markets link to it. It gets a German or French version only when that version cites that country's own rules.
3. **Regional.** The duty, interval, record, competent-person rule or legal reference differs by country, such as scaffold inspection intervals or forklift licensing. A separate page per market, each built from that market's own law. The differences must be visible near the top of the page: a short "In [country]" line with the rule and its reference. Only these pages get hreflang clusters.

**Similarity backstop:** if two market versions of a regional topic still come out more than 80% similar, keep the one with the richer source material, don't make the other, and log the topic as mis-sorted.

**hreflang** links only regional equivalents, plus `x-default`. Every page in a cluster lists all the others. Noindexed and unreleased pages are never in a cluster.

---

## 5. The topic sheet is the guide queue

`docs/Safety_Blog_Topics.xlsx` (sheet "Blog Topics") lists 138 topics with real search keywords. Rows 1–3 are published. It is the single source of truth for guides. Make these changes, and keep the sheet opening cleanly.

**New columns.** Update the "How to Use" sheet to explain them.

| Column | Holds |
|---|---|
| `Topic type` | country-only, same everywhere or regional |
| `Markets` | which markets get a version |
| `Main page for keyword` | the URL that owns this search |
| `Overlaps` | other pages on the same subject |
| `Cluster volume`, `KD`, `Intent`, `Checked on` | keyword data from section 6 |
| `Keyword source` | OpenSEO, Search Console or topic sheet |
| `Go/no-go` | the result of the search-results check in section 6, with the reason |
| `Notes` | anything else |

**Statuses.** `topics.mjs` must skip every status except `Not started`: `Published`, `Dropped`, `Waiting: low demand`, `Waiting: high competition` and `Skipped: search results`. The weekly run rechecks both `Waiting` statuses each month and moves rows that now pass back to `Not started`.

**Rows to mark `Dropped`,** with the reason in Notes. They're thin lists, one-offs or searches for courses we don't sell:

- 18 (safety messages)
- 25 (Hoover Dam deaths)
- 28 (food handler certification online)
- 29 (slogans)
- 36 (100 toolbox talk topics)
- 45 (defensive driving courses online)
- 46 (OSHA certification online courses)
- 49 (50 safety tips)
- 83 (free first aid and CPR courses)
- 119 (safety awareness calendar)

**Translations follow the `Markets` column, not "every post".** Change `generate-post.mjs` to read it instead of always writing all three languages.

- Country-only US topics (for example rows 4, 5, 21, 55, 95, 96, 116, 129, 134, 136) get no French or German version.
- Regional topics get French and German versions built from that country's own rules and sources, as now.
- Same-everywhere topics get them only if a local regulator source exists to cite.

**One main page per search.** Many topics overlap with planned standard pages:

| Sheet row | Standard page |
|---|---|
| 6 | 1910.147 (lockout/tagout) |
| 22 | 1926.502 (harnesses) |
| 51 | 1910.1200 (HazCom) |
| 55 | 1910.1000 (exposure limits) |
| 69 and 111 | 1910.151 (first aid and eyewash) |
| 77 | 1926.501 (fall protection) |
| 85 | 1910.146 (confined spaces) |
| 86 | 1926.1053 (ladders) |
| 92 | 1910.178 (forklifts) |
| 96 | 1926 Subpart P (excavations) |
| 97 | 1926.451 (scaffolds) |
| 136 | 1910.1030 (bloodborne pathogens) |
| 137 | 1910.212 (machine guarding) |
| 134 | the yearly report |

For each overlap:

- The guide owns the sheet's primary keyword (the how-to search). The standard page owns the requirements and regulation-number searches ("OSHA scaffold requirements", "OSHA 1926.451").
- Their titles and opening sentences target those different searches, and they link to each other.
- Row 134 ("Most common OSHA violations") becomes the yearly report itself, not a separate post.
- Record every pairing in `Main page for keyword` and `Overlaps`.

**Special rows**

- **Food safety** (13, 56, 70, 78, 89, 94, 122) comes under the FDA Food Code and US health departments, not OSHA. Use FDA, USDA FSIS and CDC as sources, and treat these as US-only unless a market's own food regulator is used.
- **Row 138 (COR certification)** is a Canadian provincial programme. Write it for `/ca/` from Canadian sources, not for the US blog.
- **Rows whose rules may have changed** (for example row 88, OSHA heat rules): the writer states the rule's current status from the official source downloaded on the day of writing, never from memory.

**New topics** found later are appended as new rows with `Status: Not started` and `Notes: from Search Console` or `Notes: from OpenSEO`. They pass the same source, threshold and go/no-go rules before anything is written.

---

## 6. Keyword research and the go/no-go check

Every new page must have real search demand before it's written. Keyword data comes from my OpenSEO connector (MCP tools `mcp__OpenSEO__*`, project ID `002ad952-1f16-4c95-821e-83a08aec03b2`, default market US English).

**Setup**

- Check that OpenSEO shows as connected in `claude mcp list`.
- Keyword lookups run as their own step, in an interactive or headless session with only the `mcp__OpenSEO__*` tools allowed. Never inside a writing call.
- Save every result to `data/keywords/{market}/{date}.json`, so nothing is bought twice.

**If OpenSEO isn't connected,** log it and carry on like this:

- Topic sheet rows are written using the keywords already in the sheet, with `Keyword source: topic sheet`. The volume and KD thresholds are not applied to them. The go/no-go check still runs, using web search.
- Standard and industry pages are decided by the enforcement thresholds in section 7 alone, with titles from the fallback in section 8.
- No new topics are added or written until it's connected.

**Credits** (3,902 left on 12 November 2026)

- `get_keyword_metrics` is cheap: under 1 credit per keyword (125 keywords cost 32, and 20 cost 16). Use it for checking known keywords.
- `research_keywords` costs about 54 credits per seed. Use it only for finding new keywords around a topic, with category-level seeds, not one per page.
- Spend at most `keyword_credits_per_run` (default 1,500) per run, and never more than 2,000 in one batch.
- Stop buying data when the balance falls below `keyword_credit_floor` (default 500), and log it.
- Search Console queries are free. Once the site has impressions, use them first, and use OpenSEO only to fill gaps.

**Thresholds** (in config, per market and page type)

- **Guides:**
  - total monthly searches of the page's keyword cluster (its main keyword plus the related keywords it will answer): **500 or more** in the US;
  - keyword difficulty (KD) of the main keyword: **under 15** (14 or less), in every market;
  - a topic with KD of 15 or more waits, whatever its volume. Mark it `Waiting: high competition` with the KD. Fewer, easier pages are the goal; there's no volume exception.
- **Standard and industry pages:** the enforcement thresholds in section 7 decide whether a page exists. Bare regulation-number searches ("1926.501", "1910.147") are too small for keyword tools to measure, but plain-language versions are measurable: "osha scaffold requirements" has 480 searches a month at KD 14, and "osha ladder requirements" has 1,000 at KD 14. A 500 floor would remove almost all of these pages, which are the ones most useful to safety managers. So for these:
  - require a measurable cluster volume of **50 or more**;
  - the main keyword (the one the title targets) must have KD under 15. Choose it from the cluster's phrases. If every measurable phrase has KD of 15 or more, the page waits like a guide;
  - use the keyword data to choose the title wording, for example "OSHA scaffold requirements (29 CFR 1926.451)";
  - use it to set the queue order (section 11).
- **Other markets** have smaller search volumes. Start the guide floor at 150 (UK, Australia, Canada), 200 (Germany, France) and 50 (New Zealand), with the same KD-under-15 rule. Research in each market's own language and location:

  | Market | Location code |
  |---|---|
  | UK | 2826 |
  | Germany (German) | 2276 |
  | France (French) | 2250 |
  | Australia | 2036 |
  | Canada | 2124 |
  | New Zealand | 2554 |

  Log the threshold used for each market, and adjust them after the first month of real data.

**Finding more keywords from each search**

- Run `research_keywords` once for each topic sheet category (19 categories, about 1,000 credits).
- For standard pages, don't use `research_keywords`, since there are hundreds of them. Generate candidate phrases from each standard's title (for example "osha {name} requirements", "{name} checklist", "{name} inspection", "osha {number}") and score them in batches with `get_keyword_metrics`, at about 0.8 credits per phrase.
- Search-results checks through OpenSEO count against the same credit limits. Use web search for them when credits run low.
- Group the results by intent:
  - keywords a reader would expect one page to answer join that page's cluster and become its headings or FAQ;
  - a different intent becomes a new topic row in the sheet, never a second page for the same intent.
- **The topic sheet was already checked on 12 November 2026** (US, OpenSEO, 125 unpublished rows, not counting the 10 dropped). Don't buy this data again; fill the keyword columns from it, then build each row's cluster.
  - 83 rows have KD under 15. All of them have 1,000 or more searches a month for the primary keyword alone. These stay `Not started`.
  - These 42 rows have KD of 15 or more and get `Waiting: high competition`, with their KD in Notes:
    - occupational health and safety (73)
    - cor certification (68)
    - ergonomics (56)
    - electrical safety (51)
    - osha standards (51)
    - workplace violence (51)
    - evacuation plan (48)
    - psychological safety (47)
    - osha violations (45)
    - fall protection (42)
    - electrical fire (41)
    - osha inspection (41)
    - hazards (38)
    - injury prevention (37)
    - what is food safety (35)
    - osha heat regulations (34)
    - in the line of fire (32)
    - safety training (32)
    - what is safeguards (30)
    - environmental hazards (29)
    - osha 30 (29)
    - certified safety professional (28)
    - toxic substances control act (27)
    - iso 45001 (26)
    - radiation protection (25)
    - what does osha stand for (25)
    - crane operator training (24)
    - foodborne illness prevention (23)
    - safety culture (23)
    - first aid kit items (22)
    - definition of first aid (21)
    - safety precautions (21)
    - fire prevention tips (20)
    - kitchen safety (20)
    - respirator (20)
    - risk matrix (20)
    - fire safety training (19)
    - how to use an aed (18)
    - construction safety (17)
    - material safety data sheet (17)
    - carbon monoxide detector replacement (15)
    - ladder safety (15)
  - Before marking a row as waiting, check its cluster for a related phrase with the same intent and KD under 15 (for example a "checklist" or "requirements" variant). If one exists with enough volume, retarget the row's main keyword to it and keep it `Not started`. Log each retarget.
  - **Row 134 ("osha violations")** stays the yearly report (section 7g). The data pages (reports and the penalties page) are not KD-gated.
  - **Row 77 ("fall protection", KD 42):** the 1926.501 standard page covers that subject.
  - Several passing keywords are shopping searches (for example safety glasses, cut rated gloves, safety shoes, hearing protection earmuffs, spill kit, full body safety harness). The go/no-go check will skip them if page one is mostly shops.
- Mark rows below the threshold `Waiting: low demand` instead of deleting them, so they can be rechecked later.

**Go/no-go check on the search results page** (before writing any guide)

Look at the top 10 results for the main keyword (OpenSEO SERP tools if available, otherwise web search) and record the dominant format: guides, lists, tools, videos, product pages, forums or official pages.

- **Write it** if page one is mostly guides, checklists or reference pages that we can beat with clause references, checklists and downloads.
- **Skip it** if 6 or more of the top 10 are videos, or product or shop pages.
- **Skip it** if an official government page in the top 3 already gives a step-by-step answer or a ready-to-use checklist for that exact question. An official page that only states the rule, or the regulation text itself, is not a full answer. A regulator simply appearing on page one is never a reason to skip.
- If 6 or more of the top 10 are tools (calculators, generators), log it as a possible tool page and don't write an article.

Record the result and the reason in the `Go/no-go` column. Skipped topics get `Status: Skipped: search results`.

---

## 7. What the site contains

### 7a. Guides (every market)

- Only topics where the reader has to act: an inspection, a daily check, a plan, a permit or a test.
- Each guide covers what the law requires (with clause references), who does it and how often, what to check step by step, what to do when something fails, records to keep, and a downloadable checklist where one fits.
- Allowed sources are the regulation text, regulators' own guidance pages and manufacturers' published spec sheets. Drop any topic whose main source is paywalled, and log it.
- The US list is the topic sheet. For other markets, build the topic list from that market's regulator guidance and add the topics to the sheet. Make a guide only if the market has enough source material for it to stand alone.

### 7b. US standard pages

URL: `/us/standards/{section-slug}/`, for example `/us/standards/1926-501-fall-protection/`.

A standard page contains, in this order:

1. The opening answer sentence (section 12).
2. **The enforcement picture,** over the last 5 complete fiscal years:
   - the most-cited paragraphs;
   - citations per year;
   - penalties: the median and typical range of initial penalties, and the share classed serious, willful or repeat. Say that penalties can be reduced on settlement;
   - the top industries cited.
3. What the standard requires, in plain language, from the eCFR text, with a clause reference on every requirement.
4. The checklist. Each item maps to a specific paragraph and has a "what to look for" line. Tick boxes work on the page (client-side only), it prints cleanly, and it downloads as PDF and Excel.
5. The current maximum penalty amounts (see 7d).
6. Related standards, industries and guides (section 8).
7. Sources, the data-as-of date, the not-legal-advice note and any required attribution.

An FAQ only goes on a page if it answers something the body doesn't.

### 7c. US industry pages

URL: `/us/industries/{naics-slug}/`.

An industry page contains the industry's most-cited standards (ranked, with counts), the most-cited paragraphs, penalty patterns and links to each standard page.

No standard × industry combination pages.

### 7d. OSHA penalties page

- Keep the current maximum penalty amounts from OSHA's penalties page in one config file, with their effective date. Every standard page reads from it.
- Make one page for them, `/us/osha-penalties/`, updated in place every January. Don't make a new URL each year. Show the year in the title and the date updated on the page.

### 7e. Thresholds for 7b and 7c (applied automatically)

- **Standard page:** at least 30 citations nationally in the last 5 fiscal years, the standard's text available on eCFR, and the keyword rule in section 6.
- **Industry page:** a 4-digit NAICS code with at least 200 inspections, and at least 10 distinct standards cited 5 or more times each.
- Below the threshold, no page. Never pad.
- Write the distribution to `PROGRESS.md` (how many pages pass at each threshold) for the record.

### 7f. Markets without enforcement data

Checklist pages built from the rules alone, through the same writing and checking engine. If HSE notice data is allowed (section 4), the UK gets enforcement-based pages like 7b.

### 7g. Yearly data report (the link-earning page)

Mass-produced pages with no links pointing to them tend not to rank. The site needs a page that other sites will want to cite.

- Build `/us/reports/most-cited-osha-standards-{year}/`, one URL per year, from the DOL data already fetched:
  - the most-cited standards and paragraphs;
  - trends against previous years;
  - penalties by industry;
  - the most-cited standards per industry.
- Open with a one-sentence summary that can be quoted on its own. Then charts, rendered as static SVG in the HTML, not client-side only. Then the method, data source, sample size and update date.
- Offer the report's data tables as CSV and Excel downloads.
- This page is topic sheet row 134.
- Do the same for the UK if HSE notice data is in use.
- List in `PROGRESS.md` the kinds of sites that would cite the report (trade publications, safety blogs and associations), so I can contact them myself if I choose.

### 7h. Workplace injury statistics page

Build `/us/reports/workplace-injury-statistics-{year}/` from public Bureau of Labor Statistics data: the Survey of Occupational Injuries and Illnesses and the Census of Fatal Occupational Injuries.

Same format as the yearly report: a quotable one-line summary, static SVG charts by industry, event type and year, the method, sources, data year and update date, and CSV and Excel downloads of the tables. Check the BLS release schedule, and rebuild when new data comes out.

---

## 8. Titles, hubs and internal links

**Titles use the words people search for,** not house style: "OSHA fall protection checklist (29 CFR 1926.501)", not "Fall Protection Overview". Pick each title from the keyword data in section 6 and log the source. If there's no keyword data, use the regulation's common name plus "checklist", "inspection" or "requirements".

**Every group of pages has a hub.** Each market has hub pages (`/us/standards/`, `/us/industries/`, `/us/guides/`, `/uk/guides/` and so on) with a table linking every live page in the group, grouped by topic. The US guides hub lists the `/blog/` guides. No page is released without a hub that links to it.

**Internal links are generated from data at build time,** not written by hand, so they stay complete as pages are released.

- **In-body links:** when a page mentions a clause or standard that has its own live page in the same market (such as "1926.451(f)(3)"), the first mention links to that page. When a page mentions a topic that has a live guide, the first mention links to the guide. Each target gets at most one in-body link per page.
- **Guides ↔ standard pages:** every guide links to the standard pages for the clauses it cites. Every standard page links back in a "Guides using this standard" block.
- **Standard ↔ industry pages:** each standard page lists the top industries cited for it, linked. Each industry page lists its most-cited standards, linked.
- **Related pages:** each page has a "Related" block of 3–6 links in the same market, picked by shared clauses, shared industries and topic. Never random, never site-wide.
- **Hubs and breadcrumbs:** every page is linked from its hub and has a breadcrumb trail (Home → market → hub → page).
- **The reports** link to every standard and industry page they mention, and each of those pages links back. The yearly report and the injury statistics page are also linked from the US home page and both US hubs.
- **Cross-market links:** a page links only within its own market, with two exceptions: hreflang equivalents (which aren't visible links), and same-everywhere topics, which other markets link to directly.
- **Anchor text** names the target ("forklift daily check", "OSHA 1926.501 fall protection"), never "click here" or "read more". It varies naturally and never uses the exact same phrase on every page.
- **Only live targets.** Never link to noindexed, unreleased or redirected URLs. Because links are generated at build time, a link to a page appears by itself in the first build after that page is released.
- **Minimum links:** every page has at least 3 contextual internal links, not counting navigation, footer and breadcrumbs. A page with fewer than 3 eligible live targets passes if it links to its hub and to every eligible target that exists. Log these pages; they'll pick up links as later waves go live.
- Every indexable page is within 3 clicks of home.
- Download files and the app button don't count as internal links. Downloads carry the page URL in the footer only.

---

## 9. Cover images

Use the existing `scripts/lib/cover.mjs` (Gemini on Vertex AI, key `GOOGLE_CLOUD_API_KEY`, already in GitHub secrets) for every page type: guides, standard pages, industry pages, the reports and the penalties page. No Unsplash or other stock photos. Write one shared image helper; don't copy the cover code.

**Same rules as the current guide covers**

- a realistic photo of the scene;
- no text, labels, numbers or logos;
- equipment shown being used correctly;
- alt text in the page's language;
- the IPTC `trainedAlgorithmicMedia` label;
- a 1200×630 crop for the social card and the structured data image;
- compressed WebP with a descriptive file name.

**One image per subject, reused**

- Each standard page gets one image of the work it covers (for example scaffolding for 1926.451).
- Each industry page gets one image of that kind of worksite.
- French and German versions reuse the English image with their own alt text.
- Pages on the same subject share one image file.
- The reports and the penalties page get a neutral scene image. Charts stay static SVG, never generated images.

**When it runs.** The writing runs on my computer, and the Gemini key is a GitHub secret. So images are generated in GitHub Actions:

- the weekly workflow (section 14) runs `npm run cover` for every released or about-to-release page that has no image yet, then commits the images;
- pages must build and look right without an image until theirs exists;
- if `GOOGLE_CLOUD_API_KEY` is also in my local `.env`, the local run can generate images too.

**Cost.** Cap each run at `max_images_per_run` (default 150), so a large wave can't run up the Gemini bill in one go. The rest follow in the next run. Log the number generated per run.

---

## 10. Downloads (PDF and Excel)

The generator is `scripts/downloads/build_checklist.py`, with a sample input at `scripts/downloads/samples/us-forklift-daily-check.json`. If you find them in `pipeline/downloads/` instead, move them to `scripts/downloads/` and log it. It's already built and tested, so it stays in Python, and Node calls it as a command. It makes a branded, print-ready PDF and a formatted Excel workbook (Status drop-down, defect highlighting, live summary, "Safe to operate?" result, print setup). Keep its look. Change these things:

1. **Translated template text:** move every fixed string (headings, column labels, OK / Defect / N/A, the summary and formula text, footer) to a strings file per language (`en`, `de`, `fr`). Write the German and French yourself, in natural workplace language for that country. The Excel drop-down values and formulas must use the same words.
2. **Page URL in the footer:** add `page_url` to the JSON and print it in the PDF and Excel footers. It's always a safetyindex.blog URL.
3. **Paper size:** Letter for the US and Canada, A4 for everyone else. The `paper` field already does this.
4. **Build step:** one JSON per checklist, output to `public/downloads/{market}/{slug}.pdf` and `.xlsx`. Rebuild only when the JSON's content hash changes.
5. **Checks:** every PDF opens with the expected page count, and every Excel file opens with zero formula errors (LibreOffice headless recalculation). Each batch, render 5 random PDFs to PNG and look at them yourself for layout problems.
6. **One source:** the on-page checklist and the download come from the same JSON. They must never drift apart.

---

## 11. The writing engine: headless Claude Code CLI

All content is written by Claude Code running headless (`claude -p`), driven by a Node orchestrator built into the existing pipeline (section 3).

**The queue**

One job per page that passes its thresholds, in this order, so the most valuable pages exist first if usage limits stop the run:

1. US standard pages, highest keyword cluster volume first, with citation count breaking ties. After every 5 standard pages, one guide from the topic sheet, in sheet order. That way both layers grow together.
2. US industry pages, by inspection count.
3. Any US guides still left in the sheet.
4. Guides for the UK, Australia, Canada and New Zealand.
5. German and French guides and rule-based checklists, including rewrites of the noindexed ones (section 18, step 2).
6. UK enforcement pages, if the HSE data is allowed.

"The top 50 US standard pages" anywhere in this brief means the first 50 in this order.

**Each job**

- Writes a prompt bundle to `data/jobs/{market}/{slug}/`: the writing instructions, that page's source text and stats JSON, the output JSON schema and the style rules.
- **Source search (guides only):** the existing pipeline finds sources with the API's server-side web search, which the CLI backend doesn't have. In CLI mode, run the search step as its own headless call with only the `WebSearch` tool allowed (no fetching, no file tools). It returns candidate official URLs as JSON. The existing `sources.mjs` then downloads them under its official-domain allowlist, as now. Standard, industry and report pages need no search, because their sources (eCFR, DOL, BLS) are fetched by script.
- **Writing:** calls the CLI headless with JSON output and with tools turned off, so the session can only read the prompt and return JSON. Check `claude --help` for the current flags for headless mode, JSON output, model choice and allowed or disallowed tools. Pipe the prompt through stdin.
- Validates the returned JSON against the schema. If validation fails, retries once with the error message included.

**Independent checking pass**

A second, separate `claude -p` call gets only the source material and the draft, never the writing instructions. It returns a JSON list of problems: claims not supported by the source, wrong clause references, numbers not in the data, missing steps a reader would need, and anything unsafe or misleading.

- If there are problems, rewrite once with that list, then check again.
- If it still fails, drop the page and log why. Never release a page that failed its check.

Then the checks from section 17 run.

**Hard rules for every page**

1. Make a page only when it has enough data of its own.
2. Every clause number in the output is checked against the official source text for that market. One unknown reference fails the page.
3. Every number in the prose must appear in that page's stats JSON or source text. Put every figure the template uses, such as the number of fiscal years covered, into the stats JSON so it passes this rule. The check ignores only these: list and step numbering, dates, clause references (checked under rule 2), and the numbers one to ten written as words.
4. If more than 10% of a template's pages in one batch get dropped, pause that template, fix the prompt or template, and rerun the batch.

**Running it**

- **Resumable:** job state is stored in `data/jobs/state.jsonl`. If the run stops (usage limit, crash, closed terminal), running it again carries on where it left off and never redoes finished jobs.
- **Usage limits:** when the CLI reports a usage or rate limit, wait and retry with backoff, up to 60 minutes between tries, logging each wait. Don't fail the run.
- **Parallel workers:** `workers` in config (default 3). The model is set by `writer_model`.
- **Output:** completed page content is saved in the existing content collections (`src/content/...`, with new collections for standard and industry pages) and committed. The Astro build reads only those files, so rebuilds never call Claude again.
- **Swappable writer:** the same prompts and schema work with `WRITER=api`.
- **Test first:** build and test the orchestrator on 10 pages across page types, and look at them yourself. Then give me the exact command to start the full run in a separate terminal (with `nohup` or `tmux`), plus the command to see progress. I'll leave it running.

---

## 12. Writing style rules

These go in the writing prompts and are enforced by checks. A banned-word list alone catches only a small share of AI-sounding writing; most of it comes from sentence shapes. So the checks look for patterns, not just words.

**Answer-first.** Every page opens with one sentence that answers the page's main question. Every section opens with a sentence that answers its own heading and names its subject, so it still makes sense if quoted on its own.

**Guides must answer their title.**

**Specifics or cut.** If a sentence has no specific detail (a clause, a number, an interval, a named item), cut it.

**Sentence patterns to flag and fix** (`scripts/style/patterns.mjs`)

- three items where two would do;
- "not X but Y" contrasts against a claim nobody made;
- bold labels on list items that repeat what the sentence says;
- one-line closers and verbless fragments;
- sentences ending in an "-ing" comment tail ("…, highlighting the importance of safety");
- inflated significance ("plays a pivotal role");
- sales words with no fact behind them;
- arguing against objections nobody raised;
- self-answered questions;
- generic openers and closers;
- chatbot leftovers ("I hope this helps", "[Your Name]").

Use the script for the patterns a script can catch reliably: bold labels, "-ing" tails, fragments and leftovers. The checking pass judges the rest, such as triads and significance claims.

**Test the rules before trusting them.** Run every scripted pattern over a sample of human-written safety guidance published before 2022, for example older HSE and OSHA pages. Any rule that flags good human writing becomes a judgment call for the checking pass, not an automatic fix.

**Banned phrases** (`scripts/style/banned-phrases.txt`): "delve", "tapestry", "meticulous", "In today's fast-paced", "It's important to note", "Moreover", "Furthermore", "In conclusion", "navigate the complexities", "comprehensive guide". Keep the list short and don't rely on it.

**Repetition**

- No 4-word phrase appears more than twice in a page's prose. This check covers body paragraphs only. It leaves out checklist items and their "what to look for" labels, tables, headings, clause references, the names of regulations and regulators, and shared template blocks (disclaimer, data-as-of line, attribution, related links).
- FAQ answers must not repeat the body. Over 0.8 similarity fails.

**Fact rule for every rewrite.** A fix may use only facts already in the draft or its source material. If a fix would need a new name, number or date, cut the phrase instead. After each rewrite, compare every changed line with the original and undo any change that adds a claim.

---

## 13. Technical setup

- Keep the static Astro site on Cloudflare.
- **Sitemaps:** one per market and section (for example `us-standards.xml`, `us-guides.xml`), split at 10,000 URLs each, with a sitemap index listed in robots.txt. List only live, indexable pages whose canonical points to themselves. `lastmod` is the date of the page's last upgrade or rewrite (section 16), or its release date if it has had none.
- **URLs:** lowercase only. Any URL with capital letters 301-redirects to its lowercase form. Build canonicals and hreflang from the stored lowercase slug.
- **Missing pages:** an unknown URL returns a real 404 page, never a redirect to the home page and never a 200. Retired content with no replacement returns 410. Moved content 301-redirects to its closest equivalent.
- **Speed and mobile:** the weekly workflow and the final build run Lighthouse (mobile) on a sample of 10 pages across page types. Each page runs 3 times, and the median score counts, because single Lighthouse runs vary. It fails if the median performance is under 80, accessibility is under 95, or any page isn't mobile-friendly. Performance from 80 to 89 is logged as a warning to fix.
- **Page size:** Googlebot stops reading a page after 2 MB, so keep every page's HTML under 1 MB. Use linked stylesheets, not large inline CSS, and serve SVGs over 20 KB as image files. The H1 must sit in the first 100 KB of HTML.
- **Structured data:** `BreadcrumbList` everywhere, the existing `BlogPosting` on guides, and `WebPage` on standard, industry, report and penalty pages. Generate all JSON-LD with a JSON encoder, never string templates, and validate it at build time. The markup must match what the page shows (title, dates). Don't add markup chasing rich results: Google has none for checklists, and HowTo results are retired.
- **AI crawlers** should be allowed. Fix what you can in the repo's robots.txt, and list in `PROGRESS.md` the Cloudflare dashboard settings I need to check (Security → Bots / AI Crawl Control). Cloudflare's 2026 defaults can block AI and multi-purpose crawlers at the edge.
- **`llms.txt`:** extend the existing file with the market hubs, the reports and the top standard pages, one line each. Its effect is unproven, so do it last.
- **IndexNow:** ping new and changed URLs after each deploy. It's used by Bing and others, not Google.
- **Hosting limits:** check the final page and file count against Cloudflare's static asset limits, and log a warning if we're close.

---

## 14. Release schedule

Generating content and releasing it are separate steps. Each page gets a `release_date`, and the build only includes pages whose `release_date` has passed. Sitemaps, hubs, internal links and IndexNow follow the same rule.

- `release_per_week` (default 75; 0 means release everything at once).
- `first_wave`: the top 50 US standard pages, the yearly report, the injury statistics page, the penalties page and the hubs.
- **Pages already live before this build stay live.** Their `release_date` is their original publish date. If one fails a new check from section 17, the check reports it as a warning (not a build failure), and the page joins the rewrite queue. It's only ever taken down through the noindex rules in step 2 of section 18 or the zero-impression rule in section 16.

**Impressions gate.** New pages need time to be crawled, and Search Console data runs 2–3 days behind, so the gate never judges a wave that has just gone out.

- Each week, take the most recent wave that was released at least `release_gate_min_age_days` (default 21) before the last day covered by the latest Search Console data in `data/gsc/`.
- Release the next wave only if at least `release_gate_min_share` (default 0.6) of that wave's URLs show impressions. A page missing from the page rows has zero impressions.
- If the gate fails, hold the wave, and log the share reached and the date of the data used.
- If no wave is old enough yet, or there's no Search Console data, release the wave and log that the gate was skipped.

**Indexing gate.** If more than 30% of a wave isn't indexed 4 weeks after release (from URL Inspection, section 16), hold the next wave and improve the template first. This is in addition to the impressions gate.

**Weekly reading list.** Each weekly run picks 5 random pages from the wave just released and lists their URLs in `PROGRESS.md` under the heading "Pages for Paul to read this week", with the date. This is a list only; nothing waits on it.

**The weekly GitHub Actions workflow** replaces `publish-post.yml`'s schedule. It only takes effect once I've merged `build-out`. Each week it:

1. pulls Search Console data (section 16);
2. runs the two gates and sets which wave is live;
3. generates missing cover images, up to the cap (section 9);
4. builds the site and runs every check, including Lighthouse;
5. deploys;
6. pings IndexNow.

It needs these secrets from me: the deploy hook URL or Cloudflare token, and the Search Console service account JSON. List them in `PROGRESS.md`.

---

## 15. App button and tracking

The apps aren't live yet.

- One button, only on pages that have a checklist. No pop-ups, banners or interstitials.
- All store details live in config as clear placeholders:
  - `android_package: "PLACEHOLDER_ANDROID_PACKAGE"`
  - `ios_app_id: "PLACEHOLDER_IOS_APP_ID"`
  - `ios_provider_token: "PLACEHOLDER_PROVIDER_TOKEN"`
  - `apps_live: false`
- **While `apps_live` is false:** show a plain, non-clickable note in the site's own style: "Coming soon on Android and iOS." Don't use or alter the official Google Play or App Store badges at this stage, since their brand rules don't allow modified badges.
- **When I set the real IDs and `apps_live: true`,** the same component switches to live links with the official, unmodified store badges, with no other code changes.
- **Live link formats** (built from config):
  - Google Play: `https://play.google.com/store/apps/details?id={PACKAGE}&referrer={url-encoded: utm_source=safetyindex&utm_medium=checklist&utm_campaign={market}&utm_content={checklist_id}}`
  - App Store: `https://apps.apple.com/app/id{APP_ID}?pt={PROVIDER_TOKEN}&ct={market}-{checklist_id}&mt=8`
- Device detection runs client-side: Android goes to Google Play, iPhone and iPad to the App Store, and desktop shows both badges plus a QR code. The QR code points to a safetyindex.blog redirect page (`/get-app/?c={checklist_id}`), never conform.so.
- `app_markets` controls where the button shows. German and French pages stay off until the app is localised.

**Tracking.** Find out what analytics the site uses. If it can't record custom events, add a minimal, cookie-free, self-hostable or Cloudflare-native option, and log what you chose. Track, per market:

- checklist downloads (PDF and Excel separately);
- app button taps;
- outbound store clicks.

---

## 16. Search Console loop and maintenance

Source: github.com/pauljomy/gsc-seo-autopilot (MIT, a Claude Code skill). Use its analysis rules; don't use its writing.

**Setup**

- Copy the skill into this repo at `.claude/skills/gsc-seo-autopilot/` for interactive use, with two fixes:
  1. read `seo-config.yaml` from that project folder instead of `~/.claude/skills/...`;
  2. in `cmd-publish.md`, change the broken `commands/brief.md` reference to `references/cmd-brief.md`.
- Set `app_url: ""` and list the market hubs as `internal_link_targets`.
- **Never run its `auto` or `publish` commands on this site.** They write long posts from web search results, with keyword padding and stock photos, which skips our source rules, checks and release schedule. Add a note at the top of the copied `SKILL.md` saying so.
- **Access:** a Google Cloud service account with read access to the Search Console property (the skill's README explains it). The JSON key path goes in `.env` as `GSC_CREDENTIALS`, and the property as `GSC_PROPERTY`. If either is missing, log it and fall back to manual exports in `data/gsc/`. Don't stop for this.

**Weekly data pull** (`scripts/gsc/pull.mjs`, a direct Search Console API client, no LLM)

- The last 28 days and the 28 days before: query, page, query+page and page+country rows. Save them as CSV in `data/gsc/{date}/` (git-ignored if large; keep the summary).
- URL Inspection API for pages released in the last 30 days, within the daily quota. Record whether each is indexed, and the canonical Google chose.
- The gates in section 14 and the zero-impression rule below read this data.

**Weekly improve loop** (`scripts/gsc/improve.mjs`, using the writing engine with all its checks). At most 20 page changes per week, so the effect of each can be measured.

1. **High impressions, low CTR** (over 100 impressions, CTR under 3%, average position 10 or better): rewrite the title and description under the fact rule in section 12. Log the old and new versions. After 28 days, compare CTR, and restore the old version if it's lower.
2. **Positions 5–20** (over 50 impressions): make sure the market's top-clicked pages link to the page, within the linking rules. If the queries show a sub-question the page doesn't answer and the source material covers it, add a section. Otherwise change nothing.
3. **Two of our pages for one search:** follow the `Main page for keyword` column, and make the other page's title and opening target its own search. If the two really are the same intent, merge them and 301 the weaker one.
4. **Wrong country:** a `/uk/`, `/au/`, `/ca/`, `/nz/`, French or German page getting most of its impressions from another country. Check that the page's local rule and reference are visible near the top and that hreflang is right. If the topic is really the same everywhere, re-sort it in the sheet and canonicalise it to the main version.
5. **Searches with impressions but no matching page:** append them to the topic sheet (section 5).
6. **Pages Google crawled but didn't index:** log them. The indexing gate in section 14 uses this.

**Change size and dates.** Every change, from the improve loop or any later edit, is logged with its size, measured as the share of the page's main-content words that changed:

- **optimisation:** links, title, description, images, or under 15% of the text;
- **upgrade:** 15–70% of the main content;
- **rewrite:** over 70%.

Only upgrades and rewrites change the page's visible "updated" date, its `dateModified` and the sitemap `lastmod`.

**Rule changes.** Each week, check eCFR (and each market's legislation source) for amendments to every regulation a page cites. When one changes, recheck every affected page and download against the new text with the checking pass, update or flag them, and log what changed.

**Zero-impression pages** (`scripts/maintenance/impressions.mjs`). When a page has had zero impressions for 3 months after its release date, choose one action, in this order:

1. **Merge:** if another page covers the same or a close intent, merge the useful parts into it and 301 the old URL.
2. **Noindex:** otherwise, noindex it and take it out of the sitemap. A page people use (downloads, internal visits) stays live, just hidden from Google.
3. **Delete (410):** only for a page with no downloads, no internal visits and no merge target.

**Quarterly audit.** Every quarter, write `data/audit/{date}.csv` listing every URL with:

- impressions, clicks, downloads and app-button taps;
- the topic type, the date of its last upgrade or rewrite, and whether its sources have changed;
- the action decided: keep, update, rewrite, merge or noindex.

Act on the top 20 update and rewrite candidates through the improve loop, and log a summary.

**Weekly report.** Add a dated section to `PROGRESS.md` for each market, using the skill's weekly-report structure:

- clicks, impressions, CTR and position against the previous 28 days;
- top queries and pages;
- biggest gains and drops;
- what the improve loop changed;
- pages indexed against pages released.

**AI answer tracking.** Write a fixed list of 20 buyer questions per market (for example "what does OSHA require for scaffold inspections"). Add `scripts/maintenance/ai-answers.mjs`, which records whether AI answers name or link safetyindex.blog when run with the tools available. Note in `PROGRESS.md` how I can run it monthly.

**Where it runs**

- The data pull, gates, build and deploy run in the weekly GitHub Actions workflow (section 14).
- The improve loop needs the Claude CLI, so it runs on my computer. Add `npm run weekly` (pull + improve + report), and log the `crontab` line I should add for a weekly run.
- **New writing after the first run.** The old Action that wrote posts is switched off, so `npm run weekly` also writes up to `weekly_new_pages` (default 10) new pages from the queue: topics added by Search Console or OpenSEO, `Waiting` rows that now pass, and rewrite-queue pages. They go through the same source, keyword, go/no-go, checking-pass and release rules.
- **Where the changes go:** `npm run weekly` works on a branch named `weekly-improve`.
  - It first rebases on the latest main, since the weekly Action commits cover images there.
  - Then it runs the full build and every check.
  - If `improve_auto_push` is true (the default) and everything passes, it merges into main and pushes, and the next weekly Action deploys it.
  - If anything fails, or `improve_auto_push` is false, it leaves the changes on the branch and logs what's waiting.

---

## 17. Quality checks (the build fails on any of these)

**Rules and sources**

- `conform.so` appears anywhere in `dist/` or in a download.
- A page is missing its data-as-of date or the not-legal-advice note.
- A clause reference isn't in the source text, or a number in the prose isn't in the page's data (with the exemptions in section 11).
- A page failed its independent checking pass.
- A German or French page cites only US or UK sources.
- A "reviewed by", author credential or reviewer name appears anywhere.
- A required licence attribution line is missing.

**Writing**

- A banned phrase is used, a 4-word phrase repeats more than twice in the prose (with the exemptions in section 12), or an FAQ repeats the body.
- A scripted writing pattern from section 12 is still present, or a rewrite added a fact that isn't in the source.
- A page or section doesn't open with an answer sentence.
- A page has empty sections, placeholder text, "TODO", "lorem" or leftover prompt text. The `PLACEHOLDER_*` store values are allowed only in config and only while `apps_live` is false.
- A guide is under 1,200 words.

**Topics and keywords**

- A topic has no type recorded, or a non-regional topic has copies in more than one English market.
- Two market versions of a topic are more than 80% similar.
- A guide written in this build has no recorded keyword source and go/no-go result. If its keyword source is OpenSEO or Search Console, it must also have a cluster volume and KD that meet its market's threshold. Guides published before this build started are exempt, and so are guides with `Keyword source: topic sheet` written while OpenSEO wasn't connected.

**Links and structure**

- A page has no hub linking to it, an indexable page is more than 3 clicks from home, or an orphan page exists.
- An internal link is broken, or points to a noindexed, unreleased, redirected or missing URL.
- A clause or standard with its own live page is mentioned on another page in the same market without a link.
- A guide doesn't link to the live standard pages for the clauses it cites, or a standard page doesn't link back.
- A page has fewer than 3 contextual internal links, unless it meets the exception in section 8.
- hreflang isn't reciprocal, lacks `x-default`, or points at a noindexed or unreleased page.

**Technical**

- A sitemap lists a redirect, a 404, a noindexed or unreleased page, or a page whose canonical points elsewhere.
- Any URL contains capital letters, or an unknown URL returns anything other than 404.
- A page's HTML is over 1 MB, or its H1 isn't in the first 100 KB.
- JSON-LD fails to parse or doesn't match the page.
- A Lighthouse sample page's median score is under 80 for performance or 95 for accessibility.

**Pages published before this build** report new-check failures as warnings and go to the rewrite queue, as described in section 14. Every other page fails the build.

**Downloads and images**

- A download fails to open, has a formula error or doesn't match its page's checklist.
- A page that has an image is missing its alt text, 1200×630 crop or IPTC label, or an image comes from outside the repo.

---

## 18. Order of work (run straight through)

1. **Audit.** Read the repo and write the findings to `PROGRESS.md`, then keep going:
   - how the site is built: Astro version, content collections, routes, layouts and the current guide pipeline;
   - every existing guide by market and language, flagging any French or German guide whose main sources are US or which reads like translated US content, and any guide that doesn't answer the question in its title;
   - what's already in place from sections 13–15;
   - the live robots.txt (`curl https://safetyindex.blog/robots.txt`), since Cloudflare can add its own AI-crawler rules ahead of ours at the edge;
   - every place `conform.so` appears in the repo or in `dist/`;
   - how the site deploys: Cloudflare Pages git integration, Workers or something else.

   Then turn off the old publish schedule, update `CLAUDE.md` (section 3) and update the topic sheet (section 5).
2. **Fixes to the existing site.**
   - About page and footer: replace "independent" with "Made by the team behind the Conform app." Name only, no link. "Independent" currently appears in the site description in `src/config/site.mjs`; search the whole repo, including the French and German strings in `src/i18n/`, for other copies.
   - French and German guides whose **main** sources are from another country, or which are translations of US content: set to `noindex` and take them out of the sitemap and hreflang. The writing engine rewrites them later from their own country's sources. Don't noindex a post just because it mentions OSHA: the existing posts cite DGUV, BAuA, INRS and Légifrance and have clearly labelled US comparison sections, which is fine. Log each decision.
   - Add the style rules and checks (sections 12 and 17).
   - Existing English guides that don't answer their title are rewritten through the writing engine once it exists (step 4).
3. **US data and keywords.** Data fetchers and processed page inputs for the US (DOL and eCFR). Apply the thresholds. Then run keyword research (section 6): re-check the topic sheet and build keyword clusters for the standard pages, within the credit limits.
4. **The engine.** Orchestrator, writing engine, checking pass and download changes. Test on 10 pages, then give me the full-run command.
5. **Full run,** in the queue order in section 11. Fetchers for each other market are written before that market's turn in the queue.
6. **Data pages and hubs.** The yearly US report, the injury statistics page, the OSHA penalties page and all market hubs.
7. **Release and technical setup.** Release schedule, sitemaps, IndexNow, the weekly workflow, the app button, analytics events and `llms.txt`. Then the final full build with all checks green.
8. **Search Console loop** (section 16): data pull, improve loop, maintenance scripts, weekly report, AI answer tracking and `npm run weekly`.
9. **Final `PROGRESS.md` summary:** page counts by market and type, pages dropped and why, and what I need to do.

---

## 19. Stop and ask me only if

- `DOL_API_KEY` is missing from `.env` (I'll get one free at dataportal.dol.gov).
- `build_checklist.py` isn't in the repo, in either `scripts/downloads/` or `pipeline/downloads/`.
- A step needs a secret or account I haven't provided and has no fallback in this brief. A missing deploy secret doesn't stop the build: finish everything else and list it.
- Something would require breaking a rule in section 1.

Don't stop for a missing Search Console service account or a disconnected OpenSEO; sections 16 and 6 say what to do. For anything else, make the sensible choice, log it in `PROGRESS.md` and keep going.

---

## 20. Config settings

All in `scripts/config.yml` (section 2).

| Setting | Default | Section |
|---|---|---|
| `writer` (also the `WRITER` env variable) | `cli` | 3, 11 |
| `writer_model` | the CLI's default | 11 |
| `workers` | 3 | 11 |
| `keyword_credits_per_run` | 1500 | 6 |
| `keyword_credit_floor` | 500 | 6 |
| Guide thresholds per market (cluster volume, KD under) | US 500 / 15; UK, AU, CA 150 / 15; DE, FR 200 / 15; NZ 50 / 15 | 6 |
| Standard and industry page main keyword KD under | 15 | 6 |
| Standard and industry page cluster volume | 50 | 6 |
| Standard page citation floor | 30 in 5 fiscal years | 7 |
| Industry page floors | 200 inspections; 10 standards cited 5+ times | 7 |
| `max_images_per_run` | 150 | 9 |
| `release_per_week` | 75 | 14 |
| `first_wave` | see section 14 | 14 |
| `release_gate_min_share` | 0.6 | 14 |
| `release_gate_min_age_days` | 21 | 14 |
| `improve_max_changes_per_week` | 20 | 16 |
| `improve_auto_push` | true (only after the build and all checks pass) | 16 |
| `weekly_new_pages` | 10 | 16 |
| `android_package`, `ios_app_id`, `ios_provider_token` | placeholders | 15 |
| `apps_live` | false | 15 |
| `app_markets` | all except German and French | 15 |
| OSHA maximum penalty amounts and effective date | from OSHA's penalties page | 7 |
