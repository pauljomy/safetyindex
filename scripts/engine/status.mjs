// Progress of the writing engine: `npm run engine:status` (safe to run while the engine runs).
import { existsSync, readFileSync } from "node:fs";
import { buildQueue } from "./queue.mjs";

const STATE = "data/jobs/state.jsonl";
const LOG = "data/jobs/run.log";
const state = new Map();
if (existsSync(STATE)) for (const l of readFileSync(STATE, "utf8").split("\n").filter(Boolean)) { try { const r = JSON.parse(l); state.set(r.id, r); } catch {} }
const queue = await buildQueue();
let running = false;
if (existsSync("data/jobs/run.pid")) { try { process.kill(Number(readFileSync("data/jobs/run.pid", "utf8")), 0); running = true; } catch {} }

const by = {};
for (const j of queue) {
  const s = state.get(j.id)?.status ?? "to do";
  ((by[j.template] ??= {})[s] = (by[j.template][s] ?? 0) + 1);
}
console.log(`Engine ${running ? "RUNNING" : "not running"} · ${queue.length} jobs in the queue`);
for (const [t, c] of Object.entries(by)) console.log(`  ${t.padEnd(16)} ${Object.entries(c).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
const recent = [...state.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
if (recent.length) { console.log("\nLast finished:"); for (const r of recent) console.log(`  ${r.at.slice(0, 16).replace("T", " ")}  ${r.status.padEnd(8)} ${r.id}${r.reason ? ` — ${r.reason.slice(0, 110)}` : ""}`); }
if (existsSync(LOG)) { console.log("\nLog tail:"); console.log(readFileSync(LOG, "utf8").trim().split("\n").slice(-8).map((l) => `  ${l.slice(0, 200)}`).join("\n")); }
