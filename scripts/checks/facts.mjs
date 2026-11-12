// Fact checks for written pages (brief section 11, hard rules 2 and 3):
//  - every clause reference is checked against the official source text for that market
//    (US: the eCFR paragraph index; other markets: the downloaded source extracts);
//  - every number in the prose appears in the page's stats JSON or source text.
// Ignored by the number check: list and step numbering, dates, clause references and the
// numbers one to ten written as words (only digits are checked).
import { checkClause, findClauseRefs } from "../data/ecfr.mjs";

const norm = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[  ]/g, " ").replace(/\s+/g, " ");

/** Local (non-US) references worth checking against the source text. */
const LOCAL_REFS = [
  /\b(?:article\s+)?[LRD]\.?\s?\d{3,4}-\d+(?:-\d+)*/gi, // Code du travail: R. 4323-91, L4121-1
  /§\s?\d+[a-z]?(?:\s?Abs\.\s?\d+)?\s+(?:ArbSchG|BetrSichV|ArbStättV|GefStoffV|BaustellV|PSA-BV|LärmVibrationsArbSchV|ArbMedVV|DGUV Vorschrift \d+)/g,
  /\b(?:ASR|TRBS|TRGS|TRLV)\s?[A-Z]?\d+(?:[.,]\d+)*/g,
  /\bDGUV\s(?:Vorschrift|Regel|Information|Grundsatz)\s\d+(?:-\d+)*/g,
  /\bINRS\s?ED\s?\d+/gi,
  /\b(?:regulation|reg\.|section|s\.)\s?\d+[A-Z]?(?:\(\d+\))*(?=\s+of\s+the\s+[A-Z])/g,
];

/**
 * @param {string} text prose to check
 * @param {{ market: string, sourceText?: string, defaultSection?: string }} ctx
 * @returns {string[]} problems
 */
export function checkClauses(text, { market, sourceText = "", defaultSection } = {}) {
  const problems = [];
  if (market === "us" || /\b19(04|10|15|17|18|26|28)\.\d/.test(text)) {
    for (const r of findClauseRefs(text, { defaultSection })) {
      const res = checkClause(r.section, r.paragraph);
      if (!res.ok) problems.push(`clause "${r.raw}" is not in the eCFR text (${res.reason})`);
    }
  }
  if (market !== "us") {
    const src = norm(sourceText).replace(/\s/g, "");
    for (const re of LOCAL_REFS) {
      for (const m of text.matchAll(re)) {
        const ref = norm(m[0]).replace(/^article\s+/, "").replace(/\s/g, "").replace(/\./g, "");
        if (!src.replace(/\./g, "").includes(ref)) problems.push(`reference "${m[0]}" does not appear in the supplied source text`);
      }
    }
  }
  return [...new Set(problems)];
}

/** Every number in a JSON value or text, normalised ("1,234" → "1234", "12.0" → "12"). */
export function numbersIn(value) {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  const out = new Set();
  for (const m of s.matchAll(/\d[\d,   ]*(?:[.,]\d+)?/g)) {
    for (const v of variants(m[0])) out.add(v);
  }
  return out;
}

function variants(raw) {
  const t = raw.trim().replace(/[   ]/g, "");
  const out = new Set();
  // English style: 1,234.5 ; French/German style: 1.234,5 or 1 234,5
  const en = t.replace(/,(?=\d{3}\b)/g, "");
  const de = t.replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  for (const x of [en, de, t.replace(/[,]/g, "")]) {
    const n = Number(x);
    if (Number.isFinite(n)) { out.add(String(n)); out.add(String(Math.round(n))); }
  }
  return out;
}

const STRIP = [
  /\b(?:29\s*CFR\s*)?(?:§\s*)?19(?:04|10|15|17|18|26|28)\.\d+[a-z]?(?:\([A-Za-z0-9]{1,5}\))*/g, // CFR clause refs
  /\(\s?[a-z]{1,4}\s?\)(?:\(\d{1,3}\))*/g, // bare paragraph refs (b)(13)
  /\b\d{1,2}[./]\d{1,2}[./](?:19|20)?\d{2}\b/g, // dd/mm/yyyy, dd.mm.yyyy (before years are stripped)
  /\b\d{1,2}\.\d{1,2}\.(?!\d)/g, // dd.mm. (German)
  /\b\d{1,2}\.?\s+(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b/gi, // 12. November, 12 novembre
  /\b(?:FY\s?)?(?:19|20)\d{2}(?:[–-](?:19|20)?\d{2})?\b/g, // years, fiscal years and year ranges
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|Januar|Februar|März|Juni|Juli|Oktober|Dezember)\b/gi,
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/g,
  /^\s*(?:\d+[.)]|[-*])\s/gm, // list and step numbering
  /\b(?:step|étape|schritt|item|row|section|part|subpart|annex|appendix|annexe|anhang|table|tableau|tabelle|class|classe|klasse|type|typ|category|catégorie|kategorie|level|niveau|stufe|zone|abschnitt|nr\.?|punkt|ziffer|article|paragraphe|alinéa|chapitre|kapitel|teil)\s+[A-Z]?\d+(?:\.\d+)*[a-z]?\b/gi,
  /\b(?:NAICS|SIC)\s+\d{2,6}\b/gi,
  /\b(?:ANSI|ISEA|ASTM|NFPA|ISO|EN|DIN|BS|ASME|CSA|AS\/NZS|AS|NF|UL)\s?(?:EN\s?)?(?:ISO\s?)?[A-Z]?\d[\w.:/-]*/g, // standard numbers (referenced by number only)
  /\b(?:ASR|TRBS|TRGS|DGUV\s(?:Vorschrift|Regel|Information|Grundsatz)|ED|R\.?|L\.?|D\.?)\s?[A-Z]?\d[\d.,-]*/g,
  /§\s?\d+[a-z]?(?:\s?(?:Abs\.|para\.?)\s?\d+)*/g,
  /\b[A-Z]{1,4}-?\d+[A-Z]?\b/g, // codes like N95, P3, Z87, EN166 handled above, Class2
  /\b(?:STD|CPL|CSP|DIR|FAP|ADM|TED|PER|CPL)\s?\d{1,2}-\d{2}-\d{3}[A-Z]?\b/g, // OSHA directive numbers (STD 01-05-019)
  /\b(?:Pub(?:lication)?\.?\s?(?:No\.?)?|DHHS|NIOSH)\s?(?:No\.\s?)?\d{4}-\d{2,3}\b/gi, // publication numbers (NIOSH 2004-101)
  /\b(?:OSHA|INDG|HSG|L|ED)\s?\d{2,5}[A-Z]?\b/g, // document numbers (OSHA 3120, INDG 163, HSG 47, ED 6029)
  /https?:\/\/\S+/g,
];

/**
 * @param {string} text prose (markdown or plain)
 * @param {Set<string>} allowed numbers from numbersIn(stats, sources)
 * @returns {string[]} problems
 */
export function checkNumbers(text, allowed) {
  let t = text.replace(/\]\([^)]*\)/g, "]");
  for (const re of STRIP) t = t.replace(re, " ");
  const problems = new Set();
  for (const m of t.matchAll(/\d[\d,  ]*(?:[.,]\d+)?/g)) {
    const raw = m[0].replace(/[,.  ]+$/, "");
    if (!raw) continue;
    const ok = [...variants(raw)].some((v) => allowed.has(v));
    if (!ok) problems.add(`number "${raw}" is not in this page's data or source text`);
  }
  return [...problems];
}
