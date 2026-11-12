// Writing-style checks (brief section 12). Pure functions over markdown prose,
// no dependencies. The scripted rules are the ones that passed the human test
// (scripts/style/test-human.mjs, report in human-sample-report.md); everything
// else is judged by the independent checking pass from JUDGMENT_RULES.
//
//   node scripts/style/patterns.mjs --selftest      run the inline examples
//   node scripts/style/patterns.mjs <file.md> [--lang fr]   print findings
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Rule lists (finalised from the human test; see human-sample-report.md)

/** Rules a script enforces automatically. */
export const SCRIPTED_RULES = ["bold-label", "ing-tail", "fragment", "leftover"];

/** Rules the checking pass judges (no reliable script, or the script flagged human writing). */
export const JUDGMENT_RULES = [
  { id: "triad", description: "Three items (adjectives, nouns, clauses) where two would do, especially rhythmic 'X, Y and Z' lists that add no new fact." },
  { id: "not-x-but-y", description: "'Not X but Y' / 'It's not just X, it's Y' contrasts against a claim nobody made." },
  { id: "inflated-significance", description: "Inflated significance with no fact behind it: 'plays a pivotal/crucial/vital role', 'is a cornerstone of', 'cannot be overstated', 'stands as a testament'." },
  { id: "sales-words", description: "Sales or hype words with no fact behind them: 'game-changer', 'cutting-edge', 'seamless', 'robust', 'unparalleled', 'peace of mind', 'top-notch'." },
  { id: "phantom-objection", description: "Arguing against an objection nobody raised ('Some may think safety training is optional. It isn't.')." },
  { id: "generic-opener-closer", description: "Generic openers or closers that answer nothing: 'When it comes to workplace safety…', 'Safety is everyone's responsibility.', 'By following these tips you can…', 'Stay safe out there.'" },
  { id: "fragment-mid", description: "Verbless one-line fragments in the middle of a section ('No shortcuts.' between two paragraphs). The script only flags them as closers (before a heading or at the end) because mid-section it matched image captions in human pages." },
  { id: "bold-noun-label", description: "Bold noun labels on list items that only restate the item ('**Proper training:** Make sure operators get proper training.'). The script only flags action labels ('**Inspect daily:** Inspect…'); noun labels are often legitimate glossary terms." },
  { id: "self-answer", description: "Self-answered rhetorical questions in body prose ('The result? Fewer injuries.', 'Why does this matter? Because…'). Moved from scripted: the script also matched genuine question-and-answer prose in human guidance (see human-sample-report.md)." },
];

// ---------------------------------------------------------------------------
// Word lists

const STOP = {
  en: "a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each either few for from further had has have having he her here hers him his how i if in into is it its itself just may me might more most must my no nor not now of off on once only or other our out over own same shall she should so some such than that the their them then there these they this those through to too under until up upon very was we were what when where which while who whom why will with within without would you your yours",
  fr: "à au aux avec ce ces cet cette dans de des du elle elles en est et être eux il ils je la le les leur leurs lui ma mais me même mes moi mon ne nos notre nous on ou où par pas pour qu que qui sa se ses son sont sur ta te tes toi ton tu un une vos votre vous y été être avoir a ont fait peut doit sans entre plus moins comme si tout tous toute toutes aussi lors donc ainsi",
  de: "aber als am an auch auf aus bei bin bis bist da damit dann das dass dem den der des die dies diese diesem diesen dieser dieses doch du durch ein eine einem einen einer eines er es für hat hatte haben ich ihr ihre im in ist ja jede jedem jeden jeder jedes kann können man mit muss müssen nach nicht noch nur ob oder ohne sein seine sich sie sind so soll sollen über um und uns unter vom von vor war was wenn werden wie wird wir wo zu zum zur sowie bzw",
};
const STOPWORDS = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.split(/\s+/))]));
const ALL_STOP = new Set([...STOPWORDS.en, ...STOPWORDS.fr, ...STOPWORDS.de]);

// Regulators and regulation names: n-grams containing these are not "repeated phrasing".
const REG_TOKENS = new Set(
  "osha ansi nfpa niosh msha hse ccohs cfr ecfr loler puwer coshh riddor ppe inrs dguv baua arbschg betrsichv gefstoffv arbstättv asr trbs dguv-v légifrance legifrance iso din csa eu-osha euosha cnesst worksafe worksafebc anses carsat cramif oppbtp".split(/\s+/),
);
const REG_PHRASES = [
  "Occupational Safety and Health Administration",
  "National Institute for Occupational Safety and Health",
  "Health and Safety Executive",
  "Health and Safety at Work etc. Act",
  "Code of Federal Regulations",
  "Occupational Safety and Health",
  "Department of Labor",
  "Canadian Centre for Occupational Health and Safety",
  "American National Standards Institute",
  "National Fire Protection Association",
  "Code du travail",
  "Ministère du Travail",
  "Institut national de recherche et de sécurité",
  "Deutsche Gesetzliche Unfallversicherung",
  "Bundesanstalt für Arbeitsschutz und Arbeitsmedizin",
];
// "Lifting Operations and Lifting Equipment Regulations 1998", "Work at Height Regulations"…
const REG_NAME_RE = /(?:\b[A-Z][\w’'-]*\s+(?:(?:and|of|at|for|the|on|etc\.?)\s+)*){1,10}(?:Regulations?|Act|Standards?|Directive|Rule)\b(?:\s+\(?\d{4}\)?)?/g;
// "l'arrêté du 4 novembre 1993", "décret n° 2008-244 du 7 mars 2008", "Verordnung vom 3. Februar 2015"
const REG_DATED_RE = /\b(?:l['’])?(?:arrêté|décret|directive|loi|ordonnance|circulaire|règlement|Verordnung|Richtlinie|Gesetz|Bekanntmachung)\s+(?:\(\p{L}+\)\s+)?(?:n°\s*[\d/-]+\s+)?(?:du|vom)\s+\d{1,2}(?:er|\.)?\s+\p{L}+\s+\d{4}/giu;
// Quoted wording (usually copied from the regulation) is not the writer's phrasing.
const QUOTE_RE = /“[^”\n]*”|"[^"\n]*"|«[^»\n]*»|„[^“”\n]*[“”]|‘[^’\n]{12,}’/g;
// 1910.147(c)(4), § 1926.502, L. 4121-1, R4323-58, Article 5, section 1910.178(l)
const CLAUSE_RE = /§+\s*[\w.()-]*\d[\w.()-]*|\b\d+(?:\.\d+)+(?:\([a-z0-9]{1,4}\))*|\b\d+(?:\([a-z0-9]{1,4}\))+|\b[LRD]\.?\s?\d{3,4}(?:-\d+)+|\b(?:Article|Art\.|Artikel|Anhang|Annex|Appendix|Annexe|clause|paragraph|section|Abs\.|Nr\.|Teil|Part|Subpart)\s+[\w.()-]*\d[\w.()-]*/gi;

// English words that make a short line a sentence (for the fragment rule).
const VERBS = new Set(
  ("is are was were be been being am 's 're 've 'd 'll has have had do does did done can could will would shall should may might must need needs needed " +
    "get gets got go goes went make makes made take takes took give gives gave put keep keeps check checks inspect use uses wear wears stop stops start starts " +
    "read call see know ask follow report test lock tag lift lifts move moves turn leave leaves stay stays let say says said tell find found work works apply applies " +
    "require requires comply complies contact replace repair clean store mark sign hold carry cover remove fit fits look looks run runs pay try means mean help helps").split(/\s+/),
);

// One-line closers (whole paragraph). Lowercased, punctuation-insensitive.
const CLOSERS = {
  en: ["simple as that", "it's that simple", "that's it", "that's all", "safety first", "the bottom line", "bottom line", "period", "full stop", "end of story", "no exceptions", "every time", "nothing more nothing less", "stay safe", "stay safe out there", "better safe than sorry", "case closed", "enough said", "the result", "the takeaway", "the verdict", "lesson learned", "food for thought", "think about it"],
  fr: ["tout simplement", "c'est tout", "c'est aussi simple que cela", "la sécurité avant tout", "la sécurité d'abord", "point final", "en bref", "sans exception", "à chaque fois", "restez prudents", "mieux vaut prévenir que guérir", "le verdict", "le résultat", "en résumé"],
  de: ["ganz einfach", "so einfach ist das", "sicherheit geht vor", "sicherheit zuerst", "punkt", "mehr nicht", "ohne ausnahme", "das war's", "jedes mal", "bleiben sie sicher", "das fazit", "das ergebnis", "kurz gesagt", "fazit"],
};

const LEFTOVERS = [
  /\bI hope (?:this|that|it) helps\b/i,
  /\bAs an AI\b/i,
  /\bAs a (?:large )?language model\b/i,
  /\bmy (?:training|knowledge) (?:data|cutoff)\b/i,
  /\[(?:your|company|insert|name|date|link|add|placeholder|author|title|source|url)\b[^\]\n]{0,40}\](?!\()/i,
  /\{\{[^}\n]*\}\}/,
  /\bCertainly!/i,
  /\bAbsolutely!/i,
  /(?:^|[\s"“])Sure!/i,
  /\bGreat question\b/i,
  /\bLet me know if\b/i,
  /\bfeel free to\b/i,
  /\bHere['’]s an?\b/i,
  /\bJ['’]esp[èe]re que cela\b/i,
  /\bN['’]h[ée]sitez pas\b/i,
  /\bIch hoffe,? (?:das|dies) hilft\b/i,
  /(?:^|[\s"„])Gerne!/i,
  /\b(?:TODO|FIXME|TBD)\b/,
  /\blorem ipsum\b/i,
];

// Evaluative participle tails. "ensuring"/"making it" only with an evaluative object
// (the plain forms carry facts in human guidance; see the report).
const ING_TAIL_RE = new RegExp(
  ",\\s+(?:thus\\s+|thereby\\s+|further\\s+)?(?:" +
    [
      "highlighting", "emphasi[sz]ing", "underscoring", "showcasing", "reflecting", "demonstrating", "illustrating",
      "signal{1,2}ing", "reinforcing", "contributing to", "fostering", "cementing", "solidifying", "paving the way",
      "setting the stage", "marking a", "serving as a (?:reminder|testament)",
      "ensuring (?:that )?(?:everyone|every (?:worker|employee)|workers? (?:stay|remain|go home)|a safer|safety|peace of mind|compliance|the (?:safety|well-?being) of)",
      "making (?:it|them|this) (?:an? )?(?:essential|crucial|vital|critical|key|important|indispensable|invaluable|a must|a cornerstone|easier|simpler|safer)",
    ].join("|") +
    ")\\b[^.!?\\n]*[.!?]?\\s*$",
  "i",
);

// ---------------------------------------------------------------------------
// Banned phrases

let bannedCache;
function bannedList() {
  if (bannedCache) return bannedCache;
  const lines = readFileSync(join(here, "banned-phrases.txt"), "utf8").split(/\r?\n/);
  bannedCache = lines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((phrase) => ({ phrase, re: phraseRegex(phrase) }));
  return bannedCache;
}

function inflect(word) {
  const w = escapeRe(word);
  if (/e$/i.test(word)) return `${w.slice(0, -1)}(?:e|es|ed|ing|er|ers)`;
  if (/y$/i.test(word)) return `${w.slice(0, -1)}(?:y|ies|ied)`;
  if (/ous$/i.test(word)) return `${w}(?:ly|ness)?`;
  return `${w}(?:s|es|ed|ing|ly)?`;
}
function phraseRegex(phrase) {
  const words = phrase.split(/\s+/);
  const last = words.pop();
  const parts = words.map((w) => escapeRe(w).replace(/['’]/g, "['’]"));
  parts.push(/^[a-z]/i.test(last) && /[a-z]$/i.test(last) ? inflect(last) : escapeRe(last));
  return new RegExp(`(?<![\\p{L}\\p{N}])${parts.join("\\s+")}(?![\\p{L}\\p{N}])`, "giu");
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** @returns {{phrase: string, match: string, index: number}[]} */
export function findBanned(text) {
  const out = [];
  for (const { phrase, re } of bannedList()) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) out.push({ phrase, match: m[0], index: m.index });
  }
  return out.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------------------
// Markdown helpers

/** Split markdown into blocks with their offsets. kind: heading|list|table|quote|code|html|para */
export function blocksOf(md) {
  const out = [];
  let start = 0;
  let body = md;
  const fm = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  if (fm) start = fm[0].length;
  body = md.slice(start);
  const lines = body.split("\n");
  let pos = start;
  let cur = null;
  let fence = false;
  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const lineStart = pos;
    pos += raw.length + 1;
    if (/^\s*(```|~~~)/.test(line)) {
      if (!fence) { flush(); cur = { kind: "code", text: line, index: lineStart }; fence = true; }
      else { cur.text += "\n" + line; flush(); fence = false; }
      continue;
    }
    if (fence) { cur.text += "\n" + line; continue; }
    if (!line.trim()) { flush(); continue; }
    if (/^#{1,6}\s/.test(line)) { flush(); out.push({ kind: "heading", text: line, index: lineStart }); continue; }
    const kind = /^\s*([-*+]|\d+[.)])\s+/.test(line) ? "list"
      : /^\s*\|/.test(line) ? "table"
      : /^\s*>/.test(line) ? "quote"
      : /^\s*</.test(line) ? "html"
      : "para";
    if (cur && (cur.kind === kind || (cur.kind === "list" && kind === "para" && /^\s+/.test(line)))) {
      cur.text += "\n" + line;
    } else {
      flush();
      cur = { kind, text: line, index: lineStart };
    }
  }
  flush();
  return out;
}

/** Strip inline markdown (links keep their text, emphasis and code marks go). */
export function plain(s) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<https?:[^>]+>/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/(\*\*|__|\*|_|`)/g, "")
    .replace(/<[^>]+>/g, "");
}

const ABBR = /(?:\b(?:e\.g|i\.e|etc|vs|No|no|Fig|fig|Dr|Mr|Ms|Mrs|St|approx|U\.S|U\.K|Inc|Ltd|Co|Art|Abs|Nr|z\.B|bzw|ca|S|p|pp|al)\.)$/;
/** Sentences with offsets relative to the input string. */
export function sentencesOf(text) {
  const out = [];
  let start = 0;
  const push = (chunk, at) => {
    const lead = chunk.length - chunk.trimStart().length;
    if (chunk.trim()) out.push({ s: chunk.trim(), index: at + lead });
  };
  for (const m of text.matchAll(/[.!?]+["”’)\]]*(?=\s|$)|\n/g)) {
    const end = m.index + m[0].length;
    if (m[0] !== "\n" && end < text.length) {
      if (ABBR.test(text.slice(start, end))) continue;
      if (/^\s+\p{Ll}/u.test(text.slice(end, end + 3))) continue; // "… approx. three metres"
    }
    push(text.slice(start, end), start);
    start = end;
  }
  push(text.slice(start), start);
  return out;
}

const wordsOf = (s) => (s.toLowerCase().replace(/[’]/g, "'").match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []);

function stem(w) {
  w = w.toLowerCase().replace(/['’]s$/, "");
  for (const [suf, rep] of [["ations", "ate"], ["ation", "ate"], ["ings", ""], ["ing", ""], ["ions", ""], ["ion", ""], ["ies", "y"], ["ied", "y"], ["ed", ""], ["ly", ""], ["es", ""], ["s", ""]]) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) { w = w.slice(0, -suf.length) + rep; break; }
  }
  return w.replace(/e$/, "");
}

// ---------------------------------------------------------------------------
// Pattern rules

const MESSAGES = {
  "bold-label": "Bold label repeats the sentence that follows; drop the label or make it add information.",
  "ing-tail": "Sentence ends in an evaluative '-ing' comment tail; cut the tail or replace it with a fact.",
  fragment: "One-line verbless fragment or stock closer; fold it into a sentence with a specific detail or cut it.",
  leftover: "Chatbot leftover or placeholder; remove it.",
  "self-answer": "Self-answered rhetorical question; state the answer directly.",
};

const ACTION_VERBS = {
  en: new Set(("inspect check wear use keep ensure make train maintain avoid store follow lock tag test secure report plan provide identify assess " +
    "review label clean replace document establish install mark verify isolate control limit protect remove stop start know read always never " +
    "communicate monitor post choose select prepare set put take give get stay be do don't fit adjust warn guard ventilate evaluate record schedule " +
    "conduct perform enforce require prevent reduce eliminate understand recognize recognise consider apply comply call contact lift carry move hold").split(/\s+/)),
  de: new Set("prüfen tragen kontrollieren sichern verwenden benutzen einhalten schulen unterweisen melden reinigen lagern kennzeichnen absperren abschalten warten dokumentieren beachten überprüfen vermeiden halten sorgen stellen achten festlegen ermitteln beurteilen bereitstellen".split(" ")),
};
function isActionLabel(label, lang) {
  const w = wordsOf(label);
  if (!w.length) return false;
  if (lang === "fr") return /(?:ez|er|ir|re)$/.test(w[0]) && !/(?:ier|eur|ure|ire)$/.test(w[0]) || ["toujours", "jamais", "ne"].includes(w[0]);
  if (lang === "de") return ACTION_VERBS.de.has(w[0]) || w[1] === "sie" || ["immer", "nie", "niemals"].includes(w[0]);
  // "Fit testing", "Lock inspection": a verb-looking word followed by a noun is a noun phrase.
  return ACTION_VERBS.en.has(w[0]) && !(w[1] && /(?:ing|tion|ment|ness|ance|ence)s?$/.test(w[1]));
}

function ruleBoldLabel(block, lang, out) {
  const stop = STOPWORDS[lang] ?? STOPWORDS.en;
  let off = 0;
  for (const line of block.text.split("\n")) {
    const m = line.match(/^(\s*(?:[-*+]|\d+[.)])\s+)(\*\*|__)(.+?)\2\s*[:.–—-]?\s*(.+)$/);
    if (m) {
      const label = m[3].replace(/[:.]\s*$/, "");
      const rest = sentencesOf(plain(m[4]))[0]?.s ?? "";
      // Only action labels ("Inspect daily:", "Vérifiez…", "Prüfen Sie…"). Noun labels that name
      // the item ("I.V. connector systems: Use needleless connector systems…") are glossary
      // style and passed the human test only as a judgment call.
      if (!isActionLabel(label, lang)) { off += line.length + 1; continue; }
      const lw = [...new Set(wordsOf(label).filter((w) => !stop.has(w) && !ALL_STOP.has(w)).map(stem))];
      const sw = new Set(wordsOf(rest).map(stem));
      if (lw.length && rest) {
        const hit = lw.filter((w) => sw.has(w)).length / lw.length;
        if (hit >= 0.6) out.push({ rule: "bold-label", match: line.trim(), index: block.index + off });
      }
    }
    off += line.length + 1;
  }
}

function ruleIngTail(block, out) {
  const lines = block.text.split("\n");
  let off = 0;
  for (const line of lines) {
    for (const { s, index } of sentencesOf(line)) {
      const m = plain(s).match(ING_TAIL_RE);
      if (m) out.push({ rule: "ing-tail", match: s, index: block.index + off + index });
    }
    off += line.length + 1;
  }
}

function isCloser(text, lang) {
  const t = text.toLowerCase().replace(/[’]/g, "'").replace(/[^\p{L}\p{N}' ]/gu, " ").replace(/\s+/g, " ").trim();
  return (CLOSERS[lang] ?? []).includes(t);
}

const DETERMINERS = new Set("no a an the every all some any your our their more less fewer many few these those".split(" "));
function hasVerbEn(words) {
  return words.some((w, i) => {
    if (VERBS.has(w) || /'(s|re|ve|d|ll)$/.test(w) || /n't$/.test(w)) return true;
    if (i > 0 && DETERMINERS.has(words[i - 1])) return false; // "no excuses", "the guards"
    return (w.length > 3 && /ed$/.test(w)) || (w.length > 3 && /[^su]s$/.test(w));
  });
}

function ruleFragment(block, lang, out, next) {
  if (block.kind !== "para" || block.text.includes("\n")) return;
  const raw = block.text.trim();
  const t = plain(raw).trim();
  if (!t) return;
  if (/^(\*\*|__)/.test(raw)) return; // bold pseudo-heading or "**Term** – definition"
  if (isCloser(t, lang)) { out.push({ rule: "fragment", match: raw, index: block.index }); return; }
  if (lang !== "en") return;
  if (!/[.!?…]["”’)]*$/.test(t)) return; // labels and headings without terminal punctuation are not prose
  if (/^[\p{L}\s]{1,30}:/u.test(t)) return; // "Note: …", "Source: …"
  if (/^\(?(?:Figure|Fig\.|Table|Photo|Image|Source)\b/i.test(t)) return; // captions
  if (new RegExp(CLAUSE_RE.source, "i").test(t) || /\bCFR\b/.test(t)) return; // citations ("29 CFR 1910.1030(b).")
  // Verbless fragments are scripted only in closer position (last block before a heading or
  // the end). Mid-section ones matched image captions in human pages: judgment rule.
  if (next && next.kind !== "heading") return;
  const w = wordsOf(t);
  if (w.length === 0 || w.length > 6) return;
  if (!hasVerbEn(w)) out.push({ rule: "fragment", match: raw, index: block.index });
}

function ruleLeftover(text, out) {
  for (const re of LEFTOVERS) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    for (const m of text.matchAll(g)) out.push({ rule: "leftover", match: m[0].trim(), index: m.index });
  }
}

function ruleSelfAnswer(block, out) {
  const sents = sentencesOf(plain(block.text));
  for (let i = 0; i < sents.length - 1; i++) {
    const q = sents[i].s;
    if (!q.endsWith("?")) continue;
    if (wordsOf(q).length > 6) continue;
    out.push({ rule: "self-answer", match: `${q} ${sents[i + 1].s}`, index: block.index + sents[i].index });
  }
}

/**
 * All pattern findings (scripted and the heuristic self-answer rule). Filter on
 * SCRIPTED_RULES for the automatic gate.
 * @param {string} text markdown or plain prose
 * @param {{lang?: "en"|"fr"|"de"}} [opts]
 * @returns {{rule: string, match: string, index: number, message: string}[]}
 */
export function findPatterns(text, { lang = "en" } = {}) {
  const out = [];
  const blocks = blocksOf(text);
  for (const [i, b] of blocks.entries()) {
    if (b.kind === "code" || b.kind === "heading" || b.kind === "table" || b.kind === "html") continue;
    if (b.kind === "list") ruleBoldLabel(b, lang, out);
    if (lang === "en" && (b.kind === "para" || b.kind === "list" || b.kind === "quote")) ruleIngTail(b, out);
    ruleFragment(b, lang, out, blocks[i + 1]);
    if (b.kind === "para") ruleSelfAnswer(b, out);
  }
  ruleLeftover(text, out);
  return out.sort((a, b) => a.index - b.index).map((f) => ({ ...f, message: MESSAGES[f.rule] }));
}

/** Banned phrases plus the scripted pattern rules only: what the automatic gate fails on. */
export function scriptedFindings(text, { lang = "en" } = {}) {
  const pats = findPatterns(text, { lang }).filter((f) => SCRIPTED_RULES.includes(f.rule));
  const banned = findBanned(text).map((b) => ({ rule: "banned", match: b.match, index: b.index, message: `Banned phrase "${b.phrase}".` }));
  return [...pats, ...banned].sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------------------
// Repetition

/** Body paragraphs only: no headings, lists, tables, blockquotes, code, link URLs, quoted wording, clause references, regulation/regulator names or exempt strings. */
export function proseOf(md, exempt = []) {
  let paras = blocksOf(md).filter((b) => b.kind === "para").map((b) => plain(b.text));
  const ex = [...exempt, ...REG_PHRASES].filter(Boolean).sort((a, b) => b.length - a.length);
  return paras.map((p) => {
    for (const e of ex) p = p.replace(new RegExp(escapeRe(e).replace(/\s+/g, "\\s+"), "gi"), " ⟂ ");
    p = p.replace(/(\d)[ \u00a0\u202f](?=\d{3}\b)/g, "$1"); // 70 000 → 70000
    return p.replace(QUOTE_RE, " ⟂ ").replace(REG_DATED_RE, " ⟂ ").replace(CLAUSE_RE, " ⟂ ").replace(REG_NAME_RE, " ⟂ ");
  });
}

/**
 * n-word phrases used more than `max` times in body paragraphs.
 * @returns {{phrase: string, count: number}[]}
 */
export function repeatedPhrases(text, { n = 4, max = 2, exempt = [] } = {}) {
  const counts = new Map();
  for (const p of proseOf(text, exempt)) {
    for (const chunk of p.split(/[.!?;:⟂()\[\]"“”„«»]+|\s[–—-]\s/)) {
      const w = (chunk.toLowerCase().replace(/[’]/g, "'").match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []).map((x) => x.replace(/'$/, ""));
      for (let i = 0; i + n <= w.length; i++) {
        const g = w.slice(i, i + n);
        if (g.every((x) => ALL_STOP.has(x))) continue;
        if (g.some((x) => REG_TOKENS.has(x) || /\d/.test(x) && /[a-z]/.test(x) && x.length > 4)) continue;
        const k = g.join(" ");
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
  }
  return [...counts].filter(([, c]) => c > max).map(([phrase, count]) => ({ phrase, count })).sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase));
}

// ---------------------------------------------------------------------------
// Similarity

function shingles(s, k = 3) {
  const w = wordsOf(plain(s));
  if (w.length < k) return new Set(w);
  const out = new Set();
  for (let i = 0; i + k <= w.length; i++) out.add(w.slice(i, i + k).join(" "));
  return out;
}

/** Jaccard similarity over word 3-shingles (0..1). */
export function similarity(a, b) {
  const A = shingles(a);
  const B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * FAQ answers that repeat the body. Each answer is compared with every body
 * paragraph, every pair of consecutive paragraphs, and every run of body
 * sentences as long as the answer (so a copied passage inside a longer
 * paragraph is still caught).
 * @param {Array<{q?:string,a?:string,question?:string,answer?:string}|string>} faq
 * @param {string} body markdown
 * @returns {{index:number, question:string, answer:string, score:number, match:string}[]}
 */
export function faqRepeatsBody(faq, body, threshold = 0.8) {
  const paras = blocksOf(body).filter((b) => b.kind === "para" || b.kind === "list" || b.kind === "quote").map((b) => plain(b.text));
  const sents = paras.flatMap((p) => sentencesOf(p).map((x) => x.s));
  const out = [];
  (faq ?? []).forEach((item, index) => {
    const question = typeof item === "string" ? "" : item.q ?? item.question ?? "";
    const answer = typeof item === "string" ? item : item.a ?? item.answer ?? "";
    if (!answer.trim()) return;
    const k = Math.max(1, sentencesOf(answer).length);
    const cands = [...paras];
    for (let i = 0; i + 1 < paras.length; i++) cands.push(`${paras[i]} ${paras[i + 1]}`);
    for (const len of [k, k + 1]) for (let i = 0; i + len <= sents.length; i++) cands.push(sents.slice(i, i + len).join(" "));
    let best = 0;
    let match = "";
    for (const c of cands) {
      const s = similarity(answer, c);
      if (s > best) { best = s; match = c; }
    }
    if (best > threshold) out.push({ index, question, answer, score: Math.round(best * 1000) / 1000, match });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Sections and answer-first

/** Split a markdown body into sections. Text before the first heading has heading "" and level 0. */
export function sectionsOf(markdown) {
  const out = [];
  let cur = { heading: "", level: 0, text: "" };
  let fence = false;
  const md = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      if (cur.level || cur.text.trim()) out.push({ ...cur, text: cur.text.trim() });
      cur = { heading: h[2], level: h[1].length, text: "" };
    } else cur.text += line + "\n";
  }
  if (cur.level || cur.text.trim()) out.push({ ...cur, text: cur.text.trim() });
  return out;
}

const NOT_AN_ANSWER = /^(?:in this (?:section|guide|article|post|page)|this (?:section|guide|article|post|page) (?:will|explains|covers|looks|describes|outlines|walks)|let['’]s|let us|here['’]s|here is|here are|before we|we['’]ll|we will|now(?:,)? (?:that|let)|first(?:ly)?, let|so(?:,)?\s|but\s|and\s|or\s|also,|well,|when it comes to|dans cette (?:section|partie)|dans ce (?:guide|article)|voyons|voici|avant de (?:commencer|voir)|mais\s|et\s|donc,|alors,|in diesem (?:abschnitt|artikel|leitfaden|beitrag)|hier (?:ist|sind|finden)|schauen wir|sehen wir uns|bevor wir|aber\s|und\s|also,)/i;

/**
 * Does a section open with a declarative sentence that answers its heading?
 * @param {string} sectionText section markdown (a leading heading line is skipped)
 * @returns {{ok: boolean, firstSentence: string, reason?: string}}
 */
export function opensWithAnswer(sectionText) {
  const blocks = blocksOf(sectionText).filter((b) => b.kind !== "heading");
  const first = blocks[0];
  if (!first) return { ok: false, firstSentence: "", reason: "section has no text before the next heading" };
  if (first.kind !== "para") return { ok: false, firstSentence: "", reason: `section opens with a ${first.kind}, not a sentence` };
  const firstSentence = sentencesOf(plain(first.text).replace(/\s+/g, " "))[0]?.s ?? "";
  if (/\?$/.test(firstSentence)) return { ok: false, firstSentence, reason: "first sentence is a question" };
  if (NOT_AN_ANSWER.test(firstSentence)) return { ok: false, firstSentence, reason: "first sentence is a signpost or starts with a conjunction" };
  if (wordsOf(firstSentence).length < 5) return { ok: false, firstSentence, reason: "first sentence is too short to answer the heading" };
  if (!/[.!:]["”’)]*$/.test(firstSentence)) return { ok: false, firstSentence, reason: "first sentence is not a complete sentence" };
  return { ok: true, firstSentence };
}

// ---------------------------------------------------------------------------
// Self-test

function selftest() {
  let fail = 0;
  const rules = (t, lang) => findPatterns(t, { lang }).map((f) => f.rule);
  const expect = (name, cond) => {
    if (!cond) { fail++; console.error(`FAIL ${name}`); } else console.log(`ok   ${name}`);
  };
  const has = (t, rule, lang = "en") => expect(`${rule} flags: ${JSON.stringify(t).slice(0, 70)}`, rules(t, lang).includes(rule));
  const not = (t, rule, lang = "en") => expect(`${rule} passes: ${JSON.stringify(t).slice(0, 70)}`, !rules(t, lang).includes(rule));

  // banned
  expect("banned: delving", findBanned("We are delving into the rules.").some((b) => b.phrase === "delve"));
  expect("banned: Delves", findBanned("This post delves deep.").length === 1);
  expect("banned: It’s important to note (curly)", findBanned("It’s important to note that…").length === 1);
  expect("banned: meticulously", findBanned("Inspect meticulously.").length === 1);
  expect("banned: comprehensive guides", findBanned("Our comprehensive guides").length === 1);
  expect("banned: no false hit on 'delivery'", findBanned("Delivery of the forklift.").length === 0);
  expect("banned: no hit on 'furthermost'", findBanned("the furthermost point").length === 0);

  // bold-label
  has("- **Inspect daily:** Inspect the truck daily before use.", "bold-label");
  has("- **Wear a hard hat:** Workers must wear a hard hat in the zone.", "bold-label");
  has("1. **Lock out the energy source.** Lock out each energy source before servicing.", "bold-label");
  not("- **Forks:** No cracks or bends.", "bold-label");
  not("- **Fit testing.** Anyone using a tight-fitting facepiece must be fit tested before first use.", "bold-label");
  not("- **Daily:** Check tyre pressure and horn before the first shift.", "bold-label");
  not("- **Class E:** Tested to 20,000 volts.", "bold-label");
  has("- **Vérifiez les fourches :** Vérifiez les fourches avant chaque poste.", "bold-label", "fr");
  has("- **Prüfen Sie die Gabeln:** Prüfen Sie die Gabeln vor jeder Schicht.", "bold-label", "de");
  not("- **Accessory safety devices:** have safety features that are external to the device.", "bold-label");
  not("- **Contrôle quotidien :** Le contrôle quotidien du chariot porte sur les fourches.", "bold-label", "fr");

  // ing-tail
  has("Employers must train operators every three years, highlighting the importance of safety.", "ing-tail");
  has("The standard was updated in 2019, underscoring OSHA's commitment to workers.", "ing-tail");
  has("Hard hats are rated by class, ensuring the safety of every worker.", "ing-tail");
  has("Training is required, making it an essential part of any programme.", "ing-tail");
  not("Inspect the truck before each shift, including forks and chains.", "ing-tail");
  not("Test the atmosphere first, using a calibrated meter.", "ing-tail");
  not("Secure the load, ensuring that the forks are fully inserted.", "ing-tail");
  not("Highlighting hazards with tape is allowed.", "ing-tail");
  not("Les chariots sont vérifiés, reflétant la norme.", "ing-tail", "fr");

  // fragment
  has("Some text here.\n\nSimple as that.\n\nMore text follows here.", "fragment");
  has("The forklift has a capacity plate.\n\nSafety first.\n", "fragment");
  has("The forklift has a capacity plate.\n\nThe bottom line?\n", "fragment");
  has("The forklift has a capacity plate.\n\nNo shortcuts, no excuses.\n", "fragment");
  has("The forklift has a capacity plate.\n\nNo shortcuts, no excuses.\n\n## Next question?\n", "fragment");
  not("The forklift has a capacity plate.\n\nVertical mast type.\n\nThis forklift is built for outdoor use.\n", "fragment");
  not("Some text here.\n\n**Likelihood** – the chance of something happening.\n", "fragment");
  has("Texte.\n\nTout simplement.\n", "fragment", "fr");
  has("Text.\n\nSicherheit geht vor.\n", "fragment", "de");
  not("The forklift has a capacity plate.\n\nInspect it daily.\n", "fragment");
  not("The forklift has a capacity plate.\n\nThe forks were cracked.\n", "fragment");
  not("## Forklift checks\n\nThe forklift has a capacity plate.", "fragment");
  not("The forklift has a capacity plate.\n\n**Daily checks**\n", "fragment");
  not("The forklift has a capacity plate.\n\nNote: see 1910.178.\n", "fragment");
  not("The forklift has a capacity plate.\n\n29 CFR 1910.1030(b).\n", "fragment");
  not("The forklift has a capacity plate.\n\n(Figure 7) Sliding shield.\n", "fragment");
  not("Texte.\n\nUn contrôle quotidien.\n", "fragment", "fr");

  // leftover
  has("I hope this helps you stay safe.", "leftover");
  has("Signed, [Your Name]", "leftover");
  has("Contact {{company}} today.", "leftover");
  has("Certainly! Here is the answer.", "leftover");
  has("N'hésitez pas à nous contacter.", "leftover", "fr");
  has("Ich hoffe, das hilft.", "leftover", "de");
  has("TODO: add the table", "leftover");
  not("See [OSHA's guidance](https://www.osha.gov/x) for details.", "leftover");
  not("Make sure the brakes hold.", "leftover");

  // self-answer (judgment rule, but the heuristic still runs)
  has("Most injuries happen at the dock. The result? Fewer forklifts tip over when chocks are used.", "self-answer");
  not("Has the atmosphere been tested by a competent person today? Then entry can start.", "self-answer");

  // repetition
  const rep = repeatedPhrases("The truck must be inspected. The truck must be inspected daily. Then the truck must be inspected again.\n\n- the truck must be inspected\n\n| the truck must be inspected |");
  expect("repeatedPhrases counts prose only", rep.length >= 1 && rep[0].phrase === "the truck must be" && rep[0].count === 3);
  expect("repeatedPhrases ignores clause refs", repeatedPhrases("See 1910.178(l)(4) for training. See 1910.178(l)(4) for training. See 1910.178(l)(4) for training.").length === 0);
  expect("repeatedPhrases ignores regulators", repeatedPhrases("Under OSHA rules here. Under OSHA rules here. Under OSHA rules here.").length === 0);
  expect("repeatedPhrases skips quotations", repeatedPhrases('It must "properly fit each affected employee" here. Again "properly fit each affected employee" now. Once more "properly fit each affected employee" today.').length === 0);
  expect("repeatedPhrases skips dated French regulation names", repeatedPhrases("Selon l'arrêté du 4 novembre 1993, oui. L'arrêté du 4 novembre 1993 dit cela. Voir l'arrêté du 4 novembre 1993.").length === 0);
  expect("repeatedPhrases honours exempt", repeatedPhrases("Data as of May 2026 here. Data as of May 2026 here. Data as of May 2026 here.", { exempt: ["Data as of May 2026"] }).length === 0);
  expect("repeatedPhrases works in German", repeatedPhrases("Der Stapler muss täglich geprüft werden. Der Stapler muss täglich geprüft werden. Der Stapler muss täglich geprüft werden.").length > 0);
  expect("repeatedPhrases skips stopword-only grams", !repeatedPhrases("it is in the box. it is in the box. it is in the box.").some((r) => r.phrase === "it is in the"));

  // similarity / FAQ
  expect("similarity identical = 1", similarity("Hard hats must be replaced after an impact.", "Hard hats must be replaced after an impact.") === 1);
  expect("similarity unrelated ≈ 0", similarity("Hard hats must be replaced after an impact.", "Forklift operators need training every three years.") === 0);
  const body = "Intro paragraph about forklifts and their many uses on site.\n\nOperators must be evaluated at least once every three years. Refresher training is also needed after an accident or near miss.\n\nAnother paragraph.";
  expect("faqRepeatsBody flags a copied answer", faqRepeatsBody([{ q: "How often?", a: "Operators must be evaluated at least once every three years." }], body).length === 1);
  expect("faqRepeatsBody passes a new answer", faqRepeatsBody([{ q: "Who trains?", a: "A person with the knowledge, training and experience to train others." }], body).length === 0);

  // sections / answer-first
  const md = "Intro.\n\n## What is LOTO?\n\nLockout/tagout is the procedure that isolates energy before servicing.\n\n## Why?\n\nIn this section we look at why.\n\n## Who?\n\nBut who does it?\n\n## Table\n\n| a | b |\n";
  const secs = sectionsOf(md);
  expect("sectionsOf splits headings", secs.length === 5 && secs[1].heading === "What is LOTO?" && secs[1].level === 2);
  expect("opensWithAnswer ok", opensWithAnswer(secs[1].text).ok);
  expect("opensWithAnswer rejects signpost", !opensWithAnswer(secs[2].text).ok);
  expect("opensWithAnswer rejects conjunction/question", !opensWithAnswer(secs[3].text).ok);
  expect("opensWithAnswer rejects table opener", !opensWithAnswer(secs[4].text).ok);
  expect("opensWithAnswer handles e.g.", opensWithAnswer("Energy sources, e.g. hydraulic lines, must be isolated first. Then test.").firstSentence === "Energy sources, e.g. hydraulic lines, must be isolated first.");
  expect("rule lists are disjoint", !JUDGMENT_RULES.some((j) => SCRIPTED_RULES.includes(j.id)));

  console.log(fail ? `\n${fail} failure(s)` : "\nall passed");
  return fail;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) process.exit(selftest() ? 1 : 0);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) { console.error("usage: node scripts/style/patterns.mjs --selftest | <file.md> [--lang en|fr|de]"); process.exit(2); }
  const li = args.indexOf("--lang");
  const lang = li >= 0 ? args[li + 1] : /\/(fr|de)\//.exec(file)?.[1] ?? "en";
  const text = readFileSync(file, "utf8");
  const line = (i) => text.slice(0, i).split("\n").length;
  const found = [...findPatterns(text, { lang }), ...findBanned(text).map((b) => ({ rule: "banned", match: b.match, index: b.index }))];
  for (const f of found.sort((a, b) => a.index - b.index)) console.log(`${file}:${line(f.index)} [${f.rule}${SCRIPTED_RULES.includes(f.rule) || f.rule === "banned" ? "" : ", judgment"}] ${f.match}`);
  for (const r of repeatedPhrases(text)) console.log(`${file} [repeated ×${r.count}] ${r.phrase}`);
  process.exit(found.some((f) => f.rule === "banned" || SCRIPTED_RULES.includes(f.rule)) ? 1 : 0);
}
