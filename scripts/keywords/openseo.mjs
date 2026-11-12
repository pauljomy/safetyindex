// Keyword data from OpenSEO (brief section 6). Lookups run as their own headless step with only
// the OpenSEO MCP tools allowed, never inside a writing call. Every result is saved in
// data/keywords/<market>/<date>.json so nothing is bought twice, and a credit ledger
// (data/keywords/ledger.json) enforces keyword_credits_per_run and keyword_credit_floor.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { config } from "../lib/config.mjs";

const DIR = "data/keywords";
const LEDGER = join(DIR, "ledger.json");
const TOOL = process.env.OPENSEO_TOOL_PREFIX ?? "mcp__claude_ai_OpenSEO__";
/** Estimated credits per keyword for get_keyword_metrics (125 keywords cost 32, 20 cost 16). */
const CREDITS_PER_KEYWORD = 0.8;
// One "run" = one process (an engine run, a weekly run or a keyword script).
const runId = `${new Date().toISOString().slice(0, 16)}-${process.pid}`;

const today = () => new Date().toISOString().slice(0, 10);
const readJson = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d);

export function ledger() {
  return readJson(LEDGER, { balance: null, balanceCheckedOn: null, runs: {} });
}
function spend(credits, note) {
  const l = ledger();
  l.runs[runId] = (l.runs[runId] ?? 0) + credits;
  if (l.balance != null) l.balance = Math.round((l.balance - credits) * 10) / 10;
  (l.log ??= []).push({ at: new Date().toISOString(), credits, note });
  l.log = l.log.slice(-500);
  mkdirSync(DIR, { recursive: true });
  writeFileSync(LEDGER, `${JSON.stringify(l, null, 2)}\n`);
}
/** Can this run spend `credits` more? */
export function canSpend(credits) {
  const l = ledger();
  if ((l.runs[runId] ?? 0) + credits > config.keyword_credits_per_run) return { ok: false, why: `this run has spent ${l.runs[runId] ?? 0} of ${config.keyword_credits_per_run} keyword credits` };
  if (l.balance != null && l.balance - credits < config.keyword_credit_floor) return { ok: false, why: `balance ${l.balance} would fall below the floor of ${config.keyword_credit_floor}` };
  if (credits > config.keyword_batch_max_credits) return { ok: false, why: `batch of ${credits} credits is over ${config.keyword_batch_max_credits}` };
  return { ok: true };
}

/** All saved rows for a market, newest first, keyed by keyword. */
export function cached(market) {
  const dir = join(DIR, market);
  const rows = new Map();
  if (!existsSync(dir)) return rows;
  const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
  for (const f of files) for (const r of readJson(join(dir, f), { rows: [] }).rows ?? []) if (!rows.has(r.keyword)) rows.set(r.keyword, { ...r, checkedOn: f.slice(0, 10) });
  return rows;
}

export function save(market, rows, meta = {}) {
  const dir = join(DIR, market);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${today()}.json`);
  const prev = readJson(file, { rows: [] });
  const merged = new Map(prev.rows.map((r) => [r.keyword, r]));
  for (const r of rows) merged.set(r.keyword, r);
  writeFileSync(file, `${JSON.stringify({ ...prev, ...meta, market, rows: [...merged.values()] }, null, 1)}\n`);
}

function claude(args, input) {
  return new Promise((resolve) => {
    const c = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (err += d));
    c.on("close", (code) => resolve({ code, out, err }));
    c.stdin.end(input);
  });
}

const rowSchema = {
  type: "object", additionalProperties: false, required: ["rows", "error"],
  properties: { error: { type: "string" }, rows: { type: "array", items: { type: "object", additionalProperties: false, required: ["keyword", "volume", "kd", "intent"], properties: { keyword: { type: "string" }, volume: { type: ["integer", "null"] }, kd: { type: ["integer", "null"] }, intent: { type: ["string", "null"] } } } } },
};

/**
 * Search volume, KD and intent for keywords in a market (cached first; OpenSEO for the rest).
 * @returns {Promise<{ rows: {keyword: string, volume: number|null, kd: number|null, intent: string|null}[] } | null>} null when OpenSEO isn't usable
 */
export async function keywordData(keywords, market, { log = console.log } = {}) {
  const want = [...new Set(keywords.map((k) => k.toLowerCase().trim()).filter((k) => k && k.length <= 80))];
  const have = cached(market);
  const missing = want.filter((k) => !have.has(k));
  if (missing.length) {
    const cost = Math.ceil(missing.length * CREDITS_PER_KEYWORD) + 1;
    const ok = canSpend(cost);
    if (!ok.ok) { log(`  ! keyword data for ${market}: not buying (${ok.why})`); return have.size && want.every((k) => have.has(k)) ? { rows: want.map((k) => have.get(k)) } : null; }
    const prompt = `Call the tool ${TOOL}get_keyword_metrics exactly once with projectId "${config.openseo_project_id}", locationCode ${config.location_codes[market]}, languageCode "${config.language_codes[market]}", includeMonthlyTrends false, and these keywords: ${JSON.stringify(missing)}. Return every row the tool returns as {keyword (lowercase), volume (monthly search volume or null), kd (keyword difficulty or null), intent (main search intent or null)}. Keywords the tool doesn't return: volume null, kd null. If the tool fails, set error to its message and rows to []; otherwise error is "".`;
    // ToolSearch only loads tool schemas (MCP tools can be deferred); nothing else is allowed.
    const args = ["-p", "--output-format", "json", "--no-session-persistence", "--permission-prompts", "none", "--allowedTools", `ToolSearch,${TOOL}get_keyword_metrics`,
      "--disallowedTools", "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Agent,Task", "--json-schema", JSON.stringify(rowSchema)];
    let res, data;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { out } = await claude(args, `${prompt} If the tool isn't loaded yet, load it with ToolSearch ("select:${TOOL}get_keyword_metrics") first.`);
      try { res = JSON.parse(out.trim().split("\n").at(-1)); } catch { res = null; }
      data = res?.structured_output;
      if (data && !data.error) break;
      log(`  … OpenSEO lookup attempt ${attempt + 1} failed (${(data?.error || res?.result || "no output").slice(0, 120)}); retrying`);
      await new Promise((r) => setTimeout(r, 30_000 * (attempt + 1)));
    }
    if (!data || data.error) { log(`  ! OpenSEO lookup failed for ${market}: ${data?.error || res?.result || "no output"}`); return null; }
    spend(cost, `${market}: ${missing.length} keywords`);
    const rows = missing.map((k) => data.rows.find((r) => r.keyword.toLowerCase() === k) ?? { keyword: k, volume: null, kd: null, intent: null });
    save(market, rows, { source: "OpenSEO get_keyword_metrics" });
    for (const r of rows) have.set(r.keyword, { ...r, checkedOn: today() });
    log(`  · OpenSEO ${market}: ${missing.length} keyword(s), ≈${cost} credits`);
  }
  return { rows: want.map((k) => have.get(k)) };
}
