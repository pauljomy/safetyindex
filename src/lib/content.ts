// Collection access, URLs, markets, translations and the site index. Every list of
// pages (hubs, related blocks, generated links, footer, llms.txt, llms-full.txt,
// markdown mirrors, sitemaps) comes from here, and only released pages are returned.
import { getCollection, type CollectionEntry } from "astro:content";
import { categories } from "../data/categories.mjs";
import { entity, site } from "../config/site.mjs";
import { latest } from "./dates";
import { slugify } from "./slugify";
import { isReleased, releaseOf } from "./release";
import { defaultLang, inLang, langOf, langOfMarket, langs, marketMeta, marketOf, meta, stripLang, ui, type Lang, type Market } from "../i18n/ui";

export type Post = CollectionEntry<"posts">;
export type Standard = CollectionEntry<"standards">;
export type Industry = CollectionEntry<"industries">;
export type Report = CollectionEntry<"reports">;
export type Checklist = CollectionEntry<"checklists">;

const prefix = (lang: Lang) => (lang === defaultLang ? "" : `/${lang}`);
const englishDir = /^(uk|au|ca|nz)\//;

export const url = {
  post: (id: string) => {
    const m = id.match(englishDir);
    return m ? `/${m[1]}/guides/${id.slice(3)}` : `${prefix(langOf(id))}/blog/${stripLang(id)}`;
  },
  blog: (lang: Lang = defaultLang) => `${prefix(lang)}/blog`,
  category: (slug: string, lang: Lang = defaultLang) => `${prefix(lang)}/category/${slug}`,
  tags: (lang: Lang = defaultLang) => `${prefix(lang)}/tags`,
  tag: (slug: string, lang: Lang = defaultLang) => `${prefix(lang)}/tags/${slug}`,
  standard: (slug: string) => `/us/standards/${slug}`,
  industry: (slug: string) => `/us/industries/${slug}`,
  report: (slug: string) => `/us/reports/${slug}`,
  penalties: () => "/us/osha-penalties",
  /** Market home: /us, /uk, …; /fr and /de are the French and German home pages. */
  market: (m: Market) => (m === "fr" || m === "de" ? `/${m}` : `/${m}`),
  /** Guides hub of a market. US guides live in /blog; the hub listing them by topic is /us/guides. */
  guidesHub: (m: Market) => (m === "fr" || m === "de" ? `/${m}/blog` : `/${m}/guides`),
  standardsHub: () => "/us/standards",
  industriesHub: () => "/us/industries",
  reportsHub: () => "/us/reports",
};

/** A guide's market from its file path: posts/x.md → us, posts/fr/x.md → fr, posts/uk/x.md → uk. */
export const postMarket = (p: Post): Market => marketOf(p.id.includes("/") ? `/${p.id}` : p.id);
const stamp = (d: { date: Date; updated?: Date }) => latest(d.date, d.updated);
const live = <T extends { data: { noindex?: boolean } & Parameters<typeof isReleased>[0] }>(e: T) => isReleased(e.data);

const memo = new Map<string, Promise<unknown>>();
const once = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  if (!memo.has(key)) memo.set(key, fn());
  return memo.get(key) as Promise<T>;
};

/** Every released guide in every market, newest first (routes, markdown mirrors). */
export const getAllPosts = (): Promise<Post[]> =>
  once("posts", async () => (await getCollection("posts")).filter(live).sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id)));

/** Released guides of one market. */
export async function getGuides(m: Market): Promise<Post[]> {
  return (await getAllPosts()).filter((p) => postMarket(p) === m);
}

/** Released guides in the language's main market (en = US English, fr, de), newest first. */
export async function getPosts(lang: Lang = defaultLang): Promise<Post[]> {
  return getGuides(lang === "en" ? "us" : (lang as Market));
}

export const getStandards = (): Promise<Standard[]> =>
  once("standards", async () => (await getCollection("standards")).filter(live).sort((a, b) => b.data.stats.citations - a.data.stats.citations));
export const getIndustries = (): Promise<Industry[]> =>
  once("industries", async () => (await getCollection("industries")).filter(live).sort((a, b) => b.data.stats.inspections - a.data.stats.inspections));
export const getReports = (): Promise<Report[]> =>
  once("reports", async () => (await getCollection("reports")).filter(live).sort((a, b) => (b.data.year ?? 0) - (a.data.year ?? 0)));
export async function getChecklist(id?: string): Promise<Checklist | undefined> {
  if (!id) return undefined;
  return (await getCollection("checklists")).find((c) => c.id === id);
}

/** The English slug a post belongs to: its own, or another market version's `translationOf`. */
export const originalSlug = (post: Post) => post.data.translationOf ?? stripLang(post.id).replace(englishDir, "");

/**
 * Hreflang alternates of a guide, keyed by market: only released, indexable versions,
 * and only when the page itself is indexable. Undefined when there are no other versions.
 */
export async function postAlternates(post: Post): Promise<Partial<Record<Market, string>> | undefined> {
  if (post.data.noindex || post.data.topicType === "country-only") return undefined;
  const base = originalSlug(post);
  const found: Partial<Record<Market, string>> = {};
  for (const p of await getAllPosts()) if (!p.data.noindex && originalSlug(p) === base) found[postMarket(p)] = url.post(p.id);
  return Object.keys(found).length > 1 ? found : undefined;
}

/** Paths of a page that exists in every language (home, blog, about). */
export const hubAlternates = (path: string) =>
  Object.fromEntries(langs.map((l) => [l === "en" ? "us" : l, inLang(path, l)])) as Partial<Record<Market, string>>;

/** Categories that have at least one post in `lang`, in sheet order. */
export async function getCategories(lang: Lang = defaultLang) {
  const posts = await getPosts(lang);
  return categories.filter((c) => posts.some((p) => p.data.categories.includes(c.slug)));
}
export const categoryName = (slug: string, lang: Lang) => categories.find((c) => c.slug === slug)!.names[lang];
export const categoryDescription = (slug: string, lang: Lang) => categories.find((c) => c.slug === slug)!.descriptions[lang];

/** Every tag used in a language, with its posts, A–Z. */
export async function getTags(lang: Lang = defaultLang) {
  const tags = new Map<string, { slug: string; name: string; posts: Post[] }>();
  for (const post of await getPosts(lang)) {
    for (const name of post.data.tags) {
      const slug = slugify(name);
      if (!slug) continue;
      if (!tags.has(slug)) tags.set(slug, { slug, name, posts: [] });
      tags.get(slug)!.posts.push(post);
    }
  }
  return [...tags.values()].sort((a, b) => a.name.localeCompare(b.name, meta[lang].intl));
}

// ---------------------------------------------------------------- the live page index

export type PageKind = "guide" | "standard" | "industry" | "report" | "penalties";
export interface LivePage {
  kind: PageKind; market: Market; path: string; title: string; description: string;
  /** CFR sections the page is about or cites (e.g. "1926.501"). */
  sections: string[];
  /** 4-digit NAICS codes the page is about or ranks. */
  industries: string[];
  category?: string; tags: string[];
  /** Phrases that link to this page when another page in the market mentions them. */
  phrases: string[];
  updated: Date; released: Date;
  /** Section this page is *about* (standard pages). */
  own?: string;
}

const SECTION_RE = /\b(19(?:04|10|15|17|18|26|28))\.(\d{1,4}[a-z]?)(?![\d.])/g;
/** CFR sections cited in a text, e.g. ["1910.147", "1926.501"]. */
export const citedSections = (text: string) => [...new Set([...text.matchAll(SECTION_RE)].map((m) => `${m[1]}.${Number.parseInt(m[2], 10)}${m[2].replace(/^\d+/, "")}`))];

/** Every live (released, indexable) page with what the linker, hubs and related blocks need. */
export const livePages = (): Promise<LivePage[]> =>
  once("live", async () => {
    const pages: LivePage[] = [];
    for (const p of await getAllPosts()) {
      if (p.data.noindex) continue;
      const m = postMarket(p);
      pages.push({
        kind: "guide", market: m, path: url.post(p.id), title: p.data.title, description: p.data.description,
        sections: m === "us" ? citedSections(p.body ?? "") : [], industries: [], category: p.data.categories[0], tags: p.data.tags,
        phrases: p.data.linkPhrases.length ? p.data.linkPhrases : [], updated: stamp(p.data), released: releaseOf(p.data) ?? p.data.date,
      });
    }
    for (const s of await getStandards()) {
      if (s.data.noindex) continue;
      pages.push({
        kind: "standard", market: "us", path: url.standard(s.id), title: s.data.title, description: s.data.description,
        sections: [s.data.section], own: s.data.section, industries: s.data.stats.topIndustries.map((i) => String(i.naics)), category: s.data.subpart, tags: [],
        phrases: s.data.linkPhrases, updated: stamp(s.data), released: releaseOf(s.data) ?? s.data.date,
      });
    }
    for (const i of await getIndustries()) {
      if (i.data.noindex) continue;
      pages.push({
        kind: "industry", market: "us", path: url.industry(i.id), title: i.data.title, description: i.data.description,
        sections: i.data.stats.topStandards.map((s) => String(s.section)), industries: [i.data.naics], category: i.data.naics.slice(0, 2), tags: [],
        phrases: i.data.linkPhrases, updated: stamp(i.data), released: releaseOf(i.data) ?? i.data.date,
      });
    }
    for (const r of await getReports()) {
      if (r.data.noindex) continue;
      pages.push({
        kind: r.data.kind === "penalties" ? "penalties" : "report", market: "us", path: r.data.kind === "penalties" ? url.penalties() : url.report(r.id),
        title: r.data.title, description: r.data.description, sections: [], industries: [], tags: [], phrases: r.data.linkPhrases,
        updated: stamp(r.data), released: releaseOf(r.data) ?? r.data.date,
      });
    }
    return pages;
  });

/** The live standard page for a CFR section, if any. */
export async function standardFor(section: string): Promise<LivePage | undefined> {
  return (await livePages()).find((p) => p.kind === "standard" && p.own === section);
}

/**
 * Related block (3–6 links, same market): picked by shared clauses, shared industries
 * and topic. Never random, never site-wide.
 */
export async function relatedPages(path: string, { max = 6, min = 3, exclude = [] as string[] } = {}): Promise<LivePage[]> {
  const all = await livePages();
  const me = all.find((p) => p.path === path);
  if (!me) return [];
  const pool = all.filter((p) => p.market === me.market && p.path !== path && !exclude.includes(p.path) && p.kind !== "penalties");
  const score = (p: LivePage) =>
    p.sections.filter((s) => me.sections.includes(s)).length * 3 +
    p.industries.filter((i) => me.industries.includes(i)).length * 2 +
    (p.category && p.category === me.category ? 2 : 0) +
    p.tags.filter((t) => me.tags.includes(t)).length +
    (me.own && p.sections.includes(me.own) ? 3 : 0);
  const ranked = pool.map((p) => ({ p, s: score(p) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.p.path.localeCompare(b.p.path));
  const out = ranked.slice(0, max).map((x) => x.p);
  return out.length >= min ? out : out;
}

/** Hubs that exist for a market (a hub is built only when it lists at least one live page). */
export async function marketHubs(m: Market) {
  const pages = (await livePages()).filter((p) => p.market === m);
  const lang = langOfMarket(m);
  const s = ui[lang];
  const hubs: { path: string; label: string; count: number }[] = [];
  const guides = pages.filter((p) => p.kind === "guide").length;
  if (guides) hubs.push({ path: url.guidesHub(m), label: s.hubGuides, count: guides });
  if (m === "us") {
    const st = pages.filter((p) => p.kind === "standard").length;
    const ind = pages.filter((p) => p.kind === "industry").length;
    const rep = pages.filter((p) => p.kind === "report").length;
    if (st) hubs.push({ path: url.standardsHub(), label: s.hubStandards, count: st });
    if (ind) hubs.push({ path: url.industriesHub(), label: s.hubIndustries, count: ind });
    if (rep) hubs.push({ path: url.reportsHub(), label: s.hubReports, count: rep });
    if (pages.some((p) => p.kind === "penalties")) hubs.push({ path: url.penalties(), label: s.hubPenalties, count: 1 });
  }
  return hubs;
}

/** Markets that have at least one live page (their home and hubs are built). */
export async function liveMarkets(): Promise<Market[]> {
  const ms = new Set((await livePages()).map((p) => p.market));
  return (Object.keys(marketMeta) as Market[]).filter((m) => ms.has(m) || m === "us" || m === "fr" || m === "de");
}

// ---------------------------------------------------------------- llms-full.txt

export interface IndexedPage {
  path: string; title: string; description: string; lang: Lang; market: Market;
  section: "home" | "hub" | "post" | "category" | "company" | "standard" | "industry" | "report";
  updated: Date;
  /** True when /path.md exists. */
  mirror: boolean;
}

const company = (lang: Lang) => [
  { path: inLang("/about", lang), title: ui[lang].aboutTitle, description: ui[lang].aboutDescription },
];

/** Every indexable page on the site, for llms-full.txt. */
export async function siteIndex(): Promise<IndexedPage[]> {
  const siteUpdated = new Date(site.updated);
  const pages: IndexedPage[] = [];
  for (const lang of langs) {
    const m: Market = lang === "en" ? "us" : (lang as Market);
    const posts = await getPosts(lang);
    const newest = latest(siteUpdated, ...posts.map((p) => stamp(p.data)));
    const s = ui[lang];
    pages.push({ path: inLang("/", lang), title: s.homeTitle, description: s.homeDescription, lang, market: m, section: "home", updated: newest, mirror: false });
    pages.push({ path: url.blog(lang), title: s.blog, description: s.blogDescription, lang, market: m, section: "hub", updated: newest, mirror: false });
    for (const p of posts.filter((p) => !p.data.noindex))
      pages.push({ path: url.post(p.id), title: p.data.title, description: p.data.description, lang, market: m, section: "post", updated: stamp(p.data), mirror: true });
    for (const c of await getCategories(lang))
      pages.push({ path: url.category(c.slug, lang), title: s.categoryTitle(c.names[lang]), description: c.descriptions[lang], lang, market: m, section: "category", updated: latest(siteUpdated, ...posts.filter((p) => p.data.categories.includes(c.slug)).map((p) => stamp(p.data))), mirror: false });
    for (const c of company(lang)) pages.push({ ...c, lang, market: m, section: "company", updated: siteUpdated, mirror: false });
  }
  for (const p of await livePages()) {
    if (p.kind === "guide" && (p.market === "us" || p.market === "fr" || p.market === "de")) continue;
    const section = p.kind === "guide" ? "post" : p.kind === "penalties" ? "report" : p.kind;
    pages.push({ path: p.path, title: p.title, description: p.description, lang: langOfMarket(p.market), market: p.market, section, updated: p.updated, mirror: p.kind === "guide" });
  }
  for (const m of await liveMarkets())
    for (const h of await marketHubs(m)) if (!pages.some((x) => x.path === h.path)) pages.push({ path: h.path, title: h.label, description: h.label, lang: langOfMarket(m), market: m, section: "hub", updated: siteUpdated, mirror: false });
  pages.push(
    { path: "/contact", title: "Contact Safety Index", description: "How to report a mistake or reach the team by email.", lang: defaultLang, market: "us", section: "company", updated: siteUpdated, mirror: false },
    { path: "/privacy", title: "Privacy policy", description: "What data Safety Index collects (none beyond server logs).", lang: defaultLang, market: "us", section: "company", updated: siteUpdated, mirror: false },
    { path: "/terms", title: "Terms of use", description: "Terms for using Safety Index and its guides.", lang: defaultLang, market: "us", section: "company", updated: siteUpdated, mirror: false },
  );
  return pages;
}

export { entity };
