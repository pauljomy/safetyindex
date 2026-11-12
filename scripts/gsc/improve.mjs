// The weekly improve loop (brief section 16), from the latest Search Console summary in data/gsc/.
// At most `improve_max_changes_per_week` page changes a week, so the effect of each can be measured.
//  1. High impressions, low CTR (> 100 impressions, CTR < 3%, position ≤ 10): new seoTitle and description
//     through the writing engine (writeChecked: validate, retry, independent checking pass) under the fact
//     rule; old and new logged in data/gsc/changes.jsonl. After 28 days of data, CTR is compared and the old
//     version restored if CTR fell (the restore pass).
//  2. Positions 5–20 (> 50 impressions): the market's top-clicked pages should link to the page. Links are
//     generated from `linkPhrases`, so a query that already appears in a top page's text is added as a phrase;
//     otherwise a section suggestion goes into the weekly report (nothing is changed).
//  3. Two of our pages for one search: the topic sheet's "Main page for keyword" decides; the conflict and the
//     suggested retarget are logged (never merged automatically).
//  4. Wrong country: a /uk, /au, /ca, /nz, /fr or /de page whose impressions come mostly from another country;
//     logged with the share, with whether the local rule line and hreflang alternates are there.
//  5. Searches with ≥ 50 impressions and no matching page (not a known keyword, and none of our pages ranks in
//     the top 20 for it, since rule 2 covers positions 5–20): appended to the topic sheet (max 20 a week).
//  6. Pages Google crawled but didn't index (URL Inspection): logged.
// Every content change is recorded with its size (classifyChange): optimisation / upgrade / rewrite. Only
// upgrades and rewrites set `updated` (dateModified and the sitemap lastmod follow).
// Findings go to data/gsc/improve/<date>.json for the weekly report.
//   npm run improve [-- --dry-run] [--max 20]
import { config } from "../lib/config.mjs";
import { ENGINE_SYSTEM, COUNTRY } from "../lib/prompts.mjs";
import { writeChecked } from "../engine/pipeline.mjs";
import { numbersIn } from "../checks/facts.mjs";
import { appendTopic, loadTopics, saveTopics } from "../lib/topics.mjs";
import { categories } from "../../src/data/categories.mjs";
import { latestGsc } from "./data.mjs";
import { MARKET_COUNTRY, appendJsonl, builtHtml, contentIndex, editPage, isLive, mainPageOf, marketOf, readJsonl, stripHtml, today, writeJson } from "./common.mjs";

export const CHANGES_LOG = "data/gsc/changes.jsonl";
const LANG_NAME = { en: "English", fr: "French", de: "German" };
const NAME_RE = /\b[A-ZÀ-Ý][a-zà-ÿß]+(?:\s+[A-ZÀ-Ý][a-zà-ÿß]+)+\b/g;
const MAX_PHRASES = { guide: 4, standard: 3, industry: 2 };

// --- Change size -----------------------------------------------------------------------
const tokens = (s) => String(s ?? "").toLowerCase().replace(/<[^>]+>|\]\([^)]*\)|[#*_`>|[\]()-]/g, " ").split(/\s+/).filter(Boolean);

/** Length of the longest common subsequence of two word lists (two rolling rows). */
function lcs(a, b) {
  if (a.length < b.length) [a, b] = [b, a];
  let prev = new Uint32Array(b.length + 1), cur = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/**
 * Size of a change to a page's main content: the share of words changed (1 − LCS / longer version).
 * optimisation under 15% (or only title, description, links, images), upgrade 15–70%, rewrite over 70%.
 * @returns {{ kind: "optimisation"|"upgrade"|"rewrite", share: number }}
 */
export function classifyChange(oldText, newText) {
  const a = tokens(oldText), b = tokens(newText);
  const n = Math.max(a.length, b.length);
  const share = n ? Math.round((1 - lcs(a, b) / n) * 1000) / 1000 : 0;
  return { kind: share > 0.7 ? "rewrite" : share >= 0.15 ? "upgrade" : "optimisation", share };
}

/**
 * Adds a change to a page's `changes` list (frontmatter or JSON); upgrades and rewrites also set `updated`.
 * Extra fields on `entry` (path, rule, old, new, …) go only to data/gsc/changes.jsonl.
 * @param {string} file page file
 * @param {{ kind: string, share: number, note?: string, date?: string, [k: string]: any }} entry
 */
export function recordChange(file, entry, { dryRun = false } = {}) {
  const date = entry.date ?? today();
  const { kind, share, note, ...extra } = entry;
  const row = { date, kind, share, ...(note && { note }) };
  if (!dryRun) {
    editPage(file, (d) => {
      d.changes = [...(d.changes ?? []), row];
      if (kind === "upgrade" || kind === "rewrite") d.updated = date;
    });
    appendJsonl(CHANGES_LOG, { id: `${date}:${extra.path ?? file}:${extra.rule ?? kind}`, file, ...row, ...extra });
  }
  return row;
}

// --- Helpers ----------------------------------------------------------------------------
const norm = (q) => q.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const singular = (q) => norm(q).split(" ").map((w) => w.replace(/(?<=\w{3})s$/, "")).join(" ");
const pct = (x) => `${(x * 100).toFixed(1)}%`;

function queriesByPath(gsc) {
  const m = new Map();
  for (const r of gsc.queryPages ?? []) (m.get(r.path) ?? m.set(r.path, []).get(r.path)).push(r);
  for (const list of m.values()) list.sort((a, b) => b.impressions - a.impressions);
  return m;
}

/** New seoTitle + description for one page, through the engine with all its checks. */
async function newSnippet(c, queries, log, allTitles) {
  const lang = c.lang ?? "en";
  const d = c.data;
  const oldTitle = d.seoTitle || d.title;
  const keyword = d.keyword ?? "";
  const pageText = `${c.text}\n${c.body ?? ""}`;
  const pageNums = numbersIn(pageText);
  const lowerPage = pageText.toLowerCase();
  const schema = { type: "object", additionalProperties: false, required: ["seoTitle", "description"], properties: { seoTitle: { type: "string" }, description: { type: "string" } } };
  const prompt = `This live page (for readers in ${COUNTRY[c.market]}) shows up often in Google but few searchers click it. Write a new search title (seoTitle) and meta description, in ${LANG_NAME[lang]}, that match what these searchers want and what the page really delivers.

Rules:
- seoTitle: 30–60 characters${keyword ? `, containing the page's search keyword "${keyword}" near the start` : ""}. No site name, no clickbait, no ALL CAPS.
- description: 120–155 characters, one or two plain sentences saying what the page answers and for whom.
- Fact rule: use only facts already on the page below. No number, date, clause, name or claim that isn't in the page text. Never mention conform.so.
- Don't promise anything the page doesn't contain. No "ultimate", "complete guide", "everything you need to know".

Current seoTitle: ${oldTitle}
Current description: ${d.description}

Searches that showed this page (last 28 days, with impressions and average position):
${queries.slice(0, 15).map((q) => `- "${q.query}": ${q.impressions} impressions, position ${q.position}`).join("\n") || "- (no query detail)"}

<page>
${pageText.slice(0, 24000)}
</page>`;
  const validate = (x) => {
    const e = [];
    if (x.seoTitle.length < 30 || x.seoTitle.length > 60) e.push(`seoTitle is ${x.seoTitle.length} characters (30–60)`);
    if (x.description.length < 120 || x.description.length > 155) e.push(`description is ${x.description.length} characters (120–155)`);
    if (keyword && oldTitle.toLowerCase().includes(keyword.toLowerCase()) && !x.seoTitle.toLowerCase().includes(keyword.toLowerCase())) e.push(`seoTitle must contain the keyword "${keyword}"`);
    for (const f of ["seoTitle", "description"]) {
      const nums = [...numbersIn(x[f])].filter((n) => !pageNums.has(n));
      if (nums.length) e.push(`${f} adds number(s) not on the page: ${nums.join(", ")}`);
      const names = (x[f].match(NAME_RE) ?? []).filter((n) => !lowerPage.includes(n.toLowerCase()));
      if (names.length) e.push(`${f} adds name(s) not on the page: ${names.join(", ")}`);
      if (/conform\.so/i.test(x[f])) e.push(`${f} mentions conform.so`);
    }
    if (allTitles.has(x.seoTitle.toLowerCase())) e.push("seoTitle is already used by another page");
    if (x.seoTitle === oldTitle && x.description === d.description) e.push("nothing changed");
    return e;
  };
  return writeChecked({ label: `snippet ${c.path}`, system: ENGINE_SYSTEM, prompt, schema, validate, sources: `<page path="${c.path}">\n${pageText.slice(0, 40000)}\n</page>`, market: c.market, log });
}

// --- The loop -----------------------------------------------------------------------------
export async function improve({ max = config.improve_max_changes_per_week ?? 20, dryRun = false, log = console.log } = {}) {
  const gsc = latestGsc();
  const day = today();
  const out = { date: day, dryRun, dataEndDate: gsc?.endDate ?? null, max, changes: [], restores: [], linkSuggestions: [], sectionSuggestions: [], conflicts: [], wrongCountry: [], newTopics: [], notIndexed: [], notes: [] };
  if (!gsc) { log("improve: no Search Console data in data/gsc/ (run npm run gsc:pull, or add a manual export); nothing to do."); out.notes.push("no Search Console data"); return out; }
  if (!gsc.pages) { log("improve: the latest data has page totals only (manual export without summary); rules need a full pull."); out.notes.push("page rows only"); return out; }
  log(`improve: data ${gsc.startDate ?? "?"} to ${gsc.endDate}, ${gsc.pages.length} pages, up to ${max} change(s)${dryRun ? " (dry run)" : ""}`);
  const content = contentIndex();
  const byPath = new Map(content.map((c) => [c.path, c]));
  const qByPath = queriesByPath(gsc);
  const pageRow = new Map(gsc.pages.map((p) => [p.path, p]));
  const history = readJsonl(CHANGES_LOG);
  let budget = max;
  const allTitles = new Set(content.map((c) => (c.data.seoTitle || c.data.title || "").toLowerCase()).filter(Boolean));

  // Restore pass: title/description changes with a full 28-day window of data after them.
  const evaluated = new Set(history.filter((h) => h.rule === "ctr-evaluated").map((h) => h.ref));
  for (const h of history.filter((h) => h.rule === "ctr" && !evaluated.has(h.id))) {
    if (!gsc.startDate || gsc.startDate <= h.date) continue; // not 28 days of data since the change yet
    const now = pageRow.get(h.path);
    const c = byPath.get(h.path);
    const ctrAfter = now?.ctr ?? 0;
    const lower = ctrAfter < h.ctrBefore;
    const stillOurs = c && (c.data.seoTitle ?? c.data.title) === h.new.seoTitle && c.data.description === h.new.description;
    const result = { path: h.path, changedOn: h.date, ctrBefore: h.ctrBefore, ctrAfter, action: lower ? (stillOurs ? "restored" : "lower, but the page changed since; left as is") : "kept" };
    if (lower && stillOurs && budget > 0) {
      budget--;
      if (!dryRun) {
        editPage(c.file, (d) => { d.seoTitle = h.old.seoTitle; d.description = h.old.description; });
        recordChange(c.file, { kind: "optimisation", share: 0, note: "title and description restored (CTR fell)", path: h.path, rule: "ctr-restore", old: h.new, new: h.old });
      }
    } else if (lower && stillOurs) { result.action = "lower; restore waits for next week's change budget"; out.restores.push(result); continue; }
    if (!dryRun) appendJsonl(CHANGES_LOG, { rule: "ctr-evaluated", ref: h.id, date: day, path: h.path, ctrBefore: h.ctrBefore, ctrAfter, action: result.action });
    out.restores.push(result);
    log(`  restore pass: ${h.path} CTR ${pct(h.ctrBefore)} → ${pct(ctrAfter)}: ${result.action}`);
  }
  const pending = new Set(history.filter((h) => h.rule === "ctr" && !evaluated.has(h.id)).map((h) => h.path));

  // Rule 1: high impressions, low CTR.
  const lowCtr = gsc.pages.filter((p) => p.impressions > 100 && p.ctr < 0.03 && p.position && p.position <= 10 && byPath.has(p.path) && isLive(byPath.get(p.path)) && !pending.has(p.path)).sort((a, b) => b.impressions - a.impressions);
  log(`  rule 1 (low CTR): ${lowCtr.length} candidate(s)`);
  for (const p of lowCtr) {
    if (budget <= 0) { out.notes.push(`rule 1: change budget used up; ${lowCtr.length - out.changes.filter((x) => x.rule === "ctr").length} page(s) wait`); break; }
    const c = byPath.get(p.path);
    const old = { seoTitle: c.data.seoTitle || c.data.title, description: c.data.description };
    if (dryRun) { out.changes.push({ rule: "ctr", path: p.path, dryRun: true, impressions: p.impressions, ctr: p.ctr, position: p.position, old }); budget--; continue; }
    let res;
    try { res = await newSnippet(c, qByPath.get(p.path) ?? [], log, allTitles); } catch (e) { log(`  ! ${p.path}: ${e.message}`); out.notes.push(`rule 1 ${p.path}: ${e.message}`); continue; }
    if (!res.ok) { log(`  • ${p.path}: no new title (${res.reason})`); out.notes.push(`rule 1 ${p.path}: dropped (${res.reason})`); continue; }
    const neu = { seoTitle: res.draft.seoTitle.trim(), description: res.draft.description.trim() };
    editPage(c.file, (d) => { d.seoTitle = neu.seoTitle; d.description = neu.description; });
    recordChange(c.file, { kind: "optimisation", share: 0, note: "search title and description rewritten (low CTR)", path: p.path, rule: "ctr", old, new: neu, ctrBefore: p.ctr, impressions: p.impressions, position: p.position, dataEndDate: gsc.endDate });
    allTitles.add(neu.seoTitle.toLowerCase());
    out.changes.push({ rule: "ctr", path: p.path, impressions: p.impressions, ctr: p.ctr, position: p.position, old, new: neu });
    budget--;
    log(`  ✔ ${p.path}: "${old.seoTitle}" → "${neu.seoTitle}"`);
  }

  // Rule 2: positions 5–20 with > 50 impressions: links from the market's top-clicked pages.
  const striking = gsc.pages.filter((p) => p.position >= 5 && p.position <= 20 && p.impressions > 50 && byPath.has(p.path) && isLive(byPath.get(p.path)));
  log(`  rule 2 (positions 5–20): ${striking.length} candidate(s)`);
  const distBuilt = !!builtHtml("/");
  if (striking.length && !distBuilt) out.notes.push("rule 2: dist/ isn't built, so existing links couldn't be checked; run npm run build first");
  const phraseOwner = new Map();
  for (const c of content) for (const ph of c.data.linkPhrases ?? []) phraseOwner.set(`${c.market}:${norm(ph)}`, c.path);
  for (const p of striking) {
    if (!distBuilt) break;
    const c = byPath.get(p.path);
    const market = marketOf(p.path);
    const top = gsc.pages.filter((x) => x.path !== p.path && marketOf(x.path) === market && x.clicks > 0 && byPath.has(x.path)).sort((a, b) => b.clicks - a.clicks).slice(0, 10);
    if (!top.length) continue;
    const htmls = top.map((t) => ({ path: t.path, html: builtHtml(t.path) ?? "" }));
    const linked = htmls.filter((h) => h.html.includes(`href="${p.path}"`) || h.html.includes(`href="https://safetyindex.blog${p.path}"`));
    if (linked.length) continue;
    const queries = (qByPath.get(p.path) ?? []).filter((q) => { const w = norm(q.query).split(" "); return q.query.length >= 4 && w.length >= 2 && w.length <= 6; });
    const texts = htmls.map((h) => ({ path: h.path, text: norm(stripHtml(h.html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? "")) }));
    let anchor = null;
    for (const q of queries) {
      const n = norm(q.query);
      if (phraseOwner.has(`${market}:${n}`)) continue;
      const host = texts.find((t) => ` ${t.text} `.includes(` ${n} `));
      if (host) { anchor = { phrase: n, host: host.path, query: q.query }; break; }
    }
    const phrases = c.data.linkPhrases ?? [];
    if (anchor && phrases.length < (MAX_PHRASES[c.kind] ?? 3) && budget > 0) {
      budget--;
      if (!dryRun) {
        editPage(c.file, (d) => { d.linkPhrases = [...(d.linkPhrases ?? []), anchor.phrase]; });
        recordChange(c.file, { kind: "optimisation", share: 0, note: `link phrase "${anchor.phrase}" added`, path: p.path, rule: "links", phrase: anchor.phrase, from: anchor.host });
      }
      phraseOwner.set(`${market}:${anchor.phrase}`, p.path);
      out.changes.push({ rule: "links", path: p.path, phrase: anchor.phrase, from: anchor.host, position: p.position, impressions: p.impressions, ...(dryRun && { dryRun: true }) });
      log(`  ✔ ${p.path}: link phrase "${anchor.phrase}" (mentioned on ${anchor.host})`);
    } else {
      const unanswered = queries.filter((q) => !norm(c.body ?? c.text).includes(norm(q.query))).slice(0, 3).map((q) => q.query);
      out.sectionSuggestions.push({ path: p.path, position: p.position, impressions: p.impressions, topPagesWithoutLink: top.slice(0, 3).map((t) => t.path), queriesNotAnswered: unanswered, why: anchor ? `link phrase limit reached (${phrases.length})` : "no query appears on a top-clicked page" });
    }
  }

  // Rule 3: two of our pages for one search.
  const { topics, ...sheet } = await loadTopics().catch((e) => { out.notes.push(`topic sheet unreadable: ${e.message}`); return { topics: [] }; });
  const byQuery = new Map();
  for (const r of gsc.queryPages ?? []) if (r.impressions >= 10) (byQuery.get(r.query) ?? byQuery.set(r.query, []).get(r.query)).push(r);
  for (const [query, rows] of [...byQuery].filter(([, r]) => new Set(r.map((x) => x.path)).size >= 2).sort((a, b) => b[1].reduce((s, r) => s + r.impressions, 0) - a[1].reduce((s, r) => s + r.impressions, 0)).slice(0, 30)) {
    const n = norm(query);
    const topic = topics.find((t) => norm(t.keyword) === n || t.supporting.some((s) => norm(s) === n));
    const sheetMain = topic ? mainPageOf(topic) : null;
    const main = sheetMain && rows.some((r) => r.path === sheetMain) ? sheetMain : [...rows].sort((a, b) => b.clicks - a.clicks || a.position - b.position)[0].path;
    const others = rows.filter((r) => r.path !== main).map((r) => r.path);
    out.conflicts.push({ query, pages: rows.map((r) => ({ path: r.path, impressions: r.impressions, position: r.position })), main, mainFrom: sheetMain ? `topic sheet row #${topic.n}` : "most clicks (not in the sheet)", suggestion: `keep ${main} as the page for "${query}"; retarget the title and opening of ${others.join(", ")} to ${others.length > 1 ? "their own searches" : `its own search${byPath.get(others[0])?.data.keyword ? ` ("${byPath.get(others[0]).data.keyword}")` : ""}`}` });
  }
  log(`  rule 3 (two pages, one search): ${out.conflicts.length} conflict(s) logged`);

  // Rule 4: wrong country.
  for (const p of gsc.pages.filter((p) => marketOf(p.path) !== "us" && p.impressions >= 20 && p.ownCountryShare != null && p.ownCountryShare < 0.5 && p.topCountry !== MARKET_COUNTRY[marketOf(p.path)])) {
    const c = byPath.get(p.path);
    const html = builtHtml(p.path);
    const hreflang = html ? (html.match(/<link rel="alternate" hreflang=/g) ?? []).length : null;
    const checks = [];
    if (c?.data.topicType === "regional" && !c.data.localRule) checks.push("no local rule line");
    if (hreflang != null && hreflang < 2) checks.push("no hreflang alternates");
    if (hreflang == null) checks.push("not in dist/ (build to check hreflang)");
    out.wrongCountry.push({ path: p.path, impressions: p.impressions, ownCountryShare: p.ownCountryShare, topCountry: p.topCountry, topCountryShare: p.topCountryShare, topicType: c?.data.topicType ?? null, localRule: !!c?.data.localRule, hreflangLinks: hreflang, problems: checks, suggestion: c?.data.topicType === "same everywhere" ? "topic is the same everywhere: re-sort it in the sheet and canonicalise it to the main version" : checks.length ? `fix: ${checks.join(", ")}` : "local rule and hreflang are in place; check the opening names the country's rule" });
  }
  log(`  rule 4 (wrong country): ${out.wrongCountry.length} page(s)`);

  // Rule 5: searches with impressions and no matching page → topic sheet.
  const known = new Set();
  for (const t of topics) for (const k of [t.keyword, ...t.supporting]) if (k) known.add(singular(k));
  for (const c of content) for (const k of [c.data.keyword, ...(c.data.cluster ?? []), ...(c.data.linkPhrases ?? [])]) if (typeof k === "string" && k) known.add(singular(k));
  const agg = new Map();
  for (const r of gsc.queryPages ?? []) { const a = agg.get(r.query) ?? agg.set(r.query, { query: r.query, impressions: 0, best: 999, paths: [] }).get(r.query); a.impressions += r.impressions; a.best = Math.min(a.best, r.position); a.paths.push(r); }
  for (const q of gsc.queries ?? []) if (!agg.has(q.query)) agg.set(q.query, { query: q.query, impressions: q.impressions, best: q.position, paths: [] });
  const gaps = [...agg.values()].filter((a) => a.impressions >= 50 && a.best > 20 && !known.has(singular(a.query)) && norm(a.query).length >= 4).sort((a, b) => b.impressions - a.impressions).slice(0, 20);
  for (const g of gaps) {
    const best = g.paths.sort((a, b) => b.impressions - a.impressions)[0];
    const market = best ? marketOf(best.path) : "us";
    const host = best ? byPath.get(best.path) : null;
    const cat = categories.find((x) => x.slug === host?.data.categories?.[0])?.sheet ?? "OSHA & Compliance";
    const title = g.query.charAt(0).toUpperCase() + g.query.slice(1);
    out.newTopics.push({ query: g.query, impressions: g.impressions, bestPosition: g.best, market, category: cat, shownWith: best?.path ?? null });
    if (!dryRun && sheet.ws) {
      appendTopic({ ...sheet, topics }, { category: cat, title, keyword: g.query, markets: market.toUpperCase(), topicType: "country-only", keywordSource: "Search Console", checkedOn: day, notes: `from Search Console: ${g.impressions} impressions, best position ${g.best.toFixed(1)} (${gsc.startDate} to ${gsc.endDate})${["fr", "de"].includes(market) ? "; needs an English version first" : ""}` });
    }
  }
  if (!dryRun && sheet.ws && gaps.length) await saveTopics(sheet);
  log(`  rule 5 (searches without a page): ${gaps.length} added to the topic sheet${dryRun ? " (dry run: not written)" : ""}`);

  // Rule 6: crawled but not indexed.
  out.notIndexed = Object.entries(gsc.inspection ?? {}).filter(([, r]) => !r.indexed).map(([path, r]) => ({ path, coverage: r.coverage, googleCanonical: r.googleCanonical, inspectedOn: r.inspectedOn }));
  log(`  rule 6 (not indexed): ${out.notIndexed.length} page(s)`);

  out.changeCount = max - budget;
  if (!dryRun) writeJson(`data/gsc/improve/${day}.json`, out);
  log(`improve: ${out.changeCount} change(s)${dryRun ? " planned" : " made"}; report data ${dryRun ? "not saved (dry run)" : `in data/gsc/improve/${day}.json`}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--max");
  improve({ dryRun: args.includes("--dry-run"), ...(i >= 0 && { max: Number(args[i + 1]) }) }).catch((e) => { console.error(`improve failed: ${e.stack ?? e}`); process.exit(1); });
}
