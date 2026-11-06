// When the next post is due. The workflow wakes every hour; the generator only
// does work when `nextDue` has passed. After each post the next one is set a
// random 24–36 hours later, so posts never land on a fixed rhythm.
// After a failure it retries `RETRY_HOURS` later, and emails on the 1st failure
// of an outage and every 4th one after that (not every retry).
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const SCHEDULE_FILE = "data/schedule.json";
export const MIN_HOURS = 24;
export const MAX_HOURS = 36;
export const RETRY_HOURS = 3;

export function readSchedule() {
  return existsSync(SCHEDULE_FILE) ? JSON.parse(readFileSync(SCHEDULE_FILE, "utf8")) : { nextDue: null, failures: 0, history: [] };
}
const save = (s) => writeFileSync(SCHEDULE_FILE, `${JSON.stringify(s, null, 2)}\n`);

export const isDue = (s, now = new Date()) => !s.nextDue || new Date(s.nextDue) <= now;

export function randomGapHours() {
  // Whole minutes between 24h00 and 36h00.
  const minutes = MIN_HOURS * 60 + Math.floor(Math.random() * ((MAX_HOURS - MIN_HOURS) * 60 + 1));
  return minutes / 60;
}

export function recordSuccess(s, { slug, title, usd }, now = new Date()) {
  const gap = randomGapHours();
  const next = new Date(now.getTime() + gap * 3600_000);
  s.lastPublished = now.toISOString();
  s.nextDue = next.toISOString();
  s.failures = 0;
  s.history = [...(s.history ?? []), { at: now.toISOString(), slug, title, nextGapHours: Number(gap.toFixed(2)), ...(usd != null && { apiUsd: usd }) }].slice(-200);
  save(s);
  return { next, gap };
}

/** Returns true when this failure should be emailed. */
export function recordFailure(s, message, now = new Date()) {
  s.failures = (s.failures ?? 0) + 1;
  s.lastError = { at: now.toISOString(), message: String(message).slice(0, 500) };
  s.nextDue = new Date(now.getTime() + RETRY_HOURS * 3600_000).toISOString();
  save(s);
  return s.failures === 1 || s.failures % 4 === 0;
}
