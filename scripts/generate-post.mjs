// The guide pipeline: one topic from docs/Safety_Blog_Topics.xlsx, written for one market at a
// time (only the markets in the row's Markets column). Used by the engine (scripts/engine/run.mjs,
// one job per topic and market) and by `npm run post` (the next topic, every market, through the
// configured writer: WRITER=cli by default, WRITER=api for the Anthropic API).
//
//   npm run post                 # the next topic, if the old schedule says one is due
//   npm run post -- --force      # ignore the schedule (still one topic)
//   npm run post -- --dry-run    # show the next topic and the search prompt; no calls, no writes
//
// Per market version:
//   1. search (web search only): local keyword, intent, official pages, and the go/no-go read of the top 10
//   2. go/no-go (brief section 6): skip if 6+ of 10 are videos or shop pages, or an official page in the
//      top 3 already answers step by step; 6+ tools → logged as a possible tool page, no article
//   3. keyword data for non-US markets (OpenSEO, own headless step) and the market's threshold
//   4. the script downloads the official pages (scripts/lib/sources.mjs); only downloaded pages may be cited
//   5. write → validate → independent checking pass → one rewrite → check (scripts/engine/pipeline.mjs)
//   6. similarity backstop against the US version (English markets), then the files are written
// The cover image is made later by `npm run covers`; pages build without one.
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { execSync } from "node:child_process";
import { site } from "../src/config/site.mjs";
import { categoryFromSheet } from "../src/data/categories.mjs";
import { complete, normUrl } from "./lib/claude.mjs";
import { gatherSources, mergeCandidates } from "./lib/sources.mjs";
import { existingPosts, frontmatter, postFile, toMarkdown } from "./lib/posts.mjs";
import { COUNTRY, RULES, localSearchPrompt, localWritePrompt, postSchema, searchPrompt, searchSchema, writePrompt } from "./lib/prompts.mjs";
import { isDue, readSchedule, recordFailure, recordSuccess } from "./lib/schedule.mjs";
import { STATUS, loadTopics, nextTopic, saveTopics, setRow } from "./lib/topics.mjs";
import { validatePost } from "./lib/validate.mjs";
import { config } from "./lib/config.mjs";
import { writeChecked } from "./engine/pipeline.mjs";
import { checklistJson, checklistProblems, saveJson, today } from "./engine/common.mjs";
import { similarity } from "./style/patterns.mjs";
import { keywordData } from "./keywords/openseo.mjs";
import { readFileSync } from "node:fs";

const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").split("-").slice(0, 6).join("-");
/** Cuts text at a word boundary (no mid-word cuts on the checklist header). */
const shorten = (s, max) => (s.length <= max ? s : `${s.slice(0, s.lastIndexOf(" ", max - 1)).replace(/[,;:(]+$/, "")}…`);
const localLang = (m) => (m === "fr" || m === "de" ? m : "en");

/** The go/no-go decision from the search step's read of the top 10 (brief section 6). */
export function goNoGo(serp) {
  const c = serp.counts;
  const fmt = `${serp.dominantFormat}; top 10: ${Object.entries(c).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ")}`;
  if (c.videos + c.products >= 6) return { go: false, status: STATUS.skipped, text: `Skip: ${c.videos + c.products} of 10 are videos or shop pages (${fmt})` };
  if (c.tools >= 6) return { go: false, status: STATUS.skipped, text: `Skip: ${c.tools} of 10 are tools; possible tool page (${fmt})` };
  if (serp.officialTop3FullAnswer) return { go: false, status: STATUS.skipped, text: `Skip: an official page in the top 3 already answers step by step (${fmt})` };
  return { go: true, text: `Write: ${fmt}` };
}

/**
 * Writes one market version of a topic.
 * @param {any} topic a topic sheet row (scripts/lib/topics.mjs)
 * @param {string} market us | uk | au | ca | nz | fr | de
 * @returns {Promise<{status: "done"|"dropped"|"skipped"|"waiting", reason?: string, files?: string[], path?: string, goNoGo?: string, keyword?: string, notes?: string[]}>}
 */
export async function writeGuide(topic, market, { log = console.log, replace } = {}) {
  const category = categoryFromSheet(topic.category);
  if (!category) return { status: "dropped", reason: `category "${topic.category}" is not in src/data/categories.mjs` };
  // A rewrite (replace = the existing slug) keeps the URL; the old version is left out of the duplicate checks.
  const old = replace ? existingPosts().find((p) => p.market === market && p.slug === replace) : null;
  const existing = existingPosts().filter((p) => p !== old && !(old && p.market === market && p.slug === replace));
  const lang = localLang(market);
  const inMarket = existing.filter((p) => (p.market ?? (p.lang === "en" ? "us" : p.lang)) === market);
  const enPost = market === "us" ? null : existing.find((p) => p.market === "us" && p.topicN === topic.n) ?? existing.find((p) => p.lang === "en" && p.market === "us" && p.keyword.toLowerCase() === topic.keyword.toLowerCase());
  if ((market === "fr" || market === "de") && !enPost) return { status: "dropped", reason: "the US English version doesn't exist yet" };
  const enFull = enPost ? readPost(enPost) : null;

  // 1. Search.
  const prompt = market === "fr" || market === "de" ? localSearchPrompt(market, enFull, topic, inMarket) : searchPrompt(topic, inMarket, market);
  const search = await complete({ system: RULES, prompt, schema: searchSchema, tools: "websearch", effort: "low", label: `search ${market} #${topic.n}`, log });
  const plan = search.data;
  const keyword = (market === "us" ? topic.keyword : plan.keyword || topic.keyword).toLowerCase();
  // 2. Go/no-go.
  const gate = goNoGo(plan.serp);
  // A rewrite keeps an existing URL: the go/no-go result is recorded, but it doesn't stop the rewrite.
  if (!gate.go && !replace) return { status: "skipped", reason: gate.text, goNoGo: gate.text, keyword };
  // 3. Keyword demand for non-US markets (US rows carry the sheet's keyword data).
  let kw = { source: topic.keywordSource || "topic sheet", clusterVolume: topic.clusterVolume ?? null, kd: topic.kd ?? null };
  if (market !== "us") {
    const t = config.guide_thresholds[market];
    const data = await keywordData([keyword, ...(plan.otherQueries ?? []).slice(0, 12)], market, { log });
    if (data) {
      const main = data.rows.find((r) => r.keyword === keyword) ?? data.rows.filter((r) => r.kd != null).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0];
      const cluster = data.rows.reduce((n, r) => n + (r.volume ?? 0), 0);
      kw = { source: "OpenSEO", clusterVolume: cluster, kd: main?.kd ?? null, keyword: main?.keyword ?? keyword };
      // A rewrite keeps an existing URL: keyword data is recorded but doesn't stop it.
      if (!(cluster >= t.volume) && !replace) return { status: "waiting", reason: `low demand in ${market}: cluster volume ${cluster} (floor ${t.volume})`, keyword };
      if (!(kw.kd != null && kw.kd < t.kd_under) && !replace) return { status: "waiting", reason: `high competition in ${market}: KD ${kw.kd} for "${kw.keyword}"`, keyword };
    } else if (!replace) return { status: "waiting", reason: "OpenSEO not available or credit limit reached; no keyword data for this market", keyword };
  }
  // 4. Sources.
  const opened = new Set();
  const query = [keyword, topic.title, ...(plan.outline ?? []), ...(plan.otherQueries ?? []), ...topic.supporting.slice(0, 15)].join(" ");
  const candidates = mergeCandidates(plan.candidates, search.searchResults);
  log(`  downloading up to ${market === "fr" || market === "de" ? 6 : 8} of ${candidates.length} candidate sources (${market})`);
  const sources = await gatherSources(candidates, { query, opened, max: market === "fr" || market === "de" ? 6 : 8, log });
  const localOk = (u) => (market === "fr" ? /\.fr$|europa\.eu$/ : market === "de" ? /\.de$|europa\.eu$/ : market === "uk" ? /\.uk$/ : market === "au" ? /\.au$/ : market === "ca" ? /\.ca$/ : market === "nz" ? /\.nz$/ : /./).test(new URL(u).hostname);
  const local = sources.filter((s) => localOk(s.url));
  if (market === "us" && sources.length < 3) return { status: "dropped", reason: `only ${sources.length} primary source(s) could be downloaded; at least 3 are needed` };
  if (market !== "us" && local.length < (market === "fr" || market === "de" ? 2 : 3)) return { status: "dropped", reason: `only ${local.length} official ${COUNTRY[market]} source(s) could be downloaded; the page can't be written from its own country's rules` };
  if (enFull) for (const s of enFull.data.sources ?? []) opened.add(normUrl(s.url));
  const sourceText = sources.map((s) => s.text).join("\n\n");

  // 5. Write and check.
  const slug = replace ?? (market === "fr" || market === "de" ? slugify(keyword) : market === "us" ? null : slugify(keyword));
  const writeP = market === "fr" || market === "de"
    ? localWritePrompt(market, enFull.raw, { ...plan, keyword, slug }, sources, inMarket)
    : writePrompt({ ...topic }, { ...plan, keyword }, sources, inMarket, market);
  const res = await writeChecked({
    label: `${market}-${topic.n}`, system: RULES, prompt: writeP, schema: postSchema, market, log,
    validate: (d) => {
      const e = validatePost(d, { lang, market, keyword, opened, existing, sourceText });
      if (slug && d.slug !== slug && market !== "us") e.push(`slug must be "${slug}"`);
      if (d.checklist) e.push(...checklistProblems(d.checklist));
      if (topic.topicType === "regional" && market !== "us" && !d.localRule?.trim()) e.push(`localRule is empty: a regional page needs the ${COUNTRY[market]} rule and its reference in one sentence`);
      return e;
    },
    sources: sources.map((s, i) => `<source id="${i + 1}" url="${s.url}">\n${s.text}\n</source>`).join("\n\n"),
    draftForCheck: (d) => ({ ...d, coverPrompt: undefined, coverAlt: undefined }),
  });
  if (!res.ok) return { status: "dropped", reason: res.reason, notes: res.notes, keyword };
  const p = res.draft;
  // 6. Similarity backstop for English markets (regional topics only reach here).
  if (market !== "us" && lang === "en") {
    const us = existing.find((x) => x.market === "us" && (x.topicN === topic.n));
    if (us) {
      const sim = similarity(p.body, readPost(us).body);
      if (sim > config.similarity_max) return { status: "dropped", reason: `mis-sorted topic: ${Math.round(sim * 100)}% similar to the US version; the richer US page is kept`, keyword };
    }
  }
  const finalSlug = replace ?? (market === "us" ? p.slug : slug ?? p.slug);
  const oldData = old ? frontmatter(readFileSync(postFile(market, replace), "utf8")) : null;
  const date = today();
  const pagePath = market === "us" ? `/blog/${finalSlug}` : market === "fr" || market === "de" ? `/${market}/blog/${finalSlug}` : `/${market}/guides/${finalSlug}`;
  const files = [];
  let checklistId;
  if (p.checklist) {
    const cl = checklistJson({ market, slug: finalSlug, lang, pageUrl: pagePath, checklist: p.checklist, docRef: `SI-${market.toUpperCase()}-${topic.n}`, dataAsOf: date, regulationLine: shorten(p.checklist.references?.[0] ?? "", 90) });
    saveJson(cl.file, cl.data);
    files.push(cl.file);
    checklistId = cl.id;
  }
  const englishSlugs = new Set(existing.filter((x) => x.market === "us").map((x) => x.slug));
  const data = {
    title: p.title, seoTitle: p.seoTitle, subtitle: p.subtitle, description: p.description, date: oldData?.date ?? date, ...(oldData && { updated: date, releaseDate: date, changes: [...(oldData.changes ?? []), { date, kind: "rewrite", share: 1, note: "rewritten from local sources" }] }), generatedOn: date, dataAsOf: date,
    cover: enPost?.slug ?? finalSlug, coverPrompt: p.coverPrompt, coverAlt: p.coverAlt,
    categories: [category.slug], tags: p.tags, keyword, ...(market !== "us" && enPost && { translationOf: enPost.slug }),
    topicType: topic.topicType || "regional", keywordSource: kw.source, clusterVolume: kw.clusterVolume, kd: kw.kd, goNoGo: gate.text, checkPass: "passed",
    ...(p.localRule?.trim() && { localRule: p.localRule.trim() }), ...(checklistId && { checklist: checklistId }),
    linkPhrases: p.linkPhrases, summary: p.summary, keyTakeaways: p.keyTakeaways, faq: p.faq, sources: p.sources,
    relatedPosts: (p.relatedPosts ?? []).filter((s) => englishSlugs.has(s)), topicN: topic.n,
  };
  const file = postFile(market, finalSlug);
  if (existsSync(file) && !replace) return { status: "dropped", reason: `${file} already exists`, keyword };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, toMarkdown(data, p.body));
  files.push(file);
  return { status: "done", files, path: pagePath, goNoGo: gate.text, keyword, notes: res.notes, kw, checklist: checklistId };
}

function readPost(p) {
  const md = readFileSync(postFile(p.market ?? p.lang, p.slug), "utf8");
  const data = frontmatter(md);
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, "");
  return { data, body, raw: { title: data.title, body, sources: data.sources, summary: data.summary } };
}

/** Records a market version's outcome in the topic sheet (US: Status, URL, keyword columns; others: Notes). */
export async function recordInSheet(topic, market, result) {
  const sheet = await loadTopics();
  const row = sheet.topics.find((t) => t.n === topic.n);
  if (!row) return;
  const note = (s) => [row.notes, s].filter(Boolean).join(" ");
  if (market === "us") {
    const f = { goNoGo: result.goNoGo ?? row.goNoGo, checkedOn: row.checkedOn || today() };
    if (result.status === "done") Object.assign(f, { status: STATUS.published, url: `${site.url}${result.path}`, keywordSource: row.keywordSource || "topic sheet" });
    if (result.status === "skipped") Object.assign(f, { status: STATUS.skipped });
    if (result.status === "dropped") Object.assign(f, { status: STATUS.dropped, notes: note(`Dropped by the engine ${today()}: ${result.reason}`) });
    setRow(sheet, row, f);
  } else if (result.status !== "done") setRow(sheet, row, { notes: note(`${market.toUpperCase()} version ${result.status} ${today()}: ${result.reason}`) });
  else setRow(sheet, row, { notes: note(`${market.toUpperCase()} version written ${today()}: ${result.path}`) });
  await saveTopics(sheet);
}

// ---------------------------------------------------------------- CLI (npm run post)
const args = new Set(process.argv.slice(2));
const output = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);

async function main() {
  const schedule = readSchedule();
  if (!args.has("--force") && !args.has("--dry-run") && !isDue(schedule)) {
    console.log(`Not due yet: next post at ${schedule.nextDue}.`);
    output("published", "false");
    return;
  }
  const { topics } = await loadTopics();
  const topic = nextTopic(topics);
  if (!topic) { console.log("No 'Not started' row left in the topic sheet."); output("published", "false"); return; }
  const markets = topic.markets.length ? topic.markets : ["us"];
  console.log(`Topic #${topic.n}: ${topic.title} · keyword ${topic.keyword} · markets ${markets.join(", ")} · writer ${config.writer}`);
  if (args.has("--dry-run")) { console.log(`\n--- search prompt ---\n${searchPrompt(topic, existingPosts().filter((p) => p.lang === "en"))}`); return; }
  let first;
  for (const m of ["us", ...markets.filter((m) => m !== "us")]) {
    if (!markets.includes(m)) continue;
    console.log(`\n== ${m}`);
    const r = await writeGuide(topic, m);
    console.log(`  ${r.status}${r.reason ? `: ${r.reason}` : ""}${r.path ? ` → ${r.path}` : ""}`);
    await recordInSheet(topic, m, r);
    if (m === "us") { first = r; if (r.status !== "done") break; }
  }
  if (first?.status !== "done") throw Object.assign(new Error(`#${topic.n} not written: ${first?.reason}`), { topic });
  execSync("npm run build", { stdio: "inherit" });
  recordSuccess(schedule, { slug: first.path.split("/").pop(), title: topic.title });
  output("published", "true");
  output("title", topic.title.replace(/\n/g, " "));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`✖ ${err?.stack ?? err}`);
    output("published", "false");
    if (!args.has("--dry-run")) recordFailure(readSchedule(), err?.message ?? err);
    process.exit(1);
  });
}
