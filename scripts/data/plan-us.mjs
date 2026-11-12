// Plans the US standard and industry pages (brief sections 6, 7e and 8):
//  - standard page: ≥ standard_citation_floor citations in the last 5 fiscal years, text on eCFR, and the
//    keyword rule (measurable cluster volume ≥ 50, main keyword KD under 15; all phrases KD 15+ → waits);
//  - industry page: 4-digit NAICS with ≥ 200 inspections and ≥ 10 standards cited 5+ times, plus the keyword rule.
// Keyword phrases are generated from each standard's name ("osha {name} requirements", "{name} checklist",
// "osha {number}") and scored in batches with get_keyword_metrics (scripts/keywords/openseo.mjs).
// Writes data/pages/us/standards-plan.json and industries-plan.json, fills the topic sheet's Main page /
// Overlaps columns for the guide ↔ standard pairs, and prints the threshold distribution.
//   node scripts/data/plan-us.mjs [--no-keywords]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "../lib/config.mjs";
import { loadIndex } from "./ecfr.mjs";
import { industrySlug, standardSlug } from "../lib/slugs.mjs";
import { keywordData } from "../keywords/openseo.mjs";
import { complete } from "../lib/claude.mjs";
import { loadTopics, saveTopics, setRow } from "../lib/topics.mjs";

const noKeywords = process.argv.includes("--no-keywords");
const enf = JSON.parse(readFileSync("data/pages/us/enforcement.json", "utf8"));
const idx = loadIndex();
const GENERIC = /^(general requirements?|definitions?|scope|scope and application|purpose|applicability|training|training requirements?|criteria|specific requirements|general)$/i;

/** A standard's everyday name, for keyword phrases and titles. */
export function commonName(sec) {
  let h = sec.heading.replace(/\.$/, "").trim();
  const paren = h.match(/\(([^)]+)\)/)?.[1];
  if (paren && !/\d/.test(paren)) h = paren;
  h = h.replace(/^(the|duty to have|specific requirements for|general requirements for|requirements for|use of|safety requirements for)\s+/i, "").replace(/\s*[—–-]\s*general requirements$/i, "");
  if (GENERIC.test(h) || h.length < 4) h = sec.subpartTitle ?? h;
  return h.toLowerCase().replace(/\//g, " ").replace(/[^a-z0-9 -]/g, "").replace(/\s+/g, " ").trim();
}

// ---- Standards
const dist = { cited: enf.standards.length, floor: 0, onEcfr: 0, write: 0, waitingKd: 0, lowVolume: 0 };
const cands = [];
for (const s of enf.standards) {
  if (s.citations < config.standard_citation_floor) continue;
  dist.floor++;
  const sec = idx.sections[s.section];
  if (!sec || sec.reserved) continue;
  dist.onEcfr++;
  const name = commonName(sec);
  cands.push({ section: s.section, citations: s.citations, heading: sec.heading, part: sec.part, subpart: sec.subpart, subpartTitle: sec.subpartTitle, name, slug: standardSlug(s.section, sec.heading.match(/^General requirements/i) && sec.subpartTitle ? `${sec.subpartTitle} ${sec.heading}` : sec.heading), phrases: [...new Set([`osha ${name} requirements`, `${name} checklist`, `osha ${s.section}`])] });
}
const kw = new Map();
// Formal headings aren't what people type ("osha scaffolds requirements" has no volume; "osha scaffold
// requirements" has 480 a month). One headless call per batch suggests each standard's everyday name, used in
// the brief's phrase patterns. It only proposes search wording; no facts.
if (!noKeywords) {
  // Names are cached so the plan doesn't change from one run to the next.
  const NAMES = "data/pages/us/standard-names.json";
  const cachedNames = existsSync(NAMES) ? JSON.parse(readFileSync(NAMES, "utf8")) : {};
  const todo = cands.filter((c) => !cachedNames[c.section]);
  for (let i = 0; i < todo.length; i += 60) {
    const batch = todo.slice(i, i + 60);
    const res = await complete({
      system: "You know how safety managers search Google for OSHA rules. You return only JSON.",
      schema: { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["section", "names"], properties: { section: { type: "string" }, names: { type: "array", items: { type: "string" } } } } } } },
      label: `standard names ${i / 60 + 1}`, effort: "low",
      prompt: `For each OSHA standard, give 1–2 everyday names people use in searches for what that specific section covers: lowercase, singular where people say it that way, 1–4 words (e.g. 1926.451 General requirements, Subpart L Scaffolds → "scaffold"; 1910.178 Powered industrial trucks → "forklift"; 1926.503 Training requirements, Subpart M Fall Protection → "fall protection training"; 1910.1200 Hazard communication → "hazcom", "hazard communication"). Make the names specific enough that two sections don't share one.\n${batch.map((c) => `${c.section} ${c.heading} (Subpart ${c.subpart ?? "-"}: ${c.subpartTitle ?? ""})`).join("\n")}`,
    });
    for (const it of res.data.items) cachedNames[it.section] = [...new Set(it.names.map((n) => n.toLowerCase().trim()).filter(Boolean))].slice(0, 2);
  }
  writeFileSync(NAMES, `${JSON.stringify(cachedNames, null, 1)}\n`);
  for (const c of cands) {
    // The heading-derived name always stays in, next to the everyday names.
    const names = [...new Set([...(cachedNames[c.section] ?? []), c.name])].filter(Boolean);
    c.name = names[0];
    c.phrases = [...new Set([...names.flatMap((n) => [`osha ${n} requirements`, `${n} checklist`, `${n} inspection`]), `osha ${c.section}`])];
  }
  const phrases = [...new Set(cands.flatMap((c) => c.phrases))];
  console.log(`scoring ${phrases.length} phrases for ${cands.length} standards`);
  for (let i = 0; i < phrases.length; i += 250) {
    const r = await keywordData(phrases.slice(i, i + 250), "us");
    if (!r) { console.error("keyword lookup stopped (credits or OpenSEO); the remaining standards are planned without keyword data"); break; }
    for (const x of r.rows) kw.set(x.keyword, x);
  }
}
const t = config.standard_page_keywords;
// Guides own the topic sheet's searches (brief section 5): a phrase that is a row's primary or supporting
// keyword never goes to a standard or industry page.
const sheetForKeywords = await loadTopics();
const guideOwned = new Set(sheetForKeywords.topics.filter((t) => t.status !== "Dropped").flatMap((t) => [t.keyword, ...t.supporting].map((k) => k.toLowerCase().trim())));
// One main page per search (brief section 5): a phrase belongs to the most-cited standard that uses it.
const owner = new Map();
for (const c of [...cands].sort((a, b) => b.citations - a.citations)) for (const p of c.phrases) if (!owner.has(p) && !guideOwned.has(p)) owner.set(p, c.section);
/** Standard pages own requirements and regulation-number searches: those come first as the main keyword. */
const rank = (x) => (/\bosha\b|requirements|\b19\d\d\./.test(x.keyword) ? 1 : 0);
const pages = cands.map((c) => {
  const cluster = c.phrases.filter((p) => owner.get(p) === c.section).map((p) => kw.get(p) ?? { keyword: p, volume: null, kd: null });
  const volume = cluster.reduce((n, x) => n + (x.volume ?? 0), 0);
  const easy = cluster.filter((x) => x.kd != null && x.kd < t.kd_under && (x.volume ?? 0) > 0).sort((a, b) => rank(b) - rank(a) || b.volume - a.volume)[0];
  let status = "write", reason = "";
  if (noKeywords) status = "write";
  else if (volume < t.volume) { status = "below"; reason = `cluster volume ${volume} (< ${t.volume})`; dist.lowVolume++; }
  else if (!easy) { status = "waiting"; reason = `every measurable phrase has KD ${t.kd_under}+`; dist.waitingKd++; }
  if (status === "write") dist.write++;
  const main = easy?.keyword ?? cluster[0]?.keyword ?? c.phrases[0];
  const title = main === `osha ${c.section}` ? `OSHA ${c.name} requirements (29 CFR ${c.section})` : `${main.replace(/\bosha\b/g, "OSHA").replace(/\b(ppe|lpg|gfci)\b/g, (m) => m.toUpperCase()).replace(/^./, (m) => m.toUpperCase())}${main.includes(c.section) ? "" : ` (29 CFR ${c.section})`}`;
  return { ...c, keyword: main, cluster, clusterVolume: volume, kd: easy?.kd ?? null, titleHint: title, keywordSource: noKeywords ? "enforcement data" : "OpenSEO", status, reason };
});

// Guide ↔ standard pairs from the topic sheet (brief section 5).
const sheet = await loadTopics();
for (const row of sheet.topics) {
  const m = row.overlaps.match(/standard page (19\d\d\.\d+|1926 Subpart P)/);
  if (!m) continue;
  const sections = m[1] === "1926 Subpart P" ? ["1926.651", "1926.652"] : [m[1]];
  const ps = pages.filter((p) => sections.includes(p.section));
  for (const p of ps) (p.guides ??= []).push(row.title);
  const urls = ps.map((p) => `/us/standards/${p.slug}${p.status === "write" ? "" : ` (${p.status})`}`);
  if (urls.length) setRow(sheet, row, { overlaps: `US standard page ${m[1]}: ${urls.join(", ")}`, mainPage: row.mainPage || "this guide (how-to search)" });
}
await saveTopics(sheet);
writeFileSync("data/pages/us/standards-plan.json", `${JSON.stringify({ planned: new Date().toISOString().slice(0, 10), thresholds: { citations: config.standard_citation_floor, ...t }, distribution: dist, pages }, null, 1)}\n`);

// ---- Industries
const idist = { naics4: enf.industries.length, inspections: 0, standards: 0, write: 0, waitingKd: 0, lowVolume: 0 };
const icands = [];
for (const i of enf.industries) {
  if (i.inspections < config.industry_inspection_floor) continue;
  idist.inspections++;
  if (i.standardsCited5Plus < config.industry_min_standards || !i.title) continue;
  idist.standards++;
  const short = i.title.toLowerCase().replace(/\b(and|other|all|except|\(.*?\))\b/g, " ").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  icands.push({ naics: i.naics, title: i.title, inspections: i.inspections, slug: industrySlug(i.naics, i.title), phrases: [`osha regulations for ${short}`, `${short} safety`, `${short} osha`] });
}
// NAICS titles aren't how people search ("foundation, structure, and building exterior contractors"), so one
// headless call suggests the everyday trade name for each industry; phrases are built from it. No facts involved.
const INAMES = "data/pages/us/industry-names.json";
const cachedTrades = existsSync(INAMES) ? JSON.parse(readFileSync(INAMES, "utf8")) : {};
const itodo = icands.filter((c) => !cachedTrades[c.naics]);
if (!noKeywords && itodo.length) {
  const res = await complete({
    system: "You map NAICS industry titles to the everyday words people type into Google about workplace safety in that trade. You return only JSON.",
    schema: { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["naics", "trade", "publicIntent"], properties: { naics: { type: "string" }, trade: { type: "string" }, publicIntent: { type: "boolean" } } } } } },
    label: "industry names", effort: "low",
    prompt: `For each NAICS code, give the everyday trade name a safety manager would type in a search, lowercase, 1–3 words (e.g. 2381 Foundation, Structure, and Building Exterior Contractors → "roofing"; 2361 Residential Building Construction → "residential construction"; 4931 Warehousing and Storage → "warehouse"). Pick the most common trade in the code. publicIntent = true when searches for "<trade> safety" are mostly by customers, passengers or the public rather than employers and workers (e.g. airline, car rental, amusement park, hotel).\n${itodo.map((c) => `${c.naics} ${c.title}`).join("\n")}`,
  });
  for (const it of res.data.items) cachedTrades[it.naics] = { trade: it.trade.toLowerCase(), publicIntent: it.publicIntent };
  writeFileSync(INAMES, `${JSON.stringify(cachedTrades, null, 1)}\n`);
}
if (!noKeywords) {
  for (const [naics, v] of Object.entries(cachedTrades)) { const it = { naics, ...v };
    // Industry pages rank cited standards; they have no checklist, so no "checklist" phrases. Public-facing trades
    // only get employer phrases (osha / regulations).
    const c = icands.find((x) => x.naics === it.naics);
    if (c && it.trade) { c.trade = it.trade.toLowerCase(); c.publicIntent = it.publicIntent; c.phrases = [...new Set([...(it.publicIntent ? [] : [`${c.trade} safety`]), `osha ${c.trade} regulations`, `${c.trade} osha`, `osha ${c.trade} requirements`])]; }
  }
}
if (!noKeywords) {
  const phrases = [...new Set(icands.flatMap((c) => c.phrases))];
  console.log(`scoring ${phrases.length} phrases for ${icands.length} industries`);
  for (let i = 0; i < phrases.length; i += 250) {
    const r = await keywordData(phrases.slice(i, i + 250), "us");
    if (!r) { console.error("keyword lookup stopped for industries"); break; }
    for (const x of r.rows) kw.set(x.keyword, x);
  }
}
const ti = config.industry_page_keywords;
const iowner = new Map();
for (const c of [...icands].sort((a, b) => b.inspections - a.inspections)) for (const p of c.phrases) if (!iowner.has(p) && !owner.has(p) && !guideOwned.has(p)) iowner.set(p, c.naics);
const ipages = icands.map((c) => {
  const cluster = c.phrases.filter((p) => iowner.get(p) === c.naics).map((p) => kw.get(p) ?? { keyword: p, volume: null, kd: null });
  const volume = cluster.reduce((n, x) => n + (x.volume ?? 0), 0);
  const easy = cluster.filter((x) => x.kd != null && x.kd < ti.kd_under && (x.volume ?? 0) > 0).sort((a, b) => b.volume - a.volume)[0];
  let status = "write", reason = "";
  if (noKeywords) status = "write";
  else if (volume < ti.volume) { status = "below"; reason = `cluster volume ${volume} (< ${ti.volume})`; idist.lowVolume++; }
  else if (!easy) { status = "waiting"; reason = `every measurable phrase has KD ${ti.kd_under}+`; idist.waitingKd++; }
  if (status === "write") idist.write++;
  return { ...c, keyword: easy?.keyword ?? cluster[0]?.keyword ?? c.phrases[0], cluster, clusterVolume: volume, kd: easy?.kd ?? null, keywordSource: noKeywords ? "enforcement data" : "OpenSEO", status, reason };
});
writeFileSync("data/pages/us/industries-plan.json", `${JSON.stringify({ planned: new Date().toISOString().slice(0, 10), thresholds: { inspections: config.industry_inspection_floor, standards: config.industry_min_standards, ...ti }, distribution: idist, pages: ipages }, null, 1)}\n`);
console.log("standards:", dist);
console.log("industries:", idist);
