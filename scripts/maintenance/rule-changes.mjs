// Rule changes (brief section 16), run weekly. For every 29 CFR section a page cites (standard pages:
// their section and clauses; guides and other pages: CFR references in the text and source links),
// the eCFR versioner API gives the amendment dates per section:
//   https://www.ecfr.gov/api/versioner/v1/versions/title-29.json?part=1910
// A page is affected when a cited section was amended after the text the page was written from
// (standard pages: `ecfrDate`; other pages: dataAsOf, updated or date). Affected pages are listed in
// data/rules/changes/<date>.json (read by the weekly report) and added to data/rewrite-queue.json with
// the reason; the engine rewrites them, and the checking pass rechecks them and their downloads against
// the new text. data/rules/ecfr-versions.json keeps the latest amendment date per section, so the report
// can say which amendments are new since the last check.
// UK, AU, CA, NZ, FR and DE: no change feed is wired yet (a TODO in the report).
//   npm run rules:check [-- --dry-run]
import { contentIndex, isLive, readJson, today, writeJson } from "../gsc/common.mjs";
import { addToRewriteQueue } from "../gsc/rewrite-queue.mjs";

const SNAPSHOT = "data/rules/ecfr-versions.json";
const SECTION_RE = /(?<![\d.])(19(?:04|10|15|17|18|26|28)\.\d+[a-z]?)(?![\d])/g;

export const OTHER_MARKETS_TODO = [
  "UK (legislation.gov.uk), Australia (legislation.gov.au and state registers), Canada (laws-lois.justice.gc.ca and provinces), New Zealand (legislation.govt.nz), France (Légifrance) and Germany (gesetze-im-internet.de, DGUV): legislation change feeds aren't wired yet, so pages for these markets aren't checked for rule changes automatically. legislation.gov.uk publishes Atom feeds of new and changed legislation, the most likely first one to add.",
];

/** CFR sections a page cites. */
export function citedSections(c) {
  const s = new Set();
  if (c.kind === "standard" && c.data.section) s.add(c.data.section);
  for (const m of `${c.text}\n${c.body ?? ""}`.matchAll(SECTION_RE)) s.add(m[1]);
  return [...s];
}

/** Latest amendment date per section of one part: { "1910.147": { date, substantive } }. */
async function partVersions(part) {
  const res = await fetch(`https://www.ecfr.gov/api/versioner/v1/versions/title-29.json?part=${part}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`eCFR versioner HTTP ${res.status} for part ${part}`);
  const j = await res.json();
  const out = {};
  for (const v of j.content_versions ?? []) {
    if (v.type !== "section") continue;
    const d = v.amendment_date ?? v.date;
    const cur = out[v.identifier];
    if (!cur || d > cur.date) out[v.identifier] = { date: d, substantive: !!v.substantive, removed: !!v.removed };
  }
  return out;
}

export async function checkRuleChanges({ dryRun = false, log = console.log } = {}) {
  const day = today();
  const pages = contentIndex().filter((c) => c.market === "us" || citedSections(c).length).filter((c) => isLive(c) || c.data.generatedOn);
  const cites = new Map(pages.map((c) => [c.path, citedSections(c)]));
  const parts = [...new Set([...cites.values()].flat().map((s) => s.split(".")[0]))].sort();
  const snapshot = readJson(SNAPSHOT, { checkedOn: null, sections: {} });
  const latest = {};
  const errors = [];
  for (const part of parts) {
    try { Object.assign(latest, await partVersions(part)); } catch (e) { errors.push(e.message); log(`  ! ${e.message}`); }
  }
  const cited = new Set([...cites.values()].flat());
  const newAmendments = [...cited].filter((s) => latest[s] && snapshot.sections[s] && latest[s].date > snapshot.sections[s].date).map((s) => ({ section: s, amended: latest[s].date, before: snapshot.sections[s].date, substantive: latest[s].substantive, removed: latest[s].removed }));
  const affected = [];
  for (const c of pages) {
    const asOf = String(c.kind === "standard" ? c.data.ecfrDate ?? c.data.dataAsOf ?? c.data.date : c.data.dataAsOf ?? c.data.updated ?? c.data.date ?? "").slice(0, 10);
    if (!asOf) continue;
    const hits = cites.get(c.path).filter((s) => latest[s] && latest[s].date > asOf).map((s) => ({ section: s, amended: latest[s].date, substantive: latest[s].substantive, removed: latest[s].removed }));
    if (hits.length) affected.push({ path: c.path, kind: c.kind, writtenFrom: asOf, sections: hits });
  }
  const queued = addToRewriteQueue(affected.map((a) => ({ path: a.path, from: "rule-changes", problems: a.sections.map((h) => `29 CFR ${h.section} ${h.removed ? "removed" : "amended"} on ${h.amended}${h.substantive ? "" : " (non-substantive)"}; page written from the text as of ${a.writtenFrom}`) })), { dryRun });
  const result = { date: day, dryRun, sectionsChecked: cited.size, parts, newAmendments, affected, queued, errors, todo: OTHER_MARKETS_TODO };
  if (!dryRun) {
    writeJson(SNAPSHOT, { checkedOn: day, sections: { ...snapshot.sections, ...Object.fromEntries([...cited].filter((s) => latest[s]).map((s) => [s, latest[s]])) } });
    writeJson(`data/rules/changes/${day}.json`, result);
  }
  log(`rule changes: ${cited.size} cited CFR section(s) in ${parts.length} part(s); ${newAmendments.length} new amendment(s) since ${snapshot.checkedOn ?? "the first check"}; ${affected.length} page(s) written before an amendment${dryRun ? "" : `, ${queued} newly added to the rewrite queue`}`);
  for (const a of affected) log(`  ${a.path}: ${a.sections.map((h) => `${h.section} (${h.amended})`).join(", ")}`);
  for (const t of OTHER_MARKETS_TODO) log(`  TODO: ${t}`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) checkRuleChanges({ dryRun: process.argv.includes("--dry-run") }).catch((e) => { console.error(e.stack ?? e); process.exit(1); });
