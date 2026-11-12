// Checks the checklist downloads against their JSON.
//
//   node scripts/downloads/verify.mjs [--sample 5]
//
// For every src/content/checklists/{market}/{slug}.json:
//  - the manifest entry is current (hash) and the PDF opens with the expected page count (pdfinfo);
//  - the Excel file, recalculated by LibreOffice headless, has no formula errors, the same
//    checklist items (count and names) as the JSON, and a computing summary;
//  - neither file contains "conform.so".
// Then renders the first page of `sample` random PDFs to PNG (pdftoppm) and prints the paths,
// so a person (or Claude) can look at them for layout problems.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { inflateRawSync } from 'node:zlib';
import {
  DOWNLOADS_DIR, PUBLIC_DIR, hashChecklist, itemsOf, listChecklists, readChecklist, readManifest,
} from './build.mjs';

const run = promisify(execFile);
const ERROR_RE = /#REF!|#VALUE!|#NAME\?|#DIV\/0!|#N\/A|#NUM!|#NULL!|Err:\d+/;
const FORBIDDEN = /conform\.so/i;

/** Minimal CSV parser (RFC 4180: quotes, doubled quotes, newlines in fields). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Text of every entry in a zip (xlsx) file, inflated. */
function unzipText(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  let text = '';
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip central directory');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(dataStart, dataStart + size);
    text += (method === 8 ? inflateRawSync(data) : data).toString('utf8') + '\n';
    p += 46 + nameLen + extra + comment;
  }
  return text;
}

/** LibreOffice profile that recalculates every formula on load (no cached values trusted). */
async function loProfile(dir) {
  const user = join(dir, 'lo-profile', 'user');
  await mkdir(user, { recursive: true });
  const item = (path, name) =>
    `<item oor:path="${path}"><prop oor:name="${name}" oor:op="fuse"><value>0</value></prop></item>`;
  await writeFile(join(user, 'registrymodifications.xcu'), `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
${item('/org.openoffice.Office.Calc/Formula/Load', 'OOXMLRecalcMode')}
${item('/org.openoffice.Office.Calc/Formula/Load', 'ODFRecalcMode')}
</oor:items>
`);
  return pathToFileURL(join(dir, 'lo-profile')).href;
}

async function pdfPages(file) {
  const { stdout } = await run('pdfinfo', [file]);
  return Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1]);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Returns { ok, errors, pngs }. */
export async function verifyDownloads({ sample = 5 } = {}) {
  const errors = [];
  const list = await listChecklists();
  const manifest = await readManifest();
  const tmp = await mkdtemp(join(tmpdir(), 'si-downloads-'));
  const csvDir = join(tmp, 'csv');
  const xlsxDir = join(tmp, 'xlsx');
  await mkdir(xlsxDir, { recursive: true });

  const checks = [];
  for (const c of list) {
    const err = (m) => errors.push(`${c.key}: ${m}`);
    let parsed;
    try {
      parsed = await readChecklist(c);
    } catch (e) {
      err(e.message);
      continue;
    }
    const entry = manifest.checklists?.[c.key];
    if (!entry) { err('not in data/downloads-manifest.json (run npm run downloads)'); continue; }
    if (entry.hash !== (await hashChecklist(c, parsed.raw, parsed.lang))) err('download is out of date (run npm run downloads)');
    if (!existsSync(c.pdf)) { err(`missing ${c.pdf}`); continue; }
    if (!existsSync(c.xlsx)) { err(`missing ${c.xlsx}`); continue; }

    // PDF: opens, page count, forbidden domain
    try {
      const pages = await pdfPages(c.pdf);
      if (pages !== entry.pages) err(`PDF has ${pages} pages, manifest says ${entry.pages}`);
      const { stdout: text } = await run('pdftotext', ['-enc', 'UTF-8', c.pdf, '-'], { maxBuffer: 16 << 20 });
      if (FORBIDDEN.test(text) || FORBIDDEN.test((await readFile(c.pdf)).toString('latin1'))) err('PDF contains "conform.so"');
      if (!text.includes(parsed.data.page_url)) err('PDF does not show page_url');
    } catch (e) {
      err(`PDF does not open: ${(e.stderr || e.message).trim()}`);
    }

    // Excel: forbidden domain in any part of the package; then queue for recalculation
    try {
      if (FORBIDDEN.test(unzipText(await readFile(c.xlsx)))) err('Excel file contains "conform.so"');
    } catch (e) {
      err(`Excel file is not a valid xlsx: ${e.message}`);
      continue;
    }
    const base = c.key.replace('/', '__');
    await copyFile(c.xlsx, join(xlsxDir, `${base}.xlsx`));
    checks.push({ c, base, data: parsed.data, lang: parsed.lang, err });
  }

  // one LibreOffice run recalculates and exports every workbook
  if (checks.length) {
    try {
      await run('soffice', [
        `-env:UserInstallation=${await loProfile(tmp)}`, '--headless', '--norestore',
        '--convert-to', 'csv:Text - txt - csv (StarCalc):44,34,76',
        '--outdir', csvDir, ...checks.map((x) => join(xlsxDir, `${x.base}.xlsx`)),
      ], { timeout: 300_000, maxBuffer: 16 << 20 });
    } catch (e) {
      errors.push(`LibreOffice conversion failed: ${(e.stderr || e.message).trim()}`);
    }
  }

  for (const { c, base, data, lang, err } of checks) {
    const csvFile = join(csvDir, `${base}.csv`);
    if (!existsSync(csvFile)) { err('Excel file did not open in LibreOffice'); continue; }
    const csv = await readFile(csvFile, 'utf8');
    const rows = parseCsv(csv);
    rows.forEach((row, r) => row.forEach((cell, col) => {
      if (ERROR_RE.test(cell)) err(`Excel formula error ${JSON.stringify(cell)} at ${String.fromCharCode(65 + col)}${r + 1}`);
    }));
    if (FORBIDDEN.test(csv)) err('Excel sheet contains "conform.so"');

    // checklist rows: column A is the item number
    const got = rows.filter((row) => /^\d+$/.test(row[0] ?? '') && row[1]).map((row) => row[1].split('\n')[0].trim());
    const want = itemsOf(data);
    if (got.length !== want.length) err(`Excel has ${got.length} checklist items, JSON has ${want.length}`);
    else want.forEach((name, i) => { if (got[i] !== name) err(`Excel item ${i + 1} is ${JSON.stringify(got[i])}, JSON says ${JSON.stringify(name)}`); });

    // the summary computes: an empty sheet reads "0 of N" and "pending"
    const s = JSON.parse(await readFile(join(DOWNLOADS_DIR, 'strings', `${lang}.json`), 'utf8'));
    const cellFor = (label) => rows.find((row) => row[0] === label)?.[2];
    const expectChecked = s.checked_of.replace('{checked}', '0').replace('{total}', want.length);
    if (cellFor(s.sum_checked) !== expectChecked) err(`summary "${s.sum_checked}" reads ${JSON.stringify(cellFor(s.sum_checked))}, expected ${JSON.stringify(expectChecked)}`);
    if (cellFor(s.sum_safe) !== s.result_pending) err(`summary "${s.sum_safe}" reads ${JSON.stringify(cellFor(s.sum_safe))}, expected ${JSON.stringify(s.result_pending)}`);
    if (!csv.includes(data.page_url)) err('Excel sheet does not show page_url');
  }

  // downloads with no JSON behind them
  const keys = new Set(list.map((c) => c.key));
  if (existsSync(PUBLIC_DIR)) {
    for (const market of await readdir(PUBLIC_DIR)) {
      for (const f of await readdir(join(PUBLIC_DIR, market)).catch(() => [])) {
        const key = `${market}/${f.replace(/\.(pdf|xlsx)$/, '')}`;
        if (!keys.has(key)) errors.push(`public/downloads/${market}/${f}: no checklist JSON (run npm run downloads)`);
      }
    }
  }

  // render first pages of a random sample for a visual check
  const pngs = [];
  const pngDir = join(tmp, 'png');
  await mkdir(pngDir, { recursive: true });
  for (const c of shuffle(list.filter((x) => existsSync(x.pdf))).slice(0, sample)) {
    const prefix = join(pngDir, c.key.replace('/', '__'));
    try {
      await run('pdftoppm', ['-f', '1', '-l', '1', '-r', '80', '-png', '-singlefile', c.pdf, prefix]);
      pngs.push(`${prefix}.png`);
    } catch (e) {
      errors.push(`${c.key}: pdftoppm failed: ${(e.stderr || e.message).trim()}`);
    }
  }

  return { ok: errors.length === 0, errors, pngs };
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--sample');
  const sample = i > -1 ? Number(process.argv[i + 1]) : 5;
  const r = await verifyDownloads({ sample });
  for (const e of r.errors) console.error(`error  ${e}`);
  for (const p of r.pngs) console.log(`png    ${p}`);
  console.log(r.ok ? 'downloads: all checks passed' : `downloads: ${r.errors.length} problem(s)`);
  process.exit(r.ok ? 0 : 1);
}
