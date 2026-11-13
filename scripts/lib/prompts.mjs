// Prompts for researching and writing a post. The rules come from
// GUIDELINES.md ("Writing with AI without getting penalised"); keep both in step.
import { locales, site } from "../../src/config/site.mjs";
import { sourcesBlock } from "./sources.mjs";

const lang = (code) => locales.find((l) => l.code === code);

/**
 * How a native practitioner writes for each market (adapted from the user's
 * German and French writer briefs). Facts still come only from the extracts.
 */
const LOCAL_STYLE = {
  de: `Write as a native German safety professional writing for German readers: Fachkräfte für Arbeitssicherheit, Sicherheitsbeauftragte, Bauleiter, Unternehmer and Führungskräfte. Write directly in German; never write it in English and translate.
- Address the reader with "Sie" throughout. Clear, practical, professional: no marketing language, no exaggerated claims. Short paragraphs, plain sentences; avoid long compound-noun chains where a simpler phrase works.
- Use the established German terms (Gefährdungsbeurteilung, Unterweisung, PSA, Betriebsanweisung, Baustellenverordnung, SiGeKo, Unternehmermodell, Sicherheitsfachkraft), not literal translations of English terms.
- Local rules and bodies first: Arbeitsschutzgesetz (ArbSchG), Baustellenverordnung (BaustellV), Betriebssicherheitsverordnung (BetrSichV), Arbeitsstättenverordnung and ASR, TRBS/TRGS, DGUV Vorschriften, Regeln and Informationen, the Berufsgenossenschaften (e.g. BG BAU, BG ETEM, BGN). Do not cite OSHA, the UK HSE or other foreign regulators unless the section is explicitly a comparison (e.g. a US training card the reader has heard of), and then say so.
- German formats: dates as DD.MM.YYYY, decimal comma, thousands point, metric units, "1.250 €" (amount, space, €).`,
  fr: `Write as a native French safety professional writing for French readers: préventeurs, responsables QHSE, conducteurs de travaux, coordonnateurs SPS, chefs d'entreprise and encadrants. Write directly in French; never write it in English and translate.
- Address the reader with "vous" throughout. Clear, practical, professional: no marketing language, no exaggerated claims. Short paragraphs, natural French sentence structure.
- Use the established French terms (document unique d'évaluation des risques (DUERP), plan de prévention, PPSPS, EPI, EPC, CSSCT, permis de feu, habilitation), not literal translations of English terms.
- Local rules and bodies first: Code du travail, INRS (including its ED brochures), OPPBTP, CARSAT / Assurance Maladie – Risques professionnels, Inspection du travail, ministère du Travail. Do not cite OSHA, the UK HSE or other foreign regulators unless the section is explicitly a comparison, and then say so.
- French typography and formats: a non-breaking space (U+00A0) before : ; ! ? and inside « guillemets » for quotes; dates as DD/MM/YYYY; decimal comma; space as thousands separator; "1 250 €" (amount, space, €).`,
};

export const RULES = `You write for ${site.name}, a standalone workplace safety reference. Every guide is researched and written by you (an AI) and published without a line-by-line human review, so accuracy is on you. The site says so openly.

Google ranks content on whether it helps people, not on how it was made; it penalises pages made mainly to rank that add nothing, especially at volume (spam policy: scaled content abuse). Safety and compliance are "Your Money or Your Life" topics. So:

0. Precision: when you paraphrase a definition, duty, condition, exception or interval, keep every condition the source attaches to it (who, when, how often, unless…). If a summary would drop a condition, say less and point to the source instead. Don't imply that a group needs something (or doesn't) unless the source says so.
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
- linkPhrases: 1–3 short phrases (lowercase, in the post's language) naming this guide's topic as other pages on the site would mention it, e.g. "forklift daily check". Other pages link their first mention of a phrase to this guide, so make them specific to this topic.
- localRule: for a regional topic outside the US, ONE sentence giving this country's rule and its reference (e.g. "In the UK, LOLER regulation 9 requires thorough examination of lifting equipment at least every 6 months for accessories."), from the sources; otherwise an empty string.
- checklist: when the reader has to inspect or check something, a checklist built from the sources (title, subtitle, instructions: 2–3 lines, sections with code "A"/"B"…, title and items {item, lookFor, clause}; clause = the exact rule reference from the sources, or "" when none; references: 1–3 lines naming the rules); otherwise null.
- body: the markdown body described above.`;

export const postSchema = {
  type: "object",
  additionalProperties: false,
  required: ["slug", "title", "seoTitle", "subtitle", "description", "summary", "keyTakeaways", "tags", "faq", "sources", "relatedPosts", "coverPrompt", "coverAlt", "linkPhrases", "localRule", "checklist", "body"],
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
    linkPhrases: { type: "array", items: { type: "string" } },
    localRule: { type: "string" },
    checklist: { anyOf: [{ type: "null" }, { $ref: "#/$defs/checklist" }] },
    body: { type: "string" },
  },
  $defs: {
    checklist: {
      type: "object", additionalProperties: false, required: ["title", "subtitle", "instructions", "sections", "references"],
      properties: {
        title: { type: "string" }, subtitle: { type: "string" }, instructions: { type: "array", items: { type: "string" } }, references: { type: "array", items: { type: "string" } },
        sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["code", "title", "items"], properties: {
          code: { type: "string" }, title: { type: "string" },
          items: { type: "array", items: { type: "object", additionalProperties: false, required: ["item", "lookFor", "clause"], properties: { item: { type: "string" }, lookFor: { type: "string" }, clause: { type: "string" } } } },
        } } },
      },
    },
  },
};

const existingList = (posts) =>
  posts.length ? posts.map((p) => `- ${p.path} | "${p.title}" | keyword: ${p.keyword} | categories: ${p.categories.join(", ")}`).join("\n") : "(none yet: this is the first post)";

const sourceRule = `Pick 8–12 primary pages, most useful first: the regulation text (eCFR section pages for OSHA rules), the regulator's own guidance pages, official standard summaries. Prefer normal HTML pages: PDFs and some sites (legifrance.gouv.fr, baua.de) can't be downloaded, so add an HTML alternative when you list one of those. Copy URLs exactly as they appear in your search results; never guess or construct one.`;

/** Regulators and law sites per market, for the search step. */
export const MARKET_SOURCES = {
  us: "OSHA (osha.gov), the eCFR (29 CFR 1910/1926), NIOSH (cdc.gov/niosh); for food safety the FDA Food Code (fda.gov), USDA FSIS and CDC",
  uk: "the Health and Safety Executive (hse.gov.uk, including ACOPs and INDG leaflets) and legislation.gov.uk",
  au: "Safe Work Australia (safeworkaustralia.gov.au: model WHS Act, Regulations and Codes of Practice), state regulators (SafeWork NSW, WorkSafe Victoria, WorkSafe Queensland…) and legislation.gov.au",
  ca: "CCOHS (ccohs.ca), the Canada Labour Code and the Canada Occupational Health and Safety Regulations on laws-lois.justice.gc.ca, and provincial regulators (WorkSafeBC, Ontario's OHSA on ontario.ca, CNESST, Alberta OHS)",
  nz: "WorkSafe New Zealand (worksafe.govt.nz) and the Health and Safety at Work Act 2015 and its regulations on legislation.govt.nz",
};
export const COUNTRY = { us: "the United States", uk: "the United Kingdom", au: "Australia", ca: "Canada", nz: "New Zealand", fr: "France", de: "Germany" };

/** Search step output: intent, sources and the go/no-go read of the top 10 results (brief section 6). */
export const searchSchema = {
  type: "object", additionalProperties: false,
  required: ["keyword", "otherQueries", "searchIntent", "whatThisAdds", "outline", "candidates", "caveats", "serp"],
  properties: {
    keyword: { type: "string" }, otherQueries: { type: "array", items: { type: "string" } },
    searchIntent: { type: "string" }, whatThisAdds: { type: "string" },
    outline: { type: "array", items: { type: "string" } },
    candidates: { type: "array", items: { type: "object", additionalProperties: false, required: ["url", "title", "why"], properties: { url: { type: "string" }, title: { type: "string" }, why: { type: "string" } } } },
    caveats: { type: "array", items: { type: "string" } },
    serp: { type: "object", additionalProperties: false, required: ["counts", "dominantFormat", "officialTop3FullAnswer", "notes"], properties: {
      counts: { type: "object", additionalProperties: false, required: ["guides", "lists", "tools", "videos", "products", "forums", "official"], properties: Object.fromEntries(["guides", "lists", "tools", "videos", "products", "forums", "official"].map((k) => [k, { type: "integer" }])) },
      dominantFormat: { type: "string" }, officialTop3FullAnswer: { type: "boolean" }, notes: { type: "string" },
    } },
  },
};
const serpRule = (kw) => `Also look at the top 10 results for "${kw}" and classify each as one of: guides, lists, tools (calculators, generators), videos, products (product or shop pages), forums, official (government or regulator pages). Set serp.counts (they add up to 10), serp.dominantFormat, and serp.officialTop3FullAnswer = true only if an official government page in the top 3 already gives a step-by-step answer or a ready-to-use checklist for that exact question (a page that only states the rule, or the regulation text itself, is not a full answer).`;

/** Step 1 (cheap): search only. Finds intent, the primary pages to download and the go/no-go facts. */
export function searchPrompt(topic, existingEn, market = "us") {
  return `Plan a new guide for readers in ${COUNTRY[market]}. Today is ${new Date().toISOString().slice(0, 10)}.

Working title: ${topic.title}
Main keyword${market === "us" ? " (US searchers)" : " (from US data; find the wording people in this country search)"}: ${topic.keyword}
Category: ${topic.category}
Supporting searches (covered inside the same guide): ${topic.supporting.slice(0, 40).join(", ")}

Existing posts on the site (don't duplicate their intent):
${existingList(existingEn)}

Use web search (a few focused searches${market === "us" ? "" : `, searching from ${COUNTRY[market]}`}) to learn what people searching this want, what the top results lack, and where the primary sources are. Primary sources for ${COUNTRY[market]}: ${MARKET_SOURCES[market] ?? MARKET_SOURCES.us}. Use only that country's own rules${market === "us" ? "" : " (never US OSHA rules for this market)"}. ${sourceRule}
${serpRule(market === "us" ? topic.keyword : "the main local keyword you pick")}

Reply with JSON: keyword (the main search query ${market === "us" ? `"${topic.keyword}"` : "people in this country type, lowercase"}), otherQueries (related queries the same guide should answer), searchIntent, whatThisAdds, outline (H2 headings phrased as searched questions), candidates ({url, title, why}), caveats (anything that may have changed recently or differs by jurisdiction), serp.`;
}

/** Step 2: write the English post from the downloaded extracts. */
export function writePrompt(topic, plan, sources, existingEn, market = "us") {
  const regional = topic.topicType === "regional";
  return `Write the English guide for readers in ${COUNTRY[market]}.${market !== "us" ? ` Build it only on ${COUNTRY[market]}'s own law and regulator guidance (${MARKET_SOURCES[market]}), from the extracts below; never US OSHA rules. ${regional ? `Near the top, the page shows a "localRule" line: one sentence with the ${COUNTRY[market]} rule and its reference.` : ""}` : ""}
Topic type: ${topic.topicType || "regional"}.

Main keyword: ${plan.keyword || topic.keyword}
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

${STYLE}

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
2. The local primary pages for the rules that apply in ${l.country} (${code === "fr" ? "INRS and its ED brochures pages, OPPBTP (preventionbtp.fr), Assurance Maladie / CARSAT (ameli.fr), travail-emploi.gouv.fr, code.travail.gouv.fr, service-public.fr" : "DGUV and publikationen.dguv.de, gesetze-im-internet.de (individual § pages of ArbSchG, BaustellV, BetrSichV, ArbStättV), BAuA pages for ASR/TRBS/TRGS, BG BAU and other Berufsgenossenschaften"}). ${sourceRule.replace("8–12", "4–6")}

Existing ${l.name} posts (don't duplicate):
${existingList(existingLocal)}

${serpRule("the main local keyword you pick")}

Reply with JSON: keyword (main local search query, lowercase, as people type it), otherQueries (related local queries for headings and FAQ, plus terms practitioners in ${l.country} really use), searchIntent, whatThisAdds, outline (local H2 headings phrased as searched questions), candidates ({url, title, why}; local official pages only), caveats (differences between US and local rules to check in the extracts), serp.`;
}

/** Step 4: the local rewrite, from the English post and the local extracts. */
export function localWritePrompt(code, enPost, plan, localSources, existingLocal) {
  const l = lang(code);
  return `Write the ${l.name} version of the guide below for readers in ${l.country}. It is a rewrite for that market, not a translation: Google treats automated translation that adds nothing as scaled content abuse.

${LOCAL_STYLE[code] ?? `- Write in natural ${l.label}, the way a safety practitioner in ${l.country} talks.`}
- Terms practitioners there use for this topic (from the local search): ${(plan.otherQueries ?? []).join(", ")}.
- Use the local main keyword "${plan.keyword}" in the title, seoTitle, first 100 words, one H2 and the slug "${plan.slug}"; work the related queries into headings and the FAQ.
- Build the guide on the rules that apply in ${l.country}, from the local extracts. Use a US fact from the English guide only inside an explicit comparison, with its original source URL, saying clearly it is a US (OSHA/ANSI/NFPA) rule, and label that source's title with ${code === "fr" ? "\"(en anglais)\"" : "\"(auf Englisch)\""}. If the local extracts don't cover a point, say what applies in general terms and point the reader to the competent body (${code === "fr" ? "INRS, CARSAT, OPPBTP, inspection du travail" : "Berufsgenossenschaft, Unfallkasse, Gewerbeaufsicht/Arbeitsschutzbehörde"}) rather than filling the gap with US rules.
- Every field is localised: title, seoTitle, subtitle, description, summary, keyTakeaways, tags, FAQ, headings, table text, coverAlt.
- Internal links only to the ${l.name} posts listed below (exact paths). relatedPosts uses ENGLISH slugs.
- Same rules: no claim without a source (local extract or the English guide's cited source), no invented experience, no images, no FAQ/sources section in the body.

English guide (content and US sources; not a template to translate line by line):
${JSON.stringify(enPost)}

Local source extracts (${l.country}):
${localSources.length ? sourcesBlock(localSources) : "(none could be downloaded: keep to the English guide's sourced facts, presented as US rules, and point readers to their local regulator)"}

Notes from the local search (check them against the extracts before using): ${(plan.caveats ?? []).join(" | ")}

Existing ${l.name} posts you may link:
${existingList(existingLocal)}

${STRUCTURE}

${STYLE}

${FIELDS}
(The slug must be the local slug, in ${l.label} words. coverPrompt: repeat the English one. localRule: the ${l.country} rule and its reference in one sentence, for a regional topic.)`;
}

// ===========================================================================
// Engine prompts (brief sections 11 and 12): standard pages, industry pages, the
// independent checking pass and the rewrite. Facts only from the supplied material.
import { JUDGMENT_RULES } from "../style/patterns.mjs";

/** Style rules (section 12). Also enforced by scripts/checks/writing.mjs and judged by the checking pass. */
export const STYLE = `Style rules:
- Answer first. The page opens with one sentence that answers its main question. Every section opens with a sentence that answers its own heading and names its subject, so it still makes sense quoted alone.
- Specifics or cut: if a sentence has no specific detail (a clause, a number, an interval, a named item), cut it.
- Don't write: three items where two would do; "not X but Y" contrasts against a claim nobody made; bold labels on list items that repeat the sentence; one-line closers and verbless fragments; sentences ending in an "-ing" comment tail (", highlighting the importance of…"); inflated significance ("plays a pivotal role"); sales words with no fact behind them; arguing against objections nobody raised; self-answered questions ("The result? …"); generic openers and closers; chatbot leftovers ("I hope this helps", "[Your Name]").
- Never use: delve, tapestry, meticulous, "In today's fast-paced", "It's important to note", Moreover, Furthermore, "In conclusion", "navigate the complexities", "comprehensive guide".
- No 4-word phrase more than twice in the prose. FAQ answers must not repeat the body.
- Never reproduce text from ANSI, NFPA, ISO, EN, BS, DIN or other paid standards; refer to them by number only. Never name a reviewer, author or credential.`;

export const FACT_RULES = `Fact rules (a page that breaks one is dropped):
1. Use only the material supplied below: the regulation text and the statistics JSON. Never add facts from memory.
2. Every clause reference must be a paragraph that exists in the supplied regulation text, written in full (e.g. 1910.147(c)(4)(i)).
3. Every number in your prose must appear in the statistics JSON or the regulation text. Copy numbers exactly. Don't compute new figures (no sums, ratios or percentages that aren't in the JSON). If you need a figure that isn't there, leave it out.
4. Never say what a paragraph requires unless the supplied text says it. Paraphrase in plain language; don't quote long passages.
6. One requirement per item. Each requirement item and each checklist item states a single rule and cites the exact paragraph that contains it. If a sentence would combine rules from two paragraphs (e.g. where anchors go and how strong they must be), split it into two items, each with its own paragraph.
7. Group and section headings must not add a frequency, scope or audience the regulation doesn't state. If items belong to more than one inspection (e.g. both the shift and the monthly inspection), say so in the heading or keep the heading neutral ("Controls, lines, hooks and rope").
5. When you paraphrase a definition, duty, condition, exception or interval, keep every condition the source attaches to it (who, when, how often, unless…). If a summary would drop a condition, say less and point to the clause instead. Don't imply that one group needs something (or doesn't) unless the source says so.`;

export const ENGINE_SYSTEM = `You write reference pages for ${site.name}, a standalone workplace safety reference for the US, UK, Germany, France, Australia, Canada and New Zealand. Pages are written by you (an AI) and published after automated checks and an independent AI checking pass, without a line-by-line human review, so accuracy is on you. Safety and compliance are "Your Money or Your Life" topics: be exact and plain. You never link or refer to conform.so. You return only the JSON the schema asks for.`;

const strArr = { type: "array", items: { type: "string" } };
const faqSchema = { type: "array", items: { type: "object", additionalProperties: false, required: ["question", "answer"], properties: { question: { type: "string" }, answer: { type: "string" } } } };
const checklistSchema = {
  type: "object", additionalProperties: false, required: ["title", "subtitle", "instructions", "sections", "references"],
  properties: {
    title: { type: "string" }, subtitle: { type: "string" }, instructions: strArr, references: strArr,
    sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["code", "title", "items"], properties: {
      code: { type: "string" }, title: { type: "string" },
      items: { type: "array", items: { type: "object", additionalProperties: false, required: ["item", "lookFor", "clause"], properties: { item: { type: "string" }, lookFor: { type: "string" }, clause: { type: "string" } } } },
    } } },
  },
};

export const standardSchema = {
  type: "object", additionalProperties: false,
  required: ["title", "seoTitle", "description", "opening", "enforcementSummary", "requirementsIntro", "requirements", "checklistIntro", "checklist", "faq", "linkPhrases", "coverPrompt", "coverAlt"],
  properties: {
    title: { type: "string" }, seoTitle: { type: "string" }, description: { type: "string" }, opening: { type: "string" },
    enforcementSummary: { type: "string" }, requirementsIntro: { type: "string" },
    requirements: { type: "array", items: { type: "object", additionalProperties: false, required: ["heading", "intro", "items"], properties: {
      heading: { type: "string" }, intro: { type: "string" },
      items: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "clause"], properties: { text: { type: "string" }, clause: { type: "string" } } } },
    } } },
    checklistIntro: { type: "string" }, checklist: checklistSchema, faq: faqSchema, linkPhrases: strArr, coverPrompt: { type: "string" }, coverAlt: { type: "string" },
  },
};

/** Standard page (brief section 7b). */
export function standardPrompt({ section, heading, keyword, cluster, titleHint, stats, regulationText, guides }) {
  return `Write the US standard page for 29 CFR ${section} (${heading}).

Search target: the main keyword is "${keyword}" (keyword data: ${JSON.stringify(cluster.slice(0, 12))}). The title uses the words people search for, with the regulation number, e.g. "${titleHint}". This page owns the requirements and regulation-number searches; how-to guides on the same subject are separate pages${guides.length ? ` (${guides.map((g) => `"${g}"`).join(", ")})` : ""}, so don't write a how-to guide.

The page template already shows, from the statistics: citations per fiscal year, the most-cited paragraphs, the penalty median and range, the shares of serious/willful/repeat citations, the top industries, the current maximum penalties, and sources. Don't repeat those tables in prose. You write these fields:
- title: H1, e.g. "${titleHint}". Up to 70 characters.
- seoTitle: 30–60 characters, main keyword near the start.
- description: 120–155 characters, says what the page gives (requirements, enforcement data, checklist).
- opening: ONE sentence (max 45 words) that answers "what does ${section} require?" in plain language, naming ${section}.
- enforcementSummary: 2–3 sentences reading the statistics: which paragraphs draw most citations and what they are about (from the regulation text), and how citations moved across the fiscal years. Numbers only as they appear in the statistics JSON (use the "display" values for percentages and dollars).
- requirementsIntro: one or two sentences saying who the standard applies to (scope paragraph) and how it is organised.
- requirements: 3–8 groups, each with a heading phrased as a question a safety manager asks (e.g. "When must employers provide fall protection?"), an intro sentence that answers it, and 2–8 items. Each item: one plain-language requirement with its exact paragraph in "clause" (full form, e.g. "${section}(b)(1)").
- checklistIntro: one sentence saying what the checklist covers and when to use it.
- checklist: an inspection checklist a supervisor can use on site. title (e.g. "${(/checklist and OSHA requirements/i.test(titleHint) ? titleHint.replace(/ and OSHA requirements/i, "") : titleHint.replace(/\s*requirements\b/i, " checklist")).replace(/^osha\b/i, "OSHA")}", in the words people search, capitalised as a title), subtitle (one line on when to use it), instructions (2–3 short lines: mark OK / Defect / N/A for every item, what to do when an item fails, that the manufacturer's instructions and site rules may add checks), 2–5 sections (code "A", "B"…, a title), each with 3–10 items: item (short name of what to check), lookFor (what a pass looks like, specific and observable), clause (the exact paragraph). Every item maps to a specific paragraph. references: 1–3 lines naming the regulation (e.g. "29 CFR ${section}: …" and "Source: eCFR, Title 29").
- faq: 0–4 questions, only for things the body doesn't answer (e.g. scope edge cases stated in the text). Empty if none.
- linkPhrases: 1–3 short phrases naming this standard's topic as other pages would mention it (e.g. "fall protection", "guardrail systems"), lowercase, at least 4 characters, specific to this standard.
- coverPrompt: one or two sentences in English describing a realistic photograph of the work this standard covers, equipment used correctly, no text, signs with writing, numbers, logos or close-up faces.
- coverAlt: 10–125 characters describing that photo.

${FACT_RULES}

${STYLE}

<statistics>
${JSON.stringify(stats, null, 1)}
</statistics>

<regulation_text section="${section}">
${regulationText}
</regulation_text>`;
}

export const industrySchema = {
  type: "object", additionalProperties: false,
  required: ["title", "seoTitle", "description", "opening", "patternsSummary", "penaltiesSummary", "standardNotes", "faq", "linkPhrases", "coverPrompt", "coverAlt"],
  properties: {
    title: { type: "string" }, seoTitle: { type: "string" }, description: { type: "string" }, opening: { type: "string" },
    patternsSummary: { type: "string" }, penaltiesSummary: { type: "string" },
    standardNotes: { type: "array", items: { type: "object", additionalProperties: false, required: ["section", "note"], properties: { section: { type: "string" }, note: { type: "string" } } } },
    faq: faqSchema, linkPhrases: strArr, coverPrompt: { type: "string" }, coverAlt: { type: "string" },
  },
};

/** Industry page (brief section 7c). */
export function industryPrompt({ naics, title, keyword, stats, headings, subs = [], trade }) {
  return `Write the US industry page for NAICS ${naics} (${title}): the OSHA standards cited most in this industry.

The template already shows the ranked standards table, the most-cited paragraphs, the penalty median and range and the classification shares. You write:
- title: H1 with the words people search, e.g. "Most-cited OSHA standards for ${title.toLowerCase()} (NAICS ${naics})". Up to 90 characters. The statistics cover the whole NAICS code, so the title names the code's title or one of its 6-digit industries listed below as part of it (e.g. "…: roofing, framing and other building exterior contractors (NAICS ${naics})"); never present the figures as being about one trade alone.
- seoTitle: 30–60 characters, built on the main keyword "${keyword}"${trade ? ` (the everyday name for this code is "${trade}"; use it only together with words that make clear the data covers the whole NAICS code)` : ""}.
- description: 120–155 characters.
- opening: ONE sentence (max 45 words) answering "which OSHA standards are cited most in ${title.toLowerCase()}?", naming the top standard by its number and subject.
- patternsSummary: 2–4 sentences on what the top standards have in common (e.g. falls, ladders, hazard communication), using the standard headings supplied and only numbers from the statistics JSON.
- penaltiesSummary: 1–2 sentences on the penalty pattern (median, range, share serious/willful/repeat) using the statistics "display" values only.
- standardNotes: for each of the top 5–8 standards, one short note (max 25 words) saying what that standard covers, from its heading. section = e.g. "1926.501".
- faq: 0–3 questions only if the body doesn't answer them. Usually empty.
- linkPhrases: 1–2 phrases naming this industry as other pages would mention it (e.g. "${title.toLowerCase()}"), at least 4 characters.
- coverPrompt / coverAlt: a realistic photograph of this kind of worksite (rules as for any cover: no text, logos or close-up faces, equipment used correctly); alt 10–125 characters.

${FACT_RULES}

${STYLE}

<statistics>
${JSON.stringify(stats, null, 1)}
</statistics>

<naics_definition>
NAICS ${naics} ${title} includes these 6-digit industries (U.S. Census Bureau, NAICS 2022):
${subs.map((x) => `${x.code} ${x.title}`).join("\n")}
</naics_definition>

<standard_headings>
${headings.map((h) => `${h.section}: ${h.heading}`).join("\n")}
</standard_headings>`;
}

// --- The independent checking pass: sees only the source material and the draft.
export const CHECK_SYSTEM = "You are a meticulous fact-checker for workplace safety reference pages. You compare a draft against the source material it was written from and list every problem. You return only JSON.";
export const checkSchema = {
  type: "object", additionalProperties: false, required: ["problems"],
  properties: { problems: { type: "array", items: { type: "object", additionalProperties: false, required: ["type", "severity", "where", "quote", "issue"], properties: {
    type: { type: "string", enum: ["unsupported-claim", "wrong-clause", "number-not-in-data", "missing-step", "unsafe-or-misleading", "style"] },
    severity: { type: "string", enum: ["major", "minor"] },
    where: { type: "string" }, quote: { type: "string" }, issue: { type: "string" },
  } } } },
};

export function checkPrompt({ draft, sources, market }) {
  return `Check this draft against the source material. The draft must contain nothing the sources don't support.

List every problem of these kinds:
- unsupported-claim: a statement (rule, duty, interval, definition, fact) the sources don't support, or one that goes beyond what they say.
- wrong-clause: a clause or paragraph reference that doesn't say what the draft claims, or doesn't exist in the source.
- number-not-in-data: a number not in the sources or statistics (dates, list numbering and numbers written as words one to ten are fine).
- missing-step: something a reader would need to act safely or comply that the sources cover and the draft leaves out (only important omissions).
- unsafe-or-misleading: anything that could lead a reader to act unsafely or misread the law${market && market !== "us" ? `, or anything presented as a rule of this market that comes from another country` : ""}.
- style: only these judgment rules, when clearly broken: ${JUDGMENT_RULES.map((r) => `${r.id} (${r.description})`).join("; ")}.

Severity: "major" when the problem changes what a rule requires, states something the sources don't support, cites a wrong clause or number, leaves out a condition or step that matters for safety or compliance, or could mislead a reader; "minor" for wording that could be tighter but doesn't change the meaning, and for style.
Be strict on facts and lenient on style. Quote the exact words in "quote". If there are no problems, return {"problems": []}.

<sources>
${sources}
</sources>

<draft>
${typeof draft === "string" ? draft : JSON.stringify(draft, null, 1)}
</draft>`;
}

/** Rewrite after the checking pass, under the fact rule for rewrites (section 12). */
export function rewritePrompt({ originalPrompt, draft, problems }) {
  return `${originalPrompt}

---
Your previous draft is below, followed by the problems an independent checker found. Return the complete corrected JSON (every field).
Fact rule for this rewrite: a fix may use only facts already in the draft or in the material above. If a fix would need a new name, number or date, cut the phrase instead. Fix every problem listed (minor ones too); when you're not sure a fix is fully supported by the material, delete the sentence or row rather than rewording it. Change only what the problems require, and keep every validation rule of the original task (lengths, word counts, structure).

<previous_draft>
${JSON.stringify(draft, null, 1)}
</previous_draft>

<problems>
${problems.map((p, i) => `${i + 1}. [${p.type}] ${p.where}: "${p.quote}" — ${p.issue}`).join("\n")}
</problems>`;
}
