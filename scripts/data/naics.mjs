// NAICS 2022 titles for 2- to 6-digit codes (U.S. Census Bureau, 2-6 digit 2022 codes file),
// stored in data/pages/us/naics.json. Codes from older NAICS editions with no 2022 title get null.
import { readFileSync } from "node:fs";

let titles;
export const NAICS_SOURCE = "https://www.census.gov/naics/2022NAICS/2-6%20digit_2022_Codes.xlsx";
export function naicsTitle(code) {
  titles ??= JSON.parse(readFileSync(`${process.cwd()}/data/pages/us/naics.json`, "utf8"));
  return titles[String(code)] ?? null;
}

/** The 6-digit industries under a 4-digit code, e.g. 2381 → [{code: "238160", title: "Roofing Contractors"}, …]. */
export function subIndustries(code4) {
  naicsTitle(code4);
  return Object.entries(titles).filter(([k]) => k.length === 6 && k.startsWith(String(code4))).map(([code, title]) => ({ code, title }));
}
