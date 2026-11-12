// Builds the checklist downloads (PDF + Excel) from src/content/checklists/{market}/{slug}.json.
//
//   node scripts/downloads/build.mjs [--force] [--only us/forklift-daily-check]
//
// Each JSON is rendered by build_checklist.py (Python: reportlab + openpyxl) into
// public/downloads/{market}/{slug}.pdf and .xlsx. A checklist is rebuilt only when the
// sha256 of its JSON + the strings file for its lang + build_checklist.py changes.
// Hashes, page and item counts live in data/downloads-manifest.json (committed).

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DOWNLOADS_DIR = join(ROOT, 'scripts/downloads');
export const CHECKLISTS_DIR = join(ROOT, 'src/content/checklists');
export const PUBLIC_DIR = join(ROOT, 'public/downloads');
export const MANIFEST_PATH = join(ROOT, 'data/downloads-manifest.json');
export const PY_SCRIPT = join(DOWNLOADS_DIR, 'build_checklist.py');
export const MARKETS = ['us', 'uk', 'au', 'ca', 'nz', 'de', 'fr'];
export const LANGS = ['en', 'de', 'fr'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const URL_RE = /^https:\/\/safetyindex\.blog\/[^\s"<>]*$/;

/** Python to run: $PYTHON, else the repo .venv, else python3 (CI installs requirements.txt). */
export function pythonBin() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const venv = join(ROOT, '.venv/bin/python');
  return existsSync(venv) ? venv : 'python3';
}

/** Every checklist JSON as { key, market, slug, file, pdf, xlsx }. key = "us/forklift-daily-check". */
export async function listChecklists() {
  if (!existsSync(CHECKLISTS_DIR)) return [];
  const out = [];
  for (const entry of (await readdir(CHECKLISTS_DIR, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const market = entry.name;
    if (!MARKETS.includes(market)) throw new Error(`src/content/checklists/${market}: unknown market folder (use ${MARKETS.join(', ')})`);
    for (const f of (await readdir(join(CHECKLISTS_DIR, market))).sort()) {
      if (!f.endsWith('.json')) continue;
      const slug = f.slice(0, -5);
      out.push({
        key: `${market}/${slug}`,
        market,
        slug,
        file: join(CHECKLISTS_DIR, market, f),
        pdf: join(PUBLIC_DIR, market, `${slug}.pdf`),
        xlsx: join(PUBLIC_DIR, market, `${slug}.xlsx`),
      });
    }
  }
  return out;
}

/** Parse and sanity-check one checklist JSON (Python repeats the safety checks). */
export async function readChecklist(c) {
  const raw = await readFile(c.file, 'utf8');
  const rel = relative(ROOT, c.file);
  if (/conform\.so/i.test(raw)) throw new Error(`${rel}: contains "conform.so"`);
  const data = JSON.parse(raw);
  const lang = data.lang ?? 'en';
  if (!LANGS.includes(lang)) throw new Error(`${rel}: lang must be one of ${LANGS.join(', ')}`);
  if (!SLUG_RE.test(c.slug)) throw new Error(`${rel}: file name must be a lowercase slug`);
  if (data.slug && data.slug !== c.slug) throw new Error(`${rel}: slug "${data.slug}" does not match the file name`);
  if (String(data.market ?? '').toLowerCase() !== c.market) throw new Error(`${rel}: market "${data.market}" does not match folder "${c.market}"`);
  if (!URL_RE.test(data.page_url ?? '')) throw new Error(`${rel}: page_url must be https://safetyindex.blog/...`);
  return { raw, data, lang };
}

export function itemsOf(data) {
  return data.sections.flatMap((s) => s.items.map((i) => i[0]));
}

export async function hashChecklist(c, raw, lang) {
  const h = createHash('sha256');
  for (const part of [raw, await readFile(join(DOWNLOADS_DIR, 'strings', `${lang}.json`)), await readFile(PY_SCRIPT)]) {
    h.update(part);
    h.update('\0');
  }
  return h.digest('hex');
}

export async function readManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return { checklists: {} };
  }
}

async function writeManifest(m) {
  const sorted = Object.fromEntries(Object.entries(m.checklists).sort(([a], [b]) => a.localeCompare(b)));
  await mkdir(dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(MANIFEST_PATH, JSON.stringify({ checklists: sorted }, null, 2) + '\n');
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/**
 * Build changed checklists. `only` = a key ("us/forklift-daily-check"), a slug, or an array of them.
 * Returns { built, skipped, removed, errors }.
 */
export async function buildDownloads({ force = false, only } = {}) {
  const wanted = only == null ? null : new Set([only].flat());
  const all = await listChecklists();
  const list = wanted ? all.filter((c) => wanted.has(c.key) || wanted.has(c.slug)) : all;
  if (wanted && !list.length) throw new Error(`no checklist matches ${[...wanted].join(', ')}`);

  const manifest = await readManifest();
  const result = { built: [], skipped: [], removed: [], errors: [] };
  const py = pythonBin();

  await pool(list, Math.max(1, Math.min(4, availableParallelism() - 1)), async (c) => {
    try {
      const { raw, data, lang } = await readChecklist(c);
      const hash = await hashChecklist(c, raw, lang);
      const prev = manifest.checklists[c.key];
      if (!force && prev?.hash === hash && existsSync(c.pdf) && existsSync(c.xlsx)) {
        result.skipped.push(c.key);
        return;
      }
      const { stdout } = await run(py, [PY_SCRIPT, c.file, '--pdf', c.pdf, '--xlsx', c.xlsx, '--json-result'], {
        cwd: ROOT,
        maxBuffer: 1 << 20,
      });
      const out = JSON.parse(stdout.trim().split('\n').pop());
      manifest.checklists[c.key] = {
        hash,
        lang,
        paper: data.paper ?? (['us', 'ca'].includes(c.market) ? 'letter' : 'a4'),
        pages: out.pages,
        items: out.items,
        page_url: data.page_url,
        pdf: `/downloads/${c.key}.pdf`,
        xlsx: `/downloads/${c.key}.xlsx`,
      };
      result.built.push(c.key);
    } catch (e) {
      const msg = (e.stderr || e.message || String(e)).trim().split('\n').slice(-3).join(' ');
      result.errors.push(`${c.key}: ${msg}`);
    }
  });

  // drop downloads whose JSON was deleted (only on a full run)
  if (!wanted) {
    const keys = new Set(all.map((c) => c.key));
    for (const key of Object.keys(manifest.checklists)) {
      if (keys.has(key)) continue;
      delete manifest.checklists[key];
      await rm(join(PUBLIC_DIR, `${key}.pdf`), { force: true });
      await rm(join(PUBLIC_DIR, `${key}.xlsx`), { force: true });
      result.removed.push(key);
    }
  }

  if (result.built.length || result.removed.length) await writeManifest(manifest);
  return result;
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const only = args.flatMap((a, i) => (args[i - 1] === '--only' ? [a] : []));
  try {
    const r = await buildDownloads({ force: args.includes('--force'), only: only.length ? only : undefined });
    for (const k of r.built) console.log(`built    ${k}`);
    for (const k of r.removed) console.log(`removed  ${k}`);
    console.log(`downloads: ${r.built.length} built, ${r.skipped.length} unchanged, ${r.removed.length} removed, ${r.errors.length} failed`);
    for (const e of r.errors) console.error(`error    ${e}`);
    process.exit(r.errors.length ? 1 : 0);
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}
