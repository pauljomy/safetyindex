// Licence attribution lines for a page's sources, from scripts/sources/licences.yml.
import { readFileSync } from "node:fs";
import YAML from "yaml";

interface Licence { id: string; domains: string[]; attribution: null | Record<string, string> }
let cache: Licence[] | undefined;
const licences = () => (cache ??= YAML.parse(readFileSync(`${process.cwd()}/scripts/sources/licences.yml`, "utf8")) as Licence[]);

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const matches = (h: string, d: string) => h === d || h.endsWith(`.${d}`);

/** Attribution lines required by the licences of these source URLs, in the page's language (English fallback). */
export function attributionsFor(urls: string[], lang: string): string[] {
  const out = new Set<string>();
  for (const u of urls) {
    const h = host(u);
    for (const l of licences()) if (l.attribution && l.domains.some((d) => matches(h, d))) out.add(l.attribution[lang] ?? Object.values(l.attribution)[0]);
  }
  return [...out];
}
