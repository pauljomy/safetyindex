// Post-build checks on dist/. Fails the build on:
//  - SEO basics: title (≤60, unique), meta description (≤155), canonical, exactly one H1
//  - the answer-first summary on content pages (posts)
//  - hreflang: each set lists the page itself (matching its canonical), has an x-default,
//    is reciprocal across languages, and <html lang> matches the page's own language
//  - invalid JSON-LD, missing BreadcrumbList on inner pages
//  - orphan pages (no inbound internal link) and broken internal links
//  - missing generated files (robots.txt, llms.txt, sitemap, RSS, markdown mirrors)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
import { site as siteCfg } from "../src/config/site.mjs";
const site = siteCfg.url;
if (!existsSync(dist)) { console.error("✖ dist/ not found. Run `astro build` first."); process.exit(1); }

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p); else yield p;
  }
}

const toPath = (file) => {
  const rel = relative(dist, file).replace(/\\/g, "/").replace(/\.html$/, "");
  return rel === "index" ? "/" : `/${rel}`;
};
const fileFor = (path) => {
  if (path === "/") return join(dist, "index.html");
  const direct = join(dist, path.slice(1));
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  return join(dist, `${path.slice(1)}.html`);
};

const pages = [...walk(dist)].filter((f) => f.endsWith(".html")).map((f) => ({ file: f, path: toPath(f), html: readFileSync(f, "utf8") }));
const errors = [];
const err = (path, msg) => errors.push(`${path}: ${msg}`);
const attr = (html, re) => html.match(re)?.[1];
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const titles = new Map();
const hreflangs = new Map(); // path -> [[hreflang, href], …]
const inbound = new Map(pages.map((p) => [p.path, 0]));
const isContent = (p) => /<meta property="og:type" content="article"/.test(p.html);

for (const p of pages) {
  const { html, path } = p;
  const is404 = path === "/404";

  const title = attr(html, /<title>([^<]*)<\/title>/);
  if (!title) err(path, "missing <title>");
  else {
    const t = decode(title);
    if (t.length > 60) err(path, `title is ${t.length} chars (max 60): "${t}"`);
    if (titles.has(t)) err(path, `duplicate title also used by ${titles.get(t)}`);
    titles.set(t, path);
  }
  const desc = attr(html, /<meta name="description" content="([^"]*)"/);
  if (!desc) err(path, "missing meta description");
  else if (decode(desc).length > 155) err(path, `meta description is ${decode(desc).length} chars (max 155)`);
  const canonical = attr(html, /<link rel="canonical" href="([^"]*)"/);
  if (!canonical) err(path, "missing canonical");
  else if (!is404 && canonical !== `${site}${path === "/" ? "/" : path}`) err(path, `canonical ${canonical} does not match the page URL`);
  if (!/<meta name="robots" content="[^"]+"/.test(html)) err(path, "missing robots meta");
  const alts = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]);
  hreflangs.set(path, alts);
  const htmlLang = attr(html, /<html lang="([^"]+)"/);
  const own = alts.find(([, href]) => href === canonical);
  if (alts.length && canonical && !is404) {
    if (!own || own[0] === "x-default") err(path, "hreflang set does not list the page itself with its own language and canonical URL");
    else if (own[0] !== htmlLang) err(path, `<html lang="${htmlLang}"> does not match its hreflang "${own[0]}"`);
    if (!alts.some(([l]) => l === "x-default")) err(path, "hreflang set has no x-default");
    const codes = alts.map(([l]) => l);
    if (new Set(codes).size !== codes.length) err(path, "hreflang set lists a language twice");
  }
  if (!/<meta property="og:image" content="[^"]+"/.test(html)) err(path, "missing og:image");
  else {
    const og = attr(html, /<meta property="og:image" content="([^"]+)"/).replace(site, "");
    if (!existsSync(join(dist, og.slice(1)))) err(path, `og:image ${og} was not generated`);
  }
  const h1s = html.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1s !== 1) err(path, `has ${h1s} <h1> elements (needs exactly 1)`);
  if (isContent(p) && !/data-answer/.test(html)) err(path, "content page is missing the answer-first summary");

  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!blocks.length && !is404) err(path, "no JSON-LD");
  const types = [];
  for (const b of blocks) {
    try {
      const data = JSON.parse(b);
      if (data["@context"] !== "https://schema.org") err(path, "JSON-LD without @context https://schema.org");
      if (!data["@type"]) err(path, "JSON-LD without @type");
      types.push(data["@type"]);
      if (data["@type"] === "FAQPage" && !data.mainEntity?.length) err(path, "FAQPage with no questions");
      if (data["@type"] === "BlogPosting" && !(data.datePublished && data.dateModified && data.author && data.image)) err(path, "BlogPosting missing dates, author or image");
    } catch (e) {
      err(path, `invalid JSON-LD: ${e.message}`);
    }
  }
  if (!/^\/((fr|de))?$/.test(path) && !is404 && !types.includes("BreadcrumbList")) err(path, "inner page without BreadcrumbList");
  if (types.includes("BlogPosting") && !types.includes("FAQPage")) err(path, "post without FAQPage schema");
  if (types.includes("HowTo")) err(path, "HowTo schema: Google removed its rich results in 2023");

  // Internal links: count inbound, catch broken ones.
  for (const [, raw] of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    const href = decode(raw);
    if (!href.startsWith("/") && !href.startsWith(site)) continue;
    const target = (href.startsWith(site) ? href.slice(site.length) || "/" : href).split(/[?#]/)[0] || "/";
    const file = fileFor(target);
    if (!existsSync(file)) { err(path, `broken internal link to ${target}`); continue; }
    if (target !== path && inbound.has(target)) inbound.set(target, inbound.get(target) + 1);
  }
}

// Every alternate must exist and link back (return tags).
for (const [path, alts] of hreflangs) {
  for (const [lang, href] of alts) {
    if (lang === "x-default" || !href.startsWith(site)) continue;
    const target = href.slice(site.length) || "/";
    if (target === path) continue;
    if (!pages.some((p) => p.path === target)) { err(path, `hreflang ${lang} points to ${target}, which was not built`); continue; }
    const back = hreflangs.get(target) ?? [];
    if (!back.some(([, h]) => h === `${site}${path === "/" ? "/" : path}`)) err(path, `hreflang ${lang} (${target}) has no return tag to this page`);
  }
}

for (const [path, n] of inbound) {
  if (path !== "/" && path !== "/404" && n === 0) err(path, "orphan page: no other page links to it");
}

// hreflang clusters: a noindexed page is never in one, and never points at one.
const noindexed = new Set(pages.filter((p) => /<meta name="robots" content="noindex/.test(p.html)).map((p) => p.path));
for (const [path, alts] of hreflangs) {
  const others = alts.filter(([l, h]) => l !== "x-default" && h !== `${site}${path === "/" ? "/" : path}`);
  if (noindexed.has(path) && others.length) err(path, "noindexed page is in an hreflang cluster");
  for (const [l, h] of others) if (noindexed.has(h.slice(site.length) || "/")) err(path, `hreflang ${l} points at a noindexed page`);
}

// Generated files.
for (const f of ["robots.txt", "llms.txt", "llms-full.txt", "sitemap-index.xml", "rss.xml", "icon.svg", "favicon.ico", "og-default.png"]) {
  if (!existsSync(join(dist, f))) err(`/${f}`, "was not generated");
}
const robots = existsSync(join(dist, "robots.txt")) ? readFileSync(join(dist, "robots.txt"), "utf8") : "";
if (!robots.includes(`Sitemap: ${site}/sitemap-index.xml`)) err("/robots.txt", "does not link the sitemap index");
for (const bot of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot"]) {
  if (!robots.includes(`User-agent: ${bot}`)) err("/robots.txt", `does not name ${bot}`);
}
const sitemaps = [...walk(dist)].filter((f) => /sitemap-[a-z]+-[a-z]+(-\d+)?\.xml$/.test(f)).map((f) => readFileSync(f, "utf8")).join("");
if (!sitemaps.includes("<lastmod>")) err("/sitemap", "has no lastmod values");
const full = existsSync(join(dist, "llms-full.txt")) ? readFileSync(join(dist, "llms-full.txt"), "utf8") : "";
for (const [, md] of full.matchAll(new RegExp(`Markdown: ${site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\/\\S+\\.md)`, "g"))) {
  if (!existsSync(join(dist, md.slice(1)))) err(md, "markdown mirror listed in llms-full.txt was not generated");
}

// Section 17 checks (rules, writing, links, topics, sitemaps, images): scripts/checks/site.mjs.
const { runSiteChecks } = await import("./checks/site.mjs");
const more = runSiteChecks({ pages, dist, site });
errors.push(...more.errors);
if (more.warnings.length) console.warn(`⚠ ${more.warnings.length} warning(s) on pages published before the build (added to data/rewrite-queue.json):\n  ${more.warnings.join("\n  ")}`);
if (more.fewLinks.length) console.log(`ℹ ${more.fewLinks.length} page(s) with fewer than 3 contextual links (allowed while they link their hub and every eligible target): ${more.fewLinks.join(", ")}`);

if (errors.length) {
  console.error(`✖ Build checks failed (${errors.length}):\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
const counts = [...inbound.values()].filter((n) => n > 0).length;
console.log(`✔ SEO & schema: ${pages.length} pages have a title, description, canonical, one H1 and valid JSON-LD`);
console.log(`✔ Links: no orphan pages (${counts} pages have inbound links), no broken internal links`);
console.log("✔ Generated: robots.txt, llms.txt, llms-full.txt, sitemap, RSS and markdown mirrors");
