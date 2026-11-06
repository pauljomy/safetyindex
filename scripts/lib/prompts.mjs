// Prompts for researching and writing a post. The rules come from
// GUIDELINES.md ("Writing with AI without getting penalised"); keep both in step.
import { locales, site } from "../../src/config/site.mjs";
import { openedList } from "./claude.mjs";

const lang = (code) => locales.find((l) => l.code === code);

export const RULES = `You write for ${site.name}, an independent workplace safety blog. Every guide is researched and written by you (an AI) and published without a line-by-line human review, so accuracy is on you. The site says so openly.

Google ranks content on whether it helps people, not on how it was made; it penalises pages made mainly to rank that add nothing, especially at volume (spam policy: scaled content abuse). Safety and compliance are "Your Money or Your Life" topics. So:

1. Facts only from sources you opened in this session. Every number, deadline, class, limit, section number and quote comes from a page you fetched with web_fetch, copied exactly. No source, no claim. Never cite from memory, never guess a URL.
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
- Body length: as long as the topic needs to be answered completely and no longer; for these topics that is usually 1,300–2,200 words. Never pad.`;

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
- sources: every page you cite (title as the page names itself, exact URL you opened); at least 3, all primary.
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

export function researchPrompt(topic, existingEn) {
  return `Research this topic for a new guide. Today is ${new Date().toISOString().slice(0, 10)}.

Working title: ${topic.title}
Main keyword (US searchers): ${topic.keyword}
Category: ${topic.category}
Supporting searches (cover where they fit, never as separate posts): ${topic.supporting.slice(0, 60).join(", ")}

Existing posts on the site (don't duplicate their intent; note any worth linking):
${existingList(existingEn)}

Do this:
1. Search to understand what people searching "${topic.keyword}" want to know (intent), and what the top results lack.
2. Find and OPEN (web_fetch) the primary sources for every fact the guide will need: the regulation text (eCFR for OSHA rules), the regulator's own guidance pages, the relevant standard's official summary. Check that rules are current (look for recent amendments) and copy figures exactly. Open every page you will cite; a page you only saw in search results does not count.
3. Stop when you have what a complete, accurate answer needs (typically 6–15 opened pages).

Reply with only this JSON (no prose around it):
{
  "searchIntent": "what the searcher wants, in one sentence",
  "whatThisAdds": "one sentence: what this guide will have that current top results don't (e.g. a table built from the regulation text, a worked example, exact thresholds with their section numbers)",
  "outline": ["H2 headings phrased as searched questions"],
  "facts": [{"claim": "a precise fact", "url": "the opened page it comes from", "evidence": "the exact words on that page"}],
  "sources": [{"title": "page title", "url": "exact URL opened", "publisher": "e.g. OSHA"}],
  "caveats": ["anything uncertain, conflicting, recently changed or jurisdiction-specific"],
  "relatedPosts": ["paths of existing posts worth linking"]
}`;
}

export function writePrompt(topic, brief, opened, existingEn) {
  return `Write the English guide from this research.

Main keyword: ${topic.keyword}
Working title (improve it if a clearer title fits the intent better): ${topic.title}
Supporting searches: ${topic.supporting.slice(0, 60).join(", ")}

Research brief (facts with the evidence you found):
${JSON.stringify(brief, null, 2)}

Pages you opened during research (the only URLs you may cite):
${openedList(opened).map((u) => `- ${u}`).join("\n")}

Existing posts you may link (use the exact path) or list in relatedPosts (by the slug after /blog/):
${existingList(existingEn)}

${STRUCTURE}

${FIELDS}`;
}

export function localResearchPrompt(code, enPost, topic, existingLocal) {
  const l = lang(code);
  return `An English guide has been written (below). Prepare its ${l.name} version for readers in ${l.country}. This is research only; you'll write it in the next step.

English main keyword: ${topic.keyword}
English title: ${enPost.title}
English summary: ${enPost.summary}
English outline: ${(enPost.body.match(/^##\s.+$/gm) ?? []).join(" | ")}
English sources: ${enPost.sources.map((s) => s.url).join(", ")}

Do this:
1. Find what people in ${l.country} actually search for this topic, in ${l.label} (search the web in that language: Google suggestions, "People also ask", the wording of local regulators and trade press). People don't search a translation of the English title; pick the main local keyword by fit and how commonly it is used, and keep English industry terms where practitioners there really use them.
2. Find and OPEN (web_fetch) the local primary sources that apply in ${l.country}, at most 6 pages: only those needed for local facts the guide will state (the English sources are already verified and can be reused for US facts) (${code === "fr" ? "INRS, Code du travail on Légifrance, Ministère du Travail, AFNOR summaries" : "DGUV, BAuA, ArbSchG/BetrSichV/ArbStättV/PSA-BV on gesetze-im-internet.de, ASR and TRBS rules"}) for every local fact the guide will state. Copy figures and article numbers exactly. If the topic is inherently a US rule (e.g. OSHA training cards), explain the US rule from the English sources and add what applies in ${l.country} instead, from local sources.
3. Note which English (US) sources must stay because there is no local equivalent.

Existing ${l.name} posts (don't duplicate; you may link them):
${existingList(existingLocal)}

Reply with only this JSON:
{
  "keyword": "main local search query, lowercase, as people type it",
  "otherQueries": ["related local queries to cover in headings and FAQ"],
  "slug": "local-slug-from-the-keyword (lowercase ASCII, accents dropped)",
  "facts": [{"claim": "...", "url": "opened page", "evidence": "exact words on that page"}],
  "sources": [{"title": "...", "url": "...", "publisher": "..."}],
  "keepEnglishSources": ["URLs of US/English sources that stay"],
  "terminology": ["terms practitioners in ${l.country} really use, e.g. EPI, DUERP / PSA, Gefährdungsbeurteilung"],
  "notes": ["differences between US and local rules a reader must know"]
}`;
}

export function localWritePrompt(code, enPost, research, opened, existingLocal) {
  const l = lang(code);
  return `Write the ${l.name} version of the guide below for readers in ${l.country}. It is a rewrite for that market, not a translation: Google treats automated translation that adds nothing as scaled content abuse.

- Write in natural ${l.label}, the way a safety practitioner in ${l.country} talks (keep the industry terms they really use, even English ones), not textbook or machine-translated language.
- Use the local main keyword "${research.keyword}" in the title, seoTitle, first 100 words, one H2 and the slug; work the other local queries into headings and the FAQ.
- Present the rules that apply in ${l.country} from the local sources first. Where a fact is a US rule, say clearly that it is a US (OSHA/ANSI/NFPA) requirement, and label English-language sources in their title with ${code === "fr" ? "\"(en anglais)\"" : "\"(auf Englisch)\""}.
- Every field is localised: title, seoTitle, subtitle, description, summary, keyTakeaways, tags, FAQ, headings, table text, the slug.
- Internal links only to the ${l.name} posts listed below (their exact paths). relatedPosts uses ENGLISH slugs of existing posts.
- Same rules as before: no claim without an opened source, no invented experience, no images, no FAQ/sources section in the body.

English guide (content source, not a template to translate line by line):
${JSON.stringify(enPost, null, 2)}

Local research:
${JSON.stringify(research, null, 2)}

Pages opened during research, English and local (the only URLs you may cite):
${openedList(opened).map((u) => `- ${u}`).join("\n")}

Existing ${l.name} posts you may link:
${existingList(existingLocal)}

${STRUCTURE}

${FIELDS}
(The slug must be the local slug, in ${l.label} words.)`;
}
