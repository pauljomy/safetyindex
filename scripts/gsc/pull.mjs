// Weekly Search Console pull (brief section 16): a direct API client, no LLM, no googleapis package.
// Credentials: GSC_CREDENTIALS (path to a service-account JSON key, or the JSON itself) and GSC_PROPERTY
// (e.g. "sc-domain:safetyindex.blog"), from the environment or .env. Without them it logs that and falls
// back to manual exports in data/gsc/<date>/ (pages.csv, optionally queries.csv), and exits 0.
//
// Pulls the last 28 days and the 28 days before (data lags 2–3 days, so the window ends today − 3):
// query, page, query+page and page+country rows, saved as CSV in data/gsc/<date>/ (git-ignored), plus
// summary.json (committed), which the release gates, the improve loop, the reports and maintenance read.
// URL Inspection for pages released in the last 30 days (data/release/waves.json), within the daily
// quota (stops at 1,800 a day; counter in data/gsc/inspection-quota.json).
//   npm run gsc:pull [-- --no-inspect]
import { createSign } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { GSC_DIR } from "./data.mjs";
import { MARKET_COUNTRY, SITE, addDays, marketOf, parseCsv, readJson, toCsv, toPath, today, writeJson } from "./common.mjs";

const QUOTA_FILE = join(GSC_DIR, "inspection-quota.json");
const INSPECT_DAILY_CAP = 1800;
const ROW_LIMIT = 25000;
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

const b64url = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Service-account key from GSC_CREDENTIALS (a file path or the JSON itself), or null. */
export function loadCredentials(v = process.env.GSC_CREDENTIALS) {
  if (!v?.trim()) return null;
  const s = v.trim();
  try { return JSON.parse(s.startsWith("{") ? s : readFileSync(s, "utf8")); } catch (e) { throw new Error(`GSC_CREDENTIALS is set but can't be read as a service-account key: ${e.message}`); }
}

/** OAuth 2.0 access token for a service account (JWT bearer grant, RS256 signed with node:crypto). */
export async function accessToken(key, scope = SCOPE) {
  const now = Math.floor(Date.now() / 1000);
  const aud = key.token_uri || "https://oauth2.googleapis.com/token";
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT", ...(key.private_key_id && { kid: key.private_key_id }) }))}.${b64url(JSON.stringify({ iss: key.client_email, scope, aud, iat: now, exp: now + 3600 }))}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(key.private_key);
  const res = await fetch(aud, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(sig)}` }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Google token request failed (HTTP ${res.status}): ${j.error_description ?? j.error ?? "no token"}`);
  return j.access_token;
}

async function api(token, url, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return res.json();
    const text = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 4) { await new Promise((r) => setTimeout(r, 5000 * 2 ** attempt)); continue; }
    const err = new Error(`HTTP ${res.status} from ${url.replace(/\?.*/, "")}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
}

/** All rows for one query (paginated, rowLimit 25,000). */
async function searchAnalytics(token, property, { startDate, endDate, dimensions }) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const rows = [];
  for (let startRow = 0; ; startRow += ROW_LIMIT) {
    const j = await api(token, url, { startDate, endDate, dimensions, rowLimit: ROW_LIMIT, startRow, type: "web" });
    rows.push(...(j.rows ?? []));
    if (!j.rows || j.rows.length < ROW_LIMIT) break;
  }
  return rows;
}

const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
/** Sums rows into { clicks, impressions, ctr, position } (position weighted by impressions). */
export function totalsOf(rows) {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const pos = impressions ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions : 0;
  return { clicks, impressions, ctr: impressions ? round(clicks / impressions) : 0, position: round(pos, 2) };
}

/** Pages released in the last 30 days (data/release/waves.json). */
function recentlyReleased(day) {
  const waves = readJson("data/release/waves.json", []);
  return [...new Set(waves.filter((w) => (new Date(day) - new Date(w.date)) / 864e5 <= 30).flatMap((w) => w.paths))];
}

async function inspect(token, property, paths, log) {
  const quota = readJson(QUOTA_FILE, {});
  const day = today();
  let used = quota[day] ?? 0;
  const out = {};
  for (const path of paths) {
    if (used >= INSPECT_DAILY_CAP) { log(`URL Inspection: daily cap of ${INSPECT_DAILY_CAP} reached; ${paths.length - Object.keys(out).length} page(s) left for tomorrow`); break; }
    try {
      const j = await api(token, "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", { inspectionUrl: `${SITE}${path}`, siteUrl: property });
      used++;
      const r = j.inspectionResult?.indexStatusResult ?? {};
      out[path] = { indexed: r.verdict === "PASS", coverage: r.coverageState ?? "", googleCanonical: r.googleCanonical ? toPath(r.googleCanonical) : "", userCanonical: r.userCanonical ? toPath(r.userCanonical) : "", lastCrawl: r.lastCrawlTime ?? "", inspectedOn: day };
    } catch (e) {
      used++;
      if (e.status === 429) { log("URL Inspection: quota exhausted (HTTP 429); stopping for today"); break; }
      log(`URL Inspection failed for ${path}: ${e.message}`);
    }
  }
  quota[day] = used;
  for (const d of Object.keys(quota)) if (d < addDays(day, -14)) delete quota[d];
  writeJson(QUOTA_FILE, quota);
  return out;
}

/** The newest earlier summary (to carry URL Inspection results forward). */
function previousSummary(except) {
  if (!existsSync(GSC_DIR)) return null;
  const d = readdirSync(GSC_DIR).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && x !== except && existsSync(join(GSC_DIR, x, "summary.json"))).sort().at(-1);
  return d ? readJson(join(GSC_DIR, d, "summary.json"), null) : null;
}

/** Builds summary.json from the row sets (also used for manual exports, where some sets are missing). */
export function buildSummary({ endDate, startDate, prevStartDate, prevEndDate, pages = [], prevPages = [], queries = [], prevQueries = [], queryPages = [], pageCountry = [], totals, prevTotals, inspection = {} }) {
  const prevByPage = new Map(prevPages.map((r) => [r.path, r]));
  const countries = new Map();
  for (const r of pageCountry) (countries.get(r.path) ?? countries.set(r.path, []).get(r.path)).push(r);
  const pageRows = pages.map((r) => {
    const cs = (countries.get(r.path) ?? []).sort((a, b) => b.impressions - a.impressions);
    const tot = cs.reduce((s, c) => s + c.impressions, 0);
    const own = cs.find((c) => c.country === MARKET_COUNTRY[marketOf(r.path)]);
    const p = prevByPage.get(r.path);
    return { path: r.path, clicks: r.clicks, impressions: r.impressions, ctr: round(r.ctr), position: round(r.position, 2), prevClicks: p?.clicks ?? 0, prevImpressions: p?.impressions ?? 0, prevCtr: p ? round(p.ctr) : null, prevPosition: p ? round(p.position, 2) : null, topCountry: cs[0]?.country ?? null, topCountryShare: tot && cs[0] ? round(cs[0].impressions / tot, 3) : null, ownCountryShare: tot ? round((own?.impressions ?? 0) / tot, 3) : null };
  }).sort((a, b) => b.impressions - a.impressions);
  // Pages only in the previous window (lost all impressions) still count for drops.
  const current = new Set(pages.map((r) => r.path));
  for (const p of prevPages) if (!current.has(p.path)) pageRows.push({ path: p.path, clicks: 0, impressions: 0, ctr: 0, position: null, prevClicks: p.clicks, prevImpressions: p.impressions, prevCtr: round(p.ctr), prevPosition: round(p.position, 2), topCountry: null, topCountryShare: null, ownCountryShare: null });
  const prevQ = new Map(prevQueries.map((r) => [r.query, r]));
  const markets = {};
  for (const m of Object.keys(MARKET_COUNTRY)) {
    const cur = pages.filter((r) => marketOf(r.path) === m), prev = prevPages.filter((r) => marketOf(r.path) === m);
    const mq = new Map();
    for (const r of queryPages.filter((r) => marketOf(r.path) === m)) { const q = mq.get(r.query) ?? mq.set(r.query, { query: r.query, clicks: 0, impressions: 0, pw: 0 }).get(r.query); q.clicks += r.clicks; q.impressions += r.impressions; q.pw += r.position * r.impressions; }
    markets[m] = { ...totalsOf(cur), prev: totalsOf(prev), pages: cur.length, topQueries: [...mq.values()].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 10).map((q) => ({ query: q.query, clicks: q.clicks, impressions: q.impressions, position: q.impressions ? round(q.pw / q.impressions, 1) : null })) };
  }
  return {
    endDate, startDate, prevStartDate, prevEndDate, pulledOn: today(),
    totals: totals ?? totalsOf(pages), prevTotals: prevTotals ?? totalsOf(prevPages),
    markets,
    pageImpressions: Object.fromEntries(pages.map((r) => [r.path, r.impressions])),
    pages: pageRows,
    queries: queries.sort((a, b) => b.impressions - a.impressions).slice(0, 200).map((r) => ({ query: r.query, clicks: r.clicks, impressions: r.impressions, ctr: round(r.ctr), position: round(r.position, 2), prevClicks: prevQ.get(r.query)?.clicks ?? 0, prevImpressions: prevQ.get(r.query)?.impressions ?? 0 })),
    // Query + page pairs with some demand (the improve loop's anchors, cannibalisation and gap rules).
    queryPages: queryPages.filter((r) => r.impressions >= 5).sort((a, b) => b.impressions - a.impressions).slice(0, 5000).map((r) => ({ query: r.query, path: r.path, clicks: r.clicks, impressions: r.impressions, position: round(r.position, 1) })),
    inspection,
  };
}

// --- Manual exports ------------------------------------------------------------------
const num = (s) => { const t = String(s ?? "").trim(); if (!t) return 0; return t.endsWith("%") ? Number(t.slice(0, -1).replace(",", ".")) / 100 : Number(t.replace(/,/g, "")); };
/** Reads a Search Console UI export or our own CSV (first column = page URL or query). */
function readExport(file, key) {
  const rows = parseCsv(readFileSync(file, "utf8"));
  const head = rows[0].map((h) => h.toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const [c, i, ct, p] = [col(/click/), col(/impression/), col(/ctr/), col(/position/)];
  return rows.slice(1).map((r) => {
    const o = { clicks: num(r[c]), impressions: num(r[i]), ctr: ct >= 0 ? num(r[ct]) : 0, position: p >= 0 ? num(r[p]) : 0 };
    o[key] = key === "path" ? toPath(r[0]) : r[0].trim().toLowerCase();
    if (!o.ctr && o.impressions) o.ctr = o.clicks / o.impressions;
    return o;
  });
}

/** No credentials: if the newest data/gsc/<date>/ folder has manual exports but no summary, build one. */
function manualFallback(log) {
  if (!existsSync(GSC_DIR)) { log("no manual exports in data/gsc/ either; the release gates will skip (they log it)."); return null; }
  const dirs = readdirSync(GSC_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const d = dirs.at(-1);
  if (!d) { log("no manual exports in data/gsc/ either; the release gates will skip (they log it)."); return null; }
  const dir = join(GSC_DIR, d);
  if (existsSync(join(dir, "summary.json"))) { log(`using the existing data in ${dir}/summary.json`); return readJson(join(dir, "summary.json"), null); }
  if (!existsSync(join(dir, "pages.csv"))) { log(`${dir} has no pages.csv export; nothing to read`); return null; }
  const pages = readExport(join(dir, "pages.csv"), "path");
  const queries = existsSync(join(dir, "queries.csv")) ? readExport(join(dir, "queries.csv"), "query") : [];
  const endDate = d, startDate = addDays(d, -27);
  const s = buildSummary({ endDate, startDate, prevStartDate: addDays(startDate, -28), prevEndDate: addDays(startDate, -1), pages, queries, inspection: previousSummary(d)?.inspection ?? {} });
  s.source = "manual export";
  writeJson(join(dir, "summary.json"), s);
  log(`built ${dir}/summary.json from the manual export (${pages.length} pages, ${queries.length} queries; no previous period, countries or inspection)`);
  return s;
}

export async function pullGsc({ log = console.log, inspectPages = true } = {}) {
  let key;
  try { key = loadCredentials(); } catch (e) { log(`Search Console: ${e.message}`); key = null; }
  const property = process.env.GSC_PROPERTY?.trim();
  if (!key || !property) {
    log(`Search Console: ${!key ? "GSC_CREDENTIALS" : ""}${!key && !property ? " and " : ""}${!property ? "GSC_PROPERTY" : ""} not set; falling back to manual exports in data/gsc/.`);
    return manualFallback(log);
  }
  const day = today();
  const endDate = addDays(day, -3), startDate = addDays(endDate, -27);
  const prevEndDate = addDays(startDate, -1), prevStartDate = addDays(prevEndDate, -27);
  const token = await accessToken(key);
  const dir = join(GSC_DIR, day);
  mkdirSync(dir, { recursive: true });
  const cur = { startDate, endDate }, prev = { startDate: prevStartDate, endDate: prevEndDate };
  const q = async (range, dimensions) => (await searchAnalytics(token, property, { ...range, dimensions })).map((r) => {
    const o = { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position };
    dimensions.forEach((d, i) => { o[d === "page" ? "path" : d] = d === "page" ? toPath(r.keys[i]) : r.keys[i]; });
    return o;
  });
  log(`Search Console ${property}: ${startDate} to ${endDate} (previous ${prevStartDate} to ${prevEndDate})`);
  const [queries, pages, queryPages, pageCountry, prevQueries, prevPages, tot, prevTot] = await Promise.all([
    q(cur, ["query"]), q(cur, ["page"]), q(cur, ["query", "page"]), q(cur, ["page", "country"]),
    q(prev, ["query"]), q(prev, ["page"]), q(cur, []), q(prev, []),
  ]);
  const csv = (name, header, rows, fields) => writeFileSync(join(dir, name), toCsv(header, rows.map((r) => fields.map((f) => r[f]))));
  const m = ["clicks", "impressions", "ctr", "position"];
  csv("queries.csv", ["query", ...m], queries, ["query", ...m]);
  csv("pages.csv", ["page", ...m], pages.map((r) => ({ ...r, page: `${SITE}${r.path}` })), ["page", ...m]);
  csv("query-page.csv", ["query", "page", ...m], queryPages.map((r) => ({ ...r, page: `${SITE}${r.path}` })), ["query", "page", ...m]);
  csv("page-country.csv", ["page", "country", ...m], pageCountry.map((r) => ({ ...r, page: `${SITE}${r.path}` })), ["page", "country", ...m]);
  csv("prev-queries.csv", ["query", ...m], prevQueries, ["query", ...m]);
  csv("prev-pages.csv", ["page", ...m], prevPages.map((r) => ({ ...r, page: `${SITE}${r.path}` })), ["page", ...m]);
  log(`  ${queries.length} queries, ${pages.length} pages, ${queryPages.length} query+page rows, ${pageCountry.length} page+country rows`);

  const inspection = { ...(previousSummary(day)?.inspection ?? {}) };
  if (inspectPages) {
    const paths = recentlyReleased(day);
    if (paths.length) {
      log(`  URL Inspection: ${paths.length} page(s) released in the last 30 days`);
      Object.assign(inspection, await inspect(token, property, paths, log));
    } else log("  URL Inspection: no pages released in the last 30 days (data/release/waves.json)");
  }
  const t = (rows) => (rows[0] ? { clicks: rows[0].clicks, impressions: rows[0].impressions, ctr: round(rows[0].ctr), position: round(rows[0].position, 2) } : undefined);
  const summary = buildSummary({ endDate, startDate, prevStartDate, prevEndDate, pages, prevPages, queries, prevQueries, queryPages, pageCountry, totals: t(tot), prevTotals: t(prevTot), inspection });
  summary.property = property;
  writeJson(join(dir, "summary.json"), summary);
  log(`  saved ${dir}/summary.json (clicks ${summary.totals.clicks}, impressions ${summary.totals.impressions})`);
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  pullGsc({ inspectPages: !process.argv.includes("--no-inspect") }).catch((e) => { console.error(`Search Console pull failed: ${e.message}`); process.exit(1); });
}
