// Quarterly audit (brief section 16): data/audit/<date>.csv with every URL in the built sitemaps:
// impressions and clicks (latest Search Console summary), downloads and app-button taps (blank unless an
// analytics export is in data/analytics/), page and topic type, the date of the last upgrade or rewrite,
// whether its sources changed (latest data/rules/changes/ file), and an action decided by simple rules:
//   merge    another live page in the same market targets the same keyword (and this one has fewer impressions);
//   noindex  zero impressions and released more than `zero_impression_months` ago;
//   rewrite  a cited regulation was removed, or substantively amended after the page was written;
//   update   sources changed (non-substantive), or position 11–30 with 100+ impressions, or CTR under 1% with
//            500+ impressions, or no upgrade/rewrite in over a year;
//   keep     everything else.
// The top 20 rewrite and update candidates go to data/rewrite-queue.json (from: "audit"), which the
// engine processes through the weekly run.
//   npm run audit [-- --dry-run]
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { config } from "../lib/config.mjs";
import { SITE, addDays, contentIndex, daysBetween, isLive, latestAnalytics, marketOf, readJson, releaseDateOf, toCsv, toPath, today } from "../gsc/common.mjs";
import { latestGsc } from "../gsc/data.mjs";
import { addToRewriteQueue } from "../gsc/rewrite-queue.mjs";

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function sitemapUrls() {
  if (!existsSync("dist")) return null;
  const files = readdirSync("dist").filter((f) => /^sitemap-.+\.xml$/.test(f) && f !== "sitemap-index.xml");
  if (!files.length) return null;
  return [...new Set(files.flatMap((f) => [...readFileSync(join("dist", f), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])))];
}

function latestRuleChanges() {
  const dir = "data/rules/changes";
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).filter((x) => x.endsWith(".json")).sort().at(-1);
  return f ? readJson(join(dir, f), null) : null;
}

export function runAudit({ dryRun = false, log = console.log } = {}) {
  const day = today();
  let urls = sitemapUrls();
  const content = contentIndex();
  const byPath = new Map(content.map((c) => [c.path, c]));
  if (!urls) { log("audit: dist/ has no sitemaps (run npm run build first); using the live content files instead"); urls = content.filter(isLive).map((c) => `${SITE}${c.path}`); }
  const gsc = latestGsc();
  const rows = new Map((gsc?.pages ?? []).map((p) => [p.path, p]));
  const analytics = latestAnalytics();
  const rules = latestRuleChanges();
  const changed = new Map((rules?.affected ?? []).map((a) => [a.path, a]));
  const cutoff = gsc ? addDays(gsc.endDate, -Math.round((config.zero_impression_months ?? 3) * 30.4)) : null;
  const out = [];
  for (const url of urls) {
    const path = toPath(url);
    const c = byPath.get(path);
    const r = rows.get(path);
    const impressions = gsc ? (gsc.pageImpressions?.[path] ?? 0) : null;
    const use = analytics?.get(path);
    const last = (c?.data.changes ?? []).filter((x) => x.kind === "upgrade" || x.kind === "rewrite").map((x) => String(x.date).slice(0, 10)).sort().at(-1) ?? "";
    const written = c ? String(c.data.updated ?? c.data.generatedOn ?? c.data.date ?? "").slice(0, 10) : "";
    const rc = changed.get(path);
    const dup = c?.data.keyword && content.find((x) => x !== c && x.market === c.market && isLive(x) && norm(x.data.keyword) === norm(c.data.keyword));
    let action = "keep", why = "";
    if (c) {
      if (dup && (gsc?.pageImpressions?.[dup.path] ?? 0) >= (impressions ?? 0)) { action = "merge"; why = `same keyword as ${dup.path}`; }
      else if (gsc && impressions === 0 && releaseDateOf(c) && releaseDateOf(c) <= cutoff) { action = "noindex"; why = `no impressions since release (${releaseDateOf(c)})`; }
      else if (rc?.sections.some((s) => s.removed || s.substantive)) { action = "rewrite"; why = `regulation changed: ${rc.sections.map((s) => `${s.section} ${s.amended}`).join(", ")}`; }
      else if (rc) { action = "update"; why = "regulation text changed (non-substantive)"; }
      else if (r && r.position > 10 && r.position <= 30 && r.impressions >= 100) { action = "update"; why = `position ${r.position} with ${r.impressions} impressions`; }
      else if (r && r.impressions >= 500 && r.ctr < 0.01) { action = "update"; why = `CTR ${(r.ctr * 100).toFixed(1)}% on ${r.impressions} impressions`; }
      else if ((last || written) && daysBetween(last || written, day) > 365) { action = "update"; why = `no upgrade or rewrite since ${last || written}`; }
    }
    out.push({ url, path, market: marketOf(path), pageType: c?.kind ?? "hub/other", topicType: c?.data.topicType ?? "", impressions: impressions ?? "", clicks: gsc ? (r?.clicks ?? 0) : "", downloads: use?.downloads ?? "", appTaps: use?.appTaps ?? "", lastUpgradeOrRewrite: last, sourcesChanged: rules ? (rc ? "yes" : "no") : "", action, why });
  }
  mkdirSync("data/audit", { recursive: true });
  const file = `data/audit/${day}.csv`;
  writeFileSync(file, toCsv(["url", "market", "page type", "topic type", "impressions", "clicks", "downloads", "app button taps", "last upgrade or rewrite", "sources changed", "action", "why"], out.map((o) => [o.url, o.market, o.pageType, o.topicType, o.impressions, o.clicks, o.downloads, o.appTaps, o.lastUpgradeOrRewrite, o.sourcesChanged, o.action, o.why])));
  const counts = Object.groupBy(out, (o) => o.action);
  log(`audit: ${out.length} URLs → ${file} (${Object.entries(counts).map(([k, v]) => `${v.length} ${k}`).join(", ")})`);
  if (!gsc) log("  no Search Console data: impressions and clicks are blank");
  if (!analytics) log("  no analytics export in data/analytics/: downloads and app-button taps are blank");
  // Top 20 rewrite and update candidates → the rewrite queue.
  const rank = (o) => (o.action === "rewrite" ? 1e9 : 0) + (Number(o.impressions) || 0);
  const top = out.filter((o) => (o.action === "rewrite" || o.action === "update") && byPath.has(o.path)).sort((a, b) => rank(b) - rank(a)).slice(0, 20);
  const added = addToRewriteQueue(top.map((o) => ({ path: o.path, from: "audit", problems: [`quarterly audit (${day}): ${o.action}: ${o.why}`] })), { dryRun });
  log(`  ${top.length} update/rewrite candidate(s) for the engine; ${dryRun ? "not queued (dry run)" : `${added} newly added to data/rewrite-queue.json`}`);
  return { file, rows: out, queued: top.map((o) => o.path) };
}

if (import.meta.url === `file://${process.argv[1]}`) runAudit({ dryRun: process.argv.includes("--dry-run") });
