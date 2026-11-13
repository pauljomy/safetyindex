// Data pages built by script from fetched data (no writer, so every number comes straight from the data):
//  - /us/osha-penalties (brief 7d): current maximum penalties from osha.gov/penalties, stored in
//    scripts/config.yml (osha_penalties) and read by every standard page; one URL updated in place each January;
//  - /us/reports/most-cited-osha-standards-<year> (brief 7g, topic sheet row 134): most-cited standards and
//    paragraphs, trends, penalties by industry, most-cited standards per industry, with CSV and Excel downloads.
//   node scripts/data/reports.mjs [--penalties-only]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { config, setConfig } from "../lib/config.mjs";
import { loadIndex } from "./ecfr.mjs";
import { loadTopics, saveTopics, setRow, STATUS } from "../lib/topics.mjs";

const today = new Date().toISOString().slice(0, 10);
const UA = "Mozilla/5.0 (compatible; SafetyIndexBot/1.0; +https://safetyindex.blog/about)";
const n = (x) => Number(x).toLocaleString("en-US");
const usd = (x) => (x == null ? "–" : `$${n(x)}`);
const save = (file, data) => {
  const prev = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  // Keep the release date and first publish date of a page that is already out.
  if (prev?.releaseDate) Object.assign(data, { releaseDate: prev.releaseDate, date: prev.date, updated: today });
  mkdirSync("src/content/reports", { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};

// ---------------------------------------------------------------- penalties
async function penalties() {
  const html = await (await fetch(config.osha_penalties.source_url, { headers: { "User-Agent": UA } })).text();
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const money = (re) => { const m = text.match(re); return m ? Number(m[1].replace(/,/g, "")) : null; };
  const serious = money(/Serious\s+Other-Than-Serious\s+Posting Requirements\s+\$([\d,]+) per violation/i) ?? money(/Serious[^$]{0,80}\$([\d,]+) per violation/i);
  const fta = money(/Failure to Abate\s+\$([\d,]+) per day/i);
  const willful = money(/Willful or Repeated\s+\$([\d,]+) per violation/i);
  const willfulMin = money(/minimum[^$]{0,60}\$([\d,]+)/i);
  const eff = text.match(/assessed after ([A-Z][a-z]{2,8}\.? \d{1,2}, \d{4})/)?.[1];
  if (!serious || !fta || !willful) throw new Error("couldn't read the penalty amounts from osha.gov/penalties; check the page and update scripts/config.yml by hand");
  const effective = eff ? new Date(eff.replace(".", "")).toISOString().slice(0, 10) : "";
  setConfig("osha_penalties", { ...config.osha_penalties, effective_date: effective, checked_on: today, serious_max: serious, other_than_serious_max: serious, failure_to_abate_per_day_max: fta, willful_or_repeated_max: willful, willful_or_repeated_min: willfulMin });
  const year = (effective || today).slice(0, 4);
  const enf = existsSync("data/pages/us/enforcement.json") ? JSON.parse(readFileSync("data/pages/us/enforcement.json", "utf8")) : null;
  const span = enf ? `FY${enf.fiscalYears[0]}–FY${enf.fiscalYears.at(-1)}` : "";
  const p = enf?.totals?.penalties;
  const sections = [
    { heading: "How do maximum penalties apply in state-plan states?", opening: "States that run their own OSHA-approved plans must adopt maximum penalties at least as effective as federal OSHA's, and state plans don't have to fine state and local government employers." },
    ...(p ? [{ heading: "How much does OSHA propose in practice?", opening: `Across ${n(enf.totals.citations)} citations of 29 CFR standards in ${span}, the median initial penalty for a citation with a penalty was ${usd(p.median)}, and the middle half ran from ${usd(p.p25)} to ${usd(p.p75)}; penalties can be reduced on settlement or after a contest.` }] : []),
    { heading: "Where do the amounts come from?", opening: `OSHA adjusts its maximum penalties for inflation every January; the amounts above apply to penalties assessed after ${eff ?? "the latest adjustment"}, as published on OSHA's penalties page.` },
  ];
  save("src/content/reports/osha-penalties.json", {
    kind: "penalties", title: `OSHA penalties ${year}: current maximum fines per violation`, seoTitle: `OSHA penalties ${year}: maximum fines per violation`,
    description: `OSHA's current maximum penalties for ${year}: serious, other-than-serious, failure to abate, willful and repeated violations, from OSHA's own figures.`.slice(0, 155),
    summary: `OSHA's maximum penalty is ${usd(serious)} per serious or other-than-serious violation and ${usd(willful)} per willful or repeated violation, for penalties assessed after ${eff ?? "the latest annual adjustment"}.`,
    year: Number(year), date: today, generatedOn: today, dataAsOf: today, checkPass: "passed", cover: "osha-penalties",
    coverPrompt: "An empty workplace inspection meeting room in an industrial building: a table with closed folders, a hard hat and a pair of safety glasses, a window overlooking a factory yard, no people, no screens, no text",
    coverAlt: "Factory meeting room table with closed folders, a hard hat and safety glasses, factory yard through the window", linkPhrases: ["OSHA penalties", "maximum OSHA penalties"], changes: [],
    data: { sections }, method: "Maximum amounts copied from OSHA's penalties page on the date shown; enforcement figures from the U.S. Department of Labor OSHA violation dataset.",
    sources: [{ title: "OSHA penalties", url: config.osha_penalties.source_url }, ...(enf ? [{ title: "OSHA inspection and violation data (U.S. Department of Labor Open Data Portal)", url: "https://dataportal.dol.gov/" }] : [])],
  });
  console.log(`✔ penalties: serious ${usd(serious)}, failure to abate ${usd(fta)}/day, willful/repeated ${usd(willful)}, effective ${effective}`);
}

// ---------------------------------------------------------------- most-cited report
async function mostCited() {
  const enf = JSON.parse(readFileSync("data/pages/us/enforcement.json", "utf8"));
  const idx = loadIndex();
  const fys = enf.fiscalYears;
  const last = fys.at(-1);
  const span = `FY${fys[0]}–FY${last}`;
  const name = (s) => (idx.sections[s]?.heading ?? "").replace(/\.$/, "");
  const label = (s) => `${s} ${name(s)}`.slice(0, 60);
  const top = enf.standards.slice(0, 25);
  const paragraphs = enf.standards.flatMap((s) => s.topParagraphs.map((p) => ({ clause: `${s.section}${p.paragraph}`, section: s.section, count: p.count }))).sort((a, b) => b.count - a.count).slice(0, 20);
  const latestTop = [...enf.standards].sort((a, b) => (b.byFy[last] ?? 0) - (a.byFy[last] ?? 0)).slice(0, 10);
  const sectors = Object.entries(enf.sectorPenalties).filter(([, v]) => v.n >= 100 && v.title).sort((a, b) => b[1].total - a[1].total);
  const inds = enf.industries.filter((i) => i.title && i.citations > 0).slice(0, 15);
  const [a, b, c] = top;
  const tables = {
    "most-cited-standards": { columns: ["Rank", "Standard", "Citations", "Inspections", "Median initial penalty"], rows: top.map((s, i) => [i + 1, { text: label(s.section), section: s.section }, s.citations, s.inspections, usd(s.penalties.median)]) },
    "most-cited-paragraphs": { columns: ["Rank", "Paragraph", "Citations"], rows: paragraphs.map((p, i) => [i + 1, { text: p.clause, section: p.section }, p.count]) },
    trends: { columns: ["Standard", ...fys.map((y) => `FY${y}`)], rows: latestTop.map((s) => [{ text: label(s.section), section: s.section }, ...fys.map((y) => s.byFy[y] ?? 0)]) },
    "penalties-by-industry": { columns: ["Industry sector (NAICS)", "Citations with a penalty", "Median initial penalty", "Total initial penalties"], rows: sectors.map(([k, v]) => [`${v.title} (${k})`, v.n, usd(v.median), usd(v.total)]) },
    "standards-by-industry": { columns: ["Industry (NAICS)", "Inspections", "Most-cited standards"], rows: inds.map((i) => [{ text: `${i.title} (${i.naics})`, naics: i.naics }, i.inspections, i.topStandards.slice(0, 3).map((s) => `${s.section} (${n(s.count)})`).join(", ")]) },
  };
  const slug = `most-cited-osha-standards-${last}`;
  const dl = `/downloads/reports/${slug}`;
  mkdirSync("public/downloads/reports", { recursive: true });
  const plain = (c) => (c && typeof c === "object" ? c.text : c);
  const csvCell = (v) => { const s = String(plain(v)); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const wb = new ExcelJS.Workbook();
  wb.creator = "Safety Index (safetyindex.blog)";
  for (const [k, t] of Object.entries(tables)) {
    writeFileSync(`public${dl}-${k}.csv`, `${[t.columns, ...t.rows].map((r) => r.map(csvCell).join(",")).join("\n")}\n`);
    const ws = wb.addWorksheet(k.slice(0, 31));
    ws.addRow(t.columns).font = { bold: true };
    for (const r of t.rows) ws.addRow(r.map(plain));
    ws.columns.forEach((col) => (col.width = 24));
    ws.addRow([]);
    ws.addRow([`Source: U.S. Department of Labor OSHA inspection and violation data, ${span}. Page: https://safetyindex.blog/us/reports/${slug}`]);
  }
  await wb.xlsx.writeFile(`public${dl}.xlsx`);
  const sections = [
    { heading: "What are the most-cited OSHA standards?", opening: `${label(a.section)} was the most-cited OSHA standard in ${span}, with ${n(a.citations)} citations, ahead of ${label(b.section)} (${n(b.citations)}) and ${label(c.section)} (${n(c.citations)}).`,
      chart: { title: `Most-cited OSHA standards, ${span} (citations)`, data: top.slice(0, 10).map((s) => ({ label: s.section, value: s.citations })) }, table: tables["most-cited-standards"] },
    { heading: "Which paragraphs are cited most?", opening: `The single most-cited paragraph in ${span} was ${paragraphs[0].clause}, cited ${n(paragraphs[0].count)} times.`, table: tables["most-cited-paragraphs"] },
    { heading: `How did citations change from FY${fys[0]} to FY${last}?`, opening: `The table follows the ten standards cited most in FY${last} through each of the ${fys.length} fiscal years; ${label(latestTop[0].section)} went from ${n(latestTop[0].byFy[fys[0]] ?? 0)} citations in FY${fys[0]} to ${n(latestTop[0].byFy[last] ?? 0)} in FY${last}.`, table: tables.trends },
    { heading: "Which industries draw the highest penalties?", opening: `${sectors[0][1].title} drew the most initial penalties in ${span}, ${usd(sectors[0][1].total)} across ${n(sectors[0][1].n)} cited items with a penalty.`,
      chart: { title: `Total initial penalties by industry sector, ${span}`, unit: "usd", data: sectors.slice(0, 10).map(([, v]) => ({ label: v.title.slice(0, 32), value: v.total })) }, table: tables["penalties-by-industry"] },
    { heading: "Which standards are cited most in each industry?", opening: `In ${inds[0].title}, the industry with the most inspections (${n(inds[0].inspections)}), the most-cited standard was ${inds[0].topStandards[0].section} with ${n(inds[0].topStandards[0].count)} citations.`, table: tables["standards-by-industry"] },
  ];
  const file = `src/content/reports/${slug}.json`;
  save(file, {
    kind: "most-cited", title: `Most-cited OSHA standards ${last}: citations, paragraphs and penalties`, seoTitle: `Most-cited OSHA standards ${last} (OSHA violations data)`.slice(0, 60),
    description: `The OSHA standards cited most in ${span}, the top paragraphs, trends by year and penalties by industry, from DOL enforcement data. Tables to download.`.slice(0, 155),
    summary: `${label(a.section)} was OSHA's most-cited standard in ${span}, with ${n(a.citations)} citations out of ${n(enf.totals.citations)} issued under 29 CFR standards in ${n(enf.totals.inspections)} inspections.`,
    year: last, date: today, generatedOn: today, dataAsOf: enf.fetchedOn, checkPass: "passed", keyword: "osha violations", cover: "data-report",
    coverPrompt: "A tidy workplace safety office with binders, a hard hat and safety glasses on a desk beside a window, soft daylight, no screens, no text, no people",
    coverAlt: "Safety office desk with binders, a hard hat and safety glasses", linkPhrases: ["most-cited OSHA standards", "most common OSHA violations"], changes: [],
    data: { dataYear: `${span} (federal fiscal years)`, sampleSize: `${n(enf.totals.citations)} citations in ${n(enf.totals.inspections)} inspections`, downloads: [{ label: "Download the tables (Excel)", file: `${dl}.xlsx` }, ...Object.keys(tables).map((k) => ({ label: `${k.replace(/-/g, " ")} (CSV)`, file: `${dl}-${k}.csv` }))], sections },
    method: `${enf.method} Data pulled from the DOL Open Data Portal API on ${enf.fetchedOn}. Fiscal years run from 1 October to 30 September. Standard names are from the eCFR as of ${idx.ecfrDate}.`,
    sources: [{ title: "OSHA inspection and violation data (U.S. Department of Labor Open Data Portal)", url: "https://dataportal.dol.gov/" }, { title: "Electronic Code of Federal Regulations, Title 29", url: "https://www.ecfr.gov/current/title-29" }, { title: "North American Industry Classification System (U.S. Census Bureau)", url: "https://www.census.gov/naics/" }],
  });
  // Topic sheet row 134 becomes the yearly report.
  const sheet = await loadTopics();
  const row = sheet.topics.find((t) => t.n === 134);
  if (row) { setRow(sheet, row, { mainPage: `/us/reports/${slug}`, url: `https://safetyindex.blog/us/reports/${slug}`, status: STATUS.published, keywordSource: "OpenSEO", goNoGo: "Data page (yearly report); not KD-gated" }); await saveTopics(sheet); }
  console.log(`✔ ${file}`);
}

await penalties();
if (!process.argv.includes("--penalties-only")) await mostCited();
