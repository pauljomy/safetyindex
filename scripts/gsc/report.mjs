// Weekly report (brief section 16): adds a dated section to PROGRESS.md under "## Weekly reports"
// (newest first), one subsection per market: clicks, impressions, CTR and position against the previous
// 28 days; top queries and pages; biggest gains and drops; what the improve loop changed; pages indexed
// against pages released. Then what needs a person: conflicts, wrong-country pages, pages not indexed,
// rule changes, zero-impression actions and section suggestions. Plain English, no code.
//   node scripts/gsc/report.mjs [--dry-run]   (prints instead of writing)
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MARKETS } from "../lib/config.mjs";
import { latestGsc } from "./data.mjs";
import { MARKET_ORDER, SITE, marketOf, readJson, today } from "./common.mjs";

const PROGRESS = "PROGRESS.md";
const HEADING = "## Weekly reports";
const fmt = (n) => (n == null ? "n/a" : Number(n).toLocaleString("en-GB"));
const pctf = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const delta = (a, b, f = fmt) => (b == null ? f(a) : `${f(a)} (previous 28 days: ${f(b)})`);
const latestIn = (dir) => { if (!existsSync(dir)) return null; const f = readdirSync(dir).filter((x) => x.endsWith(".json")).sort().at(-1); return f ? readJson(join(dir, f), null) : null; };
const url = (p) => `${SITE}${p}`;

export function weeklyReport({ extra = [] } = {}) {
  const day = today();
  const gsc = latestGsc();
  const imp = latestIn("data/gsc/improve");
  const rules = latestIn("data/rules/changes");
  const zero = latestIn("data/maintenance/impressions");
  const waves = readJson("data/release/waves.json", []);
  const insp = gsc?.inspection ?? {};
  const L = [`### Week of ${day}`, ""];
  if (!gsc) L.push("No Search Console data yet: add the service account (GSC_CREDENTIALS and GSC_PROPERTY) or drop a manual export into data/gsc/. The release gates skip until then.", "");
  else L.push(`Search Console data from ${gsc.startDate ?? "?"} to ${gsc.endDate}${gsc.source ? ` (${gsc.source})` : ""}. Whole site: ${delta(gsc.totals?.clicks, gsc.prevTotals?.clicks)} clicks, ${delta(gsc.totals?.impressions, gsc.prevTotals?.impressions)} impressions, CTR ${delta(gsc.totals?.ctr, gsc.prevTotals?.ctr, pctf)}, average position ${delta(gsc.totals?.position, gsc.prevTotals?.position, (x) => (x == null ? "n/a" : x.toFixed(1)))}.`, "");

  for (const m of MARKET_ORDER) {
    const name = MARKETS[m].name;
    const mk = gsc?.markets?.[m];
    const pages = (gsc?.pages ?? []).filter((p) => marketOf(p.path) === m);
    const released = [...new Set(waves.flatMap((w) => w.paths).filter((p) => marketOf(p) === m))];
    const inspected = released.filter((p) => insp[p]);
    const changes = (imp?.changes ?? []).filter((c) => marketOf(c.path) === m);
    if (!mk?.impressions && !pages.length && !released.length && !changes.length) { L.push(`#### ${name}`, "", "No search data or releases for this market yet.", ""); continue; }
    L.push(`#### ${name}`, "");
    if (mk) L.push(`- Clicks ${delta(mk.clicks, mk.prev?.clicks)}; impressions ${delta(mk.impressions, mk.prev?.impressions)}; CTR ${delta(mk.ctr, mk.prev?.ctr, pctf)}; average position ${delta(mk.position, mk.prev?.position, (x) => (x ? x.toFixed(1) : "n/a"))}.`);
    if (mk?.topQueries?.length) L.push(`- Top searches: ${mk.topQueries.slice(0, 5).map((q) => `"${q.query}" (${fmt(q.clicks)} click${q.clicks === 1 ? "" : "s"}, ${fmt(q.impressions)} impressions)`).join("; ")}.`);
    const top = [...pages].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 5);
    if (top.length) L.push(`- Top pages: ${top.map((p) => `${url(p.path)} (${fmt(p.clicks)} click${p.clicks === 1 ? "" : "s"})`).join("; ")}.`);
    const moved = pages.map((p) => ({ ...p, d: p.impressions - (p.prevImpressions ?? 0) })).filter((p) => p.d !== 0);
    const gains = moved.filter((p) => p.d > 0).sort((a, b) => b.d - a.d).slice(0, 3);
    const drops = moved.filter((p) => p.d < 0).sort((a, b) => a.d - b.d).slice(0, 3);
    if (gains.length) L.push(`- Biggest gains (impressions): ${gains.map((p) => `${url(p.path)} up ${fmt(p.d)}`).join("; ")}.`);
    if (drops.length) L.push(`- Biggest drops (impressions): ${drops.map((p) => `${url(p.path)} down ${fmt(-p.d)}`).join("; ")}.`);
    if (changes.length) L.push(`- Changed by the improve loop: ${changes.map((c) => (c.rule === "ctr" ? `${url(c.path)}: new search title "${c.new?.seoTitle ?? "(planned)"}" (was "${c.old?.seoTitle}"; CTR was ${pctf(c.ctr)})` : `${url(c.path)}: other pages now link to it on "${c.phrase}"`)).join("; ")}.`);
    else L.push("- No improve-loop changes this week.");
    if (released.length) L.push(`- Indexing: ${inspected.filter((p) => insp[p].indexed).length} of ${inspected.length} inspected pages indexed (${released.length} released in total${released.length > inspected.length ? `; ${released.length - inspected.length} not inspected yet` : ""}).`);
    L.push("");
  }

  const todo = [];
  for (const r of imp?.restores ?? []) todo.push(`Title test on ${url(r.path)} (changed ${r.changedOn}): CTR ${pctf(r.ctrBefore)} before, ${pctf(r.ctrAfter)} after; ${r.action}.`);
  for (const c of imp?.conflicts ?? []) todo.push(`Two pages for "${c.query}": ${c.pages.map((p) => url(p.path)).join(" and ")}. Main page (${c.mainFrom}): ${url(c.main)}. Suggested: ${c.suggestion}.`);
  for (const w of imp?.wrongCountry ?? []) todo.push(`Wrong country: ${url(w.path)} gets ${pctf(w.ownCountryShare)} of its impressions from its own country (top: ${String(w.topCountry).toUpperCase()}, ${pctf(w.topCountryShare)}). ${w.suggestion}.`);
  for (const s of imp?.sectionSuggestions ?? []) todo.push(`Position ${s.position} for ${url(s.path)} (${fmt(s.impressions)} impressions): ${s.why}${s.queriesNotAnswered.length ? `; searches the page may not answer: ${s.queriesNotAnswered.map((q) => `"${q}"`).join(", ")}` : ""}. A new section only if the source material covers it.`);
  if (imp?.newTopics?.length) todo.push(`Added to the topic sheet from Search Console: ${imp.newTopics.map((t) => `"${t.query}" (${t.market.toUpperCase()}, ${fmt(t.impressions)} impressions)`).join("; ")}.`);
  for (const n of imp?.notIndexed ?? []) todo.push(`Not indexed: ${url(n.path)} (${n.coverage || "no coverage state"}${n.googleCanonical && n.googleCanonical !== n.path ? `; Google chose ${url(n.googleCanonical)} as canonical` : ""}).`);
  if (rules) {
    if (rules.affected?.length) todo.push(`Regulation changes (eCFR, checked ${rules.date}): ${rules.affected.map((a) => `${url(a.path)} (${a.sections.map((s) => `29 CFR ${s.section} amended ${s.amended}`).join(", ")})`).join("; ")}. These are in the rewrite queue; the engine rewrites and rechecks them.`);
    else todo.push(`Regulation changes (eCFR, checked ${rules.date}): none affect a page (${rules.sectionsChecked} cited sections).`);
    for (const t of rules.todo ?? []) todo.push(`To do: ${t}`);
  }
  if (zero) {
    const z = [...zero.merged.map((x) => `${url(x.path)} merged into ${url(x.into)}`), ...zero.noindexed.map((x) => `${url(x.path)} noindexed`), ...zero.gone.map((x) => `${url(x.path)} removed (410)`)];
    if (z.length) todo.push(`Zero-impression pages (${zero.date}): ${z.join("; ")}.`);
  }
  for (const n of imp?.notes ?? []) todo.push(`Improve loop note: ${n}.`);
  todo.push(...extra);
  if (todo.length) L.push("#### Needs a look", "", ...todo.map((t) => `- ${t}`), "");
  return L.join("\n");
}

export function appendReport(text) {
  let t = existsSync(PROGRESS) ? readFileSync(PROGRESS, "utf8") : "# Safety Index build-out: progress\n";
  if (!t.includes(`${HEADING}\n`)) t = `${t.trimEnd()}\n\n${HEADING}\n`;
  t = t.replace(`${HEADING}\n`, `${HEADING}\n\n${text.trimEnd()}\n`);
  writeFileSync(PROGRESS, t);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = weeklyReport();
  if (process.argv.includes("--dry-run")) console.log(text);
  else { appendReport(text); console.log(`weekly report added to ${PROGRESS}`); }
}
