// Reads the posts already on the site (all languages) from their frontmatter,
// for duplicate-intent checks, internal links and related posts.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { locales } from "../../src/config/site.mjs";

export const POSTS_DIR = "src/content/posts";

export function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  return m ? YAML.parse(m[1]) : {};
}

/** @returns {{lang: string, slug: string, original: string, path: string, title: string, keyword: string, categories: string[], tags: string[], description: string}[]} */
export function existingPosts() {
  const out = [];
  for (const { code } of locales) {
    const dir = code === "en" ? POSTS_DIR : join(POSTS_DIR, code);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const d = frontmatter(readFileSync(join(dir, f), "utf8"));
      const slug = f.replace(/\.md$/, "");
      out.push({
        lang: code, slug, original: d.translationOf ?? slug,
        path: `${code === "en" ? "" : `/${code}`}/blog/${slug}`,
        title: d.title ?? "", keyword: d.keyword ?? "", categories: d.categories ?? [], tags: d.tags ?? [], description: d.description ?? "",
      });
    }
  }
  return out;
}

export function postFile(lang, slug) {
  return lang === "en" ? join(POSTS_DIR, `${slug}.md`) : join(POSTS_DIR, lang, `${slug}.md`);
}

export function toMarkdown(data, body) {
  const ordered = Object.fromEntries(
    ["title", "seoTitle", "subtitle", "description", "date", "coverImage", "coverAlt", "categories", "tags", "keyword", "translationOf", "summary", "keyTakeaways", "faq", "sources", "relatedPosts"]
      .filter((k) => data[k] !== undefined && !(Array.isArray(data[k]) && !data[k].length && k === "relatedPosts"))
      .map((k) => [k, data[k]]),
  );
  return `---\n${YAML.stringify(ordered, { lineWidth: 0 })}---\n\n${body.trim()}\n`;
}
