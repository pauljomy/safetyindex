// Thin wrapper over the Anthropic SDK: streams every request (long outputs),
// resumes server-tool turns that stop with `pause_turn`, and records which
// URLs the model actually fetched so the validator can reject citations of
// pages it never opened.
import Anthropic from "@anthropic-ai/sdk";

/** English research and writing: where accuracy and quality are decided. */
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
/** French/German research and rewriting, from an English post whose facts are already verified. */
export const TRANSLATION_MODEL = process.env.TRANSLATION_MODEL || "claude-sonnet-5-5";
/** Server-side refusal fallback (a safety classifier declining a chemicals/medical topic retries on another model). Set ANTHROPIC_FALLBACKS=off to disable. */
const FALLBACKS = process.env.ANTHROPIC_FALLBACKS !== "off";
const client = new Anthropic({ maxRetries: 4, timeout: 30 * 60 * 1000 });

/** Each fetched page is read up to this many tokens: regulation sections fit, giant PDFs are cut (the biggest input cost). */
const FETCH_TOKENS = Number(process.env.FETCH_MAX_TOKENS) || 10000;
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
export const MAX_POST_USD = Number(process.env.MAX_POST_USD) || 8;

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
      // Automatic prompt caching: pause_turn continuations and repair turns resend the same prefix.
      cache_control: { type: "ephemeral" },
    };
    const msg = await (FALLBACKS
      ? client.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : client.messages.stream(params)
    ).finalMessage();
    const usd = bill(label.replace(/ \(draft \d+\)$/, ""), msg.model ?? model, msg.usage ?? {});
    usage.input_tokens += msg.usage?.input_tokens ?? 0;
    usage.output_tokens += msg.usage?.output_tokens ?? 0;
    collectFetched(msg.content, opened);
    const u = msg.usage ?? {};
    console.log(`  · ${label} [${msg.model ?? model}]: ${msg.stop_reason} in ${Math.round((Date.now() - started) / 1000)}s · in ${u.input_tokens ?? 0} (+${u.cache_read_input_tokens ?? 0} cached) / out ${u.output_tokens ?? 0} tokens · $${usd.toFixed(2)} · ${opened.size} pages opened`);
    if (msg.stop_reason === "pause_turn") {
      msgs.push({ role: "assistant", content: msg.content });
      continue;
    }
    if (msg.stop_reason === "refusal") throw new Error(`${label}: the model declined (${msg.stop_details?.category ?? "no category"})`);
    if (msg.stop_reason === "max_tokens") throw new Error(`${label}: hit max_tokens before finishing`);
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return { text, content: msg.content, usage };
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
