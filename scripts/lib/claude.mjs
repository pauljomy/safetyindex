// Thin wrapper over the Anthropic SDK: streams every request (long outputs),
// resumes server-tool turns that stop with `pause_turn`, and records which
// URLs the model actually fetched so the validator can reject citations of
// pages it never opened.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const client = new Anthropic({ maxRetries: 4, timeout: 30 * 60 * 1000 });

export const webTools = (searches = 12, fetches = 18) => [
  { type: "web_search_20260209", name: "web_search", max_uses: searches },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: fetches },
];

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
export async function ask({ system, messages, tools, schema, effort = "high", opened = new Set(), label = "call" }) {
  const msgs = [...messages];
  const usage = { input_tokens: 0, output_tokens: 0 };
  for (let turn = 0; turn < 12; turn++) {
    const started = Date.now();
    const msg = await client.messages
      .stream({
        model: MODEL,
        max_tokens: 64000,
        system,
        messages: msgs,
        ...(tools && { tools }),
        output_config: { effort, ...(schema && { format: { type: "json_schema", schema } }) },
      })
      .finalMessage();
    usage.input_tokens += msg.usage?.input_tokens ?? 0;
    usage.output_tokens += msg.usage?.output_tokens ?? 0;
    collectFetched(msg.content, opened);
    console.log(`  · ${label}: ${msg.stop_reason} in ${Math.round((Date.now() - started) / 1000)}s (${msg.usage?.output_tokens} output tokens, ${opened.size} pages opened so far)`);
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
