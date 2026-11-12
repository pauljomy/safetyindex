// NAICS 2022 titles for 2- to 4-digit codes (U.S. Census Bureau, 2-6 digit 2022 codes file),
// stored in data/pages/us/naics.json. Codes from older NAICS editions with no 2022 title get null.
import { readFileSync } from "node:fs";

let titles;
export const NAICS_SOURCE = "https://www.census.gov/naics/2022NAICS/2-6%20digit_2022_Codes.xlsx";
export function naicsTitle(code) {
  titles ??= JSON.parse(readFileSync(new URL("../../data/pages/us/naics.json", import.meta.url), "utf8"));
  return titles[String(code)] ?? null;
}
