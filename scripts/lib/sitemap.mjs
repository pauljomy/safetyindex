// Sitemap filter and serialize for @astrojs/sitemap. Both run after the pages
// are written, so each URL's lastmod, noindex and language alternates are read
// from the page's own head (og:updated_time, robots, hreflang links): one
// source for the visible date, dateModified, hreflang and the sitemap.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../../dist/", import.meta.url));

function htmlFor(url) {
  const path = new URL(url).pathname.replace(/\/$/, "");
  const file = `${dist}${path === "" ? "index" : path.slice(1)}.html`;
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}
const meta = (html, attr, key) => html.match(new RegExp(`<meta[^>]+${attr}="${key}"[^>]+content="([^"]*)"`))?.[1];

export function sitemapFilter(url) {
  return !/noindex/.test(meta(htmlFor(url), "name", "robots") ?? "");
}

/** Bing and others may read priority; Google ignores it. */
export function priorityFor(rawPathname) {
  const pathname = rawPathname.replace(/^\/(fr|de)(?=\/|$)/, "") || "/";
  if (pathname === "/") return 1.0;
  if (pathname === "/blog") return 0.9;
  if (pathname.startsWith("/blog/")) return 0.8;
  if (/^\/(category|tags)(\/|$)/.test(pathname)) return 0.5;
  if (/^\/(about|privacy|terms|contact)$/.test(pathname)) return 0.3;
  return 0.7;
}

export function sitemapSerialize(item) {
  const html = htmlFor(item.url);
  const updated = meta(html, "property", "og:updated_time");
  const links = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)]
    .map((m) => ({ lang: m[1], url: m[2] }));
  return {
    ...item,
    lastmod: updated ? new Date(updated).toISOString() : undefined,
    priority: priorityFor(new URL(item.url).pathname),
    ...(links.length > 1 && { links }),
  };
}
