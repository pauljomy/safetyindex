// Adds a featured image to an existing post and its translations, for posts
// published before images were part of the pipeline (or to replace a bad one).
//   npm run cover -- <english-slug>            # skip if it already has one
//   npm run cover -- <english-slug> --replace  # generate a new one
// Claude Opus writes the image prompt and the alt text in each language from
// the post itself; the image comes from scripts/lib/cover.mjs.
import { readFileSync, writeFileSync } from "node:fs";
import { TRANSLATION_MODEL, ask, parseJson } from "./lib/claude.mjs";
import { makeCover } from "./lib/cover.mjs";
import { existingPosts, frontmatter, postFile, toMarkdown } from "./lib/posts.mjs";

const [slug] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const replace = process.argv.includes("--replace");
if (!slug) throw new Error("usage: npm run cover -- <english-slug> [--replace]");

const versions = existingPosts().filter((p) => p.original === slug);
const en = versions.find((p) => p.lang === "en");
if (!en) throw new Error(`no English post "${slug}"`);
const read = (p) => {
  const md = readFileSync(postFile(p.lang, p.slug), "utf8");
  return { ...p, md, data: frontmatter(md), body: md.replace(/^---\n[\s\S]*?\n---\n/, "") };
};
const posts = versions.map(read);
if (!replace && posts.every((p) => p.data.coverImage)) {
  console.log("Already has a featured image (use --replace to make a new one).");
  process.exit(0);
}

const schema = {
  type: "object", additionalProperties: false, required: ["coverPrompt", "alts"],
  properties: {
    coverPrompt: { type: "string" },
    alts: { type: "array", items: { type: "object", additionalProperties: false, required: ["lang", "alt"], properties: { lang: { type: "string" }, alt: { type: "string" } } } },
  },
};
const res = await ask({
  system: "You write image prompts and alt text for a workplace safety blog.",
  messages: [{
    role: "user",
    content: `Write the featured image for this guide.

Title: ${en.title}
Summary: ${posts.find((p) => p.lang === "en").data.summary}

- coverPrompt (English): one or two sentences describing a realistic photograph of a real workplace that shows what the guide is about, with any equipment worn and used correctly and safely. Subject only. Never text, labels, numbers, signs with writing, logos or brand names; no close-up faces.
- alts: alt text for the image, 10–125 characters, describing what it shows (not "image of…"), one per language: ${posts.map((p) => p.lang).join(", ")}.`,
  }],
  schema, effort: "low", model: TRANSLATION_MODEL, label: "cover prompt",
});
const out = parseJson(res.text, "cover prompt");
console.log(`Prompt: ${out.coverPrompt}`);
const cover = await makeCover(slug, out.coverPrompt);
console.log(`✔ ${cover.file} (${cover.kb} KB)`);

for (const p of posts) {
  const alt = out.alts.find((a) => a.lang === p.lang)?.alt;
  if (!alt || alt.length < 10 || alt.length > 125) throw new Error(`bad alt text for ${p.lang}: ${alt}`);
  const data = { ...p.data, coverImage: `${p.lang === "en" ? "." : ".."}/images/${slug}.webp`, coverAlt: alt };
  writeFileSync(postFile(p.lang, p.slug), toMarkdown(data, p.body));
  console.log(`  updated ${postFile(p.lang, p.slug)}: ${alt}`);
}
