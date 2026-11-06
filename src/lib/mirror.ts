// Clean markdown versions of every post, served at the page URL + ".md" for
// LLMs and linked from llms-full.txt. Built from the same frontmatter and body.
import { site } from "../config/site.mjs";
import { formatDate, latest } from "./dates";
import { categoryName, getAllPosts, url, type Post } from "./content";
import type { Faq, Sources } from "./schemas";
import { abs } from "./schema";
import { langOf, meta, ui } from "../i18n/ui";

const faq = (items: Faq, title: string) =>
  items.length ? [`## ${title}`, "", ...items.flatMap((f) => [`### ${f.question}`, "", f.answer, ""])].join("\n") : "";
const sources = (items: Sources, title: string) =>
  items.length ? [`## ${title}`, "", ...items.map((s) => `- [${s.title}](${s.url})`), ""].join("\n") : "";

function post(p: Post) {
  const d = p.data;
  const lang = langOf(p.id);
  const s = ui[lang];
  const locale = meta[lang].intl;
  const path = url.post(p.id);
  return [
    `# ${d.title}`, "", `*${d.subtitle}*`, "",
    `${s.by} ${site.name} · ${s.published} ${formatDate(d.date, locale)} · ${s.updated} ${formatDate(latest(d.date, d.updated), locale)}`,
    `Canonical: ${abs(path)}`,
    `${s.categories}: ${d.categories.map((c) => categoryName(c, lang)).join(", ")}${d.tags.length ? ` · ${s.tags}: ${d.tags.join(", ")}` : ""}`,
    "", `> ${d.summary}`, "",
    `## ${s.keyTakeaways}`, "", ...d.keyTakeaways.map((k) => `- ${k}`), "",
    p.body ?? "", "",
    faq(d.faq, s.faq),
    sources(d.sources, s.sources),
    `> ${s.howMade}`, "",
    `> ${s.disclaimer}`, "",
    `---\n\nFrom ${site.url.replace("https://", "")}. Page: ${abs(path)}\n`,
  ].join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Every mirrored page: its path (without .md) and markdown. */
export async function mirrors(): Promise<{ path: string; markdown: string }[]> {
  return (await getAllPosts()).filter((p) => !p.data.noindex).map((p) => ({ path: url.post(p.id), markdown: post(p) }));
}
