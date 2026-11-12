// Release schedule (brief section 14). Generated pages wait (no releaseDate) until a wave releases
// them; the build only includes pages whose releaseDate has passed.
//   - first wave (nothing released yet): the top 50 US standard pages (queue order), the yearly report,
//     the injury statistics page and the penalties page (hubs follow automatically);
//   - then one wave a week of `release_per_week` pages in queue order (0 = everything), if the gates pass:
//     impressions gate: the latest wave released at least release_gate_min_age_days before the last day of
//       Search Console data needs ≥ release_gate_min_share of its URLs with impressions;
//     indexing gate: no more than 30% of a wave unindexed 4 weeks after release (URL Inspection results).
//   No old-enough wave or no Search Console data: release and log that the gate was skipped.
// On release a page gets releaseDate = date = today (its visible publish date is the day it went live).
//   node scripts/release/release.mjs [--dry-run] [--force]
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { config } from "../lib/config.mjs";
import { buildQueue } from "../engine/queue.mjs";
import { latestGsc } from "../gsc/data.mjs";

const WAVES = "data/release/waves.json";
const LOG = "data/release/log.md";
const today = new Date().toISOString().slice(0, 10);
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const readJson = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d);

/** Every generated page with its file, URL path, kind and release state. */
export function generatedPages() {
  const out = [];
  const md = (dir, market) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const file = join(dir, f);
      const text = readFileSync(file, "utf8");
      const d = YAML.parse(text.match(/^---\n([\s\S]*?)\n---/)[1]);
      if (!d.generatedOn) continue;
      const slug = f.replace(/\.md$/, "");
      const path = market === "us" ? `/blog/${slug}` : ["fr", "de"].includes(market) ? `/${market}/blog/${slug}` : `/${market}/guides/${slug}`;
      out.push({ kind: "guide", market, file, path, slug, data: d, released: !!d.releaseDate, topicN: d.topicN });
    }
  };
  md("src/content/posts", "us");
  for (const m of ["fr", "de", "uk", "au", "ca", "nz"]) md(join("src/content/posts", m), m);
  for (const [kind, dir, prefix] of [["standard", "src/content/standards", "/us/standards/"], ["industry", "src/content/industries", "/us/industries/"], ["report", "src/content/reports", "/us/reports/"]]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const file = join(dir, f);
      const d = JSON.parse(readFileSync(file, "utf8"));
      const slug = f.replace(/\.json$/, "");
      out.push({ kind: kind === "report" && d.kind === "penalties" ? "penalties" : kind, market: "us", file, path: d.kind === "penalties" ? "/us/osha-penalties" : prefix + slug, slug, data: d, released: !!d.releaseDate, section: d.section, naics: d.naics });
    }
  }
  return out;
}

/** Sets releaseDate (and the visible publish date) on a page file. */
function release(p) {
  if (p.file.endsWith(".json")) {
    const d = JSON.parse(readFileSync(p.file, "utf8"));
    d.releaseDate = today;
    if (!d.updated) d.date = today;
    writeFileSync(p.file, `${JSON.stringify(d, null, 2)}\n`);
  } else {
    let t = readFileSync(p.file, "utf8");
    const fm = t.match(/^---\n([\s\S]*?)\n---/)[1];
    const doc = YAML.parseDocument(fm);
    doc.set("releaseDate", today);
    if (!doc.get("updated")) doc.set("date", today);
    t = t.replace(fm, doc.toString({ lineWidth: 0 }).trimEnd());
    writeFileSync(p.file, t);
  }
}

/** Unreleased pages in queue order (the engine's priority), then anything else. */
async function inQueueOrder(pages) {
  const queue = await buildQueue().catch(() => []);
  const rank = new Map(queue.map((j, i) => [j.id, i]));
  const id = (p) => (p.kind === "standard" ? `standard:${p.section}` : p.kind === "industry" ? `industry:${p.naics}` : p.kind === "guide" ? `guide:${p.market}:${p.topicN}` : `report:${p.slug}`);
  return [...pages].sort((a, b) => (rank.get(id(a)) ?? (a.kind === "report" || a.kind === "penalties" ? -1 : 1e6)) - (rank.get(id(b)) ?? (b.kind === "report" || b.kind === "penalties" ? -1 : 1e6)));
}

/** The impressions and indexing gates. Returns { pass, notes }. */
export function gates(waves) {
  const notes = [];
  const gsc = latestGsc();
  if (!gsc) return { pass: true, notes: ["gates skipped: no Search Console data in data/gsc/"] };
  const lastDay = new Date(gsc.endDate);
  const old = waves.filter((w) => (lastDay - new Date(w.date)) / 864e5 >= config.release_gate_min_age_days).at(-1);
  let pass = true;
  if (!old) notes.push(`impressions gate skipped: no wave released ${config.release_gate_min_age_days}+ days before ${gsc.endDate}`);
  else {
    const withImpr = old.paths.filter((p) => (gsc.pageImpressions[p] ?? 0) > 0).length;
    const share = old.paths.length ? withImpr / old.paths.length : 1;
    notes.push(`impressions gate: wave ${old.wave} (${old.date}) has ${withImpr}/${old.paths.length} URLs with impressions (${(share * 100).toFixed(0)}%, needs ${config.release_gate_min_share * 100}%), data to ${gsc.endDate}`);
    if (share < config.release_gate_min_share) pass = false;
  }
  const insp = gsc.inspection ?? {};
  const aged = waves.filter((w) => (Date.now() - new Date(w.date)) / 864e5 >= config.indexing_gate_age_days).at(-1);
  if (aged && Object.keys(insp).length) {
    const checked = aged.paths.filter((p) => insp[p]);
    const unindexed = checked.filter((p) => !insp[p].indexed).length;
    if (checked.length) {
      const share = unindexed / checked.length;
      notes.push(`indexing gate: wave ${aged.wave} has ${unindexed}/${checked.length} inspected URLs not indexed (${(share * 100).toFixed(0)}%, max ${config.indexing_gate_max_unindexed_share * 100}%)`);
      if (share > config.indexing_gate_max_unindexed_share) { pass = false; notes.push("hold: improve the template before releasing more (indexing gate)"); }
    }
  } else notes.push("indexing gate skipped: no wave is 4 weeks old or no URL Inspection data");
  return { pass, notes };
}

export async function runRelease({ force = false } = {}) {
  const waves = readJson(WAVES, []);
  const pages = generatedPages();
  const waiting = await inQueueOrder(pages.filter((p) => !p.released && !p.data.noindex));
  const lines = [`## ${today}`];
  let wave;
  if (!waiting.length) lines.push("nothing waiting to release");
  else if (!waves.length) {
    const top = waiting.filter((p) => p.kind === "standard").slice(0, config.first_wave.top_us_standard_pages);
    const data = waiting.filter((p) => p.kind === "report" || p.kind === "penalties");
    wave = [...top, ...data];
    lines.push(`first wave: ${top.length} standard pages and ${data.length} data pages (hubs follow)`);
  } else {
    const g = force ? { pass: true, notes: ["gates bypassed with --force"] } : gates(waves);
    lines.push(...g.notes);
    if (!g.pass) lines.push("wave held");
    else wave = config.release_per_week > 0 ? waiting.slice(0, config.release_per_week) : waiting;
  }
  if (wave?.length) {
    if (!dry) for (const p of wave) release(p);
    waves.push({ wave: waves.length + 1, date: today, paths: wave.map((p) => p.path) });
    lines.push(`released wave ${waves.length}: ${wave.length} pages (${Object.entries(Object.groupBy(wave, (p) => p.kind)).map(([k, v]) => `${v.length} ${k}`).join(", ")}); ${waiting.length - wave.length} still waiting`);
    // Weekly reading list (section 14): 5 random pages from the wave just released.
    const pick = [...wave].sort(() => Math.random() - 0.5).slice(0, 5).map((p) => p.path);
    lines.push(`reading list: ${pick.join(", ")}`);
    if (!dry) appendReadingList(pick);
  }
  if (!dry) {
    mkdirSync("data/release", { recursive: true });
    writeFileSync(WAVES, `${JSON.stringify(waves, null, 1)}\n`);
    writeFileSync(LOG, `${lines.join("\n")}\n\n${existsSync(LOG) ? readFileSync(LOG, "utf8") : ""}`);
  }
  console.log(lines.join("\n"));
  return { released: wave?.length ?? 0, lines };
}

function appendReadingList(paths) {
  const f = "PROGRESS.md";
  const site = "https://safetyindex.blog";
  const block = `\n### Pages for Paul to read this week (${today})\n\n${paths.map((p) => `- ${site}${p}`).join("\n")}\n`;
  let t = readFileSync(f, "utf8");
  if (!t.includes("## Weekly reading lists")) t += "\n## Weekly reading lists\n";
  t = t.replace("## Weekly reading lists\n", `## Weekly reading lists\n${block}`);
  writeFileSync(f, t);
}

if (import.meta.url === `file://${process.argv[1]}`) await runRelease({ force: args.includes("--force") });
