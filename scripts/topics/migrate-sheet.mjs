// One-off migration of docs/Safety_Blog_Topics.xlsx to the build-out layout
// (brief section 5): new columns, topic types and markets, Dropped rows, the
// rows waiting for lower competition (KD from the 12 Nov 2026 OpenSEO check),
// and the "How to Use" sheet. Safe to re-run: it only fills empty cells and
// never touches Published rows' status.
//   node scripts/topics/migrate-sheet.mjs
import { COLUMNS, STATUS, loadTopics, saveTopics, setRow } from "../lib/topics.mjs";

const REGIONAL = "US, UK, AU, CA, NZ, FR, DE";
const EVERYWHERE = "US, FR, DE"; // FR/DE only when the local search finds a local regulator source
const US = "US";

// Topic type per sheet # (see brief sections 4 and 5).
const type = {};
const set = (t, nums) => nums.forEach((n) => (type[n] = t));
set("regional", [1, 2, 3, 6, 7, 8, 9, 10, 11, 15, 16, 17, 22, 23, 24, 37, 41, 43, 47, 48, 50, 52, 63, 69, 81, 85, 86, 90, 91, 92, 93, 97, 99, 100, 104, 107, 109, 111, 112, 114, 115, 117, 118, 120, 121, 124, 125, 130, 131, 133, 137]);
set("same everywhere", [12, 14, 19, 20, 26, 27, 30, 31, 32, 33, 34, 35, 39, 40, 42, 44, 53, 54, 57, 58, 59, 60, 61, 62, 64, 66, 67, 71, 72, 73, 74, 75, 76, 79, 82, 84, 87, 98, 102, 103, 106, 108, 110, 113, 126, 127, 128, 132, 135]);
set("country-only", [4, 5, 13, 21, 38, 51, 55, 56, 65, 68, 70, 77, 78, 80, 88, 89, 94, 95, 96, 101, 105, 116, 122, 123, 129, 134, 136, 138]);
const marketsFor = (n) => (n === 138 ? "CA" : n === 101 ? "UK" : type[n] === "regional" ? REGIONAL : type[n] === "same everywhere" ? EVERYWHERE : US);

const dropped = {
  18: "Thin list of short messages; no inspection, plan, permit or test to act on.",
  25: "One-off history topic (Hoover Dam deaths); not an action a reader takes at work.",
  28: "Search for online food handler courses, which we don't sell.",
  29: "Thin list (safety slogans).",
  36: "Thin list (100 toolbox talk topics).",
  45: "Search for online defensive driving courses, which we don't sell.",
  46: "Search for OSHA certification courses, which we don't sell.",
  49: "Thin list (50 safety tips).",
  83: "Search for free first aid and CPR courses, which we don't sell.",
  105: "Main source is the paid ISO 45001 standard (text can't be used); also KD 26 on 12 Nov 2026.",
  119: "Thin list (safety awareness calendar).",
};

// KD of the primary keyword from the 12 Nov 2026 OpenSEO check (brief section 6): KD 15+ waits.
const highKd = {
  "occupational health and safety": 73, "cor certification": 68, ergonomics: 56, "haccp restaurant plan": 56, "electrical safety": 51,
  "osha standards": 51, "workplace violence": 51, "evacuation plan": 48, "psychological safety": 47, "osha violations": 45,
  "fall protection": 42, "electrical fire": 41, "osha inspection": 41, hazards: 38, "injury prevention": 37, "what is food safety": 35,
  "osha heat regulations": 34, "in the line of fire": 32, "safety training": 32, "what is safeguards": 30, "environmental hazards": 29,
  "osha 30": 29, "certified safety professional": 28, "toxic substances control act": 27, "iso 45001": 26, "radiation protection": 25,
  "what does osha stand for": 25, "crane operator training": 24, "foodborne illness prevention": 23, "safety culture": 23,
  "first aid kit items": 22, "definition of first aid": 21, "safety precautions": 21, "fire prevention tips": 20, "kitchen safety": 20,
  respirator: 20, "risk matrix": 20, "fire safety training": 19, "how to use an aed": 18, "construction safety": 17,
  "material safety data sheet": 17, "carbon monoxide detector replacement": 15, "ladder safety": 15,
};
// "ergonomics (56)" in the brief; the HACCP row (56) is not on the list, so only the brief's keywords count.
delete highKd["haccp restaurant plan"];

// Guides that overlap a planned standard page (brief section 5). URLs are filled in once the
// standard slugs exist (scripts/data/build-standards.mjs); until then the section number stands in.
const overlaps = {
  6: "1910.147", 22: "1926.502", 51: "1910.1200", 55: "1910.1000", 69: "1910.151", 111: "1910.151", 77: "1926.501",
  85: "1910.146", 86: "1926.1053", 92: "1910.178", 96: "1926 Subpart P", 97: "1926.451", 136: "1910.1030", 137: "1910.212",
};
const notes = {
  13: "Food safety: FDA Food Code, USDA FSIS and CDC sources, not OSHA. US-only.",
  56: "Food safety: FDA Food Code, USDA FSIS and CDC sources, not OSHA. US-only.",
  70: "Food safety: FDA Food Code, USDA FSIS and CDC sources, not OSHA. US-only.",
  78: "Food safety: FDA Food Code, USDA FSIS and CDC sources, not OSHA. US-only.",
  89: "Food safety: FDA Food Code, USDA FSIS and CDC sources, not OSHA. US-only.",
  94: "Food safety: FDA Food Code, USDA FSIS and CDC sources, not OSHA. US-only.",
  122: "Food safety: FDA Food Code, USDA FSIS and CDC sources, not OSHA. US-only.",
  138: "Canadian provincial programme: written for /ca/ from Canadian sources, not the US blog.",
  88: "Rule may have changed: state its current status from the official source downloaded on the day of writing.",
  77: "Subject covered by the 1926.501 fall protection standard page.",
  134: "Becomes the yearly report (/us/reports/most-cited-osha-standards-{year}), not a post. Data pages are not KD-gated.",
  101: "PEEPs are a UK fire safety concept: written for /uk/ from UK sources.",
  4: "Published before the build. Country-only US topic; the German version is noindexed (mostly US sources), the French version cites INRS and stays.",
  1: "Published before the build.", 2: "Published before the build. The German version is noindexed (only US sources).",
  3: "Published before the build. The French version is noindexed (only US sources).",
};

const sheet = await loadTopics();
const { ws } = sheet;
// Header cells for the new columns, styled like the existing ones.
const header = ws.getRow(1);
const style = header.getCell(7).style;
COLUMNS.forEach(([, label], i) => {
  const cell = header.getCell(i + 1);
  if (!cell.value) { cell.value = label; cell.style = style; }
});
[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].forEach((c, i) => (ws.getColumn(c).width = [16, 24, 34, 26, 14, 8, 14, 12, 16, 40, 60][i]));

const log = [];
for (const t of sheet.topics) {
  const f = {};
  if (!t.topicType) f.topicType = type[t.n] ?? "same everywhere";
  if (!t.markets.length) f.markets = marketsFor(t.n);
  if (!t.notes && notes[t.n]) f.notes = notes[t.n];
  if (overlaps[t.n] && !t.overlaps) { f.overlaps = `US standard page ${overlaps[t.n]}`; f.mainPage ||= "this guide (how-to search)"; }
  if (t.n === 134) f.mainPage = "/us/reports/most-cited-osha-standards (yearly report)";
  if (t.status !== STATUS.published) {
    if (dropped[t.n]) { f.status = STATUS.dropped; f.notes = dropped[t.n]; log.push(`#${t.n} dropped: ${dropped[t.n]}`); }
    else if (highKd[t.keyword.toLowerCase()] != null && t.n !== 134) {
      f.kd = highKd[t.keyword.toLowerCase()];
      f.status = STATUS.highCompetition;
      f.notes = [notes[t.n], `KD ${f.kd} on the 12 Nov 2026 OpenSEO check.`].filter(Boolean).join(" ");
    } else if (!t.status) f.status = STATUS.notStarted;
  }
  if (t.n === 134) f.kd = 45;
  if (Object.keys(f).length) setRow(sheet, t, f);
}

// How to Use sheet.
const how = sheet.wb.getWorksheet("How to Use");
const lines = [
  "How to use this list",
  "One row = one guide topic, in publishing order. It is the single source of truth for guides (brief section 5).",
  "Primary Keyword: the main search term the guide targets (title, URL, first 100 words, one H2). Supporting Keywords: related searches covered in the same guide as headings or FAQ, never separate posts.",
  "Status: only 'Not started' rows are written. Published, Dropped, 'Waiting: low demand', 'Waiting: high competition' and 'Skipped: search results' are skipped. The weekly run rechecks both Waiting statuses each month and moves rows that now pass back to 'Not started'.",
  "Published URL: filled in when the guide goes live.",
  "Topic type: country-only (exists under one country's law; one page in that market), same everywhere (one English page in the most relevant market; French/German only when a local regulator source exists) or regional (a separate page per market, each from that market's own law, with hreflang).",
  "Markets: which markets get a version (US, UK, AU, CA, NZ, FR, DE). The generator writes only these.",
  "Main page for keyword: the URL that owns this search. Overlaps: other pages on the same subject (for example the US standard page). The guide owns the how-to search; the standard page owns the requirements and regulation-number searches; they link to each other.",
  "Cluster volume, KD, Intent, Checked on: keyword data (cluster volume = monthly searches of the main keyword plus the related keywords the page answers; KD = keyword difficulty of the main keyword). Guides need cluster volume >= the market floor (US 500, UK/AU/CA 150, DE/FR 200, NZ 50) and KD under 15.",
  "Keyword source: OpenSEO, Search Console or topic sheet. Go/no-go: the search-results check before writing (write / skip, with the reason).",
  "Notes: anything else (why a row was dropped or is waiting, retargets, mis-sorted topics).",
  "Facts always come from current official sources (OSHA, eCFR, HSE, INRS, DGUV, Safe Work Australia, CCOHS, WorkSafe NZ...), never from this list.",
];
how.spliceRows(1, how.rowCount);
lines.forEach((l, i) => { how.getRow(i + 1).getCell(1).value = l; });
how.getRow(1).font = { bold: true, size: 13 };
how.getColumn(1).width = 160;
how.getColumn(1).alignment = { wrapText: true, vertical: "top" };

await saveTopics(sheet);
const counts = {};
for (const t of sheet.topics) counts[t.status] = (counts[t.status] ?? 0) + 1;
console.log(log.join("\n"));
console.log(counts);
const types = {};
for (const t of sheet.topics) types[t.topicType] = (types[t.topicType] ?? 0) + 1;
console.log(types);
