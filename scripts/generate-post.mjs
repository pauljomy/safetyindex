// Publishes exactly one new guide (English + French + German) from the next
// unpublished row of docs/Safety_Blog_Topics.xlsx, when the schedule says one
// is due (a random 24–36 hours after the previous post; see scripts/lib/schedule.mjs).
//
//   npm run post                 # does nothing unless a post is due
//   npm run post -- --force      # ignore the schedule (still exactly one post)
//   npm run post -- --dry-run    # show the next topic and the research prompt; no API calls, no writes
//   npm run post -- --test-email # send a test failure email and exit
//
// Model: Claude Sonnet 5.5 for every step. Budget: hard stop at MAX_POST_USD
// (default $2); a typical post costs well under $1. The model
// never fetches pages itself (a server-side fetch loop re-reads every page on
// every step, which is what made the first post cost ~$20). Instead:
//   1. web search only: search intent + a shortlist of primary pages
//   2. this script downloads those pages and keeps the relevant passages
//      (scripts/lib/sources.mjs); only downloaded pages may be cited
//   3. write the English post from those extracts (high effort); validate, up to 2 repairs
//   4. featured image (Gemini on Vertex AI) from the post's coverPrompt
//   5. per language: search the local keyword + local regulator pages, the
//      script downloads them, the post is rewritten for that market
//   6. write the files, run the full site build (SEO, hreflang, schema, links)
//   7. mark the row Published, schedule the next post, store the cost
// Any failure rolls back the files, records the failure, and emails ALERT_EMAIL.
import { appendFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { execSync } from "node:child_process";
import { locales, site } from "../src/config/site.mjs";
import { categoryFromSheet } from "../src/data/categories.mjs";
import { MAX_POST_USD, MODEL, TRANSLATION_MODEL, ask, ledger, parseJson, searchTool, totalUsd } from "./lib/claude.mjs";
import { gatherSources, mergeCandidates } from "./lib/sources.mjs";
import { sendFailureEmail } from "./lib/mail.mjs";
import { existingPosts, postFile, toMarkdown } from "./lib/posts.mjs";
import { FIELDS, RULES, localSearchPrompt, localWritePrompt, postSchema, searchPrompt, writePrompt } from "./lib/prompts.mjs";
import { isDue, readSchedule, recordFailure, recordSuccess } from "./lib/schedule.mjs";
import { loadTopics, markPublished, nextTopic } from "./lib/topics.mjs";
import { bodyWords, validatePost } from "./lib/validate.mjs";
import { makeCover } from "./lib/cover.mjs";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const FORCE = args.has("--force");
const MAX_REPAIRS = 2;
const today = new Date().toISOString().slice(0, 10);

const output = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);

/** Writes a post, then asks the model to fix whatever the validator finds. */
async function draft({ label, prompt, ctx, model, effort = "high" }) {
  const messages = [{ role: "user", content: prompt }];
  for (let attempt = 0; ; attempt++) {
    const res = await ask({ system: RULES, messages, schema: postSchema, effort, model, label: `${label} (draft ${attempt + 1})` });
    const post = parseJson(res.text, label);
    const problems = validatePost(post, ctx);
    if (!problems.length) return post;
    console.log(`  ! ${label}: ${problems.length} problem(s):\n    - ${problems.join("\n    - ")}`);
    if (attempt >= MAX_REPAIRS) throw new Error(`${label} still fails validation after ${MAX_REPAIRS} repairs:\n- ${problems.join("\n- ")}`);
    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: `The draft failed these checks. Fix every one and return the complete corrected JSON (all fields, full body):\n- ${problems.join("\n- ")}\n\n${FIELDS}` });
  }
}

async function main() {
  if (args.has("--test-email")) {
    const ok = await sendFailureEmail({ subject: `[${site.name}] test alert`, error: "This is a test of the failure email. Nothing is wrong.", attempt: 0 });
    process.exit(ok ? 0 : 1);
  }

  const schedule = readSchedule();
  if (!FORCE && !DRY && !isDue(schedule)) {
    console.log(`Not due yet: next post at ${schedule.nextDue}.`);
    output("published", "false");
    return;
  }

  const sheet = await loadTopics();
  const topic = nextTopic(sheet.topics);
  if (!topic) {
    console.log("Every topic in the sheet is published. Add rows to docs/Safety_Blog_Topics.xlsx.");
    output("published", "false");
    return;
  }
  const category = categoryFromSheet(topic.category);
  if (!category) throw Object.assign(new Error(`Row ${topic.row}: category "${topic.category}" is not in src/data/categories.mjs`), { topic });
  const existing = existingPosts();
  const existingIn = (code) => existing.filter((p) => p.lang === code);

  console.log(`Topic #${topic.n}: ${topic.title}\n  keyword: ${topic.keyword} · category: ${category.slug} · model: ${MODEL === TRANSLATION_MODEL ? MODEL : `${MODEL} (en), ${TRANSLATION_MODEL} (search, fr/de)`} · budget $${MAX_POST_USD}`);
  if (DRY) {
    console.log(`\n--- search prompt ---\n${searchPrompt(topic, existingIn("en"))}`);
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!process.env.GOOGLE_CLOUD_API_KEY) throw new Error("GOOGLE_CLOUD_API_KEY is not set (featured image)");

  const written = [];
  try {
    // 1–2. English
    const openedEn = new Set();
    console.log("Searching (English)…");
    const search = await ask({ system: RULES, messages: [{ role: "user", content: searchPrompt(topic, existingIn("en")) }], tools: [searchTool(3)], effort: "low", model: TRANSLATION_MODEL, label: "search en" });
    const plan = parseJson(search.text, "search en");
    console.log(`  adds: ${plan.whatThisAdds}`);
    const candidates = mergeCandidates(plan.candidates, search.searchResults);
    console.log(`Downloading up to 8 of ${candidates.length} candidate sources…`);
    const query = [topic.keyword, topic.title, ...(plan.outline ?? []), ...topic.supporting.slice(0, 15)].join(" ");
    const sources = await gatherSources(candidates, { query, opened: openedEn, max: 8 });
    if (sources.length < 3) throw new Error(`only ${sources.length} primary source(s) could be downloaded; at least 3 are needed`);
    console.log("Writing (English)…");
    const en = await draft({ label: "post en", prompt: writePrompt(topic, plan, sources, existingIn("en")), model: MODEL, ctx: { lang: "en", keyword: topic.keyword, opened: openedEn, existing } });
    // Featured image now, before paying for the translations: no image, no post.
    console.log("Generating the featured image…");
    const cover = await makeCover(en.slug, en.coverPrompt);
    written.push(cover.file);
    console.log(`  ${cover.file} (${cover.kb} KB)`);
    const englishSlugs = new Set(existingIn("en").map((p) => p.slug));
    const base = { date: today, categories: [category.slug] };
    const posts = [{
      lang: "en", slug: en.slug,
      data: { ...base, title: en.title, seoTitle: en.seoTitle, subtitle: en.subtitle, description: en.description, coverImage: `./images/${en.slug}.webp`, coverAlt: en.coverAlt, tags: en.tags, keyword: topic.keyword, summary: en.summary, keyTakeaways: en.keyTakeaways, faq: en.faq, sources: en.sources, relatedPosts: en.relatedPosts.filter((s) => englishSlugs.has(s)) },
      body: en.body,
    }];

    // 3. Other languages
    for (const { code, name } of locales.filter((l) => l.code !== "en")) {
      const opened = new Set(openedEn);
      opened.raw = new Map(openedEn.raw);
      console.log(`Searching (${name})…`);
      const r = await ask({ system: RULES, messages: [{ role: "user", content: localSearchPrompt(code, en, topic, existingIn(code)) }], tools: [searchTool(2)], effort: "low", model: TRANSLATION_MODEL, label: `search ${code}` });
      const local = parseJson(r.text, `search ${code}`);
      if (!local.keyword) throw new Error(`search ${code}: no local keyword`);
      console.log(`  local keyword: ${local.keyword}`);
      const localSources = await gatherSources(mergeCandidates(local.candidates, r.searchResults), { query: [local.keyword, ...(local.otherQueries ?? []), ...(local.terminology ?? [])].join(" "), opened, max: 4 });
      console.log(`Writing (${name})…`);
      const p = await draft({ label: `post ${code}`, prompt: localWritePrompt(code, en, local, localSources, existingIn(code)), model: TRANSLATION_MODEL, ctx: { lang: code, keyword: local.keyword, opened, existing } });
      posts.push({
        lang: code, slug: p.slug,
        data: { ...base, title: p.title, seoTitle: p.seoTitle, subtitle: p.subtitle, description: p.description, coverImage: `../images/${en.slug}.webp`, coverAlt: p.coverAlt, tags: p.tags, keyword: local.keyword, translationOf: en.slug, summary: p.summary, keyTakeaways: p.keyTakeaways, faq: p.faq, sources: p.sources, relatedPosts: p.relatedPosts.filter((s) => englishSlugs.has(s)) },
        body: p.body,
      });
    }

    // 4. Files + full build
    for (const p of posts) {
      const file = postFile(p.lang, p.slug);
      if (existsSync(file)) throw new Error(`${file} already exists`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, toMarkdown(p.data, p.body));
      written.push(file);
      console.log(`  wrote ${file} (${bodyWords(p.body)} words)`);
    }
    console.log("Building the site to check the new pages…");
    execSync("npm run build", { stdio: "inherit" });

    // 5. Sheet + schedule
    const url = `${site.url}/blog/${en.slug}`;
    await markPublished(sheet, topic, url);
    printCost();
    const { next, gap } = recordSuccess(schedule, { slug: en.slug, title: en.title, usd: Number(totalUsd().toFixed(2)) });
    console.log(`✔ Published ${url} (+ ${posts.length - 1} translations). Next post due ${next.toISOString()} (in ${gap.toFixed(1)} h).`);
    output("published", "true");
    output("slug", en.slug);
    output("title", en.title.replace(/\n/g, " "));
  } catch (err) {
    for (const f of written) if (existsSync(f)) unlinkSync(f);
    err.topic ??= topic;
    throw err;
  }
}

function printCost() {
  if (!ledger.length) return;
  console.log("\nAPI cost for this run:");
  for (const r of ledger)
    console.log(`  ${r.label.padEnd(12)} ${r.model.padEnd(18)} in ${r.input + r.cacheWrite} + cached ${r.cacheRead} / out ${r.output} · ${r.searches} searches, ${r.fetches} fetches · $${r.usd.toFixed(2)}`);
  console.log(`  total ≈ $${totalUsd().toFixed(2)} (featured image ≈ $0.03 extra)\n`);
}

main().catch(async (err) => {
  console.error(`✖ ${err?.stack ?? err}`);
  printCost();
  output("published", "false");
  if (!DRY && !args.has("--test-email")) {
    const schedule = readSchedule();
    const notify = recordFailure(schedule, err?.message ?? err);
    if (notify) {
      await sendFailureEmail({ subject: `[${site.name}] post generation failed`, error: err, topic: err?.topic, attempt: schedule.failures })
        .catch((e) => console.error(`✖ Failure email could not be sent: ${e.message}`));
    } else console.log(`(failure #${schedule.failures}; email skipped to avoid repeats)`);
  }
  process.exit(1);
});
