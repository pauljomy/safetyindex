// /llms-full.txt: every indexable page with its one-line description and, for
// posts, the markdown mirror. Grouped by language.
import type { APIRoute } from "astro";
import { entity, locales, site } from "../config/site.mjs";
import { siteIndex } from "../lib/content";
import { abs } from "../lib/schema";
import { isoDate } from "../lib/dates";

export const GET: APIRoute = async () => {
  const pages = await siteIndex();
  const body = [
    `# ${site.name}: full page index`, "", `> ${entity.definition}`, "",
    ...locales.flatMap((l) => [
      `## ${l.name}`, "",
      ...pages.filter((p) => p.lang === l.code).flatMap((p) => [
        `- [${p.title}](${abs(p.path)}): ${p.description}`,
        `  - Updated: ${isoDate(p.updated)}${p.mirror ? `\n  - Markdown: ${abs(`${p.path}.md`)}` : ""}`,
      ]),
      "",
    ]),
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
