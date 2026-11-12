// docs/Safety_Blog_Topics.xlsx, sheet "Blog Topics": the guide queue, in publishing order.
// Columns: # | Category | Blog Post Title | Primary Keyword | Supporting Keywords | Status | Published URL |
//   Topic type | Markets | Main page for keyword | Overlaps | Cluster volume | KD | Intent | Checked on |
//   Keyword source | Go/no-go | Notes
// Only "Not started" rows are written. Every other status is skipped:
// Published, Dropped, Waiting: low demand, Waiting: high competition, Skipped: search results.
import ExcelJS from "exceljs";

export const SHEET_FILE = "docs/Safety_Blog_Topics.xlsx";
const SHEET = "Blog Topics";
export const COLUMNS = [
  ["n", "#"], ["category", "Category"], ["title", "Blog Post Title"], ["keyword", "Primary Keyword"],
  ["supporting", "Supporting Keywords"], ["status", "Status"], ["url", "Published URL"],
  ["topicType", "Topic type"], ["markets", "Markets"], ["mainPage", "Main page for keyword"], ["overlaps", "Overlaps"],
  ["clusterVolume", "Cluster volume"], ["kd", "KD"], ["intent", "Intent"], ["checkedOn", "Checked on"],
  ["keywordSource", "Keyword source"], ["goNoGo", "Go/no-go"], ["notes", "Notes"],
];
const COL = Object.fromEntries(COLUMNS.map(([k], i) => [k, i + 1]));

export const STATUS = {
  notStarted: "Not started", published: "Published", dropped: "Dropped",
  lowDemand: "Waiting: low demand", highCompetition: "Waiting: high competition", skipped: "Skipped: search results",
};
export const TOPIC_TYPES = ["country-only", "same everywhere", "regional"];

const cellText = (c) => {
  const v = c.value;
  if (v == null) return "";
  if (typeof v === "object") return v.text ?? v.result ?? (v.richText ? v.richText.map((r) => r.text).join("") : "");
  return String(v);
};

/** "US, FR, DE" → ["us", "fr", "de"] */
export const parseMarkets = (s) => String(s ?? "").split(/[,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean);

export async function loadTopics() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SHEET_FILE);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`${SHEET_FILE} has no "${SHEET}" sheet`);
  const topics = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const get = (k) => cellText(row.getCell(COL[k])).trim();
    if (!get("title")) return;
    const num = (k) => (get(k) === "" ? null : Number(get(k)));
    topics.push({
      row: i, n: Number(get("n")) || i - 1, category: get("category"), title: get("title"), keyword: get("keyword"),
      supporting: get("supporting").split(",").map((s) => s.trim()).filter(Boolean), status: get("status"), url: get("url"),
      topicType: get("topicType"), markets: parseMarkets(get("markets")), mainPage: get("mainPage"), overlaps: get("overlaps"),
      clusterVolume: num("clusterVolume"), kd: num("kd"), intent: get("intent"), checkedOn: get("checkedOn"),
      keywordSource: get("keywordSource"), goNoGo: get("goNoGo"), notes: get("notes"),
    });
  });
  return { wb, ws, topics };
}

/** Rows the guide queue may write: status "Not started", and not a row that became a data page (the yearly report). */
export const isWritable = (t) => t.status === STATUS.notStarted && !/^\/us\/reports\//.test(t.mainPage);

/** The first writable row, in sheet order. */
export const nextTopic = (topics) => topics.find(isWritable);

/** Sets cells on one row by field name, e.g. { status: "Published", url }. */
export function setRow({ ws }, topic, fields) {
  const row = ws.getRow(topic.row);
  for (const [k, v] of Object.entries(fields)) {
    if (!COL[k]) throw new Error(`unknown topic sheet field ${k}`);
    row.getCell(COL[k]).value = Array.isArray(v) ? v.join(", ").toUpperCase() : v;
    topic[k] = k === "markets" ? parseMarkets(Array.isArray(v) ? v.join(",") : v) : v;
  }
}

export const saveTopics = ({ wb }) => wb.xlsx.writeFile(SHEET_FILE);

export async function markPublished(sheet, topic, url) {
  setRow(sheet, topic, { status: STATUS.published, url });
  await saveTopics(sheet);
}

/** Appends a new topic row (Status: Not started), e.g. from Search Console or OpenSEO. */
export function appendTopic({ ws, topics }, fields) {
  const n = Math.max(0, ...topics.map((t) => t.n)) + 1;
  const row = ws.addRow(COLUMNS.map(([k]) => (k === "n" ? n : k === "status" ? STATUS.notStarted : fields[k] ?? null)));
  const t = { row: row.number, n, status: STATUS.notStarted, supporting: [], markets: [], ...fields };
  topics.push(t);
  return t;
}
