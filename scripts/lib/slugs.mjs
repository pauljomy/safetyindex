// URL slugs for generated pages, shared by the data scripts, the engine and the site.
const STOP = new Set(["the", "of", "and", "for", "in", "on", "a", "an", "to", "with", "general", "requirements", "specific"]);
export const slugify = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** "1926.501", "Duty to have fall protection." → "1926-501-duty-to-have-fall-protection" (short name, max 5 words). */
export function standardSlug(section, heading) {
  const words = slugify(heading.replace(/\.$/, "").replace(/\([^)]*\)/g, (m) => ` ${m.slice(1, -1)} `)).split("-").filter((w) => w && !STOP.has(w));
  return `${section.replace(".", "-")}-${words.slice(0, 5).join("-")}`.replace(/-$/, "");
}

/** "2381", "Foundation, Structure, and Building Exterior Contractors" → "2381-foundation-structure-building-exterior-contractors" */
export function industrySlug(naics, title) {
  const words = slugify(title).split("-").filter((w) => w && !["and", "the", "of"].includes(w));
  return `${naics}-${words.slice(0, 6).join("-")}`;
}
