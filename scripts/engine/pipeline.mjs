// The write → validate → check → rewrite → check flow shared by every page type (brief section 11):
//  1. write (tools off, JSON against the schema); validate; on failure retry once with the errors;
//  2. independent checking pass (a separate call that sees only the sources and the draft, run
//     from a folder without CLAUDE.md so it never sees the writing instructions);
//  3. problems → rewrite once with the list (fact rule for rewrites), validate, check again;
//  4. still failing → the page is dropped with the reason. A page that failed its check is never released.
import { CHECK_SYSTEM, checkPrompt, checkSchema, rewritePrompt } from "../lib/prompts.mjs";
import { complete, neutralCwd } from "../lib/claude.mjs";
import { config } from "../lib/config.mjs";
import { numbersIn } from "../checks/facts.mjs";

/** Problems that block a page: major factual ones. Style findings and minor wording points are fixed in the rewrite when there is one, but never drop a page on their own. */
const blocking = (problems) => problems.filter((p) => p.type !== "style" && p.severity !== "minor");

const NAME_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;
const CLAUSE_RE = /\b19\d\d\.\d+(?:\([A-Za-z0-9]+\))*/g;

import { similarity } from "../style/patterns.mjs";

/** What a changed line adds that's in neither the original draft nor the sources: numbers, clauses, (English) names. */
function addedFacts(line, allowedNums, allowedText, names) {
  const nums = [...numbersIn(line)].filter((x) => !allowedNums.has(x));
  const clauses = (line.match(CLAUSE_RE) ?? []).filter((c) => !allowedText.includes(c));
  const nm = names ? (line.match(NAME_RE) ?? []).filter((c) => !allowedText.includes(c)) : [];
  return [...nums, ...clauses, ...nm];
}

/**
 * Fact rule for rewrites (section 12): compare every changed line with the original and undo any change
 * that adds a claim (a number, clause or, in English, a name that is in neither the original draft nor the
 * sources). A changed line that adds a fact goes back to its closest original line, or is removed when it
 * has no counterpart. Unchanged and fact-neutral lines keep the rewrite's fixes.
 */
export function guardRewrite(oldDraft, newDraft, sourceText, { lang = "en" } = {}) {
  const allowedNums = numbersIn(`${JSON.stringify(oldDraft)}\n${sourceText}`);
  const allowedText = `${JSON.stringify(oldDraft)}\n${sourceText}`;
  const names = lang === "en";
  const reverted = [];
  const walk = (o, n, path) => {
    if (typeof n === "string") {
      if (typeof o !== "string" || o === n) return n;
      const oldLines = o.split("\n");
      const oldSet = new Set(oldLines);
      const out = [];
      for (const [i, line] of n.split("\n").entries()) {
        if (oldSet.has(line)) { out.push(line); continue; }
        const added = addedFacts(line, allowedNums, allowedText, names);
        if (!added.length) { out.push(line); continue; }
        const best = oldLines.map((l) => ({ l, s: similarity(l, line) })).sort((a, b) => b.s - a.s)[0];
        reverted.push(`${path}: ${added.slice(0, 3).join(", ")}`);
        const back = best && best.s > 0.3 ? best.l : oldLines[i];
        if (back != null && !out.includes(back)) out.push(back);
      }
      return out.join("\n");
    }
    if (Array.isArray(n)) return n.map((x, i) => walk(Array.isArray(o) ? o[i] : undefined, x, `${path}[${i}]`));
    if (n && typeof n === "object") return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, walk(o?.[k], v, path ? `${path}.${k}` : k)]));
    return n;
  };
  return { draft: walk(oldDraft, newDraft, ""), reverted };
}

/**
 * @param {{ label: string, system: string, prompt: string, schema: object, validate: (d: any) => string[],
 *           sources: string, market: string, lang?: string, log: (s: string) => void, draftForCheck?: (d: any) => any }} o
 * @returns {Promise<{ ok: boolean, draft?: any, reason?: string, checkProblems?: any[], notes: string[] }>}
 */
export async function writeChecked(o) {
  const notes = [];
  const model = config.writer_model || undefined;
  const write = async (prompt, label) => (await complete({ system: o.system, prompt, schema: o.schema, label, model, effort: "high", log: o.log })).data;

  // 1. Write + validate, one retry with the errors.
  let draft = await write(o.prompt, `${o.label} write`);
  let problems = o.validate(draft);
  if (problems.length) {
    o.log(`  ! ${o.label}: ${problems.length} validation problem(s), retrying once:\n    - ${problems.slice(0, 12).join("\n    - ")}`);
    draft = await write(`${o.prompt}\n\n---\nYour previous draft failed these checks. Fix every one and return the complete corrected JSON:\n- ${problems.join("\n- ")}\n\n<previous_draft>\n${JSON.stringify(draft)}\n</previous_draft>`, `${o.label} retry`);
    problems = o.validate(draft);
    if (problems.length) return { ok: false, reason: `validation failed after one retry: ${problems.slice(0, 6).join("; ")}`, notes };
  }

  // 2. Independent checking pass.
  const check = async (d, label) =>
    (await complete({ system: CHECK_SYSTEM, prompt: checkPrompt({ draft: o.draftForCheck ? o.draftForCheck(d) : d, sources: o.sources, market: o.market }), schema: checkSchema, label, model: config.checker_model || model, effort: "high", cwd: neutralCwd(), log: o.log })).data.problems ?? [];
  let found = await check(draft, `${o.label} check`);
  if (!blocking(found).length) return { ok: true, draft, checkProblems: found, notes };

  // 3. One rewrite with the problem list, then validate and check again.
  o.log(`  ! ${o.label}: checking pass found ${blocking(found).length} problem(s); rewriting once`);
  const rewritten = await write(rewritePrompt({ originalPrompt: o.prompt, draft, problems: found }), `${o.label} rewrite`);
  const guarded = guardRewrite(draft, rewritten, o.sources, { lang: o.lang ?? (o.market === "fr" || o.market === "de" ? o.market : "en") });
  if (guarded.reverted.length) notes.push(`rewrite changes undone (added facts): ${guarded.reverted.join("; ")}`);
  draft = guarded.draft;
  problems = o.validate(draft);
  if (problems.length) {
    // One mechanical fix (lengths, links missing from sources, repeated phrases…): not a second content rewrite.
    o.log(`  ! ${o.label}: rewrite has ${problems.length} validation problem(s); one mechanical fix`);
    const fixed = await write(`${o.prompt}\n\n---\nYour draft below fails these checks. Fix only these points and return the complete JSON; change nothing else and add no new facts:\n- ${problems.join("\n- ")}\n\n<draft>\n${JSON.stringify(draft)}\n</draft>`, `${o.label} fix`);
    draft = guardRewrite(draft, fixed, o.sources, { lang: o.market === "fr" || o.market === "de" ? o.market : "en" }).draft;
    problems = o.validate(draft);
    if (problems.length) return { ok: false, reason: `rewrite failed validation: ${problems.slice(0, 6).join("; ")}`, checkProblems: found, notes };
  }
  found = await check(draft, `${o.label} recheck`);
  if (blocking(found).length) return { ok: false, reason: `failed the checking pass twice: ${blocking(found).slice(0, 4).map((p) => `[${p.type}] ${p.quote} — ${p.issue}`).join(" | ")}`, checkProblems: found, notes };
  return { ok: true, draft, checkProblems: found, notes };
}
