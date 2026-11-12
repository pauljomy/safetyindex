// Writing checks (brief sections 12 and 17), shared by the per-page validator
// (scripts/lib/validate.mjs) and the build (scripts/check-dist.mjs).
import { faqRepeatsBody, opensWithAnswer, repeatedPhrases, scriptedFindings, sectionsOf } from "../style/patterns.mjs";

export const MIN_GUIDE_WORDS = 1200;
const words = (s) => (String(s).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
export const wordCount = words;

/** Names of regulations and regulators: left out of the repetition count. */
export const REPETITION_EXEMPT = [
  "Occupational Safety and Health Administration", "Occupational Safety and Health Act", "Code of Federal Regulations", "Health and Safety Executive",
  "Safe Work Australia", "WorkSafe New Zealand", "Canadian Centre for Occupational Health and Safety", "Canada Labour Code", "Health and Safety at Work Act",
  "Code du travail", "Institut national de recherche et de sécurité", "Deutsche Gesetzliche Unfallversicherung", "Bundesanstalt für Arbeitsschutz und Arbeitsmedizin",
  "Arbeitsschutzgesetz", "Betriebssicherheitsverordnung", "Department of Labor", "Bureau of Labor Statistics", "National Institute for Occupational Safety and Health",
  "the most-cited", "initial penalty", "fiscal years",
];

/** Claims of review or credentials (rule 9). */
const REVIEWED = [
  /\breviewed by\b/i, /\bfact[- ]checked by\b/i, /\bmedically reviewed\b/i, /\bwritten by [A-Z][a-z]+ [A-Z][a-z]+/,
  /\b(?:CSP|CIH|CHST|NEBOSH|MSc|PhD|RN|MD),\s/i, /\bour (?:safety )?experts?\b/i, /\bcertified safety professional on our team\b/i,
  /\bgeprüft von\b/i, /\brelu par\b/i, /\bvalidé par (?:un|une|notre)\b/i,
];

const PLACEHOLDER = /\b(?:TODO|TBD|lorem ipsum|placeholder|\[insert|\[your |\{\{|xxx\b)|PLACEHOLDER_/i;

/**
 * Checks one page's prose.
 * @param {{ body: string, faq?: {question:string,answer:string}[], lang?: string, guide?: boolean, opening?: string, sectionsMarkdown?: string }} p
 *   body: the main prose as markdown; opening: the page's first sentence (summary/opening field)
 * @returns {string[]} problems
 */
export function checkWriting({ body, faq = [], lang = "en", guide = false, opening, extraText = "" }) {
  const e = [];
  const all = `${opening ?? ""}\n\n${body}\n\n${faq.map((f) => `${f.question}\n${f.answer}`).join("\n")}\n\n${extraText}`;
  for (const f of scriptedFindings(all, { lang })) e.push(`writing pattern "${f.rule ?? "banned phrase"}": "${String(f.match).slice(0, 80)}"${f.message ? ` (${f.message})` : ""}`);
  for (const r of repeatedPhrases(body, { n: 4, max: 2, exempt: REPETITION_EXEMPT })) e.push(`the phrase "${r.phrase}" appears ${r.count} times in the prose (max 2)`);
  for (const r of faqRepeatsBody(faq, body, 0.8)) e.push(`FAQ answer to "${r.question}" repeats the body (similarity ${r.score.toFixed(2)})`);
  for (const re of REVIEWED) if (re.test(all)) e.push(`claims a review or credential ("${all.match(re)[0]}"); the site has no named reviewers`);
  if (PLACEHOLDER.test(all)) e.push(`placeholder or leftover text ("${all.match(PLACEHOLDER)[0]}")`);
  if (opening != null && !opening.trim()) e.push("the page has no opening answer sentence");
  else if (opening && /\?\s*$/.test(opening.trim())) e.push("the opening must answer the question, not ask one");
  const secs = sectionsOf(body);
  for (const [i, s] of secs.entries()) {
    if (s.level > 3 || !s.heading) continue;
    const hasChildren = secs[i + 1] && secs[i + 1].level > s.level;
    if (!s.text.trim()) { if (!hasChildren) e.push(`section "${s.heading}" is empty`); continue; }
    const r = opensWithAnswer(s.text);
    if (!r.ok && s.level === 2) e.push(`section "${s.heading}" doesn't open with an answer sentence (${r.reason ?? r.firstSentence.slice(0, 60)})`);
  }
  if (guide && words(body) < MIN_GUIDE_WORDS) e.push(`guide body is ${words(body)} words (minimum ${MIN_GUIDE_WORDS}; add substance from the sources, not filler)`);
  return e;
}

/** For JSON pages (standard, industry): joins text fields into markdown-ish prose for the checks. */
export const proseFromBlocks = (blocks) => blocks.filter(Boolean).map((b) => (typeof b === "string" ? b : b.heading ? `## ${b.heading}\n\n${b.text}` : b.text)).join("\n\n");
