// data/rewrite-queue.json: pages the engine should rewrite in place. The build checks write entries
// for pages from before the build that fail a new check ({ path, problems }); the maintenance scripts
// add entries with `from` ("rule-changes", "audit") and a reason, which the build keeps until the
// engine has rewritten the page (scripts/engine/queue.mjs turns every entry into a rewrite job).
import { createHash } from "node:crypto";
import { readJson, today, writeJson } from "./common.mjs";

export const REWRITE_QUEUE = "data/rewrite-queue.json";

export const readRewriteQueue = () => readJson(REWRITE_QUEUE, []);

/** Adds maintenance entries (deduped by path + from). Returns how many were new. */
export function addToRewriteQueue(entries, { dryRun = false } = {}) {
  const q = readRewriteQueue();
  let added = 0;
  for (const e of entries) {
    const hit = q.find((x) => x.path === e.path && x.from === e.from);
    if (hit) { for (const p of e.problems ?? []) if (!hit.problems.includes(p)) hit.problems.push(p); continue; }
    q.push({ path: e.path, problems: e.problems ?? [], from: e.from, addedOn: e.addedOn ?? today() });
    added++;
  }
  if (!dryRun) writeJson(REWRITE_QUEUE, q, 2);
  return added;
}

/** Removes a page's maintenance entries once it has been rewritten (check entries go at the next build). */
export function doneInRewriteQueue(path) {
  const q = readRewriteQueue();
  const left = q.filter((x) => !(x.path === path && x.from));
  if (left.length !== q.length) writeJson(REWRITE_QUEUE, left, 2);
}

/** A stable id for a rewrite request, so a new request for the same page is a new engine job. */
export const rewriteJobId = (e) => `rewrite-queue:${e.path}:${createHash("sha1").update(JSON.stringify([e.from ?? "checks", e.addedOn ?? "", e.problems ?? []])).digest("hex").slice(0, 8)}`;
