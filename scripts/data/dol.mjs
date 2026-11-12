// US enforcement data: OSHA inspections and violations from the DOL Open Data
// Portal API v4 (apiprod.dol.gov/v4, key DOL_API_KEY). The two datasets are
// joined on activity_nr. Raw monthly pulls are cached in data/raw/us/dol/
// (git-ignored); the aggregate the site and the writer use is
// data/pages/us/enforcement.json (committed).
//   node --env-file-if-exists=.env scripts/data/dol.mjs           # pull missing months + aggregate
//   node --env-file-if-exists=.env scripts/data/dol.mjs --refresh # re-pull every month
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../lib/config.mjs";
import { naicsTitle } from "./naics.mjs";

const API = "https://apiprod.dol.gov/v4/get/OSHA";
const RAW = "data/raw/us/dol";
export const ENFORCEMENT_FILE = "data/pages/us/enforcement.json";
const PAGE = 10000;

/** Federal fiscal year of a date (FY2026 = 1 Oct 2025 – 30 Sep 2026). */
export const fiscalYear = (d) => { const x = new Date(d); return x.getUTCFullYear() + (x.getUTCMonth() >= 9 ? 1 : 0); };

/** The last N complete fiscal years, oldest first. */
export function completeFiscalYears(n = config.fiscal_years, today = new Date()) {
  const last = fiscalYear(today) - 1;
  return Array.from({ length: n }, (_, i) => last - n + 1 + i);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(dataset, { fields, filter, offset = 0 }) {
  const key = process.env.DOL_API_KEY;
  if (!key) throw new Error("DOL_API_KEY is missing from .env (get one free at dataportal.dol.gov)");
  const qs = new URLSearchParams({ "X-API-KEY": key.trim(), limit: String(PAGE), offset: String(offset), fields: fields.join(","), filter_object: JSON.stringify(filter) });
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${API}/${dataset}/json?${qs}`, { headers: { "User-Agent": "SafetyIndexBot/1.0 (+https://safetyindex.blog/about)" }, signal: AbortSignal.timeout(180_000) });
      if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status}`), { retryAfter: Number(res.headers.get("retry-after")) || 0 });
      if (!res.ok) throw Object.assign(new Error(`DOL API ${res.status}: ${(await res.text()).slice(0, 200)}`), { fatal: res.status === 401 || res.status === 403 });
      const body = await res.json();
      return body.data ?? [];
    } catch (e) {
      if (e.fatal || attempt >= 12) throw e;
      const wait = Math.max((e.retryAfter ?? 0) * 1000, Math.min(600_000, 15_000 * 2 ** attempt));
      console.log(`  … ${dataset} retry in ${wait / 1000}s (${e.message})`);
      await sleep(wait);
    }
  }
}

/** All rows of one dataset for one calendar month (paged), cached on disk. */
async function month(dataset, dateField, fields, y, m, refresh) {
  const file = join(RAW, `${dataset}-${y}-${String(m).padStart(2, "0")}.json`);
  if (existsSync(file) && !refresh) return JSON.parse(readFileSync(file, "utf8"));
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  const filter = { and: [{ field: dateField, operator: "gt", value: new Date(from - 1000).toISOString().slice(0, 19) }, { field: dateField, operator: "lt", value: to.toISOString().slice(0, 19) }] };
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await get(dataset, { fields, filter, offset });
    rows.push(...page);
    if (page.length < PAGE) break;
    await sleep(3000);
  }
  mkdirSync(RAW, { recursive: true });
  writeFileSync(file, JSON.stringify(rows));
  console.log(`  ${dataset} ${y}-${String(m).padStart(2, "0")}: ${rows.length} rows`);
  await sleep(3000);
  return rows;
}

function* months(fromFy, toFy) {
  for (let y = fromFy - 1, m = 10; y < toFy || (y === toFy && m <= 9); m === 12 ? ((m = 1), y++) : m++) yield [y, m];
}

const INSP_FIELDS = ["activity_nr", "open_date", "naics_code", "site_state", "reporting_id", "insp_type", "insp_scope", "owner_type"];
const VIOL_FIELDS = ["activity_nr", "citation_id", "standard", "viol_type", "issuance_date", "initial_penalty", "current_penalty", "delete_flag", "nr_instances"];

export async function pullDol({ refresh = false } = {}) {
  const fys = completeFiscalYears();
  const [first, last] = [fys[0], fys.at(-1)];
  const now = new Date();
  console.log(`DOL OSHA data, FY${first}–FY${last} (inspections from FY${first - 1} so earlier inspections still join)`);
  const inspections = new Map();
  for (const [y, m] of months(first - 1, last)) {
    const recent = now - Date.UTC(y, m, 1) < 120 * 864e5; // re-pull the latest months: late records
    for (const r of await month("inspection", "open_date", INSP_FIELDS, y, m, refresh || recent)) inspections.set(r.activity_nr, r);
  }
  const violations = [];
  for (const [y, m] of months(first, last)) {
    const recent = now - Date.UTC(y, m, 1) < 120 * 864e5;
    violations.push(...(await month("violation", "issuance_date", VIOL_FIELDS, y, m, refresh || recent)));
  }
  return { fys, inspections, violations };
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
};
const penaltyStats = (values) => {
  const s = values.filter((v) => v > 0).sort((a, b) => a - b);
  return { n: s.length, median: quantile(s, 0.5), p25: quantile(s, 0.25), p75: quantile(s, 0.75), total: Math.round(s.reduce((a, b) => a + b, 0)) };
};
const top = (counts, n, key = "key") => Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k, c]) => ({ [key]: k, count: c }));
const TYPES = { S: "serious", W: "willful", R: "repeat", O: "otherThanSerious", U: "unclassified" };

/** Aggregates the raw pulls into per-standard and per-industry statistics. */
export function aggregate({ fys, inspections, violations }, { cfrCodeToClause }) {
  const inFy = (d) => fys.includes(fiscalYear(d));
  const std = {}; // section → stats
  const ind = {}; // naics4 → stats
  const sectors = {}; // naics2 → penalties
  const byFy = Object.fromEntries(fys.map((y) => [y, {}])); // fy → section → count
  let used = 0, skippedState = 0, skippedDeleted = 0;
  const allPenalties = [];
  const allTypes = {};
  for (const v of violations) {
    if (!v.issuance_date || !inFy(v.issuance_date)) continue;
    if (v.delete_flag === "X") { skippedDeleted++; continue; }
    const clause = cfrCodeToClause(v.standard ?? "");
    if (!clause) { skippedState++; continue; }
    used++;
    allPenalties.push(Number(v.initial_penalty) || 0);
    allTypes[v.viol_type ?? "U"] = (allTypes[v.viol_type ?? "U"] ?? 0) + 1;
    const fy = fiscalYear(v.issuance_date);
    const insp = inspections.get(v.activity_nr);
    const naics = String(insp?.naics_code ?? "").trim();
    const n4 = /^\d{6}$/.test(naics) && naics !== "000000" ? naics.slice(0, 4) : null;
    const s = (std[clause.section] ??= { section: clause.section, citations: 0, byFy: Object.fromEntries(fys.map((y) => [y, 0])), paragraphs: {}, types: {}, penalties: [], industries: {}, inspections: new Set() });
    s.citations++;
    s.byFy[fy]++;
    if (clause.paragraph) s.paragraphs[clause.paragraph] = (s.paragraphs[clause.paragraph] ?? 0) + 1;
    s.types[v.viol_type ?? "U"] = (s.types[v.viol_type ?? "U"] ?? 0) + 1;
    s.penalties.push(Number(v.initial_penalty) || 0);
    s.inspections.add(v.activity_nr);
    if (n4) s.industries[n4] = (s.industries[n4] ?? 0) + 1;
    byFy[fy][clause.section] = (byFy[fy][clause.section] ?? 0) + 1;
    if (n4) {
      const i = (ind[n4] ??= { naics: n4, inspections: 0, citations: 0, standards: {}, paragraphs: {}, types: {}, penalties: [] });
      i.citations++;
      i.standards[clause.section] = (i.standards[clause.section] ?? 0) + 1;
      const p = `${clause.section}${clause.paragraph ?? ""}`;
      i.paragraphs[p] = (i.paragraphs[p] ?? 0) + 1;
      i.types[v.viol_type ?? "U"] = (i.types[v.viol_type ?? "U"] ?? 0) + 1;
      i.penalties.push(Number(v.initial_penalty) || 0);
      (sectors[n4.slice(0, 2)] ??= []).push(Number(v.initial_penalty) || 0);
    }
  }
  // Inspections opened in the window, per industry.
  let inspTotal = 0;
  for (const r of inspections.values()) {
    if (!r.open_date || !inFy(r.open_date)) continue;
    inspTotal++;
    const naics = String(r.naics_code ?? "").trim();
    if (!/^\d{6}$/.test(naics) || naics === "000000") continue;
    const n4 = naics.slice(0, 4);
    (ind[n4] ??= { naics: n4, inspections: 0, citations: 0, standards: {}, paragraphs: {}, types: {}, penalties: [] }).inspections++;
  }
  const shares = (types, total) => Object.fromEntries(Object.entries(TYPES).map(([k, name]) => [name, total ? Number(((types[k] ?? 0) / total).toFixed(3)) : 0]));
  const standards = Object.values(std).map((s) => ({
    section: s.section, citations: s.citations, inspections: s.inspections.size, byFy: s.byFy,
    topParagraphs: top(s.paragraphs, 10, "paragraph"),
    penalties: penaltyStats(s.penalties), typeCounts: Object.fromEntries(Object.entries(TYPES).map(([k, name]) => [name, s.types[k] ?? 0])), typeShares: shares(s.types, s.citations),
    topIndustries: top(s.industries, 10, "naics").map((x) => ({ ...x, title: naicsTitle(x.naics) })),
  })).sort((a, b) => b.citations - a.citations);
  const industries = Object.values(ind).map((i) => ({
    naics: i.naics, title: naicsTitle(i.naics), inspections: i.inspections, citations: i.citations,
    topStandards: top(i.standards, 25, "section"), standardsCited5Plus: Object.values(i.standards).filter((c) => c >= config.industry_min_citations_per_standard).length,
    topParagraphs: top(i.paragraphs, 10, "clause"), penalties: penaltyStats(i.penalties), typeCounts: Object.fromEntries(Object.entries(TYPES).map(([k, name]) => [name, i.types[k] ?? 0])), typeShares: shares(i.types, i.citations),
  })).sort((a, b) => b.inspections - a.inspections);
  return {
    source: "U.S. Department of Labor, Open Data Portal API v4: OSHA Inspection and Violation datasets (apiprod.dol.gov/v4)",
    sourceUrl: "https://dataportal.dol.gov/",
    fetchedOn: new Date().toISOString().slice(0, 10),
    fiscalYears: fys,
    fiscalYearCount: fys.length,
    window: { from: `${fys[0] - 1}-10-01`, to: `${fys.at(-1)}-09-30` },
    totals: { citations: used, inspections: inspTotal, excludedNonCfrCodes: skippedState, excludedDeleted: skippedDeleted, penalties: penaltyStats(allPenalties), typeShares: shares(allTypes, used) },
    method: "Citations are violation items issued in the fiscal years shown, excluding deleted items and items cited under state-plan or non-29 CFR codes (including the General Duty Clause). Each item counts once. Penalties are initial penalties of items with a penalty above zero, before any settlement or contest. Industries use the inspection's 4-digit NAICS code.",
    topByFy: Object.fromEntries(Object.entries(byFy).map(([fy, c]) => [fy, top(c, 25, "section")])),
    sectorPenalties: Object.fromEntries(Object.entries(sectors).map(([k, v]) => [k, { title: naicsTitle(k), ...penaltyStats(v) }])),
    standards, industries,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = await pullDol({ refresh: process.argv.includes("--refresh") });
  if (process.argv.includes("--pull-only")) process.exit(0);
  const agg = aggregate(data, await import("./ecfr.mjs"));
  mkdirSync("data/pages/us", { recursive: true });
  writeFileSync(ENFORCEMENT_FILE, JSON.stringify(agg));
  console.log(`✔ ${ENFORCEMENT_FILE}: ${agg.totals.citations} citations, ${agg.totals.inspections} inspections, ${agg.standards.length} standards, ${agg.industries.length} industries`);
}
