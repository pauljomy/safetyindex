# Safety Index

A static workplace safety blog on [Astro](https://astro.build) with the [astro-micro](https://github.com/trevortylerlee/astro-micro) theme. New guides are researched and written by Claude Sonnet 5.5 from primary sources and published automatically, one topic at a time, at random 24–36 hour intervals, in English, French and German. Each post has one featured image (an AI-generated photograph); there are no other images.

```bash
npm install
npm run dev            # http://localhost:4321 (search works only after a build)
npm run build          # astro build → Pagefind → SEO/hreflang/schema/link checks
npm run preview        # serve dist/
npm run post           # publish one post if one is due (needs ANTHROPIC_API_KEY)
npm run post -- --force       # publish one now, ignoring the schedule
npm run post:dry       # show the next topic and prompt; no API calls
npm run post -- --test-email  # check the failure email settings
npm run cover -- <slug>       # add (or --replace) the featured image of an existing post

# Build-out (see PROGRESS.md and safetyindex-build-brief.md)
npm run build:preview  # build every page, released or not (local review only; never deploy)
npm run engine         # the writing engine: headless `claude -p`, resumable (data/jobs/state.jsonl)
npm run engine:status  # progress of the engine (safe while it runs)
npm run release        # release the next wave (gates: impressions, indexing)
npm run covers         # cover images for released / next-wave pages (needs GOOGLE_CLOUD_API_KEY)
npm run downloads      # checklist PDFs and Excel files (Python, scripts/downloads/)
npm run downloads:verify
npm run lighthouse     # Lighthouse on 10 sample pages (needs Chrome)
npm run indexnow       # ping new and changed URLs after a deploy
npm run weekly         # Search Console pull + improve loop + new pages + report (local, needs the Claude CLI)
```

Settings for all of it live in `scripts/config.yml`. Data fetchers: `scripts/data/` (DOL enforcement, eCFR, NAICS, reports, BLS). Keyword lookups: `scripts/keywords/` (OpenSEO, own headless step).

## How publishing works

1. `.github/workflows/publish-post.yml` wakes every hour. `scripts/is-due.mjs` reads `data/schedule.json`; if no post is due it stops (a few seconds, no API calls).
2. When due, `scripts/generate-post.mjs` takes the first row of `docs/Safety_Blog_Topics.xlsx` whose Status isn't Published and, with Claude Sonnet 5.5 for every step and a hard spending cap per post (`MAX_POST_USD`, default **$2**; a typical post costs under $1):
   - **search** (web search only): search intent, what the guide adds, and a shortlist of official primary pages (regulators, law texts, standards bodies);
   - **download** those pages in the script itself (`scripts/lib/sources.mjs`), keeping the relevant passages (about 3,500 tokens a page, up to 8 pages). The model never fetches pages: a server-side fetch loop re-reads every page on every step, which is what made the first post (written with Opus) cost about $20;
   - **write** the English post from those extracts only (high effort), then check it (`scripts/lib/validate.mjs`): lengths, structure, no invented experience, and **every cited URL must be a page the script downloaded**. Up to 2 repair rounds;
   - make the featured image (Gemini on Vertex AI, `scripts/lib/cover.mjs`), saved as WebP with the IPTC AI-generated label; no image, no post;
   - for French and German: search the local keyword and local regulator pages, the script downloads up to 4, and the post is rewritten for that market by a native-writer brief (Sie/vous, local terms and bodies, local formats);
   - write the files and run the full build; any failure deletes the new files;
   - mark the row Published, schedule the next post a random 24–36 hours later, and store the run's cost as `apiUsd` in `data/schedule.json` (the Actions log prints a per-call cost table).
3. The workflow commits the posts, the spreadsheet and the schedule. Your host (Cloudflare Pages, Netlify, Vercel…) deploys on push.

If anything fails (API down, no credits, the budget stop, a post that won't pass the checks), nothing is published, the next try is 3h later (then 6h, 12h, 24h), and an email goes to `pauljomy92@gmail.com` (first failure of an outage, then every 4th retry). GitHub also emails the repo owner when a workflow run fails.

## Setup

1. Push this repo to GitHub (the `temp/` folder and `.env` are git-ignored).
2. **Settings → Secrets and variables → Actions → Secrets:**
   - `ANTHROPIC_API_KEY`
   - `GOOGLE_CLOUD_API_KEY` (Vertex AI key for the featured image; the project defaults to `conform-blog-513213`, override with the `GOOGLE_CLOUD_PROJECT` variable)
   - Failure email over SMTP. With Gmail: `SMTP_HOST`=`smtp.gmail.com`, `SMTP_PORT`=`465`, `SMTP_USER`=your Gmail address, `SMTP_PASS`=a [Google app password](https://myaccount.google.com/apppasswords) (needs 2-Step Verification). Optional: `ALERT_EMAIL` (default pauljomy92@gmail.com), `MAIL_FROM`.
3. **Variables (optional):** `ANTHROPIC_MODEL` (English post, default `claude-sonnet-5-5`), `TRANSLATION_MODEL` (search and fr/de, default `claude-sonnet-5-5`), `MAX_POST_USD` (default `2`), `GOOGLE_CLOUD_PROJECT`. The domain (`https://safetyindex.blog`) and contact email are set in `src/config/site.mjs`.
4. **Cloudflare** (Workers static assets, `wrangler.jsonc`): Workers & Pages → Create → Import a repository → `pauljomy/safetyindex`. Build command `npm run build`, deploy command `npx wrangler deploy`, root `/`. Node comes from `.node-version` (24). Then add `safetyindex.blog` under the Worker's Settings → Domains & Routes. Every push to `main` (including the bot's post commits) redeploys. Response headers are in `public/_headers`.

## Where things live

| What | File |
| --- | --- |
| Site name, URL, contact, languages | `src/config/site.mjs` |
| Categories (from the sheet) in 3 languages | `src/data/categories.mjs` |
| Interface strings, AI disclosure, About text | `src/i18n/ui.ts` |
| Post schema | `src/content.config.ts` |
| Posts | `src/content/posts/*.md`, `src/content/posts/{fr,de}/*.md` |
| Page templates (one per page type, all languages) | `src/views/`; thin routes in `src/pages/` and `src/pages/[lang]/` |
| SEO head, hreflang, Open Graph | `src/components/Head.astro` |
| JSON-LD | `src/lib/schema.ts` |
| Markdown mirrors (`/blog/<slug>.md`), llms.txt, llms-full.txt, robots.txt, RSS | `src/lib/mirror.ts`, `src/pages/*.ts` |
| Sitemaps (per market and section) | `scripts/build/postbuild.mjs` |
| Build checks | `scripts/check-dist.mjs` |
| Guide pipeline, prompts, validator | `scripts/generate-post.mjs`, `scripts/lib/` |
| Writing engine (queue, jobs, checking pass) | `scripts/engine/` |
| Per-page and build checks | `scripts/checks/`, `scripts/style/`, `scripts/check-dist.mjs` |
| Standard, industry, report pages | `src/content/{standards,industries,reports}/*.json`, `src/views/` |
| Checklists (page + PDF + Excel from one JSON) | `src/content/checklists/<market>/<slug>.json` → `public/downloads/` |
| Release schedule | `scripts/release/release.mjs`, `data/release/` |
| Search Console loop and maintenance | `scripts/gsc/`, `scripts/maintenance/`, `scripts/weekly.mjs` |
| Edge Worker (lowercase 301, 410, analytics) | `worker/index.js`, `wrangler.jsonc` |
| Featured images | `src/content/posts/images/<english-slug>.webp` (made by `scripts/lib/cover.mjs`) |
| Icon, favicon, default social image | `scripts/make-assets.mjs` → `public/` |

Writing rules (spam-policy safe AI content, translations, SEO standard) are in `CLAUDE.md`.
