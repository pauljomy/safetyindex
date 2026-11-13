// The weekly run on Paul's computer (brief section 16): `npm run weekly`. Needs the Claude CLI (the improve
// loop and the engine write through `claude -p`). Works on the branch `weekly-improve`:
//   0. fetch origin; check out (or create) weekly-improve; rebase it on origin/main (the weekly Action
//      commits cover images, release dates and Search Console summaries there);
//   1. Search Console pull (falls back to manual exports without credentials);
//   2. improve loop (at most improve_max_changes_per_week changes);
//   3. zero-impression pages (dry run unless --apply);
//   4. rule changes (eCFR amendments → rewrite queue);
//   5. monthly recheck of the topic sheet's Waiting rows (only when the last one is 28+ days old);
//   6. up to weekly_new_pages pages from the engine queue (new topics, rows that now pass, the rewrite queue);
//   7. weekly report in PROGRESS.md;
//   8. npm run build (every check).
// Each stage is committed on weekly-improve. A failing stage is logged and the run continues where that is
// safe. If improve_auto_push is true and the build passes, weekly-improve is merged into main and pushed (the
// next weekly Action deploys it); otherwise the branch is left as it is and PROGRESS.md says what's waiting.
// A failing build is never pushed.
//   npm run weekly [-- --apply] [--no-push] [--dry-run]
// --dry-run: no git, no writing, no OpenSEO lookups, no build; runs each stage's own dry run.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "./lib/config.mjs";
import { today } from "./gsc/common.mjs";

const BRANCH = "weekly-improve";
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const apply = args.includes("--apply");
const noPush = args.includes("--no-push");
const day = today();
export const CRON_LINE = "0 6 * * 5 cd /mnt/e/safetyindex && /usr/bin/env PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin npm run weekly >> data/weekly.log 2>&1";
// Paths a weekly run may change (never anything else is committed).
const PATHS = ["src/content", "docs/Safety_Blog_Topics.xlsx", "data", "public/_redirects", "public/downloads", "PROGRESS.md"];

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (s) => console.log(`[${stamp()}] ${s}`);
const git = (...a) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (...a) => { try { return { ok: true, out: git(...a) }; } catch (e) { return { ok: false, out: `${e.stderr ?? ""}${e.message}`.trim() }; } };

/** Runs a Node script as its own process (a crash in one stage can't take the run down). */
function node(script, extra = [], { timeoutMs = 6 * 3600_000 } = {}) {
  const r = spawnSync(process.execPath, ["--env-file-if-exists=.env", script, ...extra], { stdio: "inherit", timeout: timeoutMs });
  return r.status === 0;
}

function commit(stage) {
  if (dry) return;
  tryGit("add", "-A", "--", ...PATHS.filter((p) => existsSync(p)));
  if (tryGit("diff", "--cached", "--quiet").ok) return;
  const r = tryGit("commit", "-q", "-m", `Weekly ${day}: ${stage}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`);
  log(r.ok ? `  committed: ${stage}` : `  ! commit failed (${stage}): ${r.out.split("\n")[0]}`);
}

/** Adds a line under this week's report heading in PROGRESS.md (or at the end when there's no report). */
function noteInProgress(text) {
  if (dry || !existsSync("PROGRESS.md")) return;
  let t = readFileSync("PROGRESS.md", "utf8");
  const h = `### Week of ${day}\n`;
  t = t.includes(h) ? t.replace(h, `${h}\n**Weekly run:** ${text}\n`) : `${t.trimEnd()}\n\n**Weekly run ${day}:** ${text}\n`;
  writeFileSync("PROGRESS.md", t);
}

async function main() {
  log(`weekly run ${day}${dry ? " (dry run)" : ""}${apply ? " (--apply)" : ""}`);
  const failed = [];
  const stage = (name, ok) => { if (!ok) { failed.push(name); log(`  ✖ ${name} failed; carrying on`); } else log(`  ✔ ${name}`); commit(name); return ok; };

  // 0. Branch.
  let startBranch = null;
  if (!dry) {
    if (spawnSync("claude", ["--version"], { stdio: "ignore" }).status !== 0) log("  ! the Claude CLI isn't on the PATH: the improve loop and the engine will fail (see the crontab PATH)");
    if (tryGit("status", "--porcelain", "--untracked-files=no").out) { log("✖ the working tree has uncommitted changes; commit or stash them first. Nothing done."); process.exitCode = 1; return; }
    startBranch = tryGit("rev-parse", "--abbrev-ref", "HEAD").out;
    const f = tryGit("fetch", "origin");
    if (!f.ok) log(`  ! git fetch failed: ${f.out.split("\n")[0]}; working from the local copy of main`);
    const base = tryGit("rev-parse", "--verify", "origin/main").ok ? "origin/main" : "main";
    const exists = tryGit("rev-parse", "--verify", BRANCH).ok;
    const co = exists ? tryGit("checkout", "-q", BRANCH) : tryGit("checkout", "-q", "-b", BRANCH, base);
    if (!co.ok) { log(`✖ couldn't check out ${BRANCH}: ${co.out.split("\n")[0]}`); process.exitCode = 1; return; }
    const rb = tryGit("rebase", "-q", base);
    if (!rb.ok) { tryGit("rebase", "--abort"); log(`✖ rebasing ${BRANCH} on ${base} hit a conflict; resolve it by hand. Nothing else done.`); process.exitCode = 1; return; }
    log(`  on ${BRANCH}, rebased on ${base}`);
  }

  // 1–5. Data, improve loop, maintenance.
  stage("Search Console pull", node("scripts/gsc/pull.mjs"));
  stage("improve loop", node("scripts/gsc/improve.mjs", dry ? ["--dry-run"] : []));
  stage("zero-impression pages", node("scripts/maintenance/impressions.mjs", apply && !dry ? ["--apply"] : []));
  stage("rule changes", node("scripts/maintenance/rule-changes.mjs", dry ? ["--dry-run"] : []));
  stage("Waiting rows recheck", node("scripts/keywords/recheck-waiting.mjs", dry ? ["--dry-run"] : []));

  // 6. New pages from the engine queue (the engine commits each page itself).
  const n = config.weekly_new_pages ?? 10;
  if (n > 0) stage(`engine (up to ${n} pages)`, node("scripts/engine/run.mjs", dry ? ["--dry-run", "--show", String(n)] : ["--limit", String(n)]));

  // 7. Report.
  stage("weekly report", node("scripts/gsc/report.mjs", dry ? ["--dry-run"] : []));

  // 8. Build and every check.
  if (dry) { log(`dry run done. Crontab line:\n${CRON_LINE}`); return; }
  log("  building (npm run build)…");
  const built = spawnSync("npm", ["run", "build"], { stdio: "inherit", timeout: 3 * 3600_000 }).status === 0;
  if (!built) failed.push("build");
  log(built ? "  ✔ build and checks passed" : "  ✖ build or checks failed");
  commit("build outputs (rewrite queue)");

  // 9. Merge and push, or leave on the branch.
  let result;
  if (built && config.improve_auto_push && !noPush) {
    const steps = [["checkout", "-q", "main"], ["pull", "-q", "--ff-only", "origin", "main"], ["merge", "-q", "--no-edit", BRANCH], ["push", "-q", "origin", "main"]];
    let err = null;
    for (const s of steps) { const r = tryGit(...s); if (!r.ok) { err = `git ${s.slice(0, 2).join(" ")}: ${r.out.split("\n")[0]}`; break; } }
    if (err) { tryGit("merge", "--abort"); tryGit("checkout", "-q", BRANCH); result = `not pushed (${err}); the changes wait on ${BRANCH}.`; }
    else result = `merged into main and pushed${failed.length ? ` (stages that failed and were skipped: ${failed.join(", ")})` : ""}; the next weekly Action deploys it.`;
  } else {
    const why = !built ? "the build or a check failed" : noPush ? "--no-push was given" : "improve_auto_push is false";
    result = `left on branch ${BRANCH} because ${why}${failed.length ? `; failed stages: ${failed.join(", ")}` : ""}. Review it, then merge into main.`;
  }
  log(`weekly run: ${result}`);
  const onMain = tryGit("rev-parse", "--abbrev-ref", "HEAD").out === "main";
  if (!onMain) tryGit("checkout", "-q", BRANCH);
  noteInProgress(result);
  if (!onMain) commit("weekly run result");
  else if (!tryGit("diff", "--quiet", "--", "PROGRESS.md").ok) { tryGit("add", "PROGRESS.md"); tryGit("commit", "-q", "-m", `Weekly ${day}: run result\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`); tryGit("push", "-q", "origin", "main"); }
  if (startBranch && startBranch !== "HEAD" && !tryGit("status", "--porcelain", "--untracked-files=no").out) tryGit("checkout", "-q", startBranch);
  log(`To run this every Monday at 06:00, add this line with crontab -e:\n${CRON_LINE}`);
  if (!built) process.exitCode = 1;
}

main().catch((e) => { log(`✖ weekly run crashed: ${e.stack ?? e}`); process.exitCode = 1; });
