// IndexNow (Bing, Yandex and others; not Google): after a deploy, pings the URLs that are new or
// whose lastmod changed since the last ping, read from the built sitemaps (so only live, indexable
// pages). State: data/indexnow-state.json (committed, so the weekly Action remembers it).
//   npm run indexnow [-- --dry-run]
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { site } from "../src/config/site.mjs";
import { config } from "./lib/config.mjs";

const STATE = "data/indexnow-state.json";
const dry = process.argv.includes("--dry-run");
if (!config.indexnow_key) { console.log("No indexnow_key in scripts/config.yml; skipping."); process.exit(0); }
if (!existsSync("dist/sitemap-index.xml")) { console.error("Build first (dist/ has no sitemaps)."); process.exit(1); }

const now = {};
for (const f of readdirSync("dist").filter((f) => /^sitemap-.+\.xml$/.test(f) && f !== "sitemap-index.xml")) {
  for (const [, loc, lastmod] of readFileSync(`dist/${f}`, "utf8").matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)) now[loc] = lastmod ?? "";
}
const before = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const changed = Object.keys(now).filter((u) => before[u] !== now[u]);
console.log(`${changed.length} new or changed URL(s) of ${Object.keys(now).length}`);
if (!changed.length || dry) { if (dry) console.log(changed.slice(0, 50).join("\n")); process.exit(0); }
const host = new URL(site.url).host;
for (let i = 0; i < changed.length; i += 10000) {
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key: config.indexnow_key, keyLocation: `${site.url}/${config.indexnow_key}.txt`, urlList: changed.slice(i, i + 10000) }),
  });
  console.log(`IndexNow: HTTP ${res.status} for ${Math.min(10000, changed.length - i)} URL(s)`);
  if (!res.ok && res.status !== 202) process.exit(1);
}
writeFileSync(STATE, `${JSON.stringify(now, null, 0)}\n`);
