// OSHA regulation text from the eCFR public API (no key). Downloads the full
// XML of each Title 29 part once per eCFR date, parses sections, subparts and
// paragraph designators, and writes a compact index used to (1) feed exact
// standard text to the writer and (2) check every clause reference
// ("1910.147(c)(4)(i)") a written page contains.
//
//   node scripts/data/ecfr.mjs           fetch (cached) + write the index
//   node scripts/data/ecfr.mjs --force   re-download the XML
//   node scripts/data/ecfr.mjs --test    self-tests against the index
//
// Raw XML: data/raw/us/ecfr/{date}/part-{part}.xml (git-ignored).
// Index:   data/pages/us/ecfr-index.json (committed).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW_DIR = join(ROOT, "data/raw/us/ecfr");
const INDEX_PATH = join(ROOT, "data/pages/us/ecfr-index.json");
const UA = "SafetyIndexBot/1.0 (+https://safetyindex.blog/about)";
const API = "https://www.ecfr.gov/api/versioner/v1";
export const DEFAULT_PARTS = ["1904", "1910", "1915", "1917", "1918", "1926", "1928"];

// ---------------------------------------------------------------- fetching

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { tries = 5 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      // Node's fetch sends Accept-Encoding: gzip/br and decompresses; eCFR
      // refuses uncompressed requests for the full-text endpoint.
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/xml, application/json;q=0.9, */*;q=0.1" } });
      if (res.ok) return await res.text();
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
      if (res.status < 500 && res.status !== 429) throw lastErr;
      const retryAfter = Number(res.headers.get("retry-after"));
      if (retryAfter > 0) await sleep(Math.min(retryAfter, 120) * 1000);
    } catch (err) {
      lastErr = err;
      if (/HTTP 4(?!29)\d\d/.test(err.message)) throw err;
    }
    if (attempt < tries) await sleep(2000 * 2 ** (attempt - 1));
  }
  throw lastErr;
}

async function latestDate() {
  const json = JSON.parse(await fetchText(`${API}/titles.json`));
  const t = json.titles?.find((x) => Number(x.number) === 29);
  const date = t?.up_to_date_as_of || t?.latest_issue_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("eCFR: no date for title 29");
  return date;
}

const rawPath = (date, part) => join(RAW_DIR, date, `part-${part}.xml`);

async function getPartXml(date, part, force) {
  const file = rawPath(date, part);
  if (!force && existsSync(file)) return readFileSync(file, "utf8");
  const xml = await fetchText(`${API}/full/${date}/title-29.xml?part=${part}`);
  if (!xml.includes("<DIV5")) throw new Error(`eCFR: unexpected response for part ${part}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, xml);
  await sleep(1000); // polite gap between parts
  return xml;
}

// ---------------------------------------------------------------- XML helpers

const decode = (s) =>
  s
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/** Inline markup → plain text (superscripts as ^n). */
const plain = (raw) =>
  decode(raw.replace(/<br\s*\/?>/gi, " ").replace(/<SU>([\s\S]*?)<\/SU>/g, "^$1").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

const BLOCKS = new Set(["P", "FP", "FP1", "FP2", "FP-1", "FP-2", "HD1", "HD2", "HD3", "HD4", "HED", "HEAD", "TR", "CAPTION", "TCAP", "PSPACE", "CITA", "FL", "EXAMPLE-P"]);
const CONTAINERS = new Set(["NOTE", "NOTES", "EXTRACT", "FTNT", "TABLE", "GPOTABLE", "EXAMPLE", "AUTH", "SOURCE", "EDNOTE", "APPRO", "SECAUTH", "MATH"]);

/**
 * Flattens one DIV8 into block items: { tag, raw, ctx } where ctx is the list
 * of open containers (NOTE, EXTRACT, TABLE...). Tolerates unclosed <P>.
 */
function blocks(xml) {
  const items = [];
  const stack = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.raw.trim()) items.push(cur);
    cur = null;
  };
  const re = /<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[^>]*?)?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, close, tag, attrs, selfClose, text] = m;
    if (text !== undefined) {
      if (cur) cur.raw += text;
      else if (text.trim()) items.push({ tag: "TEXT", raw: text, ctx: [...stack] });
      continue;
    }
    if (CONTAINERS.has(tag)) {
      flush();
      if (selfClose) continue;
      if (close) {
        const i = stack.lastIndexOf(tag);
        if (i >= 0) stack.length = i;
      } else stack.push(tag);
      continue;
    }
    if (BLOCKS.has(tag)) {
      if (close) {
        if (cur && cur.tag === tag) flush();
        continue;
      }
      flush();
      cur = { tag, raw: "", ctx: [...stack] };
      if (selfClose) flush();
      continue;
    }
    if (tag === "TD" || tag === "TH" || tag === "ENT") {
      if (cur && !close) cur.raw += " | ";
      continue;
    }
    if (/^DIV\d$/.test(tag)) {
      flush();
      continue;
    }
    if (cur) cur.raw += m[0]; // inline markup (I, E, SU, ...)
  }
  flush();
  return items;
}

// ---------------------------------------------------------------- markers

const ROMAN_RE = /^(x{0,3})(ix|iv|v?i{0,3})$|^xl(ix|iv|v?i{0,3})$/;
const isRoman = (s) => s !== "" && ROMAN_RE.test(s);
function romanVal(s) {
  const v = { i: 1, v: 5, x: 10, l: 50 };
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const a = v[s[i]], b = v[s[i + 1]] ?? 0;
    n += a < b ? -a : a;
  }
  return n;
}
function toRoman(n) {
  const t = [[40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let s = "";
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return s;
}
const isLetterSeq = (s) => /^([a-z])\1*$/.test(s);
/** a → b, z → aa, aa → bb */
function nextLetter(s) {
  if (!s) return "a";
  const c = s[0];
  return c === "z" ? "a".repeat(s.length + 1) : String.fromCharCode(c.charCodeAt(0) + 1).repeat(s.length);
}

// One marker: (a) (1) (iv) (A) (<I>1</I>) (<E T="03">i</E>) — lowercase
// multi-letter only when roman or doubled (aa), so "(or)" is never a marker.
const MARKER_RE = /^\(\s*(?:<(?:I|E T="0[34]")>\s*([0-9]{1,3}|[a-z]{1,6}|[A-Z]{1,2})\s*<\/(?:I|E)>|([0-9]{1,3}|[a-z]{1,6}|[A-Z]{1,2}))\s*\)/;
// Italic heading (+ optional em dash) that can sit between chained markers.
const HEAD_RE = /^\s*(?:<(?:I|E T="0[34]")>(?:(?!<\/?(?:I|E)\b)[\s\S]){1,200}<\/(?:I|E)>[\s.:;,?]*(?:&#x2014;|—|--)?\s*){0,3}(?:&#x2014;|—|--)?\s*/;

const PLAIN_HEAD_RE = /^\s*[A-Z][^()<>:;]{0,100}?[.?](?:&#x2014;|—)?\s+(?=\()/;

/** Leading paragraph markers of one <P>: [{ v, italic }]. */
function leadingMarkers(raw) {
  const out = [];
  let s = raw.replace(/^\s+/, "");
  for (let guard = 0; guard < 8; guard++) {
    const m = s.match(MARKER_RE);
    if (!m) break;
    const italic = m[1] !== undefined;
    const v = italic ? m[1] : m[2];
    if (/^[a-z]+$/.test(v) && v.length > 1 && !isRoman(v) && !isLetterSeq(v)) break;
    out.push({ v, italic });
    out.rest = s.slice(m[0].length);
    s = s.slice(m[0].length);
    const h = s.match(HEAD_RE);
    if (h) s = s.slice(h[0].length);
    out.rest = s;
    if (!MARKER_RE.test(s)) {
      // Plain (non-italic) heading, e.g. "(l) Operator training. (1) ...":
      // accepted only when a first child marker follows.
      const ph = s.match(PLAIN_HEAD_RE);
      if (ph) {
        const nx = s.slice(ph[0].length).match(MARKER_RE);
        if (nx && ["1", "i", "A"].includes(nx[1] ?? nx[2])) s = s.slice(ph[0].length);
      }
    }
  }
  return out;
}

/** k-th (0-based) marker value at a level, as written in the XML text. */
function nthMarker(level, k) {
  if (level === 1 || level === 4) return String(k + 1);
  if (level === 2 || level === 5) return toRoman(k + 1);
  if (level === 3) return String.fromCharCode(65 + k);
  return nextLetter(k ? String.fromCharCode(96 + k) : "");
}

/**
 * Inline run-in lists inside one paragraph, e.g. "provided that (<I>1</I>) ...;
 * (<I>2</I>) ...; and (<I>3</I>) ..." or "The employer shall: (i) ...; (ii) ...".
 * Only a run of at least two markers in sequence, each after ":", ";", "—" or
 * "that", counts. Returns the marker values.
 */
function inlineList(rest, level) {
  if (!rest) return [];
  const italic = level >= 4;
  const re = italic ? /\(<(?:I|E T="0[34]")>([0-9]{1,2}|[a-z]{1,4})<\/(?:I|E)>\)/g : /\(([0-9]{1,2}|[ivx]{1,5}|[A-Z])\)/g;
  const lead = /(?:[:;,]|&#x2014;|—|\bthat|\bshall|\bare|\bis)\s*(?:and\s+|or\s+)?$/;
  const next = /(?:[:;,]|&#x2014;|—)\s*(?:and\s+|or\s+)?$/;
  const found = [];
  for (const m of rest.matchAll(re)) {
    const want = nthMarker(level, found.length);
    if (m[1] !== want) continue;
    if (!(found.length ? next : lead).test(rest.slice(Math.max(0, m.index - 30), m.index))) continue;
    found.push(m[1]);
  }
  return found.length >= 2 ? found : [];
}

/** Candidate CFR levels: 0 (a) · 1 (1) · 2 (i) · 3 (A) · 4 (<I>1</I>) · 5 (<I>i</I>) · 6 (<I>A</I>) */
function candidates({ v, italic }) {
  if (italic) return /^\d/.test(v) ? [4] : /^[A-Z]/.test(v) ? [6] : [5];
  if (/^\d/.test(v)) return [1];
  if (/^[A-Z]/.test(v)) return [3];
  const r = isRoman(v), l = isLetterSeq(v);
  if (r && l) return [0, 2];
  return r ? [2] : [0];
}

/**
 * Resolves the level of an ambiguous lowercase marker ((i), (v), (x), (ii)...)
 * that opens a paragraph: roman if it continues/starts a roman run under the
 * current arabic paragraph, letter if it is the next letter; when both fit,
 * look at the following paragraphs ((ii) or (A) → roman; (j) or (1) → letter).
 */
function resolveAmbiguous(mk, cur, following) {
  const v = mk.v;
  const romanOK = cur[1] != null && (cur[2] == null ? v === "i" : romanVal(v) === romanVal(cur[2]) + 1);
  const letterOK = cur[0] != null && v === nextLetter(cur[0]);
  if (romanOK && !letterOK) return 2;
  if (letterOK && !romanOK) return 0;
  if (romanOK && letterOK) {
    const rNext = toRoman(romanVal(v) + 1), lNext = nextLetter(v);
    for (const k of following) {
      if (!k || k.italic) continue;
      if (/^\d/.test(k.v)) return k.v === "1" ? 0 : 2;
      if (/^[A-Z]/.test(k.v)) return 2;
      if (k.v === rNext) return 2;
      if (k.v === lNext) return 0;
    }
    return 2;
  }
  return 2; // neither fits (e.g. a list under a definition): roman
}

/**
 * Italic lowercase markers: older sections (1910.106, .109, .179) use italic
 * letters (<I>a</I>) in place of (A) under a roman paragraph, with plain or
 * italic numbers beneath; newer ones use italic roman (<I>i</I>) under an
 * italic number. Letter → level 3, roman → level 5.
 */
function resolveItalicLower({ v }, cur, prevLevel) {
  const roman = isRoman(v), letter = isLetterSeq(v);
  if (prevLevel != null) return prevLevel === 4 && roman ? 5 : letter ? 3 : 5;
  if (!roman) return 3;
  if (!letter) return 5;
  const romanOK = cur[4] != null && (cur[5] == null ? v === "i" : romanVal(v) === romanVal(cur[5]) + 1);
  const letterOK = cur[2] != null && (cur[3] == null ? v === "a" : v === nextLetter(cur[3]));
  if (romanOK && !letterOK) return 5;
  if (letterOK && !romanOK) return 3;
  return cur[4] != null ? 5 : 3;
}

/**
 * Some older paragraphs print the fifth level as plain "(1)" instead of
 * italic. Under an uppercase paragraph, "(1)" (or the next number in that run)
 * is level 5 unless it continues the arabic level and the next marker says so.
 */
function resolvePlainDigit(mk, cur, following) {
  const n = Number(mk.v);
  const deepOK = cur[4] == null ? n === 1 : n === Number(cur[4]) + 1;
  const topOK = cur[1] == null ? n === 1 : n === Number(cur[1]) + 1;
  if (deepOK && !topOK) return 4;
  if (!deepOK) return 1;
  for (const k of following) {
    if (!k) continue;
    if (k.italic) return 1;
    if (/^[A-Z]/.test(k.v)) return 4;
    if (/^[a-z]/.test(k.v)) return k.v === "i" ? 1 : 4;
    if (Number(k.v) !== n + 1) return 1;
  }
  return 1;
}

/** Whether v is the next marker at a level given the current path. */
function isNextAt(level, v, cur) {
  const c = cur[level];
  if (level === 0) return v === nextLetter(c);
  if (level === 1 || level === 4) return Number(v) === (c == null ? 1 : Number(c) + 1);
  if (level === 2 || level === 5) return romanVal(v) === (c == null ? 1 : romanVal(c) + 1);
  return v === (c == null ? "A" : String.fromCharCode(c.charCodeAt(0) + 1));
}

const APPENDIX_HEAD = /^Appendi(x|ces|xes)\b/i;
const APPENDIX_P = /^Appendix\s+[A-Z0-9-]+\s+(to|of)\s+(§|Part|Subpart)/;
const SKIP_CTX = new Set(["NOTE", "NOTES", "EXTRACT", "FTNT", "TABLE", "GPOTABLE", "EXAMPLE", "AUTH", "SOURCE", "EDNOTE", "APPRO", "SECAUTH", "MATH"]);

/**
 * Walks a section's blocks, giving every regulatory <P> its full designator.
 * Returns items with { designator, appendix, text } plus whether an appendix
 * was found.
 */
function analyseSection(div8) {
  const items = blocks(div8);
  let appendix = null;
  let hasAppendix = false;
  const body = [];
  for (const it of items) {
    it.text = plain(it.raw);
    if (it.tag === "HEAD") continue;
    if (/^HD\d$/.test(it.tag) && APPENDIX_HEAD.test(it.text)) {
      appendix = it.text.match(/^Appendi\w+\s+([A-Z0-9-]+)\b/)?.[1] ?? "";
      hasAppendix = true;
    } else if ((it.tag === "P" || it.tag.startsWith("FP")) && APPENDIX_P.test(it.text)) {
      appendix = it.text.match(/^Appendix\s+([A-Z0-9-]+)/)[1];
      hasAppendix = true;
    }
    it.appendix = appendix;
    it.regulatory = appendix == null && it.tag === "P" && !it.ctx.some((c) => SKIP_CTX.has(c));
    it.markers = it.regulatory ? leadingMarkers(it.raw) : [];
    it.rest = it.markers.rest ?? "";
    body.push(it);
  }

  const cur = [null, null, null, null, null, null, null];
  let designator = "";
  const regIdx = body.filter((it) => it.markers.length).map((it) => body.indexOf(it));
  // Lists inside definitions ("Article means ...: (i) ...") are not paragraphs
  // of the section (eCFR anchors them under the term), so while inside a
  // definitions paragraph only the next structural sibling ends the run.
  let defLevel = null;
  let prevText = "", prevDeepest = -1;
  for (let n = 0; n < regIdx.length; n++) {
    const it = body[regIdx[n]];
    if (defLevel == null && n > 0 && /defin|\bmean/i.test(prevText)) {
      const between = body.slice(regIdx[n - 1] + 1, regIdx[n]);
      if (between.some((b) => b.regulatory && /^\s*<(?:I|E T="0[34]")>/.test(b.raw))) defLevel = prevDeepest;
    }
    let prevLevel = -1;
    const resolved = [];
    for (let j = 0; j < it.markers.length; j++) {
      const mk = it.markers[j];
      const cands = candidates(mk);
      let level;
      if (mk.italic && /^[a-z]/.test(mk.v)) level = resolveItalicLower(mk, cur, j > 0 ? prevLevel : null);
      else if (j === 0 && !mk.italic && /^\d/.test(mk.v) && cur[3] != null) level = resolvePlainDigit(mk, cur, regIdx.slice(n + 1, n + 9).map((k) => body[k].markers[0]));
      else if (cands.length === 1) level = cands[0];
      else if (j > 0) level = cands.includes(prevLevel + 1) ? prevLevel + 1 : cands[0];
      else {
        // A chained child in the same paragraph decides: "(i) Heading—(1)" is a letter.
        const next = it.markers[1];
        const following = [...(next ? [next] : []), ...regIdx.slice(n + 1, n + 9).map((k) => body[k].markers[0])];
        level = resolveAmbiguous(mk, cur, following);
      }
      if (j > 0 && level <= prevLevel) break; // chained markers must go deeper
      resolved.push([level, mk.v]);
      prevLevel = level;
    }
    if (defLevel != null) {
      const [l0, v0] = resolved[0] ?? [];
      if (l0 == null || l0 > defLevel || !isNextAt(l0, v0, cur)) {
        it.designators = [];
        it.designator = designator;
        continue;
      }
      defLevel = null;
    }
    prevText = it.text;
    prevDeepest = resolved.length ? resolved[resolved.length - 1][0] : -1;
    it.designators = [];
    for (const [level, v] of resolved) {
      cur[level] = v;
      for (let k = level + 1; k < cur.length; k++) cur[k] = null;
      designator = cur.filter((x) => x != null).map((x) => `(${x})`).join("");
      it.designators.push(designator);
    }
    it.designator = designator;
    const deepest = resolved.length ? resolved[resolved.length - 1][0] : -1;
    if (deepest >= 0 && deepest < 5) for (const v of inlineList(it.rest, deepest + 1)) it.designators.push(`${designator}(${v})`);
  }
  // "does not apply to: (i) ...;" then "(ii) ..." as its own paragraph: the
  // run-in (i) has no <P> of its own, so add it when its parent carries it.
  const all = new Set(body.flatMap((it) => it.designators ?? []));
  for (const it of body) {
    for (const d of it.designators ?? []) {
      const m = d.match(/^(.*)\((ii|2|B)\)$/);
      if (!m || !m[1]) continue;
      const first = { ii: "i", 2: "1", B: "A" }[m[2]];
      if (all.has(`${m[1]}(${first})`)) continue;
      const parent = body.find((p) => p.designators?.at(-1) === m[1]);
      if (parent && new RegExp(`[:;—]\\s*\\(${first}\\)\\s`).test(parent.text)) {
        parent.designators.push(`${m[1]}(${first})`);
        all.add(`${m[1]}(${first})`);
      }
    }
  }
  return { items: body, hasAppendix };
}

// ---------------------------------------------------------------- parsing parts

function parsePart(xml, part) {
  const sections = {};
  const tagRe = /<DIV([689]) N="([^"]*)" TYPE="([A-Z]+)"[^>]*>/g;
  let subpart = null, subpartTitle = null;
  let m;
  while ((m = tagRe.exec(xml))) {
    const [, level, n, type] = m;
    if (level === "6" && type === "SUBPART") {
      subpart = decode(n);
      const head = xml.slice(m.index, m.index + 2000).match(/<HEAD>([\s\S]*?)<\/HEAD>/)?.[1] ?? "";
      subpartTitle = plain(head).replace(/^Subpart\s+[A-Z0-9-]+\s*[—–-]\s*/, "").trim() || null;
      continue;
    }
    if (level === "9") {
      const sec = decode(n).match(/to\s+§+\s*(19\d\d\.\d+)/)?.[1];
      if (sec && sections[sec]) sections[sec].hasAppendix = true;
      continue;
    }
    if (level !== "8" || type !== "SECTION") continue;
    const end = xml.indexOf("</DIV8>", m.index);
    const div8 = xml.slice(m.index, end < 0 ? undefined : end);
    const headRaw = div8.match(/<HEAD>([\s\S]*?)<\/HEAD>/)?.[1] ?? "";
    const headText = plain(headRaw);
    const heading = headText.replace(/^§+\s*[\d.]+(?:\s*[-–]\s*[\d.]+)?\s*/, "").trim();
    const reserved = /\[Reserved\]\s*$/i.test(heading);
    const base = { part, subpart, subpartTitle };

    const range = n.match(/^(\d+)\.(\d+)-\1\.(\d+)$/);
    if (range) {
      const [, p, a, b] = range;
      for (let s = Number(a); s <= Number(b) && Number(b) - Number(a) < 500; s++) {
        const id = `${p}.${s}`;
        sections[id] = { ...base, section: id, heading, url: ecfrUrl(id), paragraphs: [], words: 0, reserved: true, hasAppendix: false };
      }
      continue;
    }
    const { items, hasAppendix } = analyseSection(div8);
    const paragraphs = [...new Set(items.flatMap((it) => it.designators ?? []))];
    const words = items.reduce((sum, it) => sum + (it.text ? it.text.split(" ").length : 0), 0);
    sections[n] = { ...base, section: n, heading, url: ecfrUrl(n), paragraphs, words, reserved, hasAppendix };
  }
  return sections;
}

// ---------------------------------------------------------------- index

function writeIndex(index) {
  // One section per line: diffable and compact.
  const lines = Object.entries(index.sections).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  const json = `{"ecfrDate":${JSON.stringify(index.ecfrDate)},"fetchedOn":${JSON.stringify(index.fetchedOn)},"parts":${JSON.stringify(index.parts)},"sections":{\n${lines.join(",\n")}\n}}\n`;
  mkdirSync(dirname(INDEX_PATH), { recursive: true });
  writeFileSync(INDEX_PATH, json);
}

/** Downloads (or reuses cached) XML for the parts and writes the index. */
export async function updateEcfr({ parts = DEFAULT_PARTS, force = false } = {}) {
  const ecfrDate = await latestDate();
  const sections = {};
  for (const part of parts) {
    const xml = await getPartXml(ecfrDate, String(part), force);
    partCache.set(`${ecfrDate}/${part}`, xml);
    Object.assign(sections, parsePart(xml, String(part)));
  }
  const index = { ecfrDate, fetchedOn: new Date().toISOString().slice(0, 10), parts: parts.map(String), sections };
  writeIndex(index);
  indexCache = index;
  return index;
}

let indexCache = null;
const partCache = new Map();

/** The processed index (data/pages/us/ecfr-index.json), cached in memory. */
export function loadIndex() {
  if (!indexCache) {
    if (!existsSync(INDEX_PATH)) throw new Error(`eCFR index missing: run node scripts/data/ecfr.mjs`);
    indexCache = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
  }
  return indexCache;
}

const normSection = (s) => String(s).trim().replace(/^(?:29\s*CFR\s*)?§*\s*/i, "");

/**
 * Plain text of a section from the cached raw XML, one paragraph per line,
 * each prefixed with its full citation ("1910.147(c)(4)(i) ..."). Cut at a
 * paragraph boundary at maxChars.
 */
export function sectionText(section, { maxChars = 60000 } = {}) {
  const id = normSection(section);
  const index = loadIndex();
  const meta = index.sections[id];
  if (!meta) return null;
  const head = `29 CFR ${id} ${meta.heading}${meta.subpart ? ` (Part ${meta.part} Subpart ${meta.subpart}${meta.subpartTitle ? `: ${meta.subpartTitle}` : ""})` : ""} [eCFR ${index.ecfrDate}, ${meta.url}]`;
  if (meta.reserved && !meta.paragraphs.length) return head;
  const key = `${index.ecfrDate}/${meta.part}`;
  if (!partCache.has(key)) {
    const file = rawPath(index.ecfrDate, meta.part);
    if (!existsSync(file)) throw new Error(`eCFR XML missing for part ${meta.part} (${index.ecfrDate}): run node scripts/data/ecfr.mjs`);
    partCache.set(key, readFileSync(file, "utf8"));
  }
  const xml = partCache.get(key);
  const start = xml.indexOf(`<DIV8 N="${id}" `);
  if (start < 0) return head;
  const end = xml.indexOf("</DIV8>", start);
  const { items } = analyseSection(xml.slice(start, end < 0 ? undefined : end));

  const lines = [head];
  let designator = "";
  for (const it of items) {
    if (!it.text || it.tag === "CITA") continue;
    if (it.ctx.some((c) => c === "AUTH" || c === "SOURCE" || c === "EDNOTE")) continue;
    if (it.designator !== undefined) designator = it.designator;
    const where = it.appendix != null ? `${id} Appendix ${it.appendix}`.trim() : `${id}${designator}`;
    if (/^HD\d$/.test(it.tag)) lines.push(`## ${it.text}`);
    else if (it.tag === "HED") continue; // "Note:" label; the note text follows
    else if (it.ctx.includes("NOTE") || it.ctx.includes("NOTES")) lines.push(`${where} [note] ${it.text}`);
    else if (it.ctx.includes("FTNT")) lines.push(`${where} [footnote] ${it.text}`);
    else if (it.tag === "TR") lines.push(`${it.appendix != null ? where : id} [table] ${it.text.replace(/^\|\s*/, "")}`);
    else lines.push(`${where} ${it.text}`);
  }
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    if (out.length + lines[i].length + 1 > maxChars) {
      out += `[truncated: ${lines.length - i} more lines; full text at ${meta.url}]`;
      return out;
    }
    out += lines[i] + "\n";
  }
  return out.trimEnd();
}

// ---------------------------------------------------------------- clause refs

/**
 * DOL/OSHA standard code → clause. "19100147 C04 I" → { section: "1910.147",
 * paragraph: "(c)(4)(i)" }. Null for state-plan, general-duty and non-19xx codes.
 */
export function cfrCodeToClause(code) {
  const m = String(code ?? "").trim().toUpperCase().match(/^(19\d\d)(\d{4})((?:\s+[A-Z0-9]+)*)\s*$/);
  if (!m) return null;
  const section = `${m[1]}.${Number(m[2])}`;
  const segs = m[3].trim() ? m[3].trim().split(/\s+/) : [];
  let paragraph = "";
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (i === 0) {
      const f = s.match(/^([A-Z]{1,2})(\d{1,3})?$/);
      if (!f) return null;
      paragraph += `(${f[1].toLowerCase()})`;
      if (f[2]) paragraph += `(${Number(f[2])})`;
    } else if (/^\d{1,3}$/.test(s)) paragraph += `(${Number(s)})`;
    else if (i === 1 && /^[IVXL]+$/.test(s)) paragraph += `(${s.toLowerCase()})`;
    else if (i === 2 && /^[A-Z]{1,2}$/.test(s)) paragraph += `(${s})`;
    else if (i > 2 && /^[IVX]+$/.test(s)) paragraph += `(${s.toLowerCase()})`; // italic roman
    else if (i > 2 && /^[A-Z]$/.test(s)) paragraph += `(${s})`;
    else return null;
  }
  return { section, paragraph: paragraph || null };
}

const PARA = String.raw`\((?:[a-z]{1,2}|[ivxl]{1,6}|\d{1,3}|[A-Z]{1,2})\)`;
const FULL_REF = new RegExp(String.raw`(?:\b29\s*C\.?F\.?R\.?\s*(?:(?:§|&sect;)+\s*|(?:Part\s+)?)|(?:§|&sect;)+\s*)?(?<![\d.])\b(19\d\d)\.(\d{1,4})(?![\d.]\d)((?:${PARA})*)`, "g");
const BARE_REF = new RegExp(String.raw`(\bparagraphs?\s+)?(?<![\w)\].])(\([a-z]{1,2}\)(?:${PARA})*)`, "g");

/**
 * Clause references in running text: "29 CFR 1910.147(c)(4)(i)", "§ 1910.178(l)",
 * "1910.1200". With defaultSection, also bare "paragraph (b)(13)" and chains
 * like "(c)(4)(i)" that start with a letter followed by a number.
 */
export function findClauseRefs(text, { defaultSection } = {}) {
  const refs = [];
  const taken = [];
  for (const m of String(text).matchAll(FULL_REF)) {
    refs.push({ raw: m[0], section: `${m[1]}.${Number(m[2])}`, paragraph: m[3] || null, index: m.index });
    taken.push([m.index, m.index + m[0].length]);
  }
  if (defaultSection) {
    const sec = normSection(defaultSection);
    for (const m of String(text).matchAll(BARE_REF)) {
      const start = m.index, end = m.index + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      const chain = m[2];
      const parts = chain.match(/\([^)]+\)/g);
      const word = Boolean(m[1]);
      if (!word && !(parts.length >= 2 && /^\(\d+\)$/.test(parts[1]))) continue;
      if (!/^\([a-z]{1,2}\)$/.test(parts[0]) || (parts[0].length === 4 && !isLetterSeq(parts[0].slice(1, 3)))) continue;
      refs.push({ raw: m[0], section: sec, paragraph: chain, index: start });
    }
  }
  return refs.sort((a, b) => a.index - b.index);
}

/** Checks a clause against the index: section exists, paragraph exists (or is a parent of one). */
export function checkClause(section, paragraph) {
  const id = normSection(section);
  const meta = loadIndex().sections[id];
  if (!meta) return { ok: false, reason: `29 CFR ${id} not found in eCFR parts ${loadIndex().parts?.join(", ") ?? ""}` };
  if (meta.reserved) return { ok: false, reason: `29 CFR ${id} is [Reserved]` };
  if (!paragraph) return { ok: true, reason: "section exists" };
  const p = String(paragraph).replace(/\s+/g, "");
  if (meta.paragraphs.includes(p)) return { ok: true, reason: "paragraph exists" };
  if (meta.paragraphs.some((x) => x.startsWith(p + "("))) return { ok: true, reason: "parent of existing paragraphs" };
  return { ok: false, reason: `paragraph ${p} not found in 29 CFR ${id}` };
}

/** https://www.ecfr.gov/current/title-29/section-1910.147#p-1910.147(c)(4)(i) */
export function ecfrUrl(section, paragraph) {
  const id = normSection(section);
  const base = `https://www.ecfr.gov/current/title-29/section-${id}`;
  return paragraph ? `${base}#p-${id}${paragraph}` : base;
}

// ---------------------------------------------------------------- CLI

function selfTest() {
  let fail = 0;
  const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fail++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  };
  const clause = (s) => {
    const r = findClauseRefs(s)[0];
    return r ? checkClause(r.section, r.paragraph).ok : null;
  };
  for (const s of ["1910.147(c)(4)(i)", "1926.501(b)(13)", "1910.178(l)(4)(iii)", "1910.1200(h)(1)", "1926.1053(b)(1)", "1910.147(c)(5)(ii)(C)(1)", "1910.147(c)(4)", "1910.147"])
    eq(`valid ${s}`, clause(s), true);
  for (const s of ["1926.501(z)(99)", "1910.9999", "1910.108"]) eq(`invalid ${s}`, clause(s), false);

  eq("code 19100147 C04 I", cfrCodeToClause("19100147 C04 I"), { section: "1910.147", paragraph: "(c)(4)(i)" });
  eq("code 19260501 B13", cfrCodeToClause("19260501 B13"), { section: "1926.501", paragraph: "(b)(13)" });
  eq("code 19100147 F03 II D", cfrCodeToClause("19100147 F03 II D"), { section: "1910.147", paragraph: "(f)(3)(ii)(D)" });
  eq("code 19260752 A", cfrCodeToClause("19260752 A"), { section: "1926.752", paragraph: "(a)" });
  eq("code 19101200 H01", cfrCodeToClause("19101200 H01"), { section: "1910.1200", paragraph: "(h)(1)" });
  eq("code 19100134", cfrCodeToClause("19100134"), { section: "1910.134", paragraph: null });
  eq("code 3276(E)(15)(B)", cfrCodeToClause("3276(E)(15)(B)"), null);
  eq("code 5A0001", cfrCodeToClause("5A0001"), null);
  eq("code 15320001 G01", cfrCodeToClause("15320001 G01"), null);

  const text = "Under 29 CFR 1910.147(c)(4)(i) and § 1910.178(l), see 1910.1200. Subpart P applies; paragraph (b)(13) and (c)(4)(i) but not (1) or (a) alone. Also 29 CFR 1926.501(b)(13).";
  eq(
    "findClauseRefs",
    findClauseRefs(text, { defaultSection: "1926.501" }).map((r) => `${r.section}${r.paragraph ?? ""}`),
    ["1910.147(c)(4)(i)", "1910.178(l)", "1910.1200", "1926.501(b)(13)", "1926.501(c)(4)(i)", "1926.501(b)(13)"],
  );
  eq("findClauseRefs raw", findClauseRefs("per 29 CFR 1910.147(c)(4)(i).")[0].raw, "29 CFR 1910.147(c)(4)(i)");
  eq("no bare refs without defaultSection", findClauseRefs("paragraph (b)(13)").length, 0);
  eq("ecfrUrl", ecfrUrl("1910.147", "(c)(4)(i)"), "https://www.ecfr.gov/current/title-29/section-1910.147#p-1910.147(c)(4)(i)");

  // Roman/letter sanity across the index: no duplicate designators and every
  // child has a parent.
  const idx = loadIndex();
  let orphans = 0;
  for (const s of Object.values(idx.sections)) {
    const set = new Set(s.paragraphs);
    for (const p of s.paragraphs) {
      const parent = p.replace(/\([^)]+\)$/, "");
      if (parent && !set.has(parent)) orphans++;
    }
  }
  console.log(`info designators without a listed parent: ${orphans}`);
  const p147 = idx.sections["1910.147"].paragraphs;
  const sample = [...p147].sort(() => Math.random() - 0.5).slice(0, 20).sort((a, b) => p147.indexOf(a) - p147.indexOf(b));
  console.log(`sample 1910.147: ${sample.join("  ")}`);
  console.log(fail ? `${fail} failed` : "all passed");
  return fail;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes("--test")) process.exit(selfTest() ? 1 : 0);
  const index = await updateEcfr({ force: args.includes("--force") });
  const byPart = {};
  let paras = 0;
  for (const s of Object.values(index.sections)) {
    byPart[s.part] ??= { sections: 0, reserved: 0, paragraphs: 0 };
    byPart[s.part].sections++;
    if (s.reserved) byPart[s.part].reserved++;
    byPart[s.part].paragraphs += s.paragraphs.length;
    paras += s.paragraphs.length;
  }
  console.log(`eCFR ${index.ecfrDate}`);
  for (const [p, c] of Object.entries(byPart)) console.log(`  part ${p}: ${c.sections} sections (${c.reserved} reserved), ${c.paragraphs} paragraphs`);
  console.log(`  total: ${Object.keys(index.sections).length} sections, ${paras} paragraphs → ${INDEX_PATH}`);
}
