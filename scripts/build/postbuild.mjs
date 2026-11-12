// Runs after `astro build`, before the checks (brief section 13):
//  - sitemaps: one per market and section (us-standards.xml, us-guides.xml, fr-guides.xml, …), split at
//    10,000 URLs, with a sitemap index at /sitemap-index.xml (listed in robots.txt). Only live, indexable
//    pages whose canonical points to themselves; lastmod = the page's last upgrade/rewrite or its release
//    date (og:updated_time); hreflang alternates from the page head;
//  - /_gone.json: retired URLs that answer 410 (data/gone.json, read by worker/index.js);
//  - the IndexNow key file.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { site } from "../../src/config/site.mjs";
import { config } from "../lib/config.mjs";

const dist = "dist";
const MAX = 10000;

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p); else yield p;
  }
}
const pathOf = (f) => { const r = relative(dist, f).replace(/\\/g, "/").replace(/\.html$/, ""); return r === "index" ? "/" : `/${r}`; };
const meta = (html, attr, key) => html.match(new RegExp(`<meta[^>]+${attr}="${key}"[^>]+content="([^"]*)"`))?.[1];

/** Sitemap name for a URL path: market + section. */
export function sitemapFor(path) {
  const m = path.match(/^\/(fr|de|uk|au|ca|nz)(\/|$)/)?.[1] ?? "us";
  const rest = m === "us" ? path : path.slice(m.length + 1) || "/";
  if (/^\/us\/standards\//.test(path)) return "us-standards";
  if (/^\/us\/industries\//.test(path)) return "us-industries";
  if (/^\/us\/(reports\/|osha-penalties)/.test(path)) return "us-reports";
  if (/^\/(blog|guides)\//.test(rest)) return `${m}-guides`;
  return `${m}-pages`;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const groups = new Map();
for (const f of walk(dist)) {
  if (!f.endsWith(".html")) continue;
  const path = pathOf(f);
  if (path === "/404" || path.startsWith("/pagefind")) continue;
  const html = readFileSync(f, "utf8");
  if (/<meta name="robots" content="noindex/.test(html)) continue;
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const loc = `${site.url}${path === "/" ? "/" : path}`;
  if (canonical !== loc) continue;
  const updated = meta(html, "property", "og:updated_time");
  const alts = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => ({ lang: m[1], url: m[2] }));
  const name = sitemapFor(path);
  (groups.get(name) ?? groups.set(name, []).get(name)).push({ loc, lastmod: updated ? updated.slice(0, 10) : undefined, alts: alts.length > 2 ? alts : [] });
}
const files = [];
for (const [name, urls] of [...groups].sort()) {
  urls.sort((a, b) => a.loc.localeCompare(b.loc));
  for (let i = 0; i * MAX < urls.length; i++) {
    const file = `sitemap-${name}${i ? `-${i + 1}` : ""}.xml`;
    const body = urls.slice(i * MAX, (i + 1) * MAX).map((u) => `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}${u.alts.map((a) => `<xhtml:link rel="alternate" hreflang="${a.lang}" href="${esc(a.url)}"/>`).join("")}</url>`).join("\n");
    writeFileSync(join(dist, file), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>\n`);
    const lastmod = urls.map((u) => u.lastmod).filter(Boolean).sort().at(-1);
    files.push({ file, lastmod, count: Math.min(MAX, urls.length - i * MAX) });
  }
}
writeFileSync(join(dist, "sitemap-index.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files.map((f) => `<sitemap><loc>${site.url}/${f.file}</loc>${f.lastmod ? `<lastmod>${f.lastmod}</lastmod>` : ""}</sitemap>`).join("\n")}\n</sitemapindex>\n`);
console.log(`✔ Sitemaps: ${files.map((f) => `${f.file} (${f.count})`).join(", ")}`);

// 410 list for the Worker.
writeFileSync(join(dist, "_gone.json"), existsSync("data/gone.json") ? readFileSync("data/gone.json", "utf8") : "[]\n");
// IndexNow key file.
if (config.indexnow_key) writeFileSync(join(dist, `${config.indexnow_key}.txt`), config.indexnow_key);
// Hosting limits (Cloudflare Workers static assets: 20,000 files per version on the free plan, 25 MiB per file).
let count = 0, biggest = 0;
for (const f of walk(dist)) { count++; biggest = Math.max(biggest, statSync(f).size); }
const limit = Number(process.env.CF_ASSET_LIMIT) || 20000;
console.log(`${count > limit * 0.8 ? "⚠" : "✔"} Hosting: ${count} files (Cloudflare static asset limit ${limit}${count > limit * 0.8 ? ": close to the limit" : ""}), largest ${(biggest / 1048576).toFixed(1)} MiB (limit 25 MiB)`);
