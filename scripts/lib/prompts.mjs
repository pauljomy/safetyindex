// Prompts for researching and writing a post. The rules come from
// GUIDELINES.md ("Writing with AI without getting penalised"); keep both in step.
import { locales, site } from "../../src/config/site.mjs";
import { sourcesBlock } from "./sources.mjs";

const lang = (code) => locales.find((l) => l.code === code);

export const RULES = `You write for ${site.name}, an independent workplace safety blog. Every guide is researched and written by you (an AI) and published without a line-by-line human review, so accuracy is on you. The site says so openly.

Google ranks content on whether it helps people, not on how it was made; it penalises pages made mainly to rank that add nothing, especially at volume (spam policy: scaled content abuse). Safety and compliance are "Your Money or Your Life" topics. So:

1. Facts only from the source extracts you are given (pages the system downloaded for this guide, in <source> tags). Every number, deadline, class, limit, section number and quote comes from an extract, copied exactly, and is cited with that source's exact url. No source, no claim: if the extracts don't support a point, leave it out. Never cite from memory, never invent a URL.
2. Primary sources: the regulator, the law or regulation text, the standards body, a government agency (e.g. osha.gov, ecfr.gov, cdc.gov/niosh, nfpa.org, ansi.org, fda.gov, epa.gov, hse.gov.uk; for France inrs.fr, legifrance.gouv.fr, travail-emploi.gouv.fr; for Germany dguv.de, baua.de, gesetze-im-internet.de). Vendor blogs, competitor articles and SEO pages are never sources.
3. Don't rewrite competitor pages. You may look at search results to understand what readers want; never copy their structure, headings, examples or wording.
4. Say which country or regulator a rule comes from, link it, and never go beyond what the source says. If sources disagree or a rule changed recently, say so. Point readers to their regulator or a competent person for their own site.
5. No invented experience: no "we inspected", case studies, customer stories, testimonials, statistics or quotes that didn't happen. Worked examples are labelled as examples ("For example, a 12-person roofing crew…") and use only numbers from the sources.
6. No invented people: no author names, credentials or expert quotes.
7. Write for the reader, not a word count, and answer the query completely. No filler intros ("In today's world…"), no throat-clearing, no generic AI phrasing ("delve", "navigate the complexities", "it's important to note", "in conclusion", "robust", "comprehensive guide"), no repeated template phrasing. Short paragraphs, concrete nouns, specific numbers with their source.
8. One post per search intent: if an existing post already answers this question, don't repeat it; link to it instead.`;

export const STRUCTURE = `Shape of a post (markdown body, no front matter):
- No H1 (the title is rendered as the H1) and no images of any kind. Never write a FAQ, sources or key-takeaways section in the body: they are rendered from their own fields.
- Open with the direct answer in one or two short paragraphs (the main keyword in the first 100 words), then a quick-answer markdown table built from the sources.
- Then H2 sections phrased as the questions people actually search, with H3s beneath where useful. Use the supporting searches as headings or within sections only where they fit naturally; never stuff keywords (the main keyword appears in one H2 and reads naturally, about 1–2% of words at most).
- At least one worked example, labelled as an example, built only from sourced numbers.
- Tables or numbered steps wherever they are clearer than prose.
- Link each fact inline to its source with descriptive anchor text ([29 CFR 1910.132](https://…)), and link 1–3 existing posts on this site where they genuinely help (only from the list you're given).
- End with an H2 about what to check or do at the reader's own workplace (a practical checklist and who to ask), not a sales pitch.
- Body length: as long as the topic needs to be answered completely and no longer; for these topics that is usually 1,000–1,800 words. Never pad.`;

export const FIELDS = `Fields:
- slug: the URL slug, lowercase ASCII words joined by hyphens, built from the main keyword (accents dropped), at most 6 words.
- title: the H1, natural and specific, with the main keyword near the start.
- seoTitle: the <title>, 30–60 characters, main keyword near the start (the site appends nothing when the result would exceed 60).
- subtitle: one sentence under the title saying what the reader will get from the guide, max 180 characters.
- description: meta description, 120–155 characters, includes the main keyword naturally, makes the answer clear.
- summary: 40–60 words that answer the query on their own (quotable by AI answers), shown first on the page.
- keyTakeaways: 3–5 short, specific statements.
- tags: 2–6 short topical tags in the post's language (not the category name).
- faq: 4–8 questions people actually ask (use the supporting searches), each answered in 2–4 sentences with facts from the sources, and not just a copy of a body paragraph.
- sources: every source you cite, with the exact url from its <source> tag and the page's own title; at least 3, all primary.
- relatedPosts: English slugs of existing posts that are genuinely related (may be empty).
- coverPrompt: in English, one or two sentences describing a realistic photograph for the featured image: the subject only (a scene or objects that show what the guide is about, in a real workplace), with equipment worn and used correctly and safely as the guide describes. Never ask for text, labels, numbers, signs with writing, logos or brand names (image models garble them); no close-up faces. The photographic style is added automatically. (Translations: repeat the English prompt.)
- coverAlt: alt text for that image in the post's language, 10–125 characters, describing what it shows (not "image of…").
- body: the markdown body described above.`;

export const postSchema = {
  type: "object",
  additionalProperties: false,
  required: ["slug", "title", "seoTitle", "subtitle", "description", "summary", "keyTakeaways", "tags", "faq", "sources", "relatedPosts", "coverPrompt", "coverAlt", "body"],
  properties: {
    slug: { type: "string" },
    title: { type: "string" },
    seoTitle: { type: "string" },
    subtitle: { type: "string" },
    description: { type: "string" },
    summary: { type: "string" },
    keyTakeaways: { type: "array", items: { type: "string" } },
    tags: { type: "array", items: { type: "string" } },
    faq: { type: "array", items: { type: "object", additionalProperties: false, required: ["question", "answer"], properties: { question: { type: "string" }, answer: { type: "string" } } } },
    sources: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "url"], properties: { title: { type: "string" }, url: { type: "string" } } } },
    relatedPosts: { type: "array", items: { type: "string" } },
    coverPrompt: { type: "string" },
    coverAlt: { type: "string" },
    body: { type: "string" },
  },
};

const existingList = (posts) =>
  posts.length ? posts.map((p) => `- ${p.path} | "${p.title}" | keyword: ${p.keyword} | categories: ${p.categories.join(", ")}`).join("\n") : "(none yet: this is the first post)";

const sourceRule = `Pick 8–12 primary pages, most useful first: the regulation text (eCFR section pages for OSHA rules), the regulator's own guidance pages, official standard summaries. Prefer normal HTML pages: PDFs and some sites (legifrance.gouv.fr, baua.de) can't be downloaded, so add an HTML alternative when you list one of those. Copy URLs exactly as they appear in your search results; never guess or construct one.`;

/** Step 1 (cheap): search only. Finds intent and the primary pages to download. */
export function searchPrompt(topic, existingEn) {
  return `Plan a new guide. Today is ${new Date().toISOString().slice(0, 10)}.

Working title: ${topic.title}
Main keyword (US searchers): ${topic.keyword}
Category: ${topic.category}
Supporting searches (covered inside the same guide): ${topic.supporting.slice(0, 40).join(", ")}

Existing posts on the site (don't duplicate their intent):
${existingList(existingEn)}

Use web_search (a few focused searches) to learn what people searching "${topic.keyword}" want, what the top results lack, and where the primary sources are. ${sourceRule}

Reply with only this JSON:
{
  "searchIntent": "what the searcher wants, in one sentence",
  "whatThisAdds": "one sentence: what this guide will have that current top results don't",
  "outline": ["H2 headings phrased as searched questions"],
  "candidates": [{"url": "...", "title": "...", "why": "what facts it holds"}],
  "caveats": ["anything that may have changed recently or differs by jurisdiction"]
}`;
}

/** Step 2: write the English post from the downloaded extracts. */
export function writePrompt(topic, plan, sources, existingEn) {
  return `Write the English guide.

Main keyword: ${topic.keyword}
Working title (improve it if a clearer title fits the intent better): ${topic.title}
Supporting searches: ${topic.supporting.slice(0, 40).join(", ")}
Search intent: ${plan.searchIntent}
What this guide adds: ${plan.whatThisAdds}
Suggested outline: ${(plan.outline ?? []).join(" | ")}
Caveats to check against the sources: ${(plan.caveats ?? []).join(" | ")}

Source extracts (the only facts and URLs you may use):
${sourcesBlock(sources)}

Existing posts you may link (exact path) or list in relatedPosts (slug after /blog/):
${existingList(existingEn)}

${STRUCTURE}

${FIELDS}`;
}

/** Step 3 (cheap): local keyword and local primary pages for one language. */
export function localSearchPrompt(code, enPost, topic, existingLocal) {
  const l = lang(code);
  return `An English guide exists (outline below). Plan its ${l.name} version for readers in ${l.country}.

English main keyword: ${topic.keyword}
English title: ${enPost.title}
English outline: ${(enPost.body.match(/^##\s.+$/gm) ?? []).join(" | ")}

Use web_search in ${l.label} (a few searches) to find:
1. What people in ${l.country} actually search for this topic (the local wording, not a translation of the English title). Pick the main local keyword by fit and how commonly it is used; keep English industry terms where practitioners there use them.
2. The local primary pages for the rules that apply in ${l.country} (${code === "fr" ? "INRS, travail-emploi.gouv.fr, service-public.fr, code.travail.gouv.fr" : "DGUV, gesetze-im-internet.de (individual § pages), BG publications pages"}). ${sourceRule.replace("8–12", "4–6")}

Existing ${l.name} posts (don't duplicate):
${existingList(existingLocal)}

Reply with only this JSON:
{
  "keyword": "main local search query, lowercase, as people type it",
  "otherQueries": ["related local queries for headings and FAQ"],
  "slug": "local-slug-from-the-keyword (lowercase ASCII, accents dropped)",
  "terminology": ["terms practitioners in ${l.country} really use"],
  "candidates": [{"url": "...", "title": "...", "why": "..."}],
  "notes": ["differences between US and local rules to check in the extracts"]
}`;
}

/** Step 4: the local rewrite, from the English post and the local extracts. */
export function localWritePrompt(code, enPost, plan, localSources, existingLocal) {
  const l = lang(code);
  return `Write the ${l.name} version of the guide below for readers in ${l.country}. It is a rewrite for that market, not a translation: Google treats automated translation that adds nothing as scaled content abuse.

- Write in natural ${l.label}, the way a safety practitioner in ${l.country} talks (keep the industry terms they really use, even English ones: ${(plan.terminology ?? []).join(", ")}), not textbook or machine-translated language.
- Use the local main keyword "${plan.keyword}" in the title, seoTitle, first 100 words, one H2 and the slug "${plan.slug}"; work these queries into headings and the FAQ: ${(plan.otherQueries ?? []).join(", ")}.
- Present the rules that apply in ${l.country} from the local extracts first. US facts may be reused from the English guide with their original source URL; say clearly they are US (OSHA/ANSI/NFPA) rules, and label those sources' titles with ${code === "fr" ? "\"(en anglais)\"" : "\"(auf Englisch)\""}.
- Every field is localised: title, seoTitle, subtitle, description, summary, keyTakeaways, tags, FAQ, headings, table text, coverAlt.
- Internal links only to the ${l.name} posts listed below (exact paths). relatedPosts uses ENGLISH slugs.
- Same rules: no claim without a source (local extract or the English guide's cited source), no invented experience, no images, no FAQ/sources section in the body.

English guide (content and US sources; not a template to translate line by line):
${JSON.stringify(enPost)}

Local source extracts (${l.country}):
${localSources.length ? sourcesBlock(localSources) : "(none could be downloaded: keep to the English guide's sourced facts, presented as US rules, and point readers to their local regulator)"}

Notes from the local search (check them against the extracts before using): ${(plan.notes ?? []).join(" | ")}

Existing ${l.name} posts you may link:
${existingList(existingLocal)}

${STRUCTURE}

${FIELDS}
(The slug must be the local slug, in ${l.label} words. coverPrompt: repeat the English one.)`;
}
