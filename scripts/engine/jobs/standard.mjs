// US standard page job (brief section 7b): eCFR text + enforcement statistics → src/content/standards/<slug>.json
// and its checklist (src/content/checklists/us/<slug>.json → PDF and Excel downloads).
import { readFileSync } from "node:fs";
import { ENGINE_SYSTEM, standardPrompt, standardSchema } from "../../lib/prompts.mjs";
import { checkClause, loadIndex, sectionText } from "../../data/ecfr.mjs";
import { checkClauses, checkNumbers, numbersIn } from "../../checks/facts.mjs";
import { checkWriting } from "../../checks/writing.mjs";
import { config } from "../../lib/config.mjs";
import { writeChecked } from "../pipeline.mjs";
import { checklistJson, checklistProblems, saveJson, today, withDisplay, writeBundle } from "../common.mjs";

const words = (s) => s.trim().split(/\s+/).length;

/** Splits "1910.147(c)(4)(i)" into section and paragraph. */
const splitClause = (c) => { const m = String(c).trim().match(/^(19\d\d\.\d+[a-z]?)((?:\([A-Za-z0-9]+\))*)$/); return m ? { section: m[1], paragraph: m[2] || null } : null; };

export function validateStandard(d, { section, allowed, regulationText }) {
  const e = [];
  if (d.seoTitle.length < 30 || d.seoTitle.length > 60) e.push(`seoTitle is ${d.seoTitle.length} characters (30–60)`);
  if (d.description.length < 120 || d.description.length > 155) e.push(`description is ${d.description.length} characters (120–155)`);
  if (d.title.length > 80) e.push(`title is ${d.title.length} characters (max 80)`);
  if (!d.title.includes(section)) e.push(`title must include the regulation number ${section}`);
  if (words(d.opening) > 45 || (d.opening.match(/[.!?](\s|$)/g) ?? []).length > 1) e.push("opening must be ONE sentence of at most 45 words");
  if (!d.opening.includes(section)) e.push(`opening must name ${section}`);
  if (d.coverAlt.length < 10 || d.coverAlt.length > 125) e.push(`coverAlt is ${d.coverAlt.length} characters (10–125)`);
  if (d.requirements.length < 2 || d.requirements.length > 10) e.push("requirements needs 2–10 groups");
  if (!d.linkPhrases.length || d.linkPhrases.length > 3 || d.linkPhrases.some((p) => p.trim().length < 4)) e.push("linkPhrases needs 1–3 phrases of at least 4 characters");
  for (const g of d.requirements) {
    if (!g.items.length) e.push(`requirement group "${g.heading}" has no items`);
    for (const it of g.items) {
      const c = splitClause(it.clause);
      if (!c) { e.push(`requirement "${it.text.slice(0, 50)}…" has clause "${it.clause}", which is not a full paragraph reference like ${section}(a)(1)`); continue; }
      const r = checkClause(c.section, c.paragraph);
      if (!r.ok) e.push(`clause ${it.clause} is not in the eCFR text (${r.reason})`);
    }
  }
  e.push(...checklistProblems(d.checklist, { needClause: true, section }));
  for (const s of d.checklist.sections) for (const i of s.items) {
    const c = splitClause(i.clause);
    if (c) { const r = checkClause(c.section, c.paragraph); if (!r.ok) e.push(`checklist clause ${i.clause} is not in the eCFR text (${r.reason})`); }
    else e.push(`checklist item "${i.item}" has clause "${i.clause}", not a full paragraph reference`);
  }
  const prose = [d.enforcementSummary, `## What does ${section} require?\n\n${d.requirementsIntro}`, ...d.requirements.map((g) => `### ${g.heading}\n\n${g.intro}\n\n${g.items.map((i) => `- ${i.text}`).join("\n")}`), `## Checklist\n\n${d.checklistIntro}`].join("\n\n");
  const all = `${d.opening}\n${d.description}\n${prose}\n${d.faq.map((f) => `${f.question} ${f.answer}`).join("\n")}\n${d.checklist.sections.flatMap((s) => s.items.map((i) => `${i.item}. ${i.lookFor}`)).join("\n")}`;
  e.push(...checkWriting({ body: prose, faq: d.faq, lang: "en", opening: d.opening }));
  e.push(...checkClauses(all, { market: "us", defaultSection: section }));
  e.push(...checkNumbers(all, allowed));
  if (/conform\.so/i.test(JSON.stringify(d))) e.push("mentions conform.so");
  return [...new Set(e)];
}

/**
 * @param {{ section: string, slug: string, keyword: string, cluster: any[], clusterVolume: number, kd: number, titleHint: string, guides?: string[], keywordSource: string }} job
 */
export async function runStandard(job, { log, enforcement }) {
  const idx = loadIndex();
  const sec = idx.sections[job.section];
  if (!sec || sec.reserved) return { status: "dropped", reason: `${job.section} is not in the eCFR text` };
  const raw = enforcement.standards.find((s) => s.section === job.section);
  if (!raw || raw.citations < config.standard_citation_floor) return { status: "dropped", reason: `fewer than ${config.standard_citation_floor} citations` };
  const stats = withDisplay({ fiscalYears: enforcement.fiscalYears, fiscalYearCount: enforcement.fiscalYearCount, ...raw });
  delete stats.section;
  const regulationText = sectionText(job.section, { maxChars: 60000 });
  const prompt = standardPrompt({ section: job.section, heading: sec.heading, keyword: job.keyword, cluster: job.cluster ?? [], titleHint: job.titleHint, stats, regulationText, guides: job.guides ?? [] });
  writeBundle("us", job.slug, { prompt, system: ENGINE_SYSTEM, source: regulationText, stats, schema: standardSchema });
  const allowed = new Set([...numbersIn(stats), ...numbersIn(regulationText), ...numbersIn(config.osha_penalties)]);
  const res = await writeChecked({
    label: job.slug, system: ENGINE_SYSTEM, prompt, schema: standardSchema, market: "us", log,
    validate: (d) => validateStandard(d, { section: job.section, allowed, regulationText }),
    sources: `<regulation_text section="${job.section}">\n${regulationText}\n</regulation_text>\n<statistics>\n${JSON.stringify(stats)}\n</statistics>`,
  });
  if (!res.ok) return { status: "dropped", reason: res.reason, notes: res.notes };
  const d = res.draft;
  const date = today();
  const pageUrl = `/us/standards/${job.slug}`;
  const cl = checklistJson({ market: "us", slug: job.slug, pageUrl, checklist: d.checklist, docRef: `SI-US-${job.section.replace(".", "-")}`, dataAsOf: enforcement.fetchedOn, regulationLine: `OSHA 29 CFR ${job.section}` });
  saveJson(cl.file, cl.data);
  const page = {
    section: job.section, part: sec.part, heading: sec.heading, subpart: sec.subpart, subpartTitle: sec.subpartTitle,
    title: d.title, seoTitle: d.seoTitle, description: d.description, opening: d.opening,
    keyword: job.keyword, cluster: job.cluster ?? [], clusterVolume: job.clusterVolume ?? null, kd: job.kd ?? null, keywordSource: job.keywordSource,
    stats: { fiscalYears: stats.fiscalYears, fiscalYearCount: stats.fiscalYearCount, citations: stats.citations, inspections: stats.inspections, byFy: Object.fromEntries(Object.entries(stats.byFy).map(([k, v]) => [String(k), v])), topParagraphs: stats.topParagraphs, penalties: stats.penalties, typeShares: stats.typeShares, typeCounts: stats.typeCounts, topIndustries: stats.topIndustries.map((i) => ({ ...i, title: i.title ?? null })) },
    enforcementSummary: d.enforcementSummary, requirementsIntro: d.requirementsIntro, requirements: d.requirements, checklistIntro: d.checklistIntro, checklist: cl.id,
    faq: d.faq, sources: [
      { title: `29 CFR ${job.section}: ${sec.heading.replace(/\.$/, "")} (eCFR)`, url: sec.url },
      { title: "OSHA inspection and violation data (U.S. Department of Labor Open Data Portal)", url: "https://dataportal.dol.gov/" },
      { title: "OSHA penalties", url: config.osha_penalties.source_url },
    ],
    ecfrDate: idx.ecfrDate, date, generatedOn: date, dataAsOf: enforcement.fetchedOn, topicType: "country-only", checkPass: "passed",
    linkPhrases: d.linkPhrases, cover: job.slug, coverPrompt: d.coverPrompt, coverAlt: d.coverAlt, changes: [],
  };
  saveJson(`src/content/standards/${job.slug}.json`, page);
  return { status: "done", files: [`src/content/standards/${job.slug}.json`, cl.file], checklist: cl.id, notes: res.notes };
}

export const readEnforcement = () => JSON.parse(readFileSync("data/pages/us/enforcement.json", "utf8"));
