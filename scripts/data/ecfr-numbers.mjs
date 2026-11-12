// Numbers that appear in each CFR section's text, so the build can re-check a standard page's numbers
// without the raw eCFR XML (git-ignored). Written by the standard-page job (and `node scripts/data/ecfr-numbers.mjs`).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { numbersIn } from "../checks/facts.mjs";

export const NUMBERS_FILE = "data/pages/us/ecfr-numbers.json";
const read = () => (existsSync(NUMBERS_FILE) ? JSON.parse(readFileSync(NUMBERS_FILE, "utf8")) : {});

/** Records the numbers in a section's text. */
export function recordSectionNumbers(section, text) {
  const all = read();
  all[section] = [...numbersIn(text)].sort((a, b) => Number(a) - Number(b));
  writeFileSync(NUMBERS_FILE, `${JSON.stringify(all)}\n`);
}
export const sectionNumbers = (section) => new Set(read()[section] ?? []);

if (import.meta.url === `file://${process.argv[1]}`) {
  const { loadIndex, sectionText } = await import("./ecfr.mjs");
  const idx = loadIndex();
  for (const s of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(idx.sections).filter((s) => !idx.sections[s].reserved)) {
    try { recordSectionNumbers(s, sectionText(s, { maxChars: 60000 })); } catch {}
  }
  console.log(`✔ ${NUMBERS_FILE}: ${Object.keys(read()).length} sections`);
}
