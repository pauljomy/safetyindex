// Checks a drafted post against the site's rules before it is written to disk.
// Returns a list of problems in plain words (fed back to the model to fix).
import { normUrl } from "./claude.mjs";
import { categorySlugs } from "../../src/data/categories.mjs";

const words = (s) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
export const MIN_BODY_WORDS = 1000;

/** Phrases that claim experience the site doesn't have. */
const invented = [
  /\b(we|our team) (inspected|visited|audited|surveyed|interviewed|tested|have seen|have worked|worked with)\b/i,
  /\bin our (experience|years|work with)\b/i,
  /\bour (clients|customers|case stud)/i,
  /\b(nous avons (inspecté|visité|audité|testé|accompagné)|notre expérience|nos clients)\b/i,
  /\b(wir haben (geprüft|besucht|getestet|begleitet)|unsere(r)? Erfahrung|unsere Kunden)\b/i,
];

/**
 * @param {any} p drafted post
 * @param {{lang: string, keyword?: string, opened: Set<string>, existing: any[]}} ctx
 */
export function validatePost(p, ctx) {
  const e = [];
  const req = (k) => { if (p[k] == null || (typeof p[k] === "string" && !p[k].trim())) e.push(`"${k}" is missing`); };
  ["slug", "title", "seoTitle", "subtitle", "description", "summary", "body"].forEach(req);
  if (e.length) return e;

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug) || p.slug.length > 80) e.push(`slug "${p.slug}" must be lowercase ASCII words joined by hyphens, at most 80 characters`);
  const mine = ctx.existing.filter((x) => x.lang === ctx.lang);
  if (mine.some((x) => x.slug === p.slug)) e.push(`slug "${p.slug}" is already used by another post in this language`);
  if (ctx.keyword && mine.some((x) => x.keyword.toLowerCase() === ctx.keyword.toLowerCase())) e.push(`keyword "${ctx.keyword}" is already targeted by another post in this language`);

  if (p.title.length > 90) e.push(`title is ${p.title.length} characters (keep it under 90)`);
  if (p.seoTitle.length > 60 || p.seoTitle.length < 30) e.push(`seoTitle is ${p.seoTitle.length} characters (must be 30–60)`);
  if (p.subtitle.length > 180) e.push(`subtitle is ${p.subtitle.length} characters (keep it under 180)`);
  if (p.description.length < 120 || p.description.length > 155) e.push(`description is ${p.description.length} characters (must be 120–155)`);
  const sw = p.summary.trim().split(/\s+/).length;
  if (sw < 40 || sw > 60) e.push(`summary is ${sw} words (must be 40–60)`);
  if (!Array.isArray(p.keyTakeaways) || p.keyTakeaways.length < 3 || p.keyTakeaways.length > 5) e.push("keyTakeaways must have 3–5 items");
  if (!Array.isArray(p.faq) || p.faq.length < 4 || p.faq.length > 8) e.push("faq must have 4–8 questions");
  if (!Array.isArray(p.tags) || p.tags.length < 2 || p.tags.length > 6) e.push("tags must have 2–6 items");
  if (!Array.isArray(p.sources) || p.sources.length < 3) e.push("sources must list at least 3 primary sources");
  if (!p.coverAlt || p.coverAlt.length < 10 || p.coverAlt.length > 125) e.push(`coverAlt is ${p.coverAlt?.length ?? 0} characters (must be 10–125)`);
  if (ctx.lang === "en" && (!p.coverPrompt || p.coverPrompt.length < 20)) e.push("coverPrompt is missing or too short");

  // Every cited URL must be a page opened during research.
  const cited = [...(p.sources ?? []).map((s) => s.url), ...[...p.body.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1])];
  for (const u of new Set(cited)) if (!ctx.opened.has(normUrl(u))) e.push(`cites ${u}, which is not one of the downloaded sources: use only URLs from the <source> tags (or, in a translation, the English guide's sources), or remove the claim and the link`);
  const sourceUrls = new Set((p.sources ?? []).map((s) => normUrl(s.url)));
  for (const m of p.body.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) if (!sourceUrls.has(normUrl(m[1]))) e.push(`body links ${m[1]}, which is not in "sources"; add it there too`);

  // Internal links must point at pages that exist, in the same language.
  const prefix = ctx.lang === "en" ? "" : `/${ctx.lang}`;
  for (const [, href] of p.body.matchAll(/\]\((\/[^)\s#]*)/g)) {
    const post = href.match(/^(?:\/(fr|de))?\/blog\/([a-z0-9-]+)$/);
    const cat = href.match(/^(?:\/(fr|de))?\/category\/([a-z0-9-]+)$/);
    if (post) {
      if ((post[1] ?? "en") !== ctx.lang) e.push(`internal link ${href} points to another language; use ${prefix}/blog/<slug>`);
      else if (!mine.some((x) => x.slug === post[2])) e.push(`internal link ${href} points to a post that does not exist`);
    } else if (cat) {
      if (!categorySlugs.includes(cat[2]) || !mine.some((x) => x.categories.includes(cat[2]))) e.push(`internal link ${href} points to a category page that does not exist yet`);
    } else e.push(`internal link ${href} is not a post (${prefix}/blog/<slug>) or category link`);
  }

  const b = p.body;
  if (/^#\s/m.test(b)) e.push("body has an H1 (# …); the page title is the only H1, start sections at ##");
  if (/!\[[^\]]*\]\(/.test(b) || /<img\b/i.test(b)) e.push("body has an image; this site has no images");
  if (!/^\|.*\|\s*\n\|\s*:?-{3,}/m.test(b)) e.push("body needs at least one markdown table (the quick-answer table)");
  const h2 = (b.match(/^##\s/gm) ?? []).length;
  if (h2 < 4) e.push(`body has ${h2} H2 sections (needs at least 4)`);
  if (/^##\s+(faq|frequently asked|questions fréquentes|foire aux questions|häufige fragen|sources|references|références|quellen|weiterführende)/im.test(b)) e.push("body repeats the FAQ or sources; those are rendered from the frontmatter, remove the section");
  if (/^##\s+(key takeaways|à retenir|das wichtigste)/im.test(b)) e.push("body repeats the key takeaways; they are rendered from the frontmatter");
  const n = words(b);
  if (n < MIN_BODY_WORDS) e.push(`body is ${n} words; a complete guide on this topic needs at least ${MIN_BODY_WORDS} (add substance from the sources, not filler)`);
  for (const re of invented) if (re.test(b)) e.push(`body claims first-hand experience (${b.match(re)[0]}); remove it, the site has none`);
  if (/\[(insert|todo|tbd|citation needed)/i.test(b) || /lorem ipsum/i.test(b)) e.push("body has placeholder text");
  return e;
}

export const bodyWords = words;
