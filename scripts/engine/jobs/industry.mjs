// US industry page job (brief section 7c): enforcement statistics for one 4-digit NAICS code →
// src/content/industries/<slug>.json. No checklist; no standard × industry pages.
import { ENGINE_SYSTEM, industryPrompt, industrySchema } from "../../lib/prompts.mjs";
import { loadIndex } from "../../data/ecfr.mjs";
import { checkClauses, checkNumbers, numbersIn } from "../../checks/facts.mjs";
import { checkWriting } from "../../checks/writing.mjs";
import { config } from "../../lib/config.mjs";
import { writeChecked } from "../pipeline.mjs";
import { saveJson, today, withDisplay, writeBundle } from "../common.mjs";
import { subIndustries } from "../../data/naics.mjs";

const words = (s) => s.trim().split(/\s+/).length;

export function validateIndustry(d, { allowed, naics }) {
  const e = [];
  if (d.seoTitle.length < 30 || d.seoTitle.length > 60) e.push(`seoTitle is ${d.seoTitle.length} characters (30–60)`);
  if (d.description.length < 120 || d.description.length > 155) e.push(`description is ${d.description.length} characters (120–155)`);
  if (d.title.length > 90) e.push(`title is ${d.title.length} characters (max 90)`);
  if (words(d.opening) > 45 || (d.opening.match(/[.!?](\s|$)/g) ?? []).length > 1) e.push("opening must be ONE sentence of at most 45 words");
  if (d.coverAlt.length < 10 || d.coverAlt.length > 125) e.push(`coverAlt is ${d.coverAlt.length} characters (10–125)`);
  if (!d.linkPhrases.length || d.linkPhrases.length > 2 || d.linkPhrases.some((p) => p.trim().length < 4)) e.push("linkPhrases needs 1–2 phrases of at least 4 characters");
  for (const n of d.standardNotes) if (words(n.note) > 30) e.push(`note for ${n.section} is longer than 25 words`);
  const prose = [d.patternsSummary, `## Penalties\n\n${d.penaltiesSummary}`, ...d.standardNotes.map((n) => n.note)].join("\n\n");
  const all = `${d.opening}\n${d.description}\n${d.title}\n${prose}\n${d.faq.map((f) => `${f.question} ${f.answer}`).join("\n")}`;
  e.push(...checkWriting({ body: prose, faq: d.faq, lang: "en", opening: d.opening }));
  e.push(...checkClauses(all, { market: "us" }));
  e.push(...checkNumbers(all.replaceAll(naics, ""), allowed));
  if (/conform\.so/i.test(JSON.stringify(d))) e.push("mentions conform.so");
  return [...new Set(e)];
}

/** @param {{ naics: string, slug: string, title: string, keyword: string, keywordSource: string, clusterVolume?: number, kd?: number }} job */
export async function runIndustry(job, { log, enforcement }) {
  const raw = enforcement.industries.find((i) => i.naics === job.naics);
  if (!raw || raw.inspections < config.industry_inspection_floor || raw.standardsCited5Plus < config.industry_min_standards) return { status: "dropped", reason: "below the industry page thresholds" };
  const stats = withDisplay({ fiscalYears: enforcement.fiscalYears, fiscalYearCount: enforcement.fiscalYearCount, ...raw });
  const idx = loadIndex();
  const headings = raw.topStandards.slice(0, 15).map((s) => ({ section: s.section, heading: idx.sections[s.section]?.heading ?? "" }));
  const subs = subIndustries(job.naics);
  const prompt = industryPrompt({ naics: job.naics, title: job.title, keyword: job.keyword, stats, headings, subs, trade: job.trade });
  const naicsText = `NAICS ${job.naics} ${job.title} includes these 6-digit industries (U.S. Census Bureau, NAICS 2022):\n${subs.map((x) => `${x.code} ${x.title}`).join("\n")}`;
  writeBundle("us", job.slug, { prompt, system: ENGINE_SYSTEM, source: `${naicsText}\n\n${headings.map((h) => `${h.section}: ${h.heading}`).join("\n")}`, stats, schema: industrySchema });
  const allowed = new Set([...numbersIn(stats), ...numbersIn(headings), ...numbersIn(subs)]);
  const res = await writeChecked({
    label: job.slug, system: ENGINE_SYSTEM, prompt, schema: industrySchema, market: "us", log,
    validate: (d) => validateIndustry(d, { allowed, naics: job.naics }),
    sources: `<naics_definition>\n${naicsText}\n</naics_definition>\n<standard_headings>\n${headings.map((h) => `${h.section}: ${h.heading}`).join("\n")}\n</standard_headings>\n<statistics>\n${JSON.stringify(stats)}\n</statistics>`,
  });
  if (!res.ok) return { status: "dropped", reason: res.reason, notes: res.notes };
  const d = res.draft;
  const date = today();
  const page = {
    naics: job.naics, naicsTitle: job.title, title: d.title, seoTitle: d.seoTitle, description: d.description, opening: d.opening,
    keyword: job.keyword, keywordSource: job.keywordSource, clusterVolume: job.clusterVolume ?? null, kd: job.kd ?? null,
    stats: { fiscalYears: stats.fiscalYears, fiscalYearCount: stats.fiscalYearCount, inspections: stats.inspections, citations: stats.citations, topStandards: stats.topStandards, topParagraphs: stats.topParagraphs, penalties: stats.penalties, typeShares: stats.typeShares, standardsCited5Plus: stats.standardsCited5Plus },
    patternsSummary: d.patternsSummary, penaltiesSummary: d.penaltiesSummary, standardNotes: d.standardNotes, faq: d.faq,
    sources: [
      { title: "OSHA inspection and violation data (U.S. Department of Labor Open Data Portal)", url: "https://dataportal.dol.gov/" },
      { title: "North American Industry Classification System (U.S. Census Bureau)", url: "https://www.census.gov/naics/" },
      { title: "OSHA penalties", url: config.osha_penalties.source_url },
    ],
    date, generatedOn: date, dataAsOf: enforcement.fetchedOn, topicType: "country-only", checkPass: "passed",
    linkPhrases: d.linkPhrases, cover: job.slug, coverPrompt: d.coverPrompt, coverAlt: d.coverAlt, changes: [],
  };
  saveJson(`src/content/industries/${job.slug}.json`, page);
  return { status: "done", files: [`src/content/industries/${job.slug}.json`], notes: res.notes };
}
