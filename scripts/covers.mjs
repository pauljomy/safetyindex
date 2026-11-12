// Cover images for pages that have none yet (brief section 9): released pages and the next wave,
// capped at max_images_per_run (the rest follow next run). One image per subject (`cover` field),
// shared by every page on that subject and by the French and German versions. Runs in the weekly
// GitHub Action (GOOGLE_CLOUD_API_KEY is a secret there) or locally when the key is in .env.
//   npm run covers [-- --dry-run]
import { existsSync, readFileSync, readdirSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { makeCover } from "./lib/cover.mjs";
import { config } from "./lib/config.mjs";

const DIR = "src/assets/covers";
const dry = process.argv.includes("--dry-run");
const subjects = new Map(); // subject → { prompt, released, path }

function add(d, path) {
  if (!d.cover || !d.coverPrompt || d.coverImage) return;
  const released = !!d.releaseDate || !d.generatedOn;
  const s = subjects.get(d.cover);
  if (!s || (released && !s.released)) subjects.set(d.cover, { prompt: d.coverPrompt, released, path, next: !released });
}
function* files(dir, ext) { if (!existsSync(dir)) return; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) yield* files(p, ext); else if (p.endsWith(ext)) yield p; } }
for (const f of files("src/content/posts", ".md")) add(YAML.parse(readFileSync(f, "utf8").match(/^---\n([\s\S]*?)\n---/)[1]), f);
for (const dir of ["src/content/standards", "src/content/industries", "src/content/reports"]) for (const f of files(dir, ".json")) add(JSON.parse(readFileSync(f, "utf8")), f);

const missing = [...subjects].filter(([s]) => !existsSync(join(DIR, `${s}.webp`)));
// Released pages first, then the pages about to be released (queue order is close enough to file order here).
const todo = [...missing.filter(([, v]) => v.released), ...missing.filter(([, v]) => !v.released).slice(0, config.release_per_week || 1e9)].slice(0, config.max_images_per_run);
console.log(`${missing.length} subject(s) without an image; making ${todo.length} this run (cap ${config.max_images_per_run})`);
if (dry) { for (const [s, v] of todo) console.log(`  ${s}: ${v.prompt.slice(0, 100)}`); process.exit(0); }
if (!process.env.GOOGLE_CLOUD_API_KEY) { console.log("GOOGLE_CLOUD_API_KEY is not set; no images made (pages build without them)."); process.exit(0); }
let made = 0;
for (const [s, v] of todo) {
  try { const r = await makeCover(s, v.prompt, { dir: DIR }); made++; console.log(`  ✔ ${r.file} (${r.kb} KB)`); }
  catch (e) { console.log(`  ✖ ${s}: ${e.message}`); }
}
mkdirSync("data/release", { recursive: true });
appendFileSync("data/release/covers.log", `${new Date().toISOString().slice(0, 10)}: ${made} image(s) made, ${missing.length - made} still missing\n`);
console.log(`${made} image(s) made this run`);
