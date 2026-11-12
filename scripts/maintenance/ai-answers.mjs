// AI answer tracking (brief section 16): asks a fixed list of 20 buyer questions per market
// (data/ai-answers/questions.json) through a headless `claude -p` call with only WebSearch allowed
// (complete() with tools: "websearch"), and records whether the answer names or links safetyindex.blog.
// Results: data/ai-answers/<date>.json, plus a summary per market. Run it monthly (it makes 140 calls):
//   npm run ai-answers                     # every market
//   npm run ai-answers -- --market us --limit 5
//   npm run ai-answers -- --dry-run        # list the questions only
import { readFileSync } from "node:fs";
import { complete } from "../lib/claude.mjs";
import { COUNTRY } from "../lib/prompts.mjs";
import { config } from "../lib/config.mjs";
import { today, writeJson } from "../gsc/common.mjs";

const QUESTIONS = "data/ai-answers/questions.json";
const LANG = { fr: "French", de: "German" };
const schema = {
  type: "object", additionalProperties: false, required: ["answer_mentions_safetyindex", "links", "summary"],
  properties: { answer_mentions_safetyindex: { type: "boolean" }, links: { type: "array", items: { type: "string" } }, summary: { type: "string" } },
};
const SYSTEM = "You are a helpful assistant answering a workplace safety question the way a search-backed AI assistant would: search the web, then answer from what you find, citing the pages you relied on. You return only the JSON the schema asks for.";
const mentions = (s) => /safetyindex\.blog|safety\s?index/i.test(s);

export async function runAiAnswers({ market, limit = Infinity, dryRun = false, log = console.log } = {}) {
  const all = JSON.parse(readFileSync(QUESTIONS, "utf8"));
  const markets = market ? [market] : Object.keys(all);
  const jobs = markets.flatMap((m) => (all[m] ?? []).slice(0, limit).map((q) => ({ market: m, question: q })));
  if (dryRun) { for (const j of jobs) log(`${j.market}: ${j.question}`); return null; }
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      const prompt = `Question from a reader in ${COUNTRY[j.market]}: "${j.question}"

Search the web and answer it as you normally would${LANG[j.market] ? `, in ${LANG[j.market]}` : ""}. Then return:
- summary: your answer in two to four sentences;
- links: every URL you cited or relied on, in order of importance;
- answer_mentions_safetyindex: true only if your answer names Safety Index or links a safetyindex.blog page.`;
      try {
        const r = await complete({ system: SYSTEM, prompt, schema, tools: "websearch", effort: "low", label: `ai-answer ${j.market}`, log: () => {} });
        const links = r.data.links ?? [];
        const ours = links.filter((u) => /safetyindex\.blog/i.test(u));
        const named = !!r.data.answer_mentions_safetyindex || ours.length > 0 || mentions(r.data.summary ?? "");
        results.push({ ...j, named, linked: ours.length > 0, ourLinks: ours, links, summary: r.data.summary, searchResults: r.searchResults.map((s) => s.url).slice(0, 20) });
        log(`  ${named ? "✔" : "·"} [${j.market}] ${j.question}${ours.length ? ` → ${ours.join(", ")}` : ""}`);
      } catch (e) {
        results.push({ ...j, error: String(e.message ?? e).slice(0, 300) });
        log(`  ✖ [${j.market}] ${j.question}: ${e.message}`);
      }
    }
  };
  log(`AI answers: ${jobs.length} question(s), writer ${config.writer}`);
  await Promise.all(Array.from({ length: Math.max(1, config.workers ?? 3) }, worker));
  const summary = Object.fromEntries(markets.map((m) => {
    const rs = results.filter((r) => r.market === m && !r.error);
    return [m, { asked: rs.length, named: rs.filter((r) => r.named).length, linked: rs.filter((r) => r.linked).length, errors: results.filter((r) => r.market === m && r.error).length }];
  }));
  const file = `data/ai-answers/${today()}.json`;
  writeJson(file, { date: today(), summary, results }, 1);
  log(`\nAI answers that name or link safetyindex.blog (saved to ${file}):`);
  for (const [m, s] of Object.entries(summary)) log(`  ${m.toUpperCase()}: named in ${s.named} of ${s.asked}, linked in ${s.linked}${s.errors ? ` (${s.errors} failed)` : ""}`);
  return { file, summary };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
  runAiAnswers({ market: opt("market"), limit: Number(opt("limit")) || Infinity, dryRun: a.includes("--dry-run") }).catch((e) => { console.error(e.stack ?? e); process.exit(1); });
}
