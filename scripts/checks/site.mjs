// Build checks from brief section 17 that run on the built site (dist/) and the content files.
// Pages published before the build (posts without `generatedOn`) report new-check failures as
// warnings and are added to the rewrite queue (data/rewrite-queue.json); everything else fails.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { config } from "../lib/config.mjs";
import { checkWriting } from "./writing.mjs";
import { checkClauses, checkNumbers, numbersIn } from "./facts.mjs";
import { similarity } from "../style/patterns.mjs";
import { sectionNumbers } from "../data/ecfr-numbers.mjs";
import { withDisplay } from "../engine/common.mjs";
import { subIndustries } from "../data/naics.mjs";

const POSTS = "src/content/posts";
const fm = (md) => YAML.parse(md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "") ?? {};
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const article = (html) => html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? "";

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p); else yield p;
  }
}

/** Content files with their URL path, market and whether they predate the build. */
export function loadContent() {
  const out = [];
  for (const file of walk(POSTS)) {
    if (!file.endsWith(".md")) continue;
    const rel = file.slice(POSTS.length + 1).replace(/\\/g, "/").replace(/\.md$/, "");
    const md = readFileSync(file, "utf8");
    const d = fm(md);
    const [dir, slug] = rel.includes("/") ? rel.split("/") : ["", rel];
    const market = dir === "" ? "us" : dir;
    const path = dir === "" ? `/blog/${slug}` : ["fr", "de"].includes(dir) ? `/${dir}/blog/${slug}` : `/${dir}/guides/${slug}`;
    out.push({ kind: "guide", file, path, market, lang: ["fr", "de"].includes(dir) ? dir : "en", data: d, body: md.replace(/^---\n[\s\S]*?\n---\n/, ""), legacy: !d.generatedOn });
  }
  for (const [kind, dir, prefix] of [["standard", "src/content/standards", "/us/standards/"], ["industry", "src/content/industries", "/us/industries/"]]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
      out.push({ kind, file: join(dir, f), path: prefix + f.replace(/\.json$/, ""), market: "us", lang: "en", data, legacy: false });
    }
  }
  return out;
}

/** The prose of a JSON page as markdown, for the writing checks. */
function jsonProse(c) {
  const d = c.data;
  if (c.kind === "standard")
    return [d.enforcementSummary, `## What does ${d.section} require?\n\n${d.requirementsIntro}`, ...d.requirements.map((g) => `### ${g.heading}\n\n${g.intro}\n\n${g.items.map((i) => `- ${i.text}`).join("\n")}`), `## Checklist\n\n${d.checklistIntro}`].join("\n\n");
  return [d.patternsSummary, `## Penalties\n\n${d.penaltiesSummary}`, ...(d.standardNotes ?? []).map((n) => n.note)].join("\n\n");
}

export function runSiteChecks({ pages, dist, site }) {
  const errors = [];
  const warnings = [];
  const rewrite = new Map();
  const content = loadContent();
  const byPath = new Map(content.map((c) => [c.path, c]));
  const built = new Map(pages.map((p) => [p.path, p]));
  const coverUsers = new Map(); // cover file → pages showing it (every page has its own photo)
  const report = (path, msg) => {
    const c = byPath.get(path);
    if (c?.legacy) { warnings.push(`${path}: ${msg}`); (rewrite.get(path) ?? rewrite.set(path, []).get(path)).push(msg); }
    else errors.push(`${path}: ${msg}`);
  };
  const noindex = (p) => /<meta name="robots" content="noindex/.test(p.html);

  // --- conform.so and placeholder store values, anywhere in dist/ (downloads are checked by verify.mjs).
  for (const f of walk(dist)) {
    if (!/\.(html|txt|xml|md|json|js|css|csv)$/.test(f)) continue;
    const t = readFileSync(f, "utf8");
    if (/conform\.so/i.test(t)) errors.push(`${f.slice(dist.length)}: contains conform.so`);
    if (/PLACEHOLDER_/.test(t)) errors.push(`${f.slice(dist.length)}: contains a PLACEHOLDER_ store value (allowed only in scripts/config.yml)`);
  }

  // --- URLs: lowercase only.
  for (const p of pages) if (/[A-Z]/.test(p.path)) errors.push(`${p.path}: URL has capital letters`);

  // --- per-page checks on the built HTML.
  const hubPaths = new Set(["/blog", "/fr/blog", "/de/blog", "/us/guides", "/us/standards", "/us/industries", "/us/reports", "/uk/guides", "/au/guides", "/ca/guides", "/nz/guides", "/us/osha-penalties"]);
  const linksOf = (html) => [...html.matchAll(/<a\b[^>]*\bhref="([^"#?]+)[^"]*"/g)].map((m) => m[1].replace(site, "") || "/").filter((h) => h.startsWith("/"));
  const contentPages = pages.filter((p) => byPath.has(p.path) || /^\/us\/reports\/|^\/us\/osha-penalties$/.test(p.path));
  for (const p of pages) {
    const { html, path } = p;
    if (path === "/404") continue;
    const size = Buffer.byteLength(html);
    if (size > 1024 * 1024) errors.push(`${path}: HTML is ${(size / 1024).toFixed(0)} KB (max 1 MB)`);
    const h1 = html.search(/<h1[\s>]/);
    if (h1 > 100 * 1024) errors.push(`${path}: the H1 starts after the first 100 KB of HTML`);
    if (!/data-as-of/.test(html)) report(path, "missing the data-as-of date");
    if (!/data-disclaimer/.test(html)) report(path, "missing the not-legal-advice note");
    // Every image needs an alt attribute; decorative thumbnails and icons use alt="" (their card title follows).
    // A page's cover image (inside <figure>) needs real alt text.
    for (const m of html.matchAll(/<img\b[^>]*>/g)) {
      const tag = m[0];
      const src = tag.match(/\bsrc="([^"]+)"/)?.[1] ?? "";
      if (/^https?:\/\//.test(src) && !src.startsWith(site)) errors.push(`${path}: image from outside the repo (${src})`);
      if (!/\balt(?:=|[\s>])/.test(tag)) { errors.push(`${path}: image without an alt attribute (${src})`); continue; }
      const before = html.slice(Math.max(0, m.index - 300), m.index);
      const isCover = /<figure\b(?![\s\S]*<\/figure>)/.test(before);
      if (isCover && /\balt(?:=""|[\s>])/.test(tag)) errors.push(`${path}: cover image without alt text (${src})`);
      if (isCover) { const file = src.replace(/^.*\//, "").split(".")[0]; coverUsers.set(file, [...(coverUsers.get(file) ?? []), path]); }
    }
    // JSON-LD headline/name matches the page.
    const h1Text = strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "").trim();
    for (const [, b] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let d; try { d = JSON.parse(b); } catch { continue; }
      const name = d["@type"] === "BlogPosting" ? d.headline : d["@type"] === "WebPage" ? d.name : null;
      if (name && name.trim() !== h1Text) errors.push(`${path}: JSON-LD ${d["@type"]} name "${name}" doesn't match the H1 "${h1Text}"`);
      const modified = html.match(/<meta property="article:modified_time" content="([^"]+)"/)?.[1];
      if (d.dateModified && modified && d.dateModified !== modified) errors.push(`${path}: JSON-LD dateModified ${d.dateModified} doesn't match the page (${modified})`);
    }
  }

  // --- content pages: sources, attribution, links.
  const live = contentPages.filter((p) => !noindex(p));
  const stdPaths = new Map(); // section → path
  for (const c of content) if (c.kind === "standard" && built.has(c.path) && !noindex(built.get(c.path))) stdPaths.set(c.data.section, c.path);
  const inbound = new Map();
  for (const p of pages) for (const h of linksOf(p.html)) if (h !== p.path) (inbound.get(h) ?? inbound.set(h, new Set()).get(h)).add(p.path);
  const fewLinks = [];
  for (const p of live) {
    const { path, html } = p;
    const c = byPath.get(path);
    const art = article(html);
    // Hub linking to the page.
    if (![...(inbound.get(path) ?? [])].some((h) => hubPaths.has(h))) report(path, "no hub page links to it");
    // Sources: French and German pages must cite their own country.
    const ext = [...art.matchAll(/<a\b[^>]*href="(https?:\/\/[^"]+)"/g)].map((m) => { try { return new URL(m[1]).hostname; } catch { return ""; } }).filter((h) => h && !h.endsWith(new URL(site).hostname));
    if (c && (c.market === "fr" || c.market === "de") && ext.length) {
      const local = ext.filter((h) => (c.market === "fr" ? /\.fr$|gouv\.fr$|europa\.eu$/ : /\.de$|europa\.eu$/).test(h));
      if (!local.length) report(path, `cites only foreign sources (${[...new Set(ext)].slice(0, 4).join(", ")}); French and German pages need their own country's sources`);
    }
    // Required licence attribution.
    const licences = YAML.parse(readFileSync("scripts/sources/licences.yml", "utf8"));
    for (const l of licences) {
      if (!l.attribution) continue;
      if (ext.some((h) => l.domains.some((d) => h === d || h.endsWith(`.${d}`) || h.replace(/^www\./, "") === d)) && !/data-attribution/.test(html)) report(path, `cites ${l.name} but the licence attribution line is missing`);
    }
    // Contextual internal links (inside the article and the related block; not nav, breadcrumbs, footer, downloads).
    const related = html.match(/<section[^>]*data-related[\s\S]*?<\/section>/)?.[0] ?? "";
    const ctx = new Set(linksOf(art + related).filter((h) => h !== path && !h.startsWith("/downloads/") && !h.startsWith("/get-app")));
    if (ctx.size < 3) {
      const hub = c?.kind === "standard" ? "/us/standards" : c?.kind === "industry" ? "/us/industries" : null;
      fewLinks.push(path);
      if (hub && !ctx.has(hub) && !(inbound.get(path)?.has(hub))) report(path, `only ${ctx.size} contextual internal links (needs 3, or a link to its hub and every eligible target)`);
    }
    // A mention of a standard with its own live page must be linked (US pages).
    if (path.startsWith("/blog/") || path.startsWith("/us/")) {
      const text = art.replace(/<(a|h[1-6]|code|pre)\b[\s\S]*?<\/\1>/gi, " ");
      for (const [section, sp] of stdPaths) {
        if (sp === path) continue;
        const re = new RegExp(`\\b${section.replace(".", "\\.")}(?![\\d.])`);
        if (re.test(strip(text)) && !linksOf(html).includes(sp)) report(path, `mentions ${section} but doesn't link its standard page ${sp}`);
      }
    }
  }
  // Standard pages link back to every live guide that cites them.
  for (const c of content.filter((c) => c.kind === "guide" && c.market === "us" && built.has(c.path) && !noindex(built.get(c.path)))) {
    for (const [section, sp] of stdPaths) {
      if (new RegExp(`\\b${section.replace(".", "\\.")}(?![\\d.])`).test(c.body) && !linksOf(built.get(sp).html).includes(c.path)) errors.push(`${sp}: doesn't link back to ${c.path}, which cites ${section}`);
    }
  }

  // --- clicks from home (indexable pages within 3 clicks).
  const depth = new Map([["/", 0]]);
  const queue = ["/"];
  while (queue.length) {
    const cur = queue.shift();
    const p = built.get(cur);
    if (!p || depth.get(cur) >= 3) continue;
    for (const h of linksOf(p.html)) if (built.has(h) && !depth.has(h)) { depth.set(h, depth.get(cur) + 1); queue.push(h); }
  }
  for (const p of pages) if (!noindex(p) && p.path !== "/404" && !depth.has(p.path)) report(p.path, "more than 3 clicks from the home page");

  // --- writing and facts on content files (generated pages fail; legacy pages warn).
  for (const c of content) {
    if (!built.has(c.path) || c.data.noindex) continue;
    if (c.kind === "guide") {
      for (const e of checkWriting({ body: c.body, faq: c.data.faq ?? [], lang: c.lang, guide: true, opening: c.data.summary })) report(c.path, e);
      if (!c.legacy && c.data.checkPass !== "passed") errors.push(`${c.path}: hasn't passed the independent checking pass`);
      if (c.market === "us") for (const e of checkClauses(c.body, { market: "us" })) report(c.path, e);
      if (!c.legacy) {
        if (!c.data.keywordSource || !c.data.goNoGo) errors.push(`${c.path}: no recorded keyword source or go/no-go result`);
        // A rewrite of a URL that existed before (date earlier than generatedOn) isn't held to the new-page thresholds.
        const rewriteOfExisting = c.data.date && c.data.generatedOn && new Date(c.data.date) < new Date(c.data.generatedOn);
        if (["OpenSEO", "Search Console"].includes(c.data.keywordSource) && !rewriteOfExisting) {
          const t = config.guide_thresholds[c.market] ?? config.guide_thresholds.us;
          if (!(c.data.clusterVolume >= t.volume) || !(c.data.kd < t.kd_under)) errors.push(`${c.path}: cluster volume ${c.data.clusterVolume} / KD ${c.data.kd} don't meet the ${c.market} threshold (${t.volume} / under ${t.kd_under})`);
        }
      }
    } else {
      const prose = jsonProse(c);
      const opening = c.data.opening;
      for (const e of checkWriting({ body: prose, faq: c.data.faq ?? [], lang: "en", opening })) report(c.path, e);
      if (c.data.checkPass !== "passed") errors.push(`${c.path}: hasn't passed the independent checking pass`);
      // Keyword rule for standard and industry pages (brief section 6): measurable cluster volume and a main keyword under the KD limit.
      const kt = c.kind === "standard" ? config.standard_page_keywords : config.industry_page_keywords;
      if (c.data.keywordSource !== "enforcement data" && !(c.data.clusterVolume >= kt.volume && c.data.kd != null && c.data.kd < kt.kd_under)) errors.push(`${c.path}: keyword "${c.data.keyword}" (cluster volume ${c.data.clusterVolume}, KD ${c.data.kd}) doesn't meet the rule (${kt.volume}+ / KD under ${kt.kd_under})`);
      // Same allowed numbers as when the page was written: stats with their display values, the NAICS code and its sub-industries.
      const allowed = numbersIn(withDisplay(c.data.stats));
      if (c.kind === "industry") { allowed.add(String(Number(c.data.naics))); for (const n of numbersIn(subIndustries(c.data.naics))) allowed.add(n); }
      for (const n of numbersIn({ cluster: c.data.cluster ?? [], penalties: config.osha_penalties })) allowed.add(n);
      if (c.data.section) for (const n of sectionNumbers(c.data.section)) allowed.add(n);
      if (c.kind === "industry") for (const st of c.data.stats.topStandards ?? []) for (const n of sectionNumbers(st.section)) allowed.add(n);
      const all = `${opening}\n\n${prose}\n\n${(c.data.faq ?? []).map((f) => f.answer).join("\n")}`;
      for (const e of checkNumbers(all, allowed)) report(c.path, e);
      for (const e of checkClauses(all, { market: "us", defaultSection: c.data.section })) report(c.path, e);
      for (const g of c.data.requirements ?? []) for (const it of g.items) for (const e of checkClauses(it.clause.startsWith("19") ? it.clause : `${c.data.section}${it.clause}`, { market: "us" })) report(c.path, e);
    }
  }

  // --- topics: types, English-market copies, similarity of market versions.
  const clusters = new Map();
  for (const c of content.filter((c) => c.kind === "guide" && !c.data.noindex)) {
    if (!c.data.topicType) report(c.path, "no topic type recorded");
    const key = c.data.translationOf ?? (c.market === "us" ? c.path.split("/").pop() : null);
    if (key) (clusters.get(key) ?? clusters.set(key, []).get(key)).push(c);
  }
  for (const [key, list] of clusters) {
    const english = list.filter((c) => ["us", "uk", "au", "ca", "nz"].includes(c.market));
    if (english.length > 1 && english.some((c) => c.data.topicType !== "regional")) errors.push(`topic ${key}: not regional but has copies in ${english.map((c) => c.market).join(", ")}`);
    for (let i = 0; i < english.length; i++) for (let j = i + 1; j < english.length; j++) {
      const s = similarity(english[i].body, english[j].body);
      if (s > config.similarity_max) errors.push(`topic ${key}: ${english[i].path} and ${english[j].path} are ${(s * 100).toFixed(0)}% similar (max ${config.similarity_max * 100}%)`);
    }
  }

  // --- sitemaps list only live, indexable, self-canonical pages.
  for (const f of walk(dist)) {
    if (!/sitemap.*\.xml$/.test(f) || /sitemap-index|sitemap_index/.test(f)) continue;
    for (const [, loc] of readFileSync(f, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)) {
      if (/\.xml$/.test(loc)) continue;
      const path = loc.replace(site, "") || "/";
      const p = built.get(path);
      if (!p) { errors.push(`${f.slice(dist.length)}: lists ${path}, which was not built`); continue; }
      if (noindex(p)) errors.push(`${f.slice(dist.length)}: lists noindexed ${path}`);
      const canon = p.html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      if (canon !== loc) errors.push(`${f.slice(dist.length)}: lists ${path}, whose canonical points elsewhere`);
    }
  }

  // --- images: no two pages share a cover photo.
  for (const [file, users] of coverUsers) if (users.length > 1) errors.push(`${users.join(", ")}: share one cover image (${file}); every page needs its own`);

  // --- images: cover files carry the IPTC AI label.
  for (const dir of ["src/assets/covers", "src/content/posts/images"]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".webp"))) if (!readFileSync(join(dir, f)).includes("trainedAlgorithmicMedia")) errors.push(`${dir}/${f}: missing the IPTC trainedAlgorithmicMedia label`);
  }

  // Entries added by the maintenance scripts (rule changes, quarterly audit) carry `from` and stay until the engine rewrites the page.
  const kept = (existsSync("data/rewrite-queue.json") ? JSON.parse(readFileSync("data/rewrite-queue.json", "utf8")) : []).filter((e) => e.from);
  writeFileSync("data/rewrite-queue.json", `${JSON.stringify([...[...rewrite].map(([path, problems]) => ({ path, problems })), ...kept], null, 2)}\n`);
  return { errors, warnings, fewLinks };
}
