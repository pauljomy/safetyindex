// Zero-impression pages (brief section 16). A page with zero Search Console impressions for
// `zero_impression_months` (default 3) after its release date (releaseDate, or date for pages from before
// the build) gets one action, in this order:
//  1. merge: another live page in the same market targets the same keyword → 301 the old URL to it
//     (a line in public/_redirects) and noindex the old file. Close-but-not-identical intent is only
//     logged as a suggestion (merging the useful parts is a person's or the engine's job);
//  2. noindex: otherwise set `noindex: true` (the build drops it from sitemaps, hubs and links; the URL keeps
//     working for the people who use it);
//  3. 410: only for a page with no downloads, no internal visits and no merge target, which needs an
//     analytics export in data/analytics/; without one, never (logged). A 410 adds the path to data/gone.json
//     (served by worker/index.js) and removes the page file (the only deletion the brief allows).
// Zero means zero in every Search Console window since release, and the saved data must reach back far
// enough to cover the period; otherwise the page is skipped and logged.
//   npm run maintenance:impressions            # dry run (default): prints what it would do
//   npm run maintenance:impressions -- --apply
import { appendFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { config } from "../lib/config.mjs";
import { addDays, allSummaries, contentIndex, editPage, isLive, latestAnalytics, readJson, releaseDateOf, today, writeJson } from "../gsc/common.mjs";
import { recordChange } from "../gsc/improve.mjs";

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const words = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 3));
const overlap = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.min(A.size, B.size); };

export function zeroImpressionPages({ months = config.zero_impression_months ?? 3, log = console.log } = {}) {
  const sums = allSummaries().filter((s) => s.endDate);
  const out = { candidates: [], skipped: [] };
  if (!sums.length) { log("no Search Console data in data/gsc/; nothing to judge"); return out; }
  const latest = sums.at(-1);
  const earliestData = sums.map((s) => s.prevStartDate ?? s.startDate ?? s.endDate).sort()[0];
  const cutoff = addDays(latest.endDate, -Math.round(months * 30.4));
  for (const c of contentIndex().filter(isLive)) {
    const rel = releaseDateOf(c);
    if (!rel || rel > cutoff) continue;
    // The period to judge: from release (or the last `months` months for older pages) to the latest data.
    const from = rel > addDays(latest.endDate, -Math.round(months * 30.4) - 28) ? rel : cutoff;
    if (earliestData > addDays(from, 31)) { out.skipped.push({ path: c.path, why: `Search Console history starts ${earliestData}; need data from about ${from}` }); continue; }
    let impressions = 0;
    for (const s of sums) {
      if (s.endDate < from) continue;
      impressions += s.pageImpressions?.[c.path] ?? 0;
      const row = s.pages?.find((p) => p.path === c.path);
      if (row && (s.prevEndDate ?? "") >= from) impressions += row.prevImpressions ?? 0;
    }
    if (impressions === 0) out.candidates.push({ page: c, released: rel, since: from });
  }
  return out;
}

export async function runImpressions({ apply = false, log = console.log } = {}) {
  const day = today();
  const { candidates, skipped } = zeroImpressionPages({ log });
  const content = contentIndex();
  const analytics = latestAnalytics();
  const result = { date: day, apply, merged: [], noindexed: [], gone: [], suggestions: [], skipped, notes: [] };
  if (!analytics) result.notes.push("no analytics export in data/analytics/, so no page is ever given a 410 (usage unknown)");
  log(`zero-impression pages: ${candidates.length} candidate(s), ${skipped.length} skipped for lack of history${apply ? "" : " (dry run: nothing changed; --apply to act)"}`);
  for (const { page: c, released } of candidates) {
    const live = content.filter((x) => x.path !== c.path && x.market === c.market && isLive(x));
    const same = c.data.keyword ? live.find((x) => x.data.keyword && norm(x.data.keyword) === norm(c.data.keyword)) : null;
    const close = !same && live.map((x) => ({ x, s: Math.max(overlap(c.data.keyword ?? c.data.title, x.data.keyword ?? x.data.title), overlap(c.data.title, x.data.title)) })).filter((r) => r.s >= 0.75).sort((a, b) => b.s - a.s)[0];
    if (same) {
      result.merged.push({ path: c.path, into: same.path, released });
      log(`  merge ${c.path} → ${same.path} (same keyword "${c.data.keyword}")`);
      if (apply) {
        const line = `${c.path} ${same.path} 301\n`;
        const cur = existsSync("public/_redirects") ? readFileSync("public/_redirects", "utf8") : "";
        if (!cur.includes(`${c.path} `)) appendFileSync("public/_redirects", (cur && !cur.endsWith("\n") ? "\n" : "") + line);
        editPage(c.file, (d) => { d.noindex = true; });
        recordChange(c.file, { kind: "optimisation", share: 0, note: `merged into ${same.path} (zero impressions since ${released}); 301`, path: c.path, rule: "zero-impressions-merge" });
      }
      continue;
    }
    if (close) result.suggestions.push({ path: c.path, closeTo: close.x.path, why: "close intent; merge the useful parts by hand or through the engine, then 301" });
    const use = analytics?.get(c.path);
    const unused = analytics && (!use || ((use.downloads ?? 1) === 0 && (use.visits ?? 1) === 0 && (use.appTaps ?? 0) === 0));
    if (unused && !close) {
      result.gone.push({ path: c.path, released, analytics: analytics.file });
      log(`  410 ${c.path} (no impressions, downloads or internal visits; no merge target)`);
      if (apply) {
        const gone = readJson("data/gone.json", []);
        if (!gone.includes(c.path)) writeJson("data/gone.json", [...gone, c.path].sort(), 0);
        unlinkSync(c.file);
        appendFileSync("data/maintenance/log.md", `- ${day}: ${c.path} removed (410); file ${c.file}\n`);
      }
      continue;
    }
    result.noindexed.push({ path: c.path, released, why: analytics ? "used, or has a close page to merge into first" : "usage unknown (no analytics export)" });
    log(`  noindex ${c.path} (zero impressions since ${released})`);
    if (apply) {
      editPage(c.file, (d) => { d.noindex = true; });
      recordChange(c.file, { kind: "optimisation", share: 0, note: `noindexed: zero impressions for ${config.zero_impression_months} months after release`, path: c.path, rule: "zero-impressions-noindex" });
    }
  }
  for (const n of result.notes) log(`  note: ${n}`);
  if (apply) writeJson(`data/maintenance/impressions/${day}.json`, { ...result, candidates: undefined });
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { mkdirSync } = await import("node:fs");
  mkdirSync("data/maintenance", { recursive: true });
  runImpressions({ apply: process.argv.includes("--apply") }).catch((e) => { console.error(e.stack ?? e); process.exit(1); });
}
