// The writing engine's orchestrator (brief section 11). Resumable: finished jobs are recorded in
// data/jobs/state.jsonl and never redone; a stopped run (usage limit, crash, closed terminal) carries
// on where it left off when started again. Usage limits wait and retry inside each call.
//
//   npm run engine                          # the whole queue
//   npm run engine -- --limit 10            # stop after 10 finished jobs
//   npm run engine -- --ids standard:1926.501,guide:us:6
//   npm run engine -- --only standard,industry
//   npm run engine -- --dry-run             # print the queue
//   npm run engine:status                   # progress (from another terminal)
//
// Each finished page is committed on the current branch (never pushed). Workers: `workers` in
// scripts/config.yml (env WORKERS). Writer: `writer` (env WRITER=cli|api), model `writer_model`.
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { config } from "../lib/config.mjs";
import { buildQueue } from "./queue.mjs";
import { runStandard, readEnforcement } from "./jobs/standard.mjs";
import { runIndustry } from "./jobs/industry.mjs";
import { recordInSheet, writeGuide } from "../generate-post.mjs";
import { loadTopics } from "../lib/topics.mjs";
import { buildDownloads } from "../downloads/build.mjs";

export const STATE = "data/jobs/state.jsonl";
const LOG = "data/jobs/run.log";
const PID = "data/jobs/run.pid";
mkdirSync("data/jobs", { recursive: true });

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (k) => args.includes(`--${k}`);

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
function log(s) {
  const line = `[${stamp()}] ${s}`;
  console.log(line);
  appendFileSync(LOG, `${line}\n`);
}

export function readState() {
  const done = new Map();
  if (!existsSync(STATE)) return done;
  for (const l of readFileSync(STATE, "utf8").split("\n").filter(Boolean)) {
    try { const r = JSON.parse(l); done.set(r.id, r); } catch {}
  }
  return done;
}
const record = (r) => appendFileSync(STATE, `${JSON.stringify({ ...r, at: new Date().toISOString() })}\n`);

/** Serialises git commits and topic-sheet writes across workers. */
let chain = Promise.resolve();
const serial = (fn) => (chain = chain.then(fn, fn));

function commit(files, message) {
  try {
    execFileSync("git", ["add", "--", ...files], { stdio: "ignore" });
    execFileSync("git", ["commit", "-q", "-m", `${message}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, "--", ...files], { stdio: "ignore" });
  } catch (e) { log(`  (commit skipped: ${e.message.split("\n")[0]})`); }
}

async function runJob(job, ctx) {
  if (job.type === "standard") return runStandard(job, ctx);
  if (job.type === "industry") return runIndustry(job, ctx);
  const { topics } = await loadTopics();
  const topic = topics.find((t) => t.n === job.n);
  if (!topic) return { status: "dropped", reason: `topic #${job.n} not in the sheet` };
  const r = await writeGuide(topic, job.market, { log: ctx.log, replace: job.replace });
  await serial(() => recordInSheet(topic, job.market, r));
  return r;
}

async function main() {
  const queue = await buildQueue();
  const state = readState();
  let todo = queue.filter((j) => !["done", "dropped", "skipped", "waiting"].includes(state.get(j.id)?.status));
  if (opt("ids")) { const ids = new Set(opt("ids").split(",")); todo = queue.filter((j) => ids.has(j.id)); }
  if (opt("only")) { const t = new Set(opt("only").split(",")); todo = todo.filter((j) => t.has(j.type) || t.has(j.template)); }
  const limit = Number(opt("limit")) || Infinity;
  if (flag("dry-run")) {
    console.log(`${queue.length} jobs in the queue, ${todo.length} to do:`);
    todo.slice(0, Number(opt("show")) || 60).forEach((j, i) => console.log(`${String(i + 1).padStart(4)}. ${j.id}${j.keyword ? `  (${j.keyword}, vol ${j.clusterVolume ?? "?"}, KD ${j.kd ?? "?"})` : ""}`));
    return;
  }
  if (existsSync(PID)) {
    const pid = Number(readFileSync(PID, "utf8"));
    try { process.kill(pid, 0); throw new Error(`another engine run is active (pid ${pid}); stop it first`); } catch (e) { if (!/ESRCH/.test(e.code ?? e.message)) throw e; }
  }
  writeFileSync(PID, String(process.pid));
  process.on("exit", () => { try { unlinkSync(PID); } catch {} });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { log(`stopped (${sig}); run again to resume`); process.exit(130); });

  const enforcement = existsSync("data/pages/us/enforcement.json") ? readEnforcement() : null;
  const workers = Math.max(1, config.workers ?? 3);
  log(`engine start: ${todo.length} of ${queue.length} jobs to do, ${workers} worker(s), writer ${config.writer}${config.writer_model ? ` (${config.writer_model})` : ""}`);
  const perTemplate = {}; // template → { done, dropped }
  const paused = new Set();
  let finished = 0;
  let next = 0;

  async function worker(w) {
    while (finished < limit) {
      const job = todo[next++];
      if (!job) return;
      if (paused.has(job.template)) continue;
      if ((job.type === "standard" || job.type === "industry") && !enforcement) { log(`  skip ${job.id}: no enforcement data yet`); continue; }
      const t0 = Date.now();
      log(`▶ [w${w}] ${job.id}`);
      let r;
      try {
        r = await runJob(job, { log: (s) => log(`   [w${w}] ${s.trim()}`), enforcement });
      } catch (e) {
        log(`✖ [w${w}] ${job.id} crashed: ${e.stack?.split("\n").slice(0, 3).join(" | ") ?? e}`);
        record({ id: job.id, template: job.template, status: "failed", reason: String(e.message ?? e).slice(0, 500) });
        continue;
      }
      if (r.status === "done" && r.checklist) {
        try { await buildDownloads({ only: r.checklist }); r.files.push(`public/downloads/${r.checklist}.pdf`, `public/downloads/${r.checklist}.xlsx`, "data/downloads-manifest.json"); }
        catch (e) { log(`  ! downloads for ${r.checklist} failed: ${e.message}`); }
      }
      record({ id: job.id, template: job.template, status: r.status, reason: r.reason, files: r.files, notes: r.notes, path: r.path });
      finished++;
      const s = (perTemplate[job.template] ??= { done: 0, dropped: 0 });
      if (r.status === "done") s.done++; else if (r.status === "dropped") s.dropped++;
      log(`${r.status === "done" ? "✔" : "•"} [w${w}] ${job.id} ${r.status}${r.reason ? `: ${r.reason}` : ""} (${Math.round((Date.now() - t0) / 1000)}s)`);
      if (r.status === "done" && r.files?.length) await serial(() => commit([...r.files, "docs/Safety_Blog_Topics.xlsx"].filter((f) => existsSync(f)), `Engine: ${job.id}`));
      else if (job.type === "guide") await serial(() => commit(["docs/Safety_Blog_Topics.xlsx"], `Engine: ${job.id} ${r.status}`));
      // Template pause (section 11, rule 4): more than 10% of a template's pages dropped in this batch.
      const n = s.done + s.dropped;
      if (n >= config.template_drop_min_batch && s.dropped / n > config.template_drop_pause_share && !paused.has(job.template)) {
        paused.add(job.template);
        log(`⏸ template "${job.template}" paused: ${s.dropped} of ${n} pages dropped (> ${config.template_drop_pause_share * 100}%). Fix the prompt or template, then run again; dropped jobs can be retried by removing their lines from ${STATE}.`);
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, (_, i) => worker(i + 1)));
  log(`engine stop: ${finished} job(s) finished this run${paused.size ? `; paused templates: ${[...paused].join(", ")}` : ""}`);
  const summary = Object.entries(perTemplate).map(([t, s]) => `${t}: ${s.done} done, ${s.dropped} dropped`).join("; ");
  if (summary) log(`  ${summary}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { log(`✖ engine error: ${e.stack ?? e}`); process.exit(1); });
