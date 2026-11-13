// Topics for US standard pages: how a safety manager looks for a rule, not how the CFR numbers it.
// Used by the header's topic row, the home page and the /us/standards hub (one anchor per topic).

/** [slug, name, ranges] — ranges are [part, from, to] on the section number (1926.501 → part 1926, number 501). */
const T = [
  ["fall-protection", "Fall protection", [["1926", 500, 503], ["1910", 28, 29], ["1910", 140, 140]]],
  ["ladders-scaffolds", "Ladders, scaffolds and walking surfaces", [["1910", 21, 30], ["1926", 450, 454], ["1926", 1050, 1060]]],
  ["electrical", "Electrical", [["1910", 301, 399], ["1926", 400, 449]]],
  ["cranes-forklifts", "Cranes, forklifts and rigging", [["1910", 66, 68], ["1910", 176, 184], ["1926", 250, 252], ["1926", 550, 556], ["1926", 600, 606], ["1926", 1400, 1442]]],
  ["machinery-tools", "Machine guarding and tools", [["1910", 211, 247], ["1926", 300, 307]]],
  ["ppe", "Personal protective equipment", [["1910", 132, 139], ["1926", 95, 107]]],
  ["confined-spaces-loto", "Confined spaces and lockout/tagout", [["1910", 146, 147], ["1926", 1200, 1213]]],
  ["fire-exits", "Fire protection and exits", [["1910", 33, 39], ["1910", 155, 165], ["1926", 24, 24], ["1926", 150, 159]]],
  ["hot-work", "Welding and hot work", [["1910", 251, 255], ["1926", 350, 354]]],
  ["excavation", "Excavation and trenching", [["1926", 650, 652]]],
  ["health-chemicals", "Chemicals and health hazards", [["1910", 94, 126], ["1910", 1000, 1499], ["1926", 52, 65], ["1926", 1100, 1153]]],
  ["first-aid-sanitation", "First aid and sanitation", [["1910", 141, 151], ["1926", 50, 51]]],
  ["recordkeeping", "Recordkeeping and reporting", [["1904", 0, 99]]],
  ["construction-general", "Construction: general and other", [["1926", 0, 9999]]],
  ["general-industry", "General industry: other", [["1910", 0, 9999], ["1915", 0, 9999], ["1917", 0, 9999], ["1918", 0, 9999], ["1928", 0, 9999]]],
];

export const standardTopics = T.map(([slug, name]) => ({ slug, name }));

/** The topic of a CFR section, e.g. "1926.501" → { slug: "fall-protection", name: "Fall protection" }. */
export function topicOf(section) {
  const [part, num] = String(section).split(".");
  const n = Number.parseInt(num, 10);
  const hit = T.find(([, , ranges]) => ranges.some(([p, a, b]) => p === part && n >= a && n <= b));
  return hit ? { slug: hit[0], name: hit[1] } : { slug: "general-industry", name: "General industry: other" };
}
