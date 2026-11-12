// The job queue, in the order of brief section 11 (so the most valuable pages exist first if usage
// limits stop the run):
//   1. US standard pages, highest keyword cluster volume first (citation count breaks ties); after
//      every 5 standard pages, one US guide from the topic sheet, in sheet order;
//   2. US industry pages, by inspection count;
//   3. any US guides still left in the sheet;
//   4. guides for the UK, Australia, Canada and New Zealand (rows whose Markets include them);
//   5. German and French guides, including rewrites of the noindexed ones;
//   6. UK enforcement pages, if HSE notice data is allowed (it isn't used: see PROGRESS.md);
//   7. pages in the rewrite queue (data/rewrite-queue.json: failed checks on pages from before the build,
//      rule changes, the quarterly audit), rewritten in place: guides through writeGuide's `replace`,
//      standard and industry pages by rerunning their job (run.mjs keeps their release date and URL).
import { existsSync, readFileSync } from "node:fs";
import { isWritable, loadTopics, STATUS } from "../lib/topics.mjs";
import { existingPosts } from "../lib/posts.mjs";
import { contentIndex } from "../gsc/common.mjs";
import { readRewriteQueue, rewriteJobId } from "../gsc/rewrite-queue.mjs";

const readJson = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d);
export const STANDARDS_PLAN = "data/pages/us/standards-plan.json";
export const INDUSTRIES_PLAN = "data/pages/us/industries-plan.json";

/** Noindexed French/German posts to rewrite from their own country's sources (section 18, step 2). */
function rewriteJobs(topics) {
  const out = [];
  for (const p of existingPosts().filter((p) => p.noindex && (p.market === "fr" || p.market === "de"))) {
    const en = existingPosts().find((x) => x.market === "us" && x.slug === p.original);
    const topic = topics.find((t) => en && t.url?.endsWith(`/blog/${en.slug}`));
    if (topic) out.push({ id: `rewrite:${p.market}:${p.slug}`, type: "guide", template: "guide-local", market: p.market, n: topic.n, replace: p.slug });
  }
  return out;
}

/** Rewrite-queue entries as jobs that rewrite the existing page in place (same URL). */
function rewriteQueueJobs(topics, standardsPlan, industriesPlan, covered) {
  const out = [];
  const pages = new Map(contentIndex().map((c) => [c.path, c]));
  const usTopicOf = (c) => {
    const en = c.market === "us" ? c : [...pages.values()].find((x) => x.market === "us" && x.kind === "guide" && x.slug === c.data.translationOf);
    return topics.find((t) => t.n === c.data.topicN) ?? (en && topics.find((t) => t.url && t.url.replace(/\/$/, "").endsWith(en.path)));
  };
  for (const e of readRewriteQueue()) {
    const c = pages.get(e.path);
    if (!c || covered.has(e.path)) continue;
    const rewrite = { path: e.path, file: c.file, from: e.from ?? "checks", reason: (e.problems ?? []).slice(0, 3).join("; ") };
    const id = rewriteJobId(e);
    if (c.kind === "guide") {
      const topic = usTopicOf(c);
      if (!topic) continue;
      const template = c.market === "us" ? "guide-us" : ["fr", "de"].includes(c.market) ? "guide-local" : "guide-en-market";
      out.push({ id, type: "guide", template, market: c.market, n: topic.n, replace: c.slug, rewrite });
    } else if (c.kind === "standard") {
      const plan = standardsPlan.find((s) => s.section === c.data.section) ?? {};
      out.push({ keyword: c.data.keyword, cluster: c.data.cluster ?? [], clusterVolume: c.data.clusterVolume, kd: c.data.kd, keywordSource: c.data.keywordSource, ...plan, id, type: "standard", template: "standard", market: "us", section: c.data.section, slug: c.slug, rewrite });
    } else if (c.kind === "industry") {
      const plan = industriesPlan.find((s) => s.naics === c.data.naics) ?? {};
      out.push({ title: c.data.naicsTitle, keyword: c.data.keyword, clusterVolume: c.data.clusterVolume, kd: c.data.kd, keywordSource: c.data.keywordSource, ...plan, id, type: "industry", template: "industry", market: "us", naics: c.data.naics, slug: c.slug, rewrite });
    }
  }
  return out;
}

export async function buildQueue() {
  const standards = readJson(STANDARDS_PLAN, { pages: [] }).pages.filter((s) => s.status === "write")
    .sort((a, b) => (b.clusterVolume ?? 0) - (a.clusterVolume ?? 0) || b.citations - a.citations);
  const industries = readJson(INDUSTRIES_PLAN, { pages: [] }).pages.filter((s) => s.status === "write").sort((a, b) => b.inspections - a.inspections);
  const { topics } = await loadTopics();
  const usGuides = topics.filter((t) => isWritable(t) && (t.markets.length ? t.markets.includes("us") : true))
    .map((t) => ({ id: `guide:us:${t.n}`, type: "guide", template: "guide-us", market: "us", n: t.n }));
  // Rows already written for the US (Published by this build) still get their other market versions.
  const marketRows = topics.filter((t) => t.status === STATUS.notStarted || (t.status === STATUS.published && t.markets.length));
  const marketGuides = (ms, template) => ms.flatMap((m) => marketRows.filter((t) => t.markets.includes(m) && !/^\/us\/reports\//.test(t.mainPage)).map((t) => ({ id: `guide:${m}:${t.n}`, type: "guide", template, market: m, n: t.n, ...(t.markets.includes("us") ? {} : { standalone: true }) })));

  const q = [];
  let g = 0;
  standards.forEach((s, i) => {
    q.push({ id: `standard:${s.section}`, type: "standard", template: "standard", market: "us", ...s });
    if ((i + 1) % 5 === 0 && g < usGuides.length) q.push(usGuides[g++]);
  });
  for (const s of industries) q.push({ id: `industry:${s.naics}`, type: "industry", template: "industry", market: "us", ...s });
  q.push(...usGuides.slice(g));
  // Market-only rows (e.g. COR for Canada, PEEPs for the UK) and regional rows for the other English markets.
  q.push(...marketGuides(["uk", "au", "ca", "nz"], "guide-en-market"));
  const localRewrites = rewriteJobs(topics);
  q.push(...marketGuides(["fr", "de"], "guide-local"), ...localRewrites);
  const covered = new Set(localRewrites.map((j) => `/${j.market}/blog/${j.replace}`));
  q.push(...rewriteQueueJobs(topics, readJson(STANDARDS_PLAN, { pages: [] }).pages, readJson(INDUSTRIES_PLAN, { pages: [] }).pages, covered));
  const seen = new Set();
  return q.filter((j) => !seen.has(j.id) && seen.add(j.id));
}
