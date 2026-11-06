// Downloads source pages in Node (not through the model), so each page is read
// once instead of being re-read on every step of a server-side research loop.
// Keeps only the passages most relevant to the topic, so a 40-page document
// costs a few thousand tokens. A page counts as "opened" only if this file
// actually downloaded it; the validator rejects citations of anything else.
import { addOpened, normUrl } from "./claude.mjs";

const UA = "Mozilla/5.0 (compatible; SafetyIndexBot/1.0; +https://safetyindex.blog/about)";
export const MAX_CHARS_PER_SOURCE = 14000; // ≈ 3,500 tokens

const decode = (s) =>
  s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/g, "'").replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&sect;/g, "§").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&eacute;/g, "é")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

/** HTML → paragraphs of plain text, without navigation, scripts and page furniture. */
export function htmlToParagraphs(html) {
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
  return decode(
    main
      .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|iframe)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/table|\/ul|\/ol|\/dd|\/dt)\b[^>]*>/gi, "\n")
      .replace(/<(td|th)\b[^>]*>/gi, " | ")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<h([1-6])\b[^>]*>/gi, (_, n) => `\n${"#".repeat(Number(n))} `)
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\n+/)
    .map((p) => p.replace(/[ \t]+/g, " ").trim())
    .filter((p) => (p.length > 25 || /^#/.test(p)) && !BOILERPLATE.test(p));
}

/** Site furniture that survives tag stripping: browser warnings, feedback, cookies, sharing, menus. */
const BOILERPLATE =
  /unsupported browser|site feedback|website feedback|cookie|javascript (is )?(disabled|required)|skip to (main )?content|share (this|on)|print this page|subscribe|sign up for|newsletter|was this page helpful|last (reviewed|updated):?\s*$|^#+\s*(menu|related|share|contact us)\b|Office of the Federal Register publishes documents|choose the 'Website Feedback'|Microsoft Edge, Google Chrome|Content Feedback|contact the agency directly|Point-in-Time System|^Parallel Table of Authorities$/i;

const tokens = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{3,}/g) ?? [];

/** Keeps the most relevant paragraphs (in page order) up to `max` characters. */
export function excerpt(paragraphs, query, max = MAX_CHARS_PER_SOURCE) {
  const all = paragraphs.join("\n");
  if (all.length <= max) return all;
  const terms = new Set(tokens(query));
  const scored = paragraphs.map((p, i) => {
    const words = tokens(p);
    const hits = words.filter((w) => terms.has(w)).length;
    // Headings and numbered rules carry the structure; a little bonus keeps them.
    const bonus = /^#|^\(?[a-z0-9]{1,3}\)|§|\d+\.\d+/.test(p) ? 1 : 0;
    return { i, p, score: hits / Math.sqrt(words.length + 4) + bonus * 0.3 };
  });
  const keep = new Set();
  let used = 0;
  for (const s of [...scored].sort((a, b) => b.score - a.score)) {
    if (used + s.p.length + 1 > max) continue;
    keep.add(s.i);
    used += s.p.length + 1;
  }
  let out = "", last = -2;
  for (const s of scored) {
    if (!keep.has(s.i)) continue;
    if (s.i !== last + 1 && out) out += "\n[…]\n";
    out += `${s.p}\n`;
    last = s.i;
  }
  return out.trim();
}

/** Downloads one page. Throws when it can't be read as text (PDFs, blocks, errors). */
export async function fetchSource(url, query) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "Accept-Language": "en,fr;q=0.8,de;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/html|xml|text\/plain/.test(type)) throw new Error(`not a web page (${type || "unknown type"})`);
  const html = await res.text();
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const paragraphs = htmlToParagraphs(html);
  const text = excerpt(paragraphs, query);
  if (text.length < 400) throw new Error("too little readable text (likely a script-rendered or blocked page)");
  return { url, title: title || new URL(url).hostname, text };
}

/**
 * Downloads candidates until `max` succeed. Records each success as opened.
 * @returns {Promise<{url: string, title: string, text: string}[]>}
 */
export async function gatherSources(candidates, { query, opened, max = 8, log = console.log }) {
  const seen = new Set();
  const list = candidates.filter((c) => c?.url && /^https?:\/\//.test(c.url) && !seen.has(normUrl(c.url)) && seen.add(normUrl(c.url)));
  const got = [];
  for (let i = 0; i < list.length && got.length < max; i += 4) {
    const batch = list.slice(i, i + Math.min(4, max - got.length));
    const results = await Promise.allSettled(batch.map((c) => fetchSource(c.url, query)));
    results.forEach((r, j) => {
      if (r.status === "fulfilled") {
        got.push(r.value);
        addOpened(opened, batch[j].url);
        log(`    ✔ ${batch[j].url} (${r.value.text.length} chars)`);
      } else log(`    ✖ ${batch[j].url}: ${r.reason.message}`);
    });
  }
  return got;
}

/** Domains whose pages count as primary sources (regulators, law texts, standards bodies, agencies). */
const PRIMARY = /(^|\.)(osha\.gov|ecfr\.gov|govinfo\.gov|federalregister\.gov|cdc\.gov|nih\.gov|epa\.gov|fda\.gov|usda\.gov|fmcsa\.dot\.gov|dot\.gov|msha\.gov|dol\.gov|nfpa\.org|ansi\.org|iso\.org|hse\.gov\.uk|legislation\.gov\.uk|ilo\.org|who\.int|europa\.eu|inrs\.fr|travail-emploi\.gouv\.fr|service-public\.fr|code\.travail\.gouv\.fr|gouv\.fr|legifrance\.gouv\.fr|dguv\.de|baua\.de|gesetze-im-internet\.de|bmas\.de|bgbau\.de|bghm\.de|bgn\.de|bgw-online\.de|bgrci\.de|bghw\.de|vbg\.de|bgetem\.de|bgq\.de|svlfg\.de|ukbund\.de|preventionbtp\.fr|oppbtp\.com|ameli\.fr|carsat-[a-z-]+\.fr|cramif\.fr|anact\.fr|afnor\.org)$/i;
/** Government and intergovernmental domains anywhere (.gov, .gouv.fr, .gov.uk, .europa.eu, .int, …) count too. */
const OFFICIAL_TLD = /(\.gov|\.gouv\.fr|\.gov\.[a-z]{2}|\.gc\.ca|\.europa\.eu|\.int|\.bund\.de)$/i;
export const isPrimary = (url) => {
  try {
    const host = new URL(url).hostname;
    return PRIMARY.test(host) || OFFICIAL_TLD.test(host);
  } catch {
    return false;
  }
};

/**
 * Official-domain URLs only (regulators, law texts, standards bodies,
 * agencies): the model's picks first, then official URLs from the raw search
 * results, so a thin list from the model never starves the writer. Vendor
 * blogs, SEO pages and copies of the law (Wikipedia, Wikisource) are dropped.
 */
export function mergeCandidates(picked = [], searchResults = []) {
  const seen = new Set();
  const out = [];
  for (const c of [...(picked ?? []), ...(searchResults ?? [])].filter((c) => isPrimary(c?.url))) {
    if (!c?.url || seen.has(normUrl(c.url))) continue;
    seen.add(normUrl(c.url));
    out.push(c);
  }
  return out;
}

/** Sources as a prompt block. */
export const sourcesBlock = (sources) =>
  sources.map((s, i) => `<source id="${i + 1}" url="${s.url}" title="${s.title.replace(/"/g, "'")}">\n${s.text}\n</source>`).join("\n\n");
