import ExcelJS from "exceljs";
const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(process.argv[2]);
const max = Number(process.argv[3] || 60);
for (const ws of wb.worksheets) { console.log("## sheet", ws.name, ws.rowCount);
  let n = 0; ws.eachRow((r, i) => { if (n++ < max) console.log(i, JSON.stringify(r.values.slice(1).map(v => v && typeof v === "object" ? (v.richText ? v.richText.map(t=>t.text).join("") : v.result ?? JSON.stringify(v)) : v))); }); }
