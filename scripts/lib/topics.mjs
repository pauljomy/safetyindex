// docs/Safety_Blog_Topics.xlsx: one row per post, in publishing order.
// Columns: # | Category | Blog Post Title | Primary Keyword | Supporting Keywords | Status | Published URL
import ExcelJS from "exceljs";

export const SHEET_FILE = "docs/Safety_Blog_Topics.xlsx";
const SHEET = "Blog Topics";
const COL = { n: 1, category: 2, title: 3, keyword: 4, supporting: 5, status: 6, url: 7 };

const cellText = (c) => {
  const v = c.value;
  if (v == null) return "";
  if (typeof v === "object") return v.text ?? v.result ?? (v.richText ? v.richText.map((r) => r.text).join("") : "");
  return String(v);
};

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
    topics.push({
      row: i, n: Number(get("n")) || i - 1, category: get("category"), title: get("title"), keyword: get("keyword"),
      supporting: get("supporting").split(",").map((s) => s.trim()).filter(Boolean), status: get("status"), url: get("url"),
    });
  });
  return { wb, ws, topics };
}

/** The first row that isn't Published, in sheet order. */
export const nextTopic = (topics) => topics.find((t) => !/^published$/i.test(t.status));

export async function markPublished({ wb, ws }, topic, url) {
  ws.getRow(topic.row).getCell(COL.status).value = "Published";
  ws.getRow(topic.row).getCell(COL.url).value = url;
  await wb.xlsx.writeFile(SHEET_FILE);
}
