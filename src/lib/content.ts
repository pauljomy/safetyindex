// Collection access, URLs, translations and the site index. Every list of
// pages (hubs, footer, llms.txt, llms-full.txt, markdown mirrors) comes from here.
import { getCollection, type CollectionEntry } from "astro:content";
import { categories } from "../data/categories.mjs";
import { entity, site } from "../config/site.mjs";
import { latest } from "./dates";
import { slugify } from "./slugify";
import { defaultLang, inLang, langOf, langs, meta, stripLang, ui, type Lang } from "../i18n/ui";

export type Post = CollectionEntry<"posts">;

const prefix = (lang: Lang) => (lang === defaultLang ? "" : `/${lang}`);

export const url = {
  post: (id: string) => `${prefix(langOf(id))}/blog/${stripLang(id)}`,
  blog: (lang: Lang = defaultLang) => `${prefix(lang)}/blog`,
  category: (slug: string, lang: Lang = defaultLang) => `${prefix(lang)}/category/${slug}`,
  tags: (lang: Lang = defaultLang) => `${prefix(lang)}/tags`,
  tag: (slug: string, lang: Lang = defaultLang) => `${prefix(lang)}/tags/${slug}`,
};

const stamp = (p: Post) => latest(p.data.date, p.data.updated);

/** Every post in every language, newest first (routes, markdown mirrors). */
export async function getAllPosts(): Promise<Post[]> {
  return (await getCollection("posts")).sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id));
}

/** Posts in one language, newest first. */
export async function getPosts(lang: Lang = defaultLang): Promise<Post[]> {
  return (await getAllPosts()).filter((p) => langOf(p.id) === lang);
}

/** The English slug a post belongs to: its own, or a translation's `translationOf`. */
export const originalSlug = (post: Post) => post.data.translationOf ?? stripLang(post.id);

/** A post's versions by language, itself included. */
export async function translationsOf(post: Post): Promise<Partial<Record<Lang, Post>>> {
  const base = originalSlug(post);
  const found: Partial<Record<Lang, Post>> = {};
  for (const p of await getAllPosts()) if (originalSlug(p) === base) found[langOf(p.id)] = p;
  return found;
}

/** Hreflang alternates of a post: path per language. Undefined when there are no translations. */
export async function postAlternates(post: Post): Promise<Partial<Record<Lang, string>> | undefined> {
  const found = await translationsOf(post);
  const entries = Object.entries(found).map(([l, p]) => [l, url.post(p!.id)]);
  return entries.length > 1 ? (Object.fromEntries(entries) as Partial<Record<Lang, string>>) : undefined;
}

/** Paths of a hub page that exists in every language. */
export const hubAlternates = (path: string) =>
  Object.fromEntries(langs.map((l) => [l, inLang(path, l)])) as Record<Lang, string>;

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

/** Related guides: explicit picks (English slugs, mapped to this language) first, then shared category/tags. */
export async function related(post: Post, limit = 3): Promise<Post[]> {
  const lang = langOf(post.id);
  const pool = (await getPosts(lang)).filter((p) => p.id !== post.id);
  const picked = post.data.relatedPosts.flatMap((slug) => pool.filter((p) => originalSlug(p) === slug));
  const score = (p: Post) =>
    (p.data.categories[0] === post.data.categories[0] ? 2 : p.data.categories.some((c) => post.data.categories.includes(c)) ? 1 : 0) +
    p.data.tags.filter((t) => post.data.tags.includes(t)).length;
  const rest = pool.filter((p) => !picked.includes(p)).map((p, i) => ({ p, s: score(p), i })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p);
  return [...picked, ...rest].slice(0, limit);
}

export interface IndexedPage {
  path: string; title: string; description: string; lang: Lang;
  section: "home" | "hub" | "post" | "category" | "company";
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
    const posts = await getPosts(lang);
    const newest = latest(siteUpdated, ...posts.map(stamp));
    const s = ui[lang];
    pages.push({ path: inLang("/", lang), title: s.homeTitle, description: s.homeDescription, lang, section: "home", updated: newest, mirror: false });
    pages.push({ path: url.blog(lang), title: s.blog, description: s.blogDescription, lang, section: "hub", updated: newest, mirror: false });
    for (const p of posts.filter((p) => !p.data.noindex))
      pages.push({ path: url.post(p.id), title: p.data.title, description: p.data.description, lang, section: "post", updated: stamp(p), mirror: true });
    for (const c of await getCategories(lang))
      pages.push({ path: url.category(c.slug, lang), title: s.categoryTitle(c.names[lang]), description: c.descriptions[lang], lang, section: "category", updated: latest(siteUpdated, ...posts.filter((p) => p.data.categories.includes(c.slug)).map(stamp)), mirror: false });
    for (const c of company(lang)) pages.push({ ...c, lang, section: "company", updated: siteUpdated, mirror: false });
  }
  pages.push(
    { path: "/contact", title: "Contact Safety First", description: "How to report a mistake or reach the team by email.", lang: defaultLang, section: "company", updated: siteUpdated, mirror: false },
    { path: "/privacy", title: "Privacy policy", description: "What data Safety First collects (none beyond server logs).", lang: defaultLang, section: "company", updated: siteUpdated, mirror: false },
    { path: "/terms", title: "Terms of use", description: "Terms for using Safety First and its guides.", lang: defaultLang, section: "company", updated: siteUpdated, mirror: false },
  );
  return pages;
}

export { entity };
