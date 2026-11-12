// Reads the posts already on the site (all languages) from their frontmatter,
// for duplicate-intent checks, internal links and related posts.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

export const POSTS_DIR = "src/content/posts";

export function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  return m ? YAML.parse(m[1]) : {};
}

/** @returns {{lang: string, slug: string, original: string, path: string, title: string, keyword: string, categories: string[], tags: string[], description: string}[]} */
export function existingPosts() {
  const out = [];
  for (const code of ["en", "fr", "de", "uk", "au", "ca", "nz"]) {
    const dir = code === "en" ? POSTS_DIR : join(POSTS_DIR, code);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const d = frontmatter(readFileSync(join(dir, f), "utf8"));
      const slug = f.replace(/\.md$/, "");
      const market = code === "en" ? "us" : code;
      out.push({
        lang: ["fr", "de"].includes(code) ? code : "en", market, slug, original: d.translationOf ?? slug, topicN: d.topicN, generatedOn: d.generatedOn, noindex: !!d.noindex,
        path: code === "en" ? `/blog/${slug}` : ["fr", "de"].includes(code) ? `/${code}/blog/${slug}` : `/${code}/guides/${slug}`,
        title: d.title ?? "", keyword: d.keyword ?? "", categories: d.categories ?? [], tags: d.tags ?? [], description: d.description ?? "",
      });
    }
  }
  return out;
}

/** File of a guide: lang or market code ("en"/"us" → root, fr, de, uk, au, ca, nz → that folder). */
export function postFile(code, slug) {
  return code === "en" || code === "us" ? join(POSTS_DIR, `${slug}.md`) : join(POSTS_DIR, code, `${slug}.md`);
}

export function toMarkdown(data, body) {
  const ordered = Object.fromEntries(
    ["noindex", "title", "seoTitle", "subtitle", "description", "date", "updated", "generatedOn", "releaseDate", "dataAsOf", "coverImage", "cover", "coverPrompt", "coverAlt", "categories", "tags", "keyword", "translationOf", "topicType", "keywordSource", "clusterVolume", "kd", "goNoGo", "checkPass", "localRule", "checklist", "linkPhrases", "summary", "keyTakeaways", "faq", "sources", "relatedPosts", "topicN", "changes"]
      .filter((k) => data[k] !== undefined && data[k] !== false && !(Array.isArray(data[k]) && !data[k].length && ["relatedPosts", "changes", "linkPhrases"].includes(k)))
      .map((k) => [k, data[k]]),
  );
  return `---\n${YAML.stringify(ordered, { lineWidth: 0 })}---\n\n${body.trim()}\n`;
}
