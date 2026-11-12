// Monthly recheck of the topic sheet's two Waiting statuses (brief section 16, run from `npm run weekly`):
// "Waiting: low demand" and "Waiting: high competition" rows are re-scored with fresh OpenSEO numbers
// (keywordData, cache ignored when older than a week, within the credit ledger) and rows that now pass the
// market's thresholds (cluster volume ≥ floor, main keyword KD under the limit) go back to "Not started",
// with a dated line in Notes. Runs only when the last recheck is 28+ days old
// (marker: data/keywords/waiting-recheck.json).
//   node scripts/keywords/recheck-waiting.mjs [--dry-run] [--force]
import { config } from "../lib/config.mjs";
import { STATUS, loadTopics, saveTopics, setRow } from "../lib/topics.mjs";
import { keywordData } from "./openseo.mjs";
import { daysBetween, readJson, today, writeJson } from "../gsc/common.mjs";

const MARKER = "data/keywords/waiting-recheck.json";

export async function recheckWaiting({ dryRun = false, force = false, log = console.log } = {}) {
  const day = today();
  const marker = readJson(MARKER, { lastRecheck: null });
  if (!force && marker.lastRecheck && daysBetween(marker.lastRecheck, day) < 28) {
    log(`Waiting rows: last rechecked ${marker.lastRecheck}; next recheck from ${new Date(new Date(marker.lastRecheck).getTime() + 28 * 864e5).toISOString().slice(0, 10)}`);
    return { ran: false, moved: [] };
  }
  const sheet = await loadTopics();
  const rows = sheet.topics.filter((t) => t.status === STATUS.lowDemand || t.status === STATUS.highCompetition);
  log(`Waiting rows: ${rows.length} to recheck${dryRun ? " (dry run: no lookups, nothing written)" : ""}`);
  if (dryRun || !rows.length) return { ran: false, due: rows.length, moved: [] };
  const byMarket = Object.groupBy(rows, (r) => (r.markets.includes("us") || !r.markets.length ? "us" : r.markets[0]));
  const moved = [], still = [];
  let failed = false;
  for (const [market, list] of Object.entries(byMarket)) {
    const t = config.guide_thresholds[market] ?? config.guide_thresholds.us;
    const kws = [...new Set(list.flatMap((r) => [r.keyword, ...r.supporting]).map((k) => k.toLowerCase().trim()).filter(Boolean))];
    const data = new Map();
    for (let i = 0; i < kws.length; i += 250) {
      const res = await keywordData(kws.slice(i, i + 250), market, { log, maxAgeDays: 7 });
      if (!res) { failed = true; log(`  ! ${market}: OpenSEO lookup failed or credits capped; these rows wait for next week`); break; }
      for (const r of res.rows) if (r) data.set(r.keyword, r);
    }
    if (failed) continue;
    for (const r of list) {
      const main = data.get(r.keyword.toLowerCase()) ?? { kd: null, volume: null };
      const cluster = [...new Set([r.keyword, ...r.supporting].map((k) => k.toLowerCase()))].reduce((n, k) => n + (data.get(k)?.volume ?? 0), 0);
      const pass = cluster >= t.volume && main.kd != null && main.kd < t.kd_under;
      const line = `Rechecked ${day}: cluster ${cluster}/mo, KD ${main.kd ?? "?"} (${market.toUpperCase()} floor ${t.volume}, KD under ${t.kd_under})${pass ? "; passes now, back to Not started." : "; still waiting."}`;
      setRow(sheet, r, { clusterVolume: cluster, kd: main.kd, checkedOn: day, keywordSource: "OpenSEO", notes: [r.notes, line].filter(Boolean).join(" "), ...(pass && { status: STATUS.notStarted }) });
      (pass ? moved : still).push(`#${r.n} ${r.keyword}`);
    }
  }
  await saveTopics(sheet);
  if (!failed) writeJson(MARKER, { lastRecheck: day, moved, stillWaiting: still.length });
  log(`Waiting rows: ${moved.length} back to Not started${moved.length ? ` (${moved.join(", ")})` : ""}; ${still.length} still waiting`);
  return { ran: true, moved };
}

if (import.meta.url === `file://${process.argv[1]}`) recheckWaiting({ dryRun: process.argv.includes("--dry-run"), force: process.argv.includes("--force") }).catch((e) => { console.error(e.stack ?? e); process.exit(1); });
