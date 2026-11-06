// Cheap pre-check for the workflow (no dependencies): is a post due?
// Writes due=true|false to $GITHUB_OUTPUT so the expensive steps can be skipped.
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const file = "data/schedule.json";
const s = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
const due = process.argv.includes("--force") || !s.nextDue || new Date(s.nextDue) <= new Date();
console.log(due ? "A post is due." : `Not due: next post at ${s.nextDue}.`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `due=${due}\n`);
