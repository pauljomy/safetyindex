# Safety Index

A static workplace safety blog on [Astro](https://astro.build) with the [astro-micro](https://github.com/trevortylerlee/astro-micro) theme. New guides are researched and written by Claude Opus from primary sources and published automatically, one topic at a time, at random 24–36 hour intervals, in English, French and German. Each post has one featured image (an AI-generated photograph); there are no other images.

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
```

## How publishing works

1. `.github/workflows/publish-post.yml` wakes every hour. `scripts/is-due.mjs` reads `data/schedule.json`; if no post is due it stops (a few seconds, no API calls).
2. When due, `scripts/generate-post.mjs` takes the first row of `docs/Safety_Blog_Topics.xlsx` whose Status isn't Published and:
   - researches it with Claude Opus (`claude-opus-5-5`) using web search and web fetch, from primary sources;
   - writes the English post, then checks it (`scripts/lib/validate.mjs`): lengths, structure, no images, no invented experience, and **every cited URL must be a page that was actually opened** during research. Problems go back to the model to fix (up to 2 times);
   - generates the featured image from a prompt Opus writes (Gemini image model on Vertex AI, `scripts/lib/cover.mjs`), saved as WebP with the IPTC AI-generated label; no image, no post;
   - researches the French and German keyword and local regulators, and writes each version the same way;
   - writes the files and runs the full build; any failure deletes the new files;
   - marks the row Published, and sets the next post a random 24–36 hours later.
3. The workflow commits the posts, the spreadsheet and the schedule. Your host (Cloudflare Pages, Netlify, Vercel…) deploys on push.

If anything fails (API down, no credits, a post that won't pass the checks), nothing is published, the next try is 3 hours later, and an email goes to `pauljomy92@gmail.com` (first failure of an outage, then every 4th retry). GitHub also emails the repo owner when a workflow run fails.

## Setup

1. Push this repo to GitHub (the `temp/` folder and `.env` are git-ignored).
2. **Settings → Secrets and variables → Actions → Secrets:**
   - `ANTHROPIC_API_KEY`
   - `GOOGLE_CLOUD_API_KEY` (Vertex AI key for the featured image; the project defaults to `conform-blog-513213`, override with the `GOOGLE_CLOUD_PROJECT` variable)
   - Failure email over SMTP. With Gmail: `SMTP_HOST`=`smtp.gmail.com`, `SMTP_PORT`=`465`, `SMTP_USER`=your Gmail address, `SMTP_PASS`=a [Google app password](https://myaccount.google.com/apppasswords) (needs 2-Step Verification). Optional: `ALERT_EMAIL` (default pauljomy92@gmail.com), `MAIL_FROM`.
3. **Variables (optional):** `ANTHROPIC_MODEL` (default `claude-opus-5-5`), `GOOGLE_CLOUD_PROJECT`. The domain (`https://safetyindex.blog`) and contact email are set in `src/config/site.mjs`.
4. **Cloudflare** (Workers static assets, `wrangler.jsonc`): Workers & Pages → Create → Import a repository → `pauljomy/safetyfirst`. Build command `npm run build`, deploy command `npx wrangler deploy`, root `/`. Node comes from `.node-version` (24). Then add `safetyindex.blog` under the Worker's Settings → Domains & Routes. Every push to `main` (including the bot's post commits) redeploys. Response headers are in `public/_headers`.

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
| Sitemap lastmod + hreflang alternates | `scripts/lib/sitemap.mjs` |
| Build checks | `scripts/check-dist.mjs` |
| Generator, prompts, validator, schedule, email | `scripts/generate-post.mjs`, `scripts/lib/` |
| Featured images | `src/content/posts/images/<english-slug>.webp` (made by `scripts/lib/cover.mjs`) |
| Icon, favicon, default social image | `scripts/make-assets.mjs` → `public/` |

Writing rules (spam-policy safe AI content, translations, SEO standard) are in `CLAUDE.md`.
