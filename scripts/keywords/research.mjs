// Finding more keywords (brief section 6): research_keywords once per topic-sheet category (category-level
// seeds, about 54 credits each), then grouped by intent:
//  - keywords a reader would expect an existing row's page to answer join that row's cluster (Supporting Keywords);
//  - a different intent becomes a new row (Status: Not started, Notes: from OpenSEO), never a second page for
//    the same intent. New rows still pass the threshold and go/no-go rules before anything is written.
// The lookup runs as its own headless step with only the OpenSEO research tool allowed; the grouping is a
// separate call with tools off. Results: data/keywords/us/research-<date>.json.
//   node scripts/keywords/research.mjs [--categories "PPE,Fire Safety"] [--dry-run]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { config } from "../lib/config.mjs";
import { cliEnv, complete } from "../lib/claude.mjs";
import { canSpend, ledger } from "./openseo.mjs";
import { appendTopic, loadTopics, saveTopics, setRow, STATUS } from "../lib/topics.mjs";
import { categories } from "../../src/data/categories.mjs";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const only = args.includes("--categories") ? args[args.indexOf("--categories") + 1].split(",").map((s) => s.trim()) : null;
const TOOL = process.env.OPENSEO_TOOL_PREFIX ?? "mcp__claude_ai_OpenSEO__";
const today = new Date().toISOString().slice(0, 10);
const OUT = `data/keywords/us/research-${today}.json`;
const SEED_CREDITS = 54;
const t = config.guide_thresholds.us;

/** Category-level seeds: the sheet category in plain search words. */
const SEEDS = {
  ppe: "personal protective equipment", "hazards-chemicals": "chemical safety", "safety-management": "safety management", "fire-safety": "fire safety workplace",
  "risk-assessment-permits": "risk assessment", "construction-safety": "construction safety", "toolbox-talks-safety-meetings": "toolbox talk", "food-safety": "food safety",
  "falls-working-at-height": "fall protection", "equipment-machinery": "forklift safety", "first-aid-medical": "first aid", "osha-compliance": "osha requirements",
  "incidents-reporting": "incident report", "safety-training-certification": "safety training", "electrical-loto": "electrical safety", "emergency-planning": "emergency action plan",
  "ergonomics-manual-handling": "ergonomics", "driver-safety": "driver safety", "confined-space": "confined space",
};

function claude(argv, input) {
  return new Promise((resolve) => {
    const c = spawn("claude", argv, { env: cliEnv(), stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.on("close", () => resolve(out));
    c.stdin.end(input);
  });
}
const rowsSchema = { type: "object", additionalProperties: false, required: ["rows", "error"], properties: { error: { type: "string" }, rows: { type: "array", items: { type: "object", additionalProperties: false, required: ["keyword", "volume", "kd", "intent"], properties: { keyword: { type: "string" }, volume: { type: ["integer", "null"] }, kd: { type: ["integer", "null"] }, intent: { type: ["string", "null"] } } } } } };

async function research(seed) {
  const prompt = `Call ${TOOL}research_keywords once with projectId "${config.openseo_project_id}" and seeds [{"seed": ${JSON.stringify(seed)}, "locationCode": ${config.location_codes.us}, "languageCode": "en"}] (default result limit). Return every keyword row as {keyword (lowercase), volume, kd, intent}. If the tool isn't loaded, load it with ToolSearch ("select:${TOOL}research_keywords") first. If the tool fails, set error to the message and rows to []; otherwise error is "".`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const out = await claude(["-p", "--output-format", "json", "--no-session-persistence", "--permission-prompts", "none", "--allowedTools", `ToolSearch,${TOOL}research_keywords`, "--disallowedTools", "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Agent,Task", "--json-schema", JSON.stringify(rowsSchema)], prompt);
    try { const d = JSON.parse(out.trim().split("\n").at(-1)).structured_output; if (d && !d.error) return d.rows; console.log(`  … ${seed}: ${d?.error ?? "no output"}`); } catch { console.log(`  … ${seed}: unreadable output`); }
    await new Promise((r) => setTimeout(r, 30_000 * (attempt + 1)));
  }
  return null;
}

const groupSchema = {
  type: "object", additionalProperties: false, required: ["joins", "newTopics"],
  properties: {
    joins: { type: "array", items: { type: "object", additionalProperties: false, required: ["row", "keywords"], properties: { row: { type: "integer" }, keywords: { type: "array", items: { type: "string" } } } } },
    newTopics: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "keyword", "supporting", "intent", "why", "topicType"], properties: { topicType: { type: "string", enum: ["country-only", "same everywhere", "regional"] }, title: { type: "string" }, keyword: { type: "string" }, supporting: { type: "array", items: { type: "string" } }, intent: { type: "string" }, why: { type: "string" } } } },
  },
};

const sheet = await loadTopics();
const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
for (const c of categories) {
  if (only && !only.includes(c.sheet)) continue;
  if (results[c.slug]) continue;
  const ok = canSpend(SEED_CREDITS);
  if (!ok.ok) { console.log(`stopping: ${ok.why}`); break; }
  if (dry) { console.log(`would research "${SEEDS[c.slug]}" (${c.sheet})`); continue; }
  const rows = await research(SEEDS[c.slug]);
  if (!rows) { console.log(`  ✖ ${c.sheet}: lookup failed`); continue; }
  const l = ledger(); l.balance = l.balance == null ? null : l.balance - SEED_CREDITS; (l.log ??= []).push({ at: new Date().toISOString(), credits: SEED_CREDITS, note: `research ${c.slug}` }); writeFileSync("data/keywords/ledger.json", `${JSON.stringify(l, null, 2)}\n`);
  results[c.slug] = { seed: SEEDS[c.slug], rows };
  mkdirSync("data/keywords/us", { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(results, null, 1)}\n`);
  console.log(`  ✔ ${c.sheet}: ${rows.length} keywords`);
}
if (dry) process.exit(0);

// Group by intent, per category, against the sheet's rows in that category.
let added = 0, joined = 0;
for (const [slug, r] of Object.entries(results)) {
  if (r.grouped) continue;
  const cat = categories.find((c) => c.slug === slug);
  const known = new Set(sheet.topics.flatMap((t) => [t.keyword, ...t.supporting].map((k) => k.toLowerCase())));
  const candidates = r.rows.filter((x) => !known.has(x.keyword) && (x.volume ?? 0) >= 100);
  if (!candidates.length) { r.grouped = true; continue; }
  const rows = sheet.topics.filter((t) => t.category === cat.sheet && t.status !== STATUS.dropped);
  const res = await complete({
    system: "You group search keywords by search intent for a workplace safety reference site. You return only JSON.",
    schema: groupSchema, label: `group ${slug}`, effort: "medium",
    prompt: `Existing topics in the "${cat.sheet}" category (row number: title | main keyword):
${rows.map((t) => `${t.n}: ${t.title} | ${t.keyword}`).join("\n")}

New keywords (keyword | monthly volume | KD | intent):
${candidates.map((x) => `${x.keyword} | ${x.volume} | ${x.kd ?? "?"} | ${x.intent ?? "?"}`).join("\n")}

1. joins: keywords a reader would expect one existing topic's page to answer (same question, a variant or a sub-question) → that row number.
2. newTopics: groups of keywords with a different intent where the reader has to act (an inspection, a daily check, a plan, a permit, a training duty or a test) and a guide could be written from official US sources (OSHA, eCFR, NIOSH; FDA/USDA/CDC for food safety). Title in plain words; keyword = the group's main search; supporting = the rest; topicType: country-only (exists under one country's law, e.g. an OSHA standard or form), same everywhere (the safe practice doesn't depend on the law) or regional (the duty, interval, record or legal reference differs by country). Never a topic that duplicates an existing row's intent, a product or shopping search, a course or certification sale, a thin list (quotes, slogans, tips), a news or history one-off, or a "safety in {place}" page.
Leave out everything else.`,
  });
  for (const j of res.data.joins) {
    const row = sheet.topics.find((t) => t.n === j.row);
    const kws = j.keywords.filter((k) => candidates.some((x) => x.keyword === k));
    if (!row || !kws.length) continue;
    row.supporting = [...row.supporting, ...kws];
    sheet.ws.getRow(row.row).getCell(5).value = row.supporting.join(", ");
    joined += kws.length;
  }
  for (const nt of res.data.newTopics) {
    const main = candidates.find((x) => x.keyword === nt.keyword.toLowerCase());
    if (!main) continue;
    const cluster = [nt.keyword, ...nt.supporting].reduce((n, k) => n + (candidates.find((x) => x.keyword === k.toLowerCase())?.volume ?? 0), 0);
    const status = main.kd != null && main.kd >= t.kd_under ? STATUS.highCompetition : cluster < t.volume ? STATUS.lowDemand : STATUS.notStarted;
    appendTopic(sheet, { category: cat.sheet, title: nt.title, keyword: nt.keyword.toLowerCase(), supporting: nt.supporting.join(", "), status, topicType: nt.topicType, markets: nt.topicType === "regional" ? "US, UK, AU, CA, NZ, FR, DE" : nt.topicType === "same everywhere" ? "US, FR, DE" : "US",
      clusterVolume: cluster, kd: main.kd, intent: main.intent ?? "", checkedOn: today, keywordSource: "OpenSEO", notes: `from OpenSEO (research ${today}): ${nt.why}` });
    sheet.ws.getRow(sheet.topics.at(-1).row).getCell(6).value = status;
    added++;
  }
  r.grouped = true;
  writeFileSync(OUT, `${JSON.stringify(results, null, 1)}\n`);
}
await saveTopics(sheet);
console.log(`✔ research: ${Object.keys(results).length} categories, ${joined} keywords joined existing rows, ${added} new topic rows`);
