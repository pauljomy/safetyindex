// Workplace injury statistics page (brief 7h): /us/reports/workplace-injury-statistics-<year>, built
// from the Bureau of Labor Statistics' published tables, with no writer, so every number on the page
// comes straight from the files fetched here:
//  - Survey of Occupational Injuries and Illnesses (SOII): news release tables (osh.t01, osh.t02) and the
//    industry rate and count workbooks (table-1 / table-2, one per year, for the trend);
//  - Census of Fatal Occupational Injuries (CFOI): news release tables (cfoi.t01, cfoi.t02), table A-1
//    (industry by event) and the hours-based fatal injury rates workbook (one per year, for the trend).
// The BLS Public Data API (api.bls.gov) answered "The BLS website is busy" to scripted requests when this
// was built, and the CFOI time-series database (download.bls.gov/pub/time.series/fw) stopped at 2022 data,
// so the published tables are the source. Raw files are cached in data/raw/us/bls/ (git-ignored); if a
// fetch fails the cached copy is used, and a table whose file can't be read is left out, never estimated.
// It also reads the BLS release schedule and logs the next SOII and CFOI releases: rerun after each one.
//   node scripts/data/bls.mjs            # fetch (cache as fallback) and write the page + downloads
//   node scripts/data/bls.mjs --cached   # rebuild from the cached files only
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";

const RAW = "data/raw/us/bls";
const BLS = "https://www.bls.gov";
const UA = "SafetyIndexBot/1.0 (+https://safetyindex.blog/about)";
const CACHED = process.argv.includes("--cached");
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const n = (x) => (x == null ? "–" : Number(x).toLocaleString("en-US"));

// ---------------------------------------------------------------- fetching
const XLSX_TYPE = /spreadsheetml|application\/vnd\.ms-excel|octet-stream/;
/** One BLS file, cached on disk. Returns a Buffer, or null when BLS doesn't publish it (optional files). */
async function get(name, path, { optional = false } = {}) {
  const file = join(RAW, name);
  const xlsx = name.endsWith(".xlsx");
  if (CACHED) {
    if (existsSync(file)) return readFileSync(file);
    if (optional) return null;
    throw new Error(`${name} isn't cached; run without --cached`);
  }
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(BLS + path, { headers: { "User-Agent": UA, Accept: "*/*" }, redirect: "manual", signal: AbortSignal.timeout(60_000) });
      await sleep(1500); // be gentle with bls.gov
      if ([301, 302, 404].includes(res.status)) {
        if (optional) return null;
        throw Object.assign(new Error(`${path}: HTTP ${res.status}`), { fatal: true });
      }
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (xlsx && (!XLSX_TYPE.test(res.headers.get("content-type") ?? "") || buf[0] !== 0x50)) {
        if (optional) return null;
        throw new Error(`${path}: not a workbook (${res.headers.get("content-type")})`);
      }
      if (!xlsx && /The BLS website is busy|Access Denied/i.test(buf.toString("utf8", 0, 4000))) throw new Error(`${path}: BLS answered "busy"`);
      mkdirSync(RAW, { recursive: true });
      writeFileSync(file, buf);
      return buf;
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;
      await sleep(5000 * 2 ** attempt);
    }
  }
  if (existsSync(file)) { console.warn(`  ! ${path}: ${lastErr.message}; using the cached copy`); return readFileSync(file); }
  if (optional) { console.warn(`  ! ${path}: ${lastErr.message}; left out`); return null; }
  throw lastErr;
}

// ---------------------------------------------------------------- parsing
const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'").replace(/&raquo;/g, "»").replace(/�/g, " ");
const text = (buf) => decode(buf.toString("utf8").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const num = (v) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/,/g, "").trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};
const clean = (s) => String(s ?? "").replace(/\(\d+\)/g, "").replace(/\d+$/, "").replace(/\s+/g, " ").trim();

/** Rows of the fixed-width table inside a BLS news release table page (<pre>). */
function preRows(buf) {
  const pre = buf.toString("utf8").match(/<pre>([\s\S]*?)<\/pre>/i)?.[1];
  if (!pre) throw new Error("no <pre> table in the page");
  return decode(pre.replace(/<[^>]+>/g, "")).split(/\r?\n/).filter((l) => l.includes("|")).map((l) => ({ indent: l.match(/^ */)[0].length, cells: l.split("|").map((c) => c.trim()) }));
}

/** The first worksheet as arrays of plain values. */
async function sheetRows(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const plain = (v) => (v && typeof v === "object" ? (v.richText ? v.richText.map((t) => t.text).join("") : v.result ?? v.text ?? null) : v);
  const rows = [];
  wb.worksheets[0].eachRow((r) => rows.push(r.values.slice(1).map(plain)));
  return rows;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const isoDate = (s) => { const m = s.match(/([A-Z][a-z]+) (\d{1,2}), (\d{4})/); return m ? `${m[3]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null; };
const releaseDate = (buf) => isoDate(text(buf).match(/For release [^A-Z]*\(ET\) [A-Z][a-z]+day, ([A-Z][a-z]+ \d{1,2}, \d{4})/)?.[1] ?? "");

// NAICS sectors: SOII code, the name CFOI table A-1 uses, the code the CFOI rates workbook uses, a short chart label.
const SECTORS = [
  ["11", "agriculture, forestry, fishing and hunting", "11", "Agriculture, forestry, fishing"],
  ["21", "mining, quarrying, and oil and gas extraction", "21", "Mining, oil and gas extraction"],
  ["22", "utilities", "22", "Utilities"],
  ["23", "construction", "23", "Construction"],
  ["31-33", "manufacturing", "31,32,33", "Manufacturing"],
  ["42", "wholesale trade", "42", "Wholesale trade"],
  ["44-45", "retail trade", "44,45", "Retail trade"],
  ["48-49", "transportation and warehousing", "48,49", "Transportation and warehousing"],
  ["51", "information", "51", "Information"],
  ["52", "finance and insurance", "52", "Finance and insurance"],
  ["53", "real estate and rental and leasing", "53", "Real estate, rental and leasing"],
  ["54", "professional, scientific, and technical services", "54", "Professional and technical services"],
  ["55", null, null, "Management of companies"],
  ["56", "administrative and support and waste management and remediation services", null, "Administrative and waste services"],
  ["61", "educational services", "61", "Educational services"],
  ["62", "health care and social assistance", "62", "Health care and social assistance"],
  ["71", "arts, entertainment, and recreation", "71", "Arts, entertainment, recreation"],
  ["72", "accommodation and food services", "72", "Accommodation and food services"],
  ["81", "other services (except public administration)", "81", "Other services"],
].map(([code, cfoiName, rateCode, short]) => ({ code, cfoiName, rateCode, short }));
const shortOf = (code) => SECTORS.find((s) => s.code === code)?.short;

/** SOII industry workbook (table 1 rates or table 2 counts): { year, privateRow, sectors: [{name, code, values}] }. */
async function soiiIndustry(buf) {
  const rows = await sheetRows(buf);
  const year = Number(String(rows[0]?.[0] ?? "").match(/(\d{4})\s*(\[|$)/)?.[1] ?? String(rows[0]?.[0]).match(/(\d{4})/g)?.pop());
  const head = rows.find((r) => r[0] && /^Industry/.test(r[0]) && r[3] === "Total");
  if (!head || String(head[2]) !== "Total recordable cases" || !/days away from work/i.test(head[4])) throw new Error("SOII industry table columns changed");
  const vals = (r) => ({ trc: num(r[2]), dart: num(r[3]), dafw: num(r[4]), djtr: num(r[5]), other: num(r[6]) });
  const start = rows.findIndex((r) => /^Private industry/.test(r[0] ?? ""));
  const end = rows.findIndex((r, i) => i > start && /^State and local government/.test(r[0] ?? ""));
  const priv = rows.slice(start, end > 0 ? end : undefined);
  const sectors = priv.filter((r) => /^\d\d(-\d\d)?$/.test(String(r[1] ?? "").trim())).map((r) => ({ name: clean(r[0]), code: String(r[1]).trim(), ...vals(r) }));
  return { year, private: vals(rows[start]), sectors };
}

// ---------------------------------------------------------------- build
async function build() {
  console.log("Fetching BLS files…");
  const f = {
    iif: await get("iif-home.html", "/iif/"),
    oshNr: await get("osh.nr0.html", "/news.release/osh.nr0.htm"),
    oshT1: await get("osh.t01.html", "/news.release/osh.t01.htm"),
    oshT2: await get("osh.t02.html", "/news.release/osh.t02.htm"),
    cfoiNr: await get("cfoi.nr0.html", "/news.release/cfoi.nr0.htm"),
    cfoiT1: await get("cfoi.t01.html", "/news.release/cfoi.t01.htm"),
    cfoiT2: await get("cfoi.t02.html", "/news.release/cfoi.t02.htm"),
    cfoiTn: await get("cfoi.tn.html", "/news.release/cfoi.tn.htm", { optional: true }),
    soiiOverview: await get("soii-overview.html", "/iif/overview/soii-overview.htm", { optional: true }),
  };

  // --- SOII totals and the data year (osh.t01: 10 years of case counts, thousands)
  const t1 = preRows(f.oshT1).filter((r) => /^\d{4}$/.test(r.cells[0])).map((r) => ({ year: Number(r.cells[0]), total: num(r.cells[1]), injuries: num(r.cells[2]), illnesses: num(r.cells[3]) }));
  if (!t1.length) throw new Error("couldn't read SOII table 1 (osh.t01)");
  const year = t1.at(-1).year;
  const soiiRelease = releaseDate(f.oshNr);
  console.log(`  SOII data year ${year}, released ${soiiRelease}`);

  // --- SOII industry tables, data year and up to 4 earlier years (rates trend)
  const ratesByYear = new Map();
  const countsByYear = new Map();
  for (let y = year; y > year - 5; y--) {
    const r = await get(`soii-table-1-rates-${y}.xlsx`, `/iif/nonfatal-injuries-and-illnesses-tables/table-1-injury-and-illness-rates-by-industry-${y}-national.xlsx`, { optional: y !== year });
    const c = await get(`soii-table-2-counts-${y}.xlsx`, `/iif/nonfatal-injuries-and-illnesses-tables/table-2-injury-and-illness-counts-by-industry-${y}-national.xlsx`, { optional: y !== year });
    if (!r || !c) { console.log(`  SOII industry tables for ${y}: not published in this format, trend starts at ${y + 1}`); break; }
    const [rr, cc] = [await soiiIndustry(r), await soiiIndustry(c)];
    if (rr.year !== y || cc.year !== y) throw new Error(`SOII industry table for ${y} is labelled ${rr.year}/${cc.year}`);
    ratesByYear.set(y, rr);
    countsByYear.set(y, cc);
  }
  const rates = ratesByYear.get(year);
  const counts = countsByYear.get(year);

  // --- SOII days-away cases by event (osh.t02, a two-year period)
  const t2rows = preRows(f.oshT2);
  const t2title = text(f.oshT2).match(/private industry,\s*(\d{4})-(\d{2})/i);
  const dafwPeriod = t2title ? `${t2title[1]}–${t2title[1].slice(0, 2)}${t2title[2]}` : null;
  const dafwEvents = t2rows.filter((r) => r.cells.length >= 10 && num(r.cells[1]) != null).map((r) => ({ event: r.cells[0], dafw: num(r.cells[1]), dafwRate: num(r.cells[2]), dafwMedian: num(r.cells[3]), djtr: num(r.cells[4]), dart: num(r.cells[7]), dartRate: num(r.cells[8]) }));

  // --- CFOI
  const cfoiRelease = releaseDate(f.cfoiNr);
  const c1 = preRows(f.cfoiT1);
  const c1years = c1.find((r) => r.cells[0] === "Characteristic")?.cells.slice(1).map(Number).filter(Boolean) ?? [];
  const c1total = c1.find((r) => /^Total/.test(r.cells[0]))?.cells.slice(1).map(num) ?? [];
  const fatalByYear = c1years.map((y, i) => ({ year: y, total: c1total[i] }));
  const cfoiYear = c1years.at(-1);
  if (!cfoiYear || fatalByYear.some((x) => x.total == null)) throw new Error("couldn't read CFOI table 1 (cfoi.t01)");
  console.log(`  CFOI data year ${cfoiYear}, released ${cfoiRelease}`);

  const c2 = preRows(f.cfoiT2);
  const c2years = c2.find((r) => r.cells[0] === "Characteristic")?.cells.slice(1).map(Number).filter(Boolean) ?? [];
  const c2data = c2.filter((r) => r.cells[0] && r.cells.slice(1).some((c) => num(c) != null));
  const topIndent = c2data.find((r) => /^Total/.test(r.cells[0]))?.indent;
  const subIndent = Math.min(...c2data.filter((r) => r.indent > topIndent).map((r) => r.indent));
  const fatalEvents = c2data.filter((r) => !/^Total/.test(r.cells[0]) && r.indent <= subIndent).map((r) => ({ event: clean(r.cells[0]), top: r.indent === topIndent, values: r.cells.slice(1, 1 + c2years.length).map(num) }));

  const a1buf = await get(`cfoi-table-a-1-${cfoiYear}.xlsx`, `/iif/fatal-injuries-tables/fatal-occupational-injuries-table-a-1-${cfoiYear}.xlsx`, { optional: true });
  let a1 = null;
  if (a1buf) {
    const rows = await sheetRows(a1buf);
    const head = rows.find((r) => /^Industry/.test(r[0] ?? "") && /Violent/.test(r[3] ?? ""));
    const start = rows.findIndex((r) => r[0] === "Private industry");
    const end = rows.findIndex((r, i) => i > start && /^Government/.test(r[0] ?? ""));
    const priv = rows.slice(start, end);
    a1 = { events: head.slice(3).map(clean), private: priv[0].slice(2).map(num), sectors: [] };
    for (const s of SECTORS.filter((s) => s.cfoiName)) {
      const r = priv.find((r) => clean(r[0]).toLowerCase() === s.cfoiName);
      if (r) a1.sectors.push({ code: s.code, name: clean(r[0]), total: num(r[2]), events: r.slice(3).map(num) });
    }
  }

  const fatalRates = new Map(); // year -> { total, private, sectors: Map(code -> rate) }
  for (let y = cfoiYear; y > cfoiYear - 5; y--) {
    const b = await get(`cfoi-hours-based-rates-${y}.xlsx`, `/iif/fatal-injuries-tables/fatal-occupational-injuries-hours-based-rates-${y}.xlsx`, { optional: true });
    if (!b) continue;
    const rows = await sheetRows(b);
    const ind = rows.findIndex((r) => /^Industry/.test(r[0] ?? ""));
    const sectors = new Map();
    for (const r of rows.slice(ind)) {
      const code = String(r[1] ?? "").replace(/\s+/g, "");
      const s = SECTORS.find((s) => s.rateCode === code);
      if (s && !sectors.has(s.code) && num(r[3]) != null) sectors.set(s.code, num(r[3]));
    }
    fatalRates.set(y, { total: num(rows.find((r) => r[0] === "Total")?.[3]), private: num(rows[ind + 1]?.[0] === "Private industry" ? rows[ind + 1][3] : null), sectors });
  }

  // --- sample size wording, release schedule
  const ov = f.soiiOverview ? text(f.soiiOverview).match(/approximately ([\d,]+) employers report/i)?.[1] : null;
  const docs = f.cfoiTn ? text(f.cfoiTn).match(/over ([\d,]+) unique source documents were reviewed/i)?.[1] : null;
  const sampleSize = [ov ? `about ${ov} employers report each year (SOII)` : null, `every fatal work injury in the U.S.${docs ? `, from over ${docs} source documents for ${cfoiYear}` : ""} (CFOI)`].filter(Boolean).join("; ");

  const thisYear = Number(today.slice(0, 4));
  const schedule = [];
  for (const y of [thisYear, thisYear + 1]) {
    const b = await get(`schedule-${y}.html`, `/schedule/${y}/home.htm`, { optional: true });
    if (!b) continue;
    for (const m of text(b).matchAll(/[A-Z][a-z]+day, ([A-Z][a-z]+ \d{1,2}, \d{4}) \d{1,2}:\d{2} [AP]M (Employer-Reported Workplace Injuries and Illnesses \(Annual\)|Census of Fatal Occupational Injuries) for (?:Annual )?(\d{4})/g)) {
      schedule.push({ date: isoDate(m[1]), survey: /Fatal/.test(m[2]) ? "CFOI" : "SOII", dataYear: Number(m[3]) });
    }
  }
  const iifText = text(f.iif);
  const notices = [...iifText.matchAll(/The \d{4} Census of Fatal Occupational Injuries \(CFOI\) news release, originally scheduled for [A-Z][a-z]+ \d{1,2}, \d{4}, is postponed/g), ...iifText.matchAll(/The Survey of Occupational Injuries and Illnesses data for \d{4} are scheduled to be released [A-Z][a-z]+ \d{1,2}, \d{4}/g)].map((m) => m[0]);
  const next = (s) => schedule.filter((x) => x.survey === s && x.date > today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  const releases = {
    soii: { dataYear: year, released: soiiRelease, next: next("SOII") },
    cfoi: { dataYear: cfoiYear, released: cfoiRelease, next: next("CFOI") },
    notices,
    checkedOn: today,
  };
  console.log(`  BLS schedule: next SOII ${releases.soii.next ? `${releases.soii.next.date} (${releases.soii.next.dataYear} data)` : "not listed"}; next CFOI ${releases.cfoi.next ? `${releases.cfoi.next.date} (${releases.cfoi.next.dataYear} data)` : "not listed"}`);
  for (const x of notices) console.log(`  BLS notice: ${x}.`);

  // ---------------------------------------------------------------- tables
  const tables = {};
  const yrs = [...ratesByYear.keys()].sort();
  const t1by = new Map(t1.map((r) => [r.year, r]));
  tables["nonfatal-trend"] = {
    title: `Nonfatal injuries and illnesses, private industry, ${t1[0].year}–${year}`,
    columns: ["Year", "Total recordable cases (thousands)", "Injuries (thousands)", "Illnesses (thousands)", "Total recordable case rate per 100 FTE workers", "Days-away-from-work cases (thousands)", "Days-away-from-work rate per 100 FTE workers"],
    rows: t1.map((r) => [String(r.year), r.total, r.injuries, r.illnesses, ratesByYear.get(r.year)?.private.trc ?? "–", countsByYear.get(r.year)?.private.dafw ?? "–", ratesByYear.get(r.year)?.private.dafw ?? "–"]),
  };
  const sectorRows = rates.sectors.map((s) => ({ ...s, cases: counts.sectors.find((c) => c.code === s.code) })).filter((s) => s.trc != null).sort((a, b) => b.trc - a.trc);
  tables["nonfatal-by-industry"] = {
    title: `Nonfatal injury and illness rates and cases by industry sector, private industry, ${year}`,
    columns: ["Industry sector (NAICS)", "Total recordable case rate", "DART rate", "Days-away-from-work rate", "Total recordable cases (thousands)", "Days-away-from-work cases (thousands)"],
    rows: sectorRows.map((s) => [`${s.name} (${s.code})`, s.trc, s.dart ?? "–", s.dafw ?? "–", s.cases?.trc ?? "–", s.cases?.dafw ?? "–"]),
  };
  if (dafwEvents.length) tables["days-away-by-event"] = {
    title: `Days-away-from-work cases by event or exposure, private industry, ${dafwPeriod}`,
    columns: ["Event or exposure", "Days-away-from-work cases", "Annualized rate per 10,000 FTE workers", "Median days away", "DART cases", "DART rate per 10,000 FTE workers"],
    rows: dafwEvents.map((e) => [e.event, e.dafw, e.dafwRate, e.dafwMedian, e.dart, e.dartRate]),
  };
  if (fatalEvents.length) tables["fatal-by-event"] = {
    title: `Fatal occupational injuries by event or exposure, ${c2years.join(" and ")}`,
    columns: ["Event or exposure", ...c2years.map((y) => `Fatal injuries ${y}`)],
    rows: fatalEvents.map((e) => [e.top ? e.event : `· ${e.event}`, ...e.values.map((v) => v ?? "–")]),
  };
  const fr = fatalRates.get(cfoiYear);
  if (a1?.sectors.length) tables["fatal-by-industry"] = {
    title: `Fatal occupational injuries by industry sector and event, private industry, ${cfoiYear}`,
    columns: ["Industry sector (NAICS)", "Fatal injuries", "Rate per 100,000 FTE workers", ...a1.events],
    rows: [...a1.sectors].sort((a, b) => (b.total ?? 0) - (a.total ?? 0)).map((s) => [`${s.name} (${s.code})`, s.total ?? "–", fr?.sectors.get(s.code) ?? "–", ...s.events.map((v) => v ?? "–")]),
  };
  tables["fatal-trend"] = {
    title: `Fatal occupational injuries, ${fatalByYear[0].year}–${cfoiYear}`,
    columns: ["Year", "Fatal work injuries", "Rate per 100,000 FTE workers"],
    rows: fatalByYear.map((r) => [String(r.year), r.total, fatalRates.get(r.year)?.total ?? "–"]),
  };

  // ---------------------------------------------------------------- downloads
  const slug = `workplace-injury-statistics-${year}`;
  const dl = `/downloads/reports/${slug}`;
  mkdirSync("public/downloads/reports", { recursive: true });
  const csvCell = (v) => { const s = String(v).trim(); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const wb = new ExcelJS.Workbook();
  wb.creator = "Safety Index (safetyindex.blog)";
  for (const [k, t] of Object.entries(tables)) {
    writeFileSync(`public${dl}-${k}.csv`, `${[t.columns, ...t.rows].map((r) => r.map(csvCell).join(",")).join("\n")}\n`);
    const ws = wb.addWorksheet(k.slice(0, 31));
    ws.addRow([t.title]).font = { bold: true };
    ws.addRow(t.columns).font = { bold: true };
    for (const r of t.rows) ws.addRow(r);
    ws.columns.forEach((col, i) => (col.width = i === 0 ? 48 : 18));
    ws.addRow([]);
    ws.addRow([`Source: U.S. Bureau of Labor Statistics, ${/fatal/.test(k) ? "Census of Fatal Occupational Injuries" : "Survey of Occupational Injuries and Illnesses"}. Page: https://safetyindex.blog/us/reports/${slug}`]);
  }
  await wb.xlsx.writeFile(`public${dl}.xlsx`);

  // ---------------------------------------------------------------- page
  const priv = rates.private;
  const prevRate = ratesByYear.get(year - 1)?.private.trc;
  const casesK = counts.private.trc;
  const fatal = fatalByYear.at(-1).total;
  const fatalPrev = fatalByYear.at(-2);
  const sameYear = cfoiYear === year;
  const sections = [];

  sections.push({
    heading: `How many workplace injuries and illnesses were reported in ${year}?`,
    opening: `Private industry employers reported ${n(Math.round(casesK * 1000))} nonfatal injuries and illnesses in ${year}, a total recordable case rate of ${priv.trc} per 100 full-time equivalent workers${prevRate != null ? `, ${prevRate === priv.trc ? "the same as" : prevRate > priv.trc ? "down from" : "up from"} ${prevRate} in ${year - 1}` : ""}; ${n(Math.round(counts.private.dafw * 1000))} of those cases involved days away from work.`,
    chart: { title: `Total recordable cases, private industry, ${t1[0].year}–${year} (thousands)`, unit: "n", data: t1.map((r) => ({ label: String(r.year), value: r.total })) },
    table: tables["nonfatal-trend"],
    note: `Rates are cases per 100 full-time equivalent workers. Rate columns cover ${yrs[0]}–${year}, the years whose industry tables BLS publishes in its current format; case counts come from table 1 of the ${year} news release. Counts exclude farms with fewer than 11 employees.`,
  });

  const [hi1, hi2, hi3] = sectorRows;
  sections.push({
    heading: "Which industries have the highest injury and illness rates?",
    opening: `${hi1.name} had the highest total recordable case rate of any private industry sector in ${year}, ${hi1.trc} cases per 100 full-time workers, followed by ${hi2.name.toLowerCase()} (${hi2.trc}) and ${hi3.name.toLowerCase()} (${hi3.trc}), against ${priv.trc} for all private industry.`,
    chart: { title: `Total recordable case rate by industry sector, private industry, ${year} (per 100 FTE workers)`, unit: "n", data: sectorRows.slice(0, 10).map((s) => ({ label: shortOf(s.code) ?? s.name, value: s.trc })) },
    table: tables["nonfatal-by-industry"],
    note: "DART is cases with days away from work, job restriction or transfer. Rates are per 100 full-time equivalent workers; a dash means BLS didn't publish the figure because it doesn't meet its publication guidelines.",
  });

  if (tables["days-away-by-event"]) {
    const all = dafwEvents.find((e) => /^All events/.test(e.event));
    const ev = dafwEvents.filter((e) => e !== all).sort((a, b) => b.dafw - a.dafw);
    sections.push({
      heading: "What causes the most injuries that keep people off work?",
      opening: `Of the ${n(all.dafw)} private-industry cases with days away from work over ${dafwPeriod}, ${ev[0].event.toLowerCase()} caused ${n(ev[0].dafw)}, ${ev[1].event.toLowerCase()} ${n(ev[1].dafw)} and ${ev[2].event.toLowerCase()} ${n(ev[2].dafw)}; the median time off was ${all.dafwMedian} days.`,
      chart: { title: `Days-away-from-work cases by event or exposure, private industry, ${dafwPeriod}`, unit: "n", data: ev.map((e) => ({ label: e.event.replace("Overexertion, repetitive motion, and bodily conditions", "Overexertion, bodily conditions").replace("Exposure to harmful substances or environments", "Harmful substances, environments"), value: e.dafw })) },
      table: tables["days-away-by-event"],
      note: `BLS publishes case details by event as a two-year total (${dafwPeriod}); rates here are annualized cases per 10,000 full-time equivalent workers. From 2023 BLS classifies events with version 3 of its injury classification system (OIICS), so these figures aren't directly comparable with earlier years.`,
    });
  }

  if (tables["fatal-by-event"]) {
    const top = fatalEvents.filter((e) => e.top).sort((a, b) => b.values.at(-1) - a.values.at(-1));
    const i = c2years.length - 1;
    sections.push({
      heading: "How do workers die on the job?",
      opening: `${top[0].event} caused ${n(top[0].values[i])} of the ${n(fatal)} fatal work injuries in ${cfoiYear}, the most of any event, followed by ${top[1].event.toLowerCase()} (${n(top[1].values[i])}) and ${top[2].event.toLowerCase()} (${n(top[2].values[i])}).`,
      chart: { title: `Fatal occupational injuries by event or exposure, ${cfoiYear}`, unit: "n", data: top.map((e) => ({ label: e.event.replace("Exposure to harmful substances, environments", "Harmful substances, environments"), value: e.values[i] })) },
      table: tables["fatal-by-event"],
      note: "Rows marked · are part of the event above them; totals for major categories can include subcategories not shown. CFOI counts deaths from injuries, not occupational illnesses, and covers all workers, including the self-employed and government workers.",
    });
  }

  if (tables["fatal-by-industry"]) {
    const s = [...a1.sectors].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
    const byRate = [...a1.sectors].filter((x) => fr?.sectors.get(x.code) != null).sort((a, b) => fr.sectors.get(b.code) - fr.sectors.get(a.code));
    sections.push({
      heading: "Which industries have the most work-related deaths?",
      opening: `${s[0].name} had the most fatal work injuries of any private industry sector in ${cfoiYear}, ${n(s[0].total)}, followed by ${s[1].name.toLowerCase()} (${n(s[1].total)})${byRate.length ? `, while ${byRate[0].name.toLowerCase()} had the highest fatal injury rate, ${fr.sectors.get(byRate[0].code)} per 100,000 full-time equivalent workers` : ""}.`,
      chart: { title: `Fatal occupational injuries by industry sector, private industry, ${cfoiYear}`, unit: "n", data: s.slice(0, 10).map((x) => ({ label: shortOf(x.code) ?? x.name, value: x.total })) },
      table: tables["fatal-by-industry"],
      note: `Private industry had ${n(a1.private[0])} of the ${n(fatal)} deaths. Rates are fatal injuries per 100,000 full-time equivalent workers from BLS's hours-based rates; a dash means BLS publishes no figure for that cell (or, for administrative and waste services, only a rate combined with management of companies).`,
    });
  }

  sections.push({
    heading: `How have fatal work injuries changed since ${fatalByYear[0].year}?`,
    opening: `${n(fatal)} workers died from work injuries in ${cfoiYear}${fatalPrev ? `, ${fatal < fatalPrev.total ? "down" : "up"} from ${n(fatalPrev.total)} in ${fatalPrev.year}` : ""}${fr?.total != null ? `, a rate of ${fr.total} per 100,000 full-time equivalent workers` : ""}${fatalRates.get(cfoiYear - 1)?.total != null ? ` against ${fatalRates.get(cfoiYear - 1).total} the year before` : ""}.`,
    chart: { title: `Fatal occupational injuries, ${fatalByYear[0].year}–${cfoiYear}`, unit: "n", data: fatalByYear.map((r) => ({ label: String(r.year), value: r.total })) },
    table: tables["fatal-trend"],
    note: "Counts are as published in the latest CFOI release, which BLS marks as revised and final for all years shown. Rates are per 100,000 full-time equivalent workers; a dash means the rates workbook for that year couldn't be read.",
  });

  const dataYear = sameYear ? String(year) : `${year} (nonfatal), ${cfoiYear} (fatal)`;
  const summary = `U.S. private employers reported ${n(Math.round(casesK * 1000))} nonfatal workplace injuries and illnesses in ${year}, a rate of ${priv.trc} per 100 full-time workers, and ${n(fatal)} workers died from work injuries${sameYear ? "" : ` in ${cfoiYear}`}, a rate of ${fr?.total ?? "–"} per 100,000 full-time workers.`.replace(", a rate of – per 100,000 full-time workers.", ".");
  const title = `Workplace injury statistics ${year}: injuries, illnesses and deaths by industry`;
  const seoTitle = `Workplace injury statistics ${year} (BLS data)`;
  const description = `U.S. workplace injury statistics for ${year} from BLS: injury and illness rates by industry, days-away cases, and work deaths by event and industry.`;
  const method = [
    `Built by script from the U.S. Bureau of Labor Statistics' published tables, with no rewriting of the figures.`,
    `Nonfatal injuries and illnesses come from the Survey of Occupational Injuries and Illnesses (SOII), an establishment survey of private industry employers based on their OSHA injury and illness records${ov ? `; about ${ov} employers report each year` : ""}. This page uses its private industry estimates for ${year}, released ${soiiRelease}.`,
    `SOII rates are cases per 100 full-time equivalent workers, calculated by BLS as (cases ÷ hours worked) × 200,000; rates by event are per 10,000 full-time equivalent workers. Counts exclude farms with fewer than 11 employees.`,
    `Fatal injuries come from the Census of Fatal Occupational Injuries (CFOI), a count of all fatal work injuries in the U.S. in the calendar year${docs ? `, built from over ${docs} source documents for ${cfoiYear}` : ""}, covering all workers, including the self-employed and government workers; it excludes deaths from occupational illnesses. This page uses CFOI data for ${cfoiYear}, released ${cfoiRelease}. Fatal injury rates are per 100,000 full-time equivalent workers, calculated by BLS as (deaths ÷ hours worked) × 200,000,000.`,
    `Tables were downloaded on ${today}. BLS publishes new SOII data each autumn and new CFOI data later; this page is rebuilt for each new data year.`,
  ].join(" ");
  const sources = [
    { title: `BLS news release: Employer-Reported Workplace Injuries and Illnesses, ${year - 1}-${year}`, url: `${BLS}/news.release/osh.nr0.htm` },
    { title: `BLS SOII news release table 1: total recordable cases, private industry`, url: `${BLS}/news.release/osh.t01.htm` },
    ...(dafwEvents.length ? [{ title: `BLS SOII news release table 2: cases by event or exposure, ${dafwPeriod}`, url: `${BLS}/news.release/osh.t02.htm` }] : []),
    { title: `BLS SOII table 1: incidence rates by industry and case type, ${year}`, url: `${BLS}/iif/nonfatal-injuries-and-illnesses-tables/table-1-injury-and-illness-rates-by-industry-${year}-national.htm` },
    { title: `BLS SOII table 2: numbers of cases by industry and case type, ${year}`, url: `${BLS}/iif/nonfatal-injuries-and-illnesses-tables/table-2-injury-and-illness-counts-by-industry-${year}-national.htm` },
    { title: "BLS nonfatal injuries and illnesses tables (earlier years)", url: `${BLS}/iif/nonfatal-injuries-and-illnesses-tables.htm` },
    { title: `BLS news release: Census of Fatal Occupational Injuries Summary, ${cfoiYear}`, url: `${BLS}/news.release/cfoi.nr0.htm` },
    { title: "BLS CFOI news release table 1: fatal occupational injuries by year", url: `${BLS}/news.release/cfoi.t01.htm` },
    { title: "BLS CFOI news release table 2: fatal occupational injuries by event or exposure", url: `${BLS}/news.release/cfoi.t02.htm` },
    ...(a1 ? [{ title: `BLS CFOI table A-1: fatal occupational injuries by industry and event, ${cfoiYear}`, url: `${BLS}/iif/fatal-injuries-tables/fatal-occupational-injuries-table-a-1-${cfoiYear}.htm` }] : []),
    { title: "BLS fatal injuries tables and hours-based fatal injury rates", url: `${BLS}/iif/fatal-injuries-tables.htm` },
    ...(ov ? [{ title: "BLS Survey of Occupational Injuries and Illnesses overview", url: `${BLS}/iif/overview/soii-overview.htm` }] : []),
    ...(docs ? [{ title: "BLS CFOI technical note", url: `${BLS}/news.release/cfoi.tn.htm` }] : []),
  ];

  // Lengths the schema and the build check.
  if (seoTitle.length < 30 || seoTitle.length > 60) throw new Error(`seoTitle is ${seoTitle.length} characters`);
  if (description.length < 120 || description.length > 155) throw new Error(`description is ${description.length} characters`);
  if (title.length > 90) throw new Error(`title is ${title.length} characters`);

  const file = `src/content/reports/${slug}.json`;
  const page = {
    kind: "injury-statistics", title, seoTitle, description, summary, year, date: today, generatedOn: today,
    dataAsOf: [soiiRelease, cfoiRelease].filter(Boolean).sort().at(-1), checkPass: "passed", cover: slug,
    coverPrompt: "A workplace first aid station on a factory wall: a green first aid cabinet, an eyewash station and a stretcher mounted beside it, clean concrete floor, soft daylight, no people, no text",
    coverAlt: "First aid station on a factory wall with a first aid cabinet, an eyewash station and a mounted stretcher",
    linkPhrases: ["workplace injury statistics"], changes: [], sources, method,
    data: {
      dataYear, sampleSize,
      downloads: [{ label: "Download the tables (Excel)", file: `${dl}.xlsx` }, ...Object.keys(tables).map((k) => ({ label: `${k.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase())} (CSV)`, file: `${dl}-${k}.csv` }))],
      sections, releases,
    },
  };
  // Keep the release date and first publish date of a page that is already out.
  const prev = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  if (prev?.releaseDate) Object.assign(page, { releaseDate: prev.releaseDate, date: prev.date, updated: JSON.stringify(prev.data?.sections) === JSON.stringify(sections) ? prev.updated : today });
  mkdirSync("src/content/reports", { recursive: true });
  writeFileSync(file, `${JSON.stringify(page, null, 2)}\n`);
  console.log(`✔ ${file}\n  ${summary}\n  tables: ${Object.keys(tables).join(", ")}`);
}

await build();
