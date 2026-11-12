// Shared pieces for engine jobs: prompt bundles, statistics with display values, checklist JSON.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { site } from "../../src/config/site.mjs";
import { MARKETS } from "../lib/config.mjs";

export const today = () => new Date().toISOString().slice(0, 10);
const usd = (n) => (n == null ? null : `$${Number(n).toLocaleString("en-US")}`);
const pct = (x) => `${Math.round(x * 100)}%`;

/** Statistics for a page, plus every figure the template shows, pre-formatted (so the number check finds them). */
export function withDisplay(stats) {
  const fys = stats.fiscalYears;
  return {
    ...stats,
    display: {
      span: `FY${fys[0]}–FY${fys.at(-1)}`,
      fiscalYearCount: fys.length,
      citations: stats.citations?.toLocaleString("en-US"),
      inspections: stats.inspections?.toLocaleString("en-US"),
      penaltyMedian: usd(stats.penalties?.median), penaltyP25: usd(stats.penalties?.p25), penaltyP75: usd(stats.penalties?.p75),
      penaltyCount: stats.penalties?.n,
      ...(stats.typeShares && Object.fromEntries(Object.entries(stats.typeShares).map(([k, v]) => [`${k}Pct`, pct(v)]))),
      ...(stats.byFy && Object.fromEntries(Object.entries(stats.byFy).map(([y, n]) => [`FY${y}`, n.toLocaleString("en-US")]))),
    },
  };
}

/** Writes the prompt bundle for a job: instructions, source text, stats, schema and style rules. */
export function writeBundle(market, slug, { prompt, system, source, stats, schema }) {
  const dir = join("data/jobs", market, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "prompt.md"), prompt);
  writeFileSync(join(dir, "system.md"), system);
  if (source != null) writeFileSync(join(dir, "source.txt"), source);
  if (stats != null) writeFileSync(join(dir, "stats.json"), JSON.stringify(stats, null, 1));
  writeFileSync(join(dir, "schema.json"), JSON.stringify(schema, null, 1));
  return dir;
}

export const saveJson = (file, data) => { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`); };

/**
 * Checklist JSON in the download generator's format (scripts/downloads/build_checklist.py) from a writer's checklist.
 * @returns {{ file: string, id: string, data: object }}
 */
export function checklistJson({ market, slug, lang = "en", pageUrl, checklist, docRef, dataAsOf, regulationLine }) {
  const m = MARKETS[market];
  const data = {
    slug, market: market.toUpperCase() === "US" ? "us" : market, lang, paper: m.paper, page_url: `${site.url}${pageUrl}`,
    doc_ref: docRef, revision: "Rev 1", data_as_of: new Date(dataAsOf).toLocaleDateString(m.lang === "en" ? "en-GB" : `${m.lang}-${market.toUpperCase()}`, { day: "numeric", month: "long", year: "numeric" }),
    title: checklist.title, subtitle: checklist.subtitle, regulation_line: regulationLine,
    info_fields: lang === "de" ? [["Datum", "Schicht"], ["Prüfer/in", "Bereich / Arbeitsmittel"]] : lang === "fr" ? [["Date", "Poste"], ["Vérificateur", "Zone / équipement"]] : [["Date", "Shift"], ["Inspector", "Area / equipment ID"]],
    instructions: checklist.instructions,
    sections: checklist.sections.map((s) => ({ code: s.code, title: s.title, items: s.items.map((i) => (i.clause ? [i.item, i.lookFor, i.clause] : [i.item, i.lookFor])) })),
    defect_log_rows: 3,
    references: checklist.references,
    disclaimer: lang === "de" ? "Allgemeine Informationen, keine Rechtsberatung. Prüfen Sie die geltende Vorschrift und die Vorgaben Ihres Betriebs." : lang === "fr" ? "Informations générales, pas un conseil juridique. Vérifiez le texte en vigueur et les consignes de votre entreprise." : "General guidance only, not legal advice. Check the current regulation and your employer's procedures.",
    site: "safetyindex.blog",
  };
  return { file: join("src/content/checklists", market, `${slug}.json`), id: `${market}/${slug}`, data };
}

/** Checklist sanity: sizes and that every item has a "what to look for" line. */
export function checklistProblems(cl, { needClause = false, section } = {}) {
  const e = [];
  if (!cl?.sections?.length || cl.sections.length > 6) e.push("checklist needs 1–6 sections");
  for (const s of cl?.sections ?? []) {
    if (!s.items?.length || s.items.length > 12) e.push(`checklist section "${s.title}" needs 1–12 items`);
    for (const i of s.items ?? []) {
      if (!i.item?.trim() || !i.lookFor?.trim()) e.push(`checklist item "${i.item}" needs a name and a "what to look for" line`);
      if (needClause && !i.clause?.trim()) e.push(`checklist item "${i.item}" has no clause`);
      if (needClause && section && i.clause && !i.clause.startsWith(section)) e.push(`checklist item "${i.item}" cites ${i.clause}, not a paragraph of ${section}`);
    }
  }
  return e;
}
