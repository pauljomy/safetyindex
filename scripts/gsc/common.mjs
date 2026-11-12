// Shared helpers for the Search Console loop and maintenance scripts (brief section 16):
// dates, CSV, markets by URL path, the content index (every page file with its path) and
// frontmatter/JSON edits that keep the file's formatting.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";

export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
export const readJson = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d);
export const writeJson = (f, data, indent = 1) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, `${JSON.stringify(data, null, indent)}\n`); };
export const appendJsonl = (f, row) => { mkdirSync(dirname(f), { recursive: true }); appendFileSync(f, `${JSON.stringify(row)}\n`); };
export const readJsonl = (f) => (existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : []);

export const SITE = "https://safetyindex.blog";
/** Search Console country codes (ISO 3166-1 alpha-3, lowercase) of each market. */
export const MARKET_COUNTRY = { us: "usa", uk: "gbr", au: "aus", ca: "can", nz: "nzl", fr: "fra", de: "deu" };
export const MARKET_ORDER = ["us", "uk", "au", "ca", "nz", "fr", "de"];

/** "https://safetyindex.blog/fr/blog/x/" → "/fr/blog/x" */
export function toPath(url) {
  try { const p = new URL(url, SITE).pathname.replace(/\/$/, ""); return p || "/"; } catch { return url; }
}
/** Market of a URL path: /uk/…, /au/…, /ca/…, /nz/…, /fr/…, /de/… or the US (everything else). */
export function marketOf(path) {
  const m = path.match(/^\/(uk|au|ca|nz|fr|de)(?:\/|$)/);
  return m ? m[1] : "us";
}

// --- CSV ---------------------------------------------------------------------
const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (header, rows) => `${[header, ...rows].map((r) => r.map(cell).join(",")).join("\n")}\n`;
export function parseCsv(text) {
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ""));
}

// --- Content index -------------------------------------------------------------
const fmBlock = (t) => t.match(/^---\n([\s\S]*?)\n---/);
function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}

/**
 * Every page file: { kind: guide|standard|industry|report|penalties, market, lang, file, path, slug, data, body, text }.
 * `body` is the markdown body (guides) or the page's prose fields (JSON pages); `text` is everything a reader sees.
 */
export function contentIndex() {
  const out = [];
  for (const file of walk("src/content/posts")) {
    if (!file.endsWith(".md")) continue;
    const rel = file.slice("src/content/posts/".length).replace(/\.md$/, "");
    const parts = rel.split("/");
    if (parts.length > 2) continue;
    const [dir, slug] = parts.length === 2 ? parts : ["", parts[0]];
    const market = dir || "us";
    const md = readFileSync(file, "utf8");
    const data = YAML.parse(fmBlock(md)?.[1] ?? "") ?? {};
    const body = md.replace(/^---\n[\s\S]*?\n---\n/, "");
    const path = !dir ? `/blog/${slug}` : ["fr", "de"].includes(dir) ? `/${dir}/blog/${slug}` : `/${dir}/guides/${slug}`;
    out.push({ kind: "guide", market, lang: ["fr", "de"].includes(dir) ? dir : "en", file, path, slug, data, body, text: `${JSON.stringify(data)}\n${body}` });
  }
  for (const [kind, dir, prefix] of [["standard", "src/content/standards", "/us/standards/"], ["industry", "src/content/industries", "/us/industries/"], ["report", "src/content/reports", "/us/reports/"]]) {
    for (const file of walk(dir)) {
      if (!file.endsWith(".json")) continue;
      const data = JSON.parse(readFileSync(file, "utf8"));
      const slug = file.split("/").pop().replace(/\.json$/, "");
      const k = kind === "report" && data.kind === "penalties" ? "penalties" : kind;
      const path = k === "penalties" ? "/us/osha-penalties" : prefix + slug;
      out.push({ kind: k, market: "us", lang: "en", file, path, slug, data, body: jsonProse(k, data), text: JSON.stringify(data) });
    }
  }
  return out;
}

/** The prose of a JSON page (what classifyChange measures). */
export function jsonProse(kind, d) {
  if (kind === "standard") return [d.opening, d.enforcementSummary, d.requirementsIntro, ...(d.requirements ?? []).flatMap((g) => [g.heading, g.intro, ...(g.items ?? []).map((i) => i.text)]), d.checklistIntro, ...(d.faq ?? []).map((f) => `${f.question} ${f.answer}`)].filter(Boolean).join("\n");
  if (kind === "industry") return [d.opening, d.patternsSummary, d.penaltiesSummary, ...(d.standardNotes ?? []).map((n) => n.note), ...(d.faq ?? []).map((f) => `${f.question} ${f.answer}`)].filter(Boolean).join("\n");
  return [d.title, d.description, d.opening, d.summary, d.intro].filter((x) => typeof x === "string").join("\n");
}

/** Released (live) pages: generated pages need a releaseDate; pages from before the build are live by their date. */
export const isLive = (c) => !c.data.noindex && (!c.data.generatedOn || !!c.data.releaseDate);
export const releaseDateOf = (c) => String(c.data.releaseDate ?? c.data.date ?? "").slice(0, 10) || null;

/**
 * Edits a page file in place: `fn(data)` mutates the frontmatter (markdown) or the JSON object.
 * Markdown keeps its formatting (YAML document edit); keys set to undefined are removed.
 */
export function editPage(file, fn) {
  if (file.endsWith(".json")) {
    const d = JSON.parse(readFileSync(file, "utf8"));
    fn(d);
    for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
    writeFileSync(file, `${JSON.stringify(d, null, 2)}\n`);
    return d;
  }
  const t = readFileSync(file, "utf8");
  const m = fmBlock(t);
  const doc = YAML.parseDocument(m[1]);
  const orig = doc.toJS() ?? {};
  const d = structuredClone(orig);
  fn(d);
  if (JSON.stringify(d) === JSON.stringify(orig)) return d;
  for (const k of new Set([...Object.keys(orig), ...Object.keys(d)])) {
    if (d[k] === undefined) { if (k in orig) doc.delete(k); continue; }
    if (JSON.stringify(orig[k]) !== JSON.stringify(d[k])) doc.set(k, d[k]);
  }
  writeFileSync(file, t.replace(m[1], doc.toString({ lineWidth: 0 }).trimEnd()));
  return d;
}

/** Built HTML of a path in dist/ (null when the site isn't built or the page isn't live). */
export function builtHtml(path) {
  const f = join("dist", path === "/" ? "index.html" : `${path.slice(1)}.html`);
  if (existsSync(f)) return readFileSync(f, "utf8");
  const g = join("dist", path.slice(1), "index.html");
  return existsSync(g) ? readFileSync(g, "utf8") : null;
}
export const stripHtml = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

/** The topic sheet's "Main page for keyword" as a URL path, given the row ("this guide" → the row's published URL). */
export function mainPageOf(topic) {
  const m = String(topic.mainPage ?? "").trim();
  if (m.startsWith("/")) return m.split(/\s/)[0].replace(/\/$/, "");
  if (/^this guide/i.test(m) || !m) return topic.url ? toPath(topic.url) : null;
  return null;
}

/** Every saved Search Console summary, oldest first: [{ date, ...summary }]. */
export function allSummaries() {
  if (!existsSync("data/gsc")) return [];
  return readdirSync("data/gsc").filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && existsSync(join("data/gsc", d, "summary.json"))).sort().map((d) => ({ date: d, ...readJson(join("data/gsc", d, "summary.json"), {}) }));
}

/**
 * The newest analytics export in data/analytics/ (CSV: path or page, visits, downloads, app_taps; header names
 * are matched loosely), as Map(path → { visits, downloads, appTaps }), or null when there is none.
 * Exports come from the Cloudflare Analytics Engine dataset (worker/index.js) and the Cloudflare dashboard.
 */
export function latestAnalytics() {
  if (!existsSync("data/analytics")) return null;
  const f = readdirSync("data/analytics").filter((x) => x.endsWith(".csv")).sort().at(-1);
  if (!f) return null;
  const rows = parseCsv(readFileSync(join("data/analytics", f), "utf8"));
  const head = rows[0]?.map((h) => h.toLowerCase().trim()) ?? [];
  const col = (re) => head.findIndex((h) => re.test(h));
  const [p, v, d, a] = [col(/^(path|page|url)/), col(/visit|view/), col(/download/), col(/app|tap/)];
  if (p < 0) return null;
  const m = new Map();
  for (const r of rows.slice(1)) m.set(toPath(r[p]), { visits: v >= 0 ? Number(r[v]) || 0 : null, downloads: d >= 0 ? Number(r[d]) || 0 : null, appTaps: a >= 0 ? Number(r[a]) || 0 : null });
  m.file = join("data/analytics", f);
  return m;
}
