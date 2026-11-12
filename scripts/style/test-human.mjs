// Tests the style rules on human-written safety guidance published before 2022
// (brief section 12: "Test the rules before trusting them").
//
// Downloads Wayback Machine snapshots (2015–2021, `id_` = original HTML) of
// OSHA, HSE and CCOHS pages, extracts the main text as light markdown (headings,
// list items, bold, tables kept so the markdown-aware rules behave as on a post),
// caches it in scripts/style/human-sample/, runs every rule and writes
// scripts/style/human-sample-report.md.
//
//   node scripts/style/test-human.mjs            use the cache, download what is missing
//   node scripts/style/test-human.mjs --refresh  download everything again
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findPatterns, findBanned, repeatedPhrases, SCRIPTED_RULES, JUDGMENT_RULES, blocksOf } from "./patterns.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "human-sample");
const refresh = process.argv.includes("--refresh");

// [id, snapshot year, original URL]
const PAGES = [
  ["osha-pit-loading", 2019, "https://www.osha.gov/SLTC/etools/pit/operations/loadhandling.html"],
  ["osha-hazardous-energy", 2019, "https://www.osha.gov/SLTC/controlhazardousenergy/index.html"],
  ["osha-confined-spaces", 2019, "https://www.osha.gov/SLTC/confinedspaces/index.html"],
  ["osha-fall-protection", 2018, "https://www.osha.gov/SLTC/fallprotection/index.html"],
  ["osha-trenching", 2019, "https://www.osha.gov/SLTC/etools/construction/trenching/mainpage.html"],
  ["osha-heat-stress", 2019, "https://www.osha.gov/SLTC/heatstress/index.html"],
  ["hse-loler", 2019, "https://www.hse.gov.uk/work-equipment-machinery/loler.htm"],
  ["hse-puwer", 2019, "https://www.hse.gov.uk/work-equipment-machinery/puwer.htm"],
  ["hse-work-at-height-faq", 2019, "https://www.hse.gov.uk/work-at-height/faqs.htm"],
  ["hse-confined-spaces", 2019, "https://www.hse.gov.uk/confinedspace/index.htm"],
  ["osha-pit-classes", 2019, "https://www.osha.gov/SLTC/etools/pit/forklift/types/classes.html"],
  ["osha-construction-ladders", 2019, "https://www.osha.gov/SLTC/etools/construction/falls/4ladders.html"],
  ["osha-hospital-sharps", 2019, "https://www.osha.gov/SLTC/etools/hospital/hazards/sharps/sharps.html"],
  ["osha-respiratory-protection", 2019, "https://www.osha.gov/SLTC/respiratoryprotection/index.html"],
  ["hse-toolbox-height", 2019, "https://www.hse.gov.uk/toolbox/height.htm"],
  ["hse-noise-employers", 2019, "https://www.hse.gov.uk/noise/employers.htm"],
  ["hse-electricity-faq", 2019, "https://www.hse.gov.uk/electricity/faq.htm"],
  ["hse-simple-risk", 2019, "https://www.hse.gov.uk/simple-health-safety/risk/index.htm"],
  ["ccohs-falls", 2019, "https://www.ccohs.ca/oshanswers/safety_haz/falls.html"],
  ["hse-toolbox-fire", 2019, "https://www.hse.gov.uk/toolbox/fire.htm"],
  ["hse-toolbox-transport", 2019, "https://www.hse.gov.uk/toolbox/transport.htm"],
  ["hse-transport-vehicles", 2019, "https://www.hse.gov.uk/workplacetransport/information/vehicles.htm"],
  ["hse-overhead-lines", 2019, "https://www.hse.gov.uk/electricity/information/overhead.htm"],
  ["ccohs-hazard-risk", 2019, "https://www.ccohs.ca/oshanswers/hsprograms/hazard_risk.html"],
  ["ccohs-hazard-identification", 2019, "https://www.ccohs.ca/oshanswers/hsprograms/hazard_identification.html"],
  ["ccohs-hand-tools", 2019, "https://www.ccohs.ca/oshanswers/safety_haz/hand_tools/general.html"],
  ["ccohs-ppe-design", 2019, "https://www.ccohs.ca/oshanswers/prevention/ppe/designin.html"],
  ["ccohs-lockout", 2019, "https://www.ccohs.ca/oshanswers/hsprograms/lockout.html"],
  ["ccohs-ladders", 2019, "https://www.ccohs.ca/oshanswers/safety_haz/ladders/portable.html"],
  ["ccohs-confined-space", 2019, "https://www.ccohs.ca/oshanswers/hsprograms/confinedspace_intro.html"],
];
const MIN_WORDS = 250;

// ---------------------------------------------------------------------------
// HTML → light markdown (no dependencies; good enough for government pages)

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", bull: "•", eacute: "é", reg: "®", copy: "©", deg: "°", frac12: "½", sect: "§", middot: "·", times: "×" };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m);

/** End index of the element that opens at `start` (balances same-name tags). */
function elementEnd(html, start) {
  const name = html.slice(start).match(/^<([a-z0-9]+)/i)?.[1];
  if (!name) return start;
  const re = new RegExp(`<(/?)${name}\\b[^>]*>`, "gi");
  re.lastIndex = start;
  let depth = 0;
  for (let m; (m = re.exec(html)); ) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return html.length;
}

function mainHtml(html) {
  html = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|noscript|svg|form|iframe|button|select)\b[\s\S]*?<\/\1>/gi, "");
  const body = html.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? html;
  const pick = [
    /<main\b/i,
    /<(?:div|section|article)\b[^>]*\bid="(?:maincontain|main-content|mainContent|contentContainer|content-main|maincontent|main)"/i,
    /<(?:div|section|article)\b[^>]*\bclass="[^"]*\b(?:main-content|field-name-body|region-content)\b/i,
    /<(?:div|section|article)\b[^>]*\bid="content"/i,
    /<article\b/i,
  ];
  let main = body;
  for (const re of pick) {
    const m = re.exec(body);
    if (m) { main = body.slice(m.index, elementEnd(body, m.index)); break; }
  }
  // Drop navigation, breadcrumbs, side boxes, footers inside the main area.
  const junk = /<(nav|aside|header|footer|div|ul|section|p)\b[^>]*\b(?:id|class|role)="[^"]*(?:nav|menu|breadcrumb|footer|header|sidebar|skip|social|share|related|pagination|toolbar|search|print|feedback|rating|banner|tabs|toc|back-to-top|backtotop)[^"]*"/i;
  for (let i = 0, m; i < 500 && (m = junk.exec(main)); i++) main = main.slice(0, m.index) + main.slice(elementEnd(main, m.index));
  main = main.replace(/<(nav|aside|header|footer)\b[\s\S]*?<\/\1>/gi, "");
  return main;
}

function toMarkdown(html) {
  let s = mainHtml(html);
  s = s
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n\n${"#".repeat(+n)} ${t.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()}\n\n`)
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => (t.replace(/<[^>]+>/g, "").trim() ? `**${t.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()}**` : ""))
    .replace(/<tr\b[^>]*>/gi, "\n| ")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<dt\b[^>]*>/gi, "\n\n")
    .replace(/<\/?(p|div|br|ul|ol|dl|dd|dt|table|tbody|thead|blockquote|section|article|main|hr|caption|figure|figcaption)\b[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  s = decode(s);
  const lines = s.split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim());
  // Re-join: list items and table rows stay single lines; plain text lines inside a paragraph are joined.
  const out = [];
  for (const l of lines) {
    if (!l) { if (out.at(-1) !== "") out.push(""); continue; }
    if (l === "-" || l === "|" || /^\|[\s|]*$/.test(l)) continue;
    const prev = out.at(-1);
    const isBlockStart = /^(#{1,6} |- |\| )/.test(l);
    if (prev && !isBlockStart && !/^(#{1,6} |\| )/.test(prev)) out[out.length - 1] = `${prev} ${l}`;
    else out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ---------------------------------------------------------------------------

async function fetchSnapshot(year, url) {
  const wb = `https://web.archive.org/web/${year}id_/${url}`;
  const res = await fetch(wb, { redirect: "follow", headers: { "user-agent": "safetyindex-style-test/1.0 (human-sample check)" }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const snap = res.url.match(/\/web\/(\d{14})/)?.[1] ?? "";
  return { html: await res.text(), snapshot: snap, final: res.url };
}

async function loadSample() {
  mkdirSync(cacheDir, { recursive: true });
  const pages = [];
  for (const [id, year, url] of PAGES) {
    const file = join(cacheDir, `${id}.txt`);
    if (!refresh && existsSync(file)) {
      const raw = readFileSync(file, "utf8");
      const [head, ...rest] = raw.split("\n---\n");
      const meta = Object.fromEntries(head.split("\n").map((l) => l.split(": ")).map(([k, ...v]) => [k, v.join(": ")]));
      if (meta.status === "ok") pages.push({ id, url, snapshot: meta.snapshot, text: rest.join("\n---\n") });
      continue;
    }
    try {
      const { html, snapshot } = await fetchSnapshot(year, url);
      const sy = +snapshot.slice(0, 4);
      if (sy && (sy < 2015 || sy > 2021)) throw new Error(`snapshot ${snapshot} outside 2015–2021`);
      const text = toMarkdown(html);
      const words = (text.match(/\p{L}+/gu) ?? []).length;
      const status = words >= MIN_WORDS ? "ok" : `too short (${words} words)`;
      writeFileSync(file, `url: ${url}\nsnapshot: ${snapshot}\nwords: ${words}\nstatus: ${status}\n---\n${text}`);
      console.log(`${id}: ${snapshot} ${words} words ${status}`);
      if (status === "ok") pages.push({ id, url, snapshot, text });
    } catch (err) {
      writeFileSync(file, `url: ${url}\nstatus: failed (${err.message})\n---\n`);
      console.log(`${id}: failed ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500)); // be polite to the Wayback Machine
  }
  return pages;
}

const ALL_RULES = ["bold-label", "ing-tail", "fragment", "leftover", "self-answer"];

async function main() {
  const pages = await loadSample();
  if (pages.length < 12) console.warn(`warning: only ${pages.length} usable pages (want 12+)`);
  const per = Object.fromEntries([...ALL_RULES, "banned"].map((r) => [r, []]));
  const rep = [];
  let totalWords = 0;
  for (const p of pages) {
    totalWords += (p.text.match(/\p{L}+/gu) ?? []).length;
    for (const f of findPatterns(p.text, { lang: "en" })) per[f.rule].push({ page: p.id, match: f.match });
    for (const b of findBanned(p.text)) per.banned.push({ page: p.id, match: `${b.match} (“${p.text.slice(Math.max(0, b.index - 40), b.index + 50).replace(/\s+/g, " ")}”)` });
    const r = repeatedPhrases(p.text);
    const paras = blocksOf(p.text).filter((b) => b.kind === "para").length;
    rep.push({ page: p.id, paras, hits: r });
  }

  const opp = { "bold-label": 0, "ing-tail": 0, fragment: 0, "self-answer": 0 };
  for (const p of pages) {
    const blocks = blocksOf(p.text);
    for (const b of blocks) {
      if (b.kind === "list") opp["bold-label"] += b.text.split("\n").filter((l) => /^\s*(?:[-*+]|\d+[.)])\s+\*\*/.test(l)).length;
      if (b.kind === "para" || b.kind === "list") opp["ing-tail"] += (b.text.match(/,\s+\w+ing\b[^.!?\n]*[.!?]/g) ?? []).length;
      if (b.kind === "para" && !b.text.includes("\n") && b.text.split(/\s+/).length <= 6) opp.fragment++;
      if (b.kind === "para") opp["self-answer"] += (b.text.match(/\?\s+\S/g) ?? []).length;
    }
  }
  const n = pages.length;
  const lines = [];
  lines.push("# Style rules: human-sample test", "");
  lines.push(`Generated by \`node scripts/style/test-human.mjs\` on ${new Date().toISOString().slice(0, 10)}.`, "");
  lines.push(`Sample: ${n} human-written safety guidance pages (Wayback Machine snapshots 2015–2021), ${totalWords.toLocaleString("en")} words in total. Text extracted as light markdown (headings, list items, bold and tables kept) and cached in \`scripts/style/human-sample/\`.`, "");
  lines.push("| Page | Snapshot | Source |", "| --- | --- | --- |");
  for (const p of pages) lines.push(`| ${p.id} | ${p.snapshot.slice(0, 8)} | ${p.url} |`);
  lines.push("", "## Hits per rule", "", "| Rule | Hits | Pages hit | Hits per page |", "| --- | --- | --- | --- |");
  for (const r of [...ALL_RULES, "banned"]) {
    const h = per[r];
    lines.push(`| ${r} | ${h.length} | ${new Set(h.map((x) => x.page)).size} / ${n} | ${(h.length / n).toFixed(2)} |`);
  }
  lines.push("", "How often the human text gave each rule a chance to fire (so a zero means something):", "");
  lines.push(`- bold-label: ${opp["bold-label"]} list items starting with a bold label`);
  lines.push(`- ing-tail: ${opp["ing-tail"]} sentences with a comma + "-ing" clause`);
  lines.push(`- fragment: ${opp.fragment} one-line paragraphs of 6 words or fewer`);
  lines.push(`- self-answer: ${opp["self-answer"]} questions followed by more text in the same paragraph`);
  lines.push("", "## Examples", "");
  for (const r of [...ALL_RULES, "banned"]) {
    lines.push(`### ${r}`, "");
    if (!per[r].length) lines.push("No hits.", "");
    else {
      for (const h of per[r].slice(0, 15)) lines.push(`- ${h.page}: ${h.match.replace(/\s+/g, " ").slice(0, 220).replace(/\|/g, "\\|")}`);
      if (per[r].length > 15) lines.push(`- … and ${per[r].length - 15} more`);
      lines.push("");
    }
  }
  lines.push("## Repeated 4-word phrases (more than twice, body paragraphs only)", "");
  lines.push("Not a pass/fail rule for human text (the repetition limit is a site rule, not a style detector), shown so the counting can be sanity-checked.", "");
  lines.push("| Page | Body paragraphs | Phrases over limit | Top phrases |", "| --- | --- | --- | --- |");
  for (const r of rep) lines.push(`| ${r.page} | ${r.paras} | ${r.hits.length} | ${r.hits.slice(0, 4).map((h) => `${h.phrase} (×${h.count})`).join("; ")} |`);
  lines.push("");

  lines.push(HISTORY);
  lines.push("## Decision", "");
  lines.push("A rule stays scripted only if it fires on no more than about one human page in three and none of its hits is clearly good writing. Otherwise it goes to the checking pass.", "");
  lines.push("| Rule | Human hits | Decision |", "| --- | --- | --- |");
  for (const r of ALL_RULES) {
    const where = SCRIPTED_RULES.includes(r) ? "scripted" : JUDGMENT_RULES.some((j) => j.id === r) ? "judgment" : "?";
    lines.push(`| ${r} | ${per[r].length} on ${new Set(per[r].map((x) => x.page)).size}/${n} pages | ${where}${DECISION_NOTES[r] ? `: ${DECISION_NOTES[r]}` : ""} |`);
  }
  lines.push(`| banned | ${per.banned.length} on ${new Set(per.banned.map((x) => x.page)).size}/${n} pages | scripted (fixed list from the brief)${DECISION_NOTES.banned ? `: ${DECISION_NOTES.banned}` : ""} |`);
  for (const j of JUDGMENT_RULES.filter((j) => !ALL_RULES.includes(j.id))) lines.push(`| ${j.id} | ${["fragment-mid", "bold-noun-label"].includes(j.id) ? "split off a scripted rule (see above)" : "not scriptable"} | judgment |`);
  lines.push("");
  writeFileSync(join(here, "human-sample-report.md"), lines.join("\n"));
  console.log(`\n${n} pages, ${totalWords} words`);
  for (const r of [...ALL_RULES, "banned"]) console.log(`${r}: ${per[r].length} hits on ${new Set(per[r].map((x) => x.page)).size} pages`);
  console.log("report: scripts/style/human-sample-report.md");
}

// Why each rule ended where it did (filled in from the results of this test).
const DECISION_NOTES = {
  "bold-label": "narrowed to action labels (label starts with a verb: \"Inspect daily:\", \"Vérifiez…\", \"Prüfen Sie…\"); noun labels moved to the judgment rule bold-noun-label",
  "ing-tail": "kept; plain \", ensuring…\" / \", making it…\" only count with an evaluative object so factual clauses (\", ensuring that the forks are fully inserted\") pass",
  fragment: "narrowed: stock closers anywhere; verbless ≤6-word lines only in closer position (before a heading or at the end), never captions, citations or bold terms; mid-section fragments moved to the judgment rule fragment-mid",
  leftover: "kept",
  "self-answer": "its one hit is fine human writing, and the sample has almost no question-then-answer prose to test it on",
  banned: "the one hit is HSE's \"Furthermore\" (plain, correct usage); kept because the brief fixes this list, and a post can always say \"also\"",
};

// Results of the earlier runs that drove the narrowing (kept so the decision can be audited).
const HISTORY = `## How the rules were narrowed

1. **First run** (21 pages, 26,677 words), rules as first written:
   - bold-label: 3 hits on 1/21 pages, all glossary items in OSHA's sharps eTool (\`**I.V. connector systems:** Use needleless connector systems…\`, \`**Accessory safety devices:** have safety features…\`, \`**Needleless Connector Systems:** Needleless connectors for IV delivery…\`). Good human writing, so the rule was narrowed to action labels.
   - fragment: 5 hits on 2/21 pages: image captions in layout tables (\`Vertical mast type.\`, \`"Add on" sliding shield.\`, \`**(Figure 7) "Add on" Safety Feature.\`) and a citation (\`29 CFR 1910.1030(b).\`). Captions and citations were excluded.
   - ing-tail, leftover, self-answer: 0 hits. A wider probe for any comma + participle tail from the list (including plain \`, ensuring\` and \`, making it\`) also found 0, so the evaluative-object restriction on those two is a guard for factual clauses, not a response to a human hit.
2. **Second run** (29 pages, 36,956 words, 8 pages added):
   - fragment: 4 hits on 3/29 pages: the captions again (\`Vertical mast type.\`, \`Variable reach type.\`) and a CCOHS definition (\`**Likelihood**– the chance of something happening.\`). Bold-term lines were excluded and verbless fragments limited to closer position, since a script cannot tell a caption from a punchy fragment.
   - self-answer: 1 hit on 1/29 pages, CCOHS's hazard checklist (\`What could I fall from? (e.g., falls to lower levels)\`), which is fine writing. Only 17 question sentences appear in body paragraphs across the sample and almost all are stand-alone pseudo-headings, so the test cannot show the rule is reliable: judgment rule.
3. **Final run**: the table above.

Also checked against the site's own posts (not human text, for sanity): the narrowed bold-label rule first matched \`**Fit testing.** Anyone using a tight-fitting facepiece must be fit tested…\` (a noun phrase), so labels whose second word is a noun (-ing, -tion, -ment…) are not treated as action labels. Repetition counting now also skips quoted regulation wording, dated French/German regulation names (\`l'arrêté du 4 novembre 1993\`) and thousands separators.
`;

main();
