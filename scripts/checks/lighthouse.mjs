// Lighthouse (mobile) on a sample of built pages across page types (brief section 13): each page runs
// `runs_per_page` times and the median counts. Fails if the median performance is under min_performance
// or accessibility under min_accessibility, or a page isn't mobile-friendly (viewport and content width
// audits). Performance from 80 to 89 is a warning. Needs Chrome: CHROME_PATH, or a chrome on the PATH.
//   npm run lighthouse
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { config } from "../lib/config.mjs";

const L = config.lighthouse;
const dist = "dist";
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain" };

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const local = `${process.env.HOME}/.cache/si-chrome`;
  if (existsSync(local)) {
    const stack = [local];
    while (stack.length) { const d = stack.pop(); for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) stack.push(p); else if (e === "chrome-headless-shell" || e === "chrome") return p; } }
  }
  for (const c of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) { try { return execFileSync("which", [c]).toString().trim(); } catch {} }
  return null;
}

/** 10 pages across types: home, hubs, a standard, an industry, a report, guides in several markets. */
function sample(n) {
  const pick = [];
  const has = (p) => existsSync(join(dist, p === "/" ? "index.html" : `${p.slice(1)}.html`));
  const first = (dir) => { const d = join(dist, dir); if (!existsSync(d)) return null; const f = readdirSync(d).find((x) => x.endsWith(".html")); return f ? `/${dir}/${f.replace(/\.html$/, "")}` : null; };
  for (const p of ["/", "/us/standards", first("us/standards"), first("us/industries"), first("us/reports"), "/us/osha-penalties", first("blog"), first("fr/blog"), first("de/blog"), first("uk/guides"), "/blog", "/us"]) if (p && has(p) && !pick.includes(p)) pick.push(p);
  return pick.slice(0, n);
}

const chrome = findChrome();
if (!chrome) { console.warn("⚠ Lighthouse skipped: no Chrome found (set CHROME_PATH)."); process.exit(process.env.CI ? 1 : 0); }
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = join(dist, p);
  if (p === "/") f = join(dist, "index.html");
  else if (!existsSync(f) || statSync(f).isDirectory()) f = `${join(dist, p)}.html`;
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  // Compressed and cacheable like production (Cloudflare), so scores reflect what visitors get.
  const type = TYPES[extname(f)] ?? "application/octet-stream";
  const body = readFileSync(f);
  const headers = { "Content-Type": type, "Cache-Control": /\/_astro\//.test(f) ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate" };
  if (/text|javascript|json|svg|xml/.test(type) && /gzip/.test(req.headers["accept-encoding"] ?? "")) { res.writeHead(200, { ...headers, "Content-Encoding": "gzip" }); return res.end(gzipSync(body)); }
  res.writeHead(200, headers);
  res.end(body);
}).listen(0);
const port = server.address().port;
const lhBin = join("node_modules", ".bin", "lighthouse");
// Chrome is started here with a debugging port (chrome-launcher picks Windows paths under WSL).
const debugPort = 9300 + Math.floor(Math.random() * 500);
let browser;
async function startChrome() {
  browser?.kill();
  browser = spawn(chrome, ["--headless", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "si-lh-"))}`, "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json(); return; } catch { await new Promise((r) => setTimeout(r, 200)); } }
}
await startChrome();
async function lighthouse(url) {
  for (let attempt = 0; ; attempt++) {
    // Async on purpose: this process also serves dist/, so a synchronous call would block the server and hang.
    try { return JSON.parse((await execFileAsync(lhBin, [url, "--quiet", "--output=json", "--only-categories=performance,accessibility", `--port=${debugPort}`], { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 })).stdout); }
    catch (e) { if (attempt >= 1) throw e; await startChrome(); }
  }
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const results = [];
const errors = [];
for (const path of sample(Number(process.env.LH_PAGES) || L.sample_pages)) {
  const perf = [], a11y = [];
  let mobile = true;
  for (let i = 0; i < (Number(process.env.LH_RUNS) || L.runs_per_page); i++) {
    let r;
    try { r = await lighthouse(`http://localhost:${port}${path}`); } catch (e) { errors.push(`${path}: Lighthouse could not run (${String(e.message).split("\n")[0].slice(0, 120)})`); break; }
    perf.push(Math.round(r.categories.performance.score * 100));
    if (process.env.LH_VERBOSE) console.log(`    run ${i + 1}: ${path} perf ${perf.at(-1)}`);
    a11y.push(Math.round(r.categories.accessibility.score * 100));
    if (r.audits.viewport?.score === 0 || r.audits["content-width"]?.score === 0) mobile = false;
  }
  if (!perf.length) continue;
  const row = { path, performance: median(perf), accessibility: median(a11y), mobile };
  results.push(row);
  console.log(`  ${path}: performance ${row.performance}, accessibility ${row.accessibility}${mobile ? "" : ", NOT mobile-friendly"}`);
  if (row.performance < L.min_performance) errors.push(`${path}: median performance ${row.performance} (min ${L.min_performance})`);
  else if (row.performance < L.warn_performance_below) console.warn(`  ⚠ ${path}: performance ${row.performance} (80–89: fix when you can)`);
  if (row.accessibility < L.min_accessibility) errors.push(`${path}: median accessibility ${row.accessibility} (min ${L.min_accessibility})`);
  if (!mobile) errors.push(`${path}: not mobile-friendly`);
}
server.close();
browser.kill();
mkdirSync("data/checks", { recursive: true });
writeFileSync("data/checks/lighthouse.json", `${JSON.stringify({ date: new Date().toISOString().slice(0, 10), results }, null, 1)}\n`);
if (errors.length) { console.error(`✖ Lighthouse failed:\n  ${errors.join("\n  ")}`); process.exit(1); }
console.log(`✔ Lighthouse: ${results.length} pages, medians within limits`);
