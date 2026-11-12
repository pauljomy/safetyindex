// Reads the Search Console data saved by scripts/gsc/pull.mjs (or manual exports) in data/gsc/<date>/.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const GSC_DIR = "data/gsc";

/**
 * The latest pull: { date, endDate, pageImpressions: {path: n}, pages: rows, inspection: {path: {indexed, coverage, googleCanonical}} } or null.
 * summary.json is written by pull.mjs; a folder with only manual CSV exports (pages.csv: page,clicks,impressions,ctr,position) also works.
 */
export function latestGsc() {
  if (!existsSync(GSC_DIR)) return null;
  const dirs = readdirSync(GSC_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  for (const d of dirs.reverse()) {
    const sum = join(GSC_DIR, d, "summary.json");
    if (existsSync(sum)) return { date: d, ...JSON.parse(readFileSync(sum, "utf8")) };
    const csv = join(GSC_DIR, d, "pages.csv");
    if (existsSync(csv)) {
      const pageImpressions = {};
      for (const line of readFileSync(csv, "utf8").split("\n").slice(1).filter(Boolean)) {
        const [page, , impressions] = line.split(",");
        try { pageImpressions[new URL(page.replace(/"/g, "")).pathname.replace(/\/$/, "") || "/"] = Number(impressions); } catch {}
      }
      return { date: d, endDate: d, pageImpressions, inspection: {} };
    }
  }
  return null;
}
