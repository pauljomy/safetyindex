// /llms.txt: a plain-language map of the site for AI assistants, built from
// config and the content collections at every build.
import type { APIRoute } from "astro";
import { entity, locales, site } from "../config/site.mjs";
import { getCategories, getPosts, url } from "../lib/content";
import { abs } from "../lib/schema";
import { isoDate, latest } from "../lib/dates";

export const GET: APIRoute = async () => {
  const posts = await getPosts("en");
  const updated = latest(site.updated, ...posts.map((p) => latest(p.data.date, p.data.updated)));
  const link = (title: string, path: string, note: string) => `- [${title}](${abs(path)}): ${note}`;
  const body = [
    `# ${site.name}`, "", `> ${entity.definition}`, "",
    `Last updated: ${isoDate(updated)}`,
    `Languages: ${locales.map((l) => `${l.name} (${l.code})`).join(", ")}. Every guide also exists in the other languages as a local rewrite, with its own URL.`, "",
    "## Main pages", "",
    link("Home", "/", "Latest workplace safety guides"),
    link("All guides", "/blog", "Every guide, newest first"),
    link("About", "/about", "How every guide is researched and written with AI"),
    ...(await getCategories("en")).map((c) => link(`${c.names.en} guides`, url.category(c.slug), c.descriptions.en)),
    "", "## Recent guides", "",
    ...posts.slice(0, 20).map((p) => link(p.data.title, url.post(p.id), `${p.data.description} (updated ${isoDate(latest(p.data.date, p.data.updated))}) Markdown: ${abs(`${url.post(p.id)}.md`)}`)),
    "", "## Links", "",
    `- Contact: mailto:${site.contactEmail}`,
    `- Every page with a one-line description: ${abs("/llms-full.txt")}`,
    `- RSS: ${abs("/rss.xml")}`,
    "", "## Sitemap", "", `- ${abs("/sitemap-index.xml")}`, "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
