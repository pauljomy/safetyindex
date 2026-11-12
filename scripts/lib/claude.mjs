// Thin wrapper over the Anthropic SDK: streams every request (long outputs),
// resumes server-tool turns that stop with `pause_turn`, and records which
// URLs the model actually fetched so the validator can reject citations of
// pages it never opened.
import Anthropic from "@anthropic-ai/sdk";

/** Writes the English post. Override with ANTHROPIC_MODEL (e.g. claude-opus-5-5). */
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
/** Searches and writes the French and German versions. Override with TRANSLATION_MODEL. */
export const TRANSLATION_MODEL = process.env.TRANSLATION_MODEL || "claude-sonnet-5-5";
/** Server-side refusal fallback (a safety classifier declining a chemicals/medical topic retries on another model). Set ANTHROPIC_FALLBACKS=off to disable. */
const FALLBACKS = process.env.ANTHROPIC_FALLBACKS !== "off";
const client = new Anthropic({ maxRetries: 4, timeout: 30 * 60 * 1000 });

/** Each fetched page is read up to this many tokens: regulation sections fit, giant PDFs are cut (the biggest input cost). */
const FETCH_TOKENS = Number(process.env.FETCH_MAX_TOKENS) || 10000;
/** Web search only (the script downloads pages itself, see scripts/lib/sources.mjs). */
// The basic variant on purpose: its result URLs and titles reach the model directly
// (the dynamic-filtering variant can hide them behind code execution).
export const searchTool = (searches = 4) => ({ type: "web_search_20250305", name: "web_search", max_uses: searches });

/** Search + server-side fetch. Not used by the post pipeline (too expensive: the fetch loop re-reads every page). */
export const webTools = (searches = 12, fetches = 18) => [
  { type: "web_search_20260209", name: "web_search", max_uses: searches },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: fetches, max_content_tokens: FETCH_TOKENS },
];

/** USD per million tokens (cache write = 1.25× input); web search $10 per 1,000. Update when prices change. */
const PRICES = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2 },
  "claude-fable-5-1": { in: 10, out: 50, cacheRead: 1 },
  "claude-opus-5": { in: 5, out: 25, cacheRead: 0.5 },
};
const SEARCH_USD = 10 / 1000;

/** Running totals for this run, per call label. */
export const ledger = [];
function bill(label, model, u) {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  const usd =
    ((u.input_tokens ?? 0) * p.in + (u.cache_creation_input_tokens ?? 0) * p.in * 1.25 + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.output_tokens ?? 0) * p.out) / 1e6 +
    searches * SEARCH_USD;
  const row = ledger.find((r) => r.label === label && r.model === model) ?? (ledger.push({ label, model, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, searches: 0, fetches: 0, usd: 0 }), ledger.at(-1));
  row.input += u.input_tokens ?? 0;
  row.cacheWrite += u.cache_creation_input_tokens ?? 0;
  row.cacheRead += u.cache_read_input_tokens ?? 0;
  row.output += u.output_tokens ?? 0;
  row.searches += searches;
  row.fetches += u.server_tool_use?.web_fetch_requests ?? 0;
  row.usd += usd;
  return usd;
}
export const totalUsd = () => ledger.reduce((s, r) => s + r.usd, 0);

/** Hard ceiling per post (USD). Checked before every request, so one run can overshoot by at most one call. */
export const MAX_POST_USD = Number(process.env.MAX_POST_USD) || 2;

/** "https://www.osha.gov/x/" → "osha.gov/x" so trivial differences don't fail a match. */
export function normUrl(u) {
  try {
    const x = new URL(u);
    return (x.host.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "") + x.search).toLowerCase();
  } catch {
    return String(u).toLowerCase();
  }
}

/** Records a fetched page: the normalised form for matching and the original URL for prompts. */
export function addOpened(opened, url) {
  opened.add(normUrl(url));
  (opened.raw ??= new Map()).set(normUrl(url), url);
}
export const openedList = (opened) => [...(opened.raw?.values() ?? opened)];

function walk(node, fn) {
  if (Array.isArray(node)) node.forEach((n) => walk(n, fn));
  else if (node && typeof node === "object") {
    fn(node);
    for (const v of Object.values(node)) walk(v, fn);
  }
}

/**
 * Collects fetched pages: successful `web_fetch_result` blocks (their final
 * URL) and, as a fallback, the URL asked for by a web_fetch call whose result
 * was not an error.
 */
function collectFetched(content, opened) {
  const requested = new Map(); // tool_use id → url
  walk(content, (n) => {
    if (n.type === "server_tool_use" && n.name === "web_fetch" && n.input?.url) requested.set(n.id, n.input.url);
  });
  walk(content, (n) => {
    if (n.type === "web_fetch_result" && n.url) addOpened(opened, n.url);
    if (n.type === "web_fetch_tool_result") {
      const ok = n.content && !/error/.test(n.content.type ?? "");
      const url = requested.get(n.tool_use_id);
      if (ok && url) addOpened(opened, url);
      if (ok && n.content.url) addOpened(opened, n.content.url);
    }
  });
}

/**
 * One model turn (with server-tool continuation).
 * @param {{system: string, messages: any[], tools?: any[], schema?: object, effort?: string, opened?: Set<string>, label?: string}} o
 * @returns {Promise<{text: string, content: any[], usage: any}>}
 */
export async function ask({ system, messages, tools, schema, effort = "high", opened = new Set(), label = "call", model = MODEL }) {
  const msgs = [...messages];
  const usage = { input_tokens: 0, output_tokens: 0 };
  const searchResults = [];
  for (let turn = 0; turn < 12; turn++) {
    if (totalUsd() >= MAX_POST_USD)
      throw new Error(`Budget stop: this post has already cost $${totalUsd().toFixed(2)} (MAX_POST_USD is $${MAX_POST_USD}). Nothing was published.`);
    const started = Date.now();
    const params = {
      model,
      max_tokens: 64000,
      system,
      messages: msgs,
      ...(tools && { tools }),
      output_config: { effort, ...(schema && { format: { type: "json_schema", schema } }) },
      // Prompt caching only where a prefix is re-sent (server-tool loops); a one-off
      // call would pay the 25% cache-write premium for nothing.
      ...(tools && { cache_control: { type: "ephemeral" } }),
    };
    const msg = await (FALLBACKS
      ? client.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : client.messages.stream(params)
    ).finalMessage();
    const usd = bill(label.replace(/ \(draft \d+\)$/, ""), msg.model ?? model, msg.usage ?? {});
    usage.input_tokens += msg.usage?.input_tokens ?? 0;
    usage.output_tokens += msg.usage?.output_tokens ?? 0;
    collectFetched(msg.content, opened);
    walk(msg.content, (n) => { if (n.type === "web_search_result" && n.url) searchResults.push({ url: n.url, title: n.title ?? "" }); });
    const u = msg.usage ?? {};
    console.log(`  · ${label} [${msg.model ?? model}]: ${msg.stop_reason} in ${Math.round((Date.now() - started) / 1000)}s · in ${u.input_tokens ?? 0} (+${u.cache_read_input_tokens ?? 0} cached) / out ${u.output_tokens ?? 0} tokens · $${usd.toFixed(2)} · ${opened.size} pages opened`);
    if (msg.stop_reason === "pause_turn") {
      msgs.push({ role: "assistant", content: msg.content });
      continue;
    }
    if (msg.stop_reason === "refusal") throw new Error(`${label}: the model declined (${msg.stop_details?.category ?? "no category"})`);
    if (msg.stop_reason === "max_tokens") throw new Error(`${label}: hit max_tokens before finishing`);
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return { text, content: msg.content, usage, searchResults };
  }
  throw new Error(`${label}: server tools kept pausing; gave up after 12 turns`);
}

/** Parses the JSON object in a reply (structured output, or the last ```json block / outermost braces). */
export function parseJson(text, label = "reply") {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]).pop();
  const candidates = [text.trim(), fenced, text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)].filter(Boolean);
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {}
  }
  throw new Error(`${label}: could not parse JSON from the model's reply`);
}

// ---------------------------------------------------------------------------
// Writer backends (brief section 11). `complete()` is what the engine calls:
//   WRITER=cli (default) → headless Claude Code: `claude -p`, prompt on stdin, JSON output,
//                          tools off for writing and checking, WebSearch only for the search step.
//   WRITER=api           → the Anthropic API through ask() above (same prompts and schemas).
// Usage and rate limits wait and retry with backoff (up to max_backoff_minutes between tries).
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { config as engineConfig } from "./config.mjs";

const LIMIT_RE = /usage limit|rate limit|rate_limit|overloaded|429|529|quota|too many requests|limit reached|try again later/i;
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Environment for headless `claude` runs: never an Anthropic API key. With ANTHROPIC_API_KEY set, the CLI
 * bills the API instead of the Claude subscription and the claude.ai connectors (OpenSEO) aren't loaded.
 * The build makes no Anthropic API calls (brief section 1 / intro), so the key is always removed here.
 */
export function cliEnv() {
  const env = { ...process.env };
  for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_SIMPLE"]) delete env[k];
  return env;
}

function runCli(args, input, { cwd, timeoutMs = 30 * 60_000 }) {
  return new Promise((resolve) => {
    const child = spawn("claude", args, { cwd, env: cliEnv(), stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, out, err }); });
    child.stdin.end(input);
  });
}

/** A neutral working directory with no CLAUDE.md, for calls that must not see the writing instructions. */
let neutralDir;
export const neutralCwd = () => (neutralDir ??= mkdtempSync(joinPath(tmpdir(), "si-check-")));

/**
 * One structured call through the configured writer.
 * @param {{ system: string, prompt: string, schema: object, tools?: "none"|"websearch", model?: string, effort?: string,
 *           label?: string, cwd?: string, log?: (s: string) => void }} o
 * @returns {Promise<{ data: any, raw: string, usd: number, searchResults: {url: string, title: string}[] }>}
 */
export async function complete(o) {
  const writer = engineConfig.writer ?? "cli";
  const log = o.log ?? console.log;
  const model = o.model || engineConfig.writer_model || undefined;
  if (writer === "api") {
    const res = await ask({ system: o.system, messages: [{ role: "user", content: o.prompt }], schema: o.schema, effort: o.effort ?? "high", model: model ?? MODEL, label: o.label, ...(o.tools === "websearch" && { tools: [searchTool(4)] }) });
    return { data: parseJson(res.text, o.label), raw: res.text, usd: 0, searchResults: res.searchResults ?? [] };
  }
  const args = ["-p", "--output-format", "json", "--no-session-persistence", "--system-prompt", o.system, "--json-schema", JSON.stringify(o.schema)];
  if (o.tools === "websearch") args.push("--tools", "WebSearch", "--allowedTools", "WebSearch");
  else args.push("--tools", "");
  if (model) args.push("--model", model);
  if (o.effort) args.push("--effort", o.effort);
  const maxWait = (engineConfig.max_backoff_minutes ?? 60) * 60_000;
  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    const { code, out, err } = await runCli(args, o.prompt, { cwd: o.cwd ?? process.cwd() });
    let res;
    try { res = JSON.parse(out.trim().split("\n").filter(Boolean).at(-1)); } catch { res = null; }
    const text = res?.result ?? "";
    const failed = code !== 0 || !res || res.is_error;
    if (failed) {
      const why = `${res?.api_error_status ?? ""} ${text} ${err}`.slice(0, 400);
      if (LIMIT_RE.test(why) || (!res && attempt < 3)) {
        const wait = Math.min(maxWait, 60_000 * 2 ** Math.min(attempt, 6));
        log(`  … ${o.label}: usage/rate limit or CLI error (${why.trim().slice(0, 160) || `exit ${code}`}); waiting ${Math.round(wait / 60_000)} min (try ${attempt + 1})`);
        await sleepMs(wait);
        continue;
      }
      throw new Error(`${o.label}: claude -p failed: ${why.trim()}`);
    }
    // Guard: a subscription (OAuth) session reports credential_expires_at; an API-key session doesn't.
    if (!("credential_expires_at" in res) && process.env.SAFETYINDEX_ALLOW_API_CLI !== "1") throw new Error(`${o.label}: claude -p ran without the Claude subscription login (API-key billing?). Log in with \`claude\` and make sure ANTHROPIC_API_KEY isn't set.`);
    const data = res.structured_output ?? parseJson(text, o.label);
    const urls = o.tools === "websearch" ? [...text.matchAll(/https?:\/\/[^\s)"'\]]+/g)].map((m) => ({ url: m[0], title: "" })) : [];
    log(`  · ${o.label} [cli${model ? ` ${model}` : ""}]: ${Math.round((Date.now() - started) / 1000)}s, $${(res.total_cost_usd ?? 0).toFixed(2)} equiv.`);
    return { data, raw: text, usd: res.total_cost_usd ?? 0, searchResults: urls };
  }
}
