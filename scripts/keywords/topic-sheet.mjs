// Keyword columns for the topic sheet (brief section 6): cluster volume (main + supporting keywords
// the guide will answer), KD, intent, checked-on and source, then the thresholds:
//  - KD 15+ → "Waiting: high competition", unless the cluster has a phrase with the same intent and
//    KD under 15 with enough volume, in which case the row is retargeted to it (logged in Notes);
//  - cluster volume under the US floor → "Waiting: low demand".
//   node scripts/keywords/topic-sheet.mjs [--dry-run] [--balance 3902]
import { appendFileSync } from "node:fs";
import { config } from "../lib/config.mjs";
import { STATUS, loadTopics, saveTopics, setRow } from "../lib/topics.mjs";
import { keywordData, ledger } from "./openseo.mjs";
import { writeFileSync, mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const bal = args.indexOf("--balance");
if (bal >= 0) { const l = ledger(); l.balance = Number(args[bal + 1]); l.balanceCheckedOn = new Date().toISOString().slice(0, 10); mkdirSync("data/keywords", { recursive: true }); writeFileSync("data/keywords/ledger.json", `${JSON.stringify(l, null, 2)}\n`); }

const t = config.guide_thresholds.us;
const sheet = await loadTopics();
const rows = sheet.topics.filter((r) => [STATUS.notStarted, STATUS.highCompetition, STATUS.lowDemand].includes(r.status) && !/^\/us\/reports\//.test(r.mainPage) && (r.markets.includes("us") || !r.markets.length));
const all = [...new Set(rows.flatMap((r) => [r.keyword, ...r.supporting].map((k) => k.toLowerCase().trim())))];
console.log(`${rows.length} rows, ${all.length} keywords`);
const data = new Map();
for (let i = 0; i < all.length; i += 250) {
  const res = await keywordData(all.slice(i, i + 250), "us");
  if (!res) { console.error("OpenSEO lookup failed or credits exhausted; stopping"); process.exit(1); }
  for (const r of res.rows) data.set(r.keyword, r);
}
const today = new Date().toISOString().slice(0, 10);
const log = [];
const content = (s) => s.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !["what", "with", "your", "from", "that", "this", "does", "osha"].includes(w));
for (const r of rows) {
  const main = data.get(r.keyword.toLowerCase()) ?? { volume: null, kd: null, intent: null };
  const cluster = [...new Set([r.keyword, ...r.supporting].map((k) => k.toLowerCase()))].reduce((n, k) => n + (data.get(k)?.volume ?? 0), 0);
  const f = { clusterVolume: cluster, kd: main.kd, intent: main.intent ?? "", checkedOn: today, keywordSource: "OpenSEO" };
  if (main.kd != null && main.kd >= t.kd_under) {
    // Retarget: a phrase in the cluster with the same intent, KD under 15 and enough volume.
    const head = new Set(content(r.keyword));
    const alt = r.supporting.map((k) => data.get(k.toLowerCase())).filter((x) => x && x.kd != null && x.kd < t.kd_under && (x.intent ?? "") === (main.intent ?? "") && content(x.keyword).some((w) => head.has(w)))
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0];
    if (alt && cluster >= t.volume && (alt.volume ?? 0) >= 100) {
      Object.assign(f, { status: STATUS.notStarted, keyword: undefined, kd: alt.kd, notes: [r.notes, `Retargeted ${today}: "${r.keyword}" (KD ${main.kd}) → "${alt.keyword}" (KD ${alt.kd}, ${alt.volume}/mo, same intent).`].filter(Boolean).join(" ") });
      log.push(`#${r.n} retargeted "${r.keyword}" (KD ${main.kd}) → "${alt.keyword}" (KD ${alt.kd}, ${alt.volume}/mo)`);
      if (!dry) { r.supporting = [r.keyword, ...r.supporting.filter((k) => k.toLowerCase() !== alt.keyword)]; sheet.ws.getRow(r.row).getCell(4).value = alt.keyword; sheet.ws.getRow(r.row).getCell(5).value = r.supporting.join(", "); }
    } else {
      f.status = STATUS.highCompetition;
      if (!/KD \d+/.test(r.notes)) f.notes = [r.notes, `KD ${main.kd} on ${today} (OpenSEO).`].filter(Boolean).join(" ");
    }
  } else if (cluster < t.volume) {
    f.status = STATUS.lowDemand;
    f.notes = [r.notes, `Cluster volume ${cluster}/mo on ${today} (floor ${t.volume}).`].filter(Boolean).join(" ");
    log.push(`#${r.n} waiting: low demand (${cluster}/mo)`);
  } else if (r.status !== STATUS.notStarted) f.status = STATUS.notStarted;
  delete f.keyword;
  if (!dry) setRow(sheet, r, f);
}
if (!dry) await saveTopics(sheet);
const counts = {};
for (const r of sheet.topics) counts[r.status] = (counts[r.status] ?? 0) + 1;
console.log(log.join("\n"));
console.log(counts);
appendFileSync("data/keywords/topic-sheet-log.txt", `${today}\n${log.join("\n")}\n${JSON.stringify(counts)}\n\n`);
