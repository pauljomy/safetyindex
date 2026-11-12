// Generated in-body links (brief section 8). When a page mentions a clause or
// standard that has its own live page in the same market ("1926.451(f)(3)"), or
// a topic that has a live guide (the guide's linkPhrases), the first mention links
// to that page. Each target gets at most one in-body link per page; the anchor is
// the mention itself, so it names the target and varies naturally.
// Plain JS so the build checks (scripts/check-dist.mjs) reuse the same patterns.

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {{ path: string, kind: string, own?: string, phrases?: string[] }} t a live page
 * @returns {RegExp | null}
 */
export function targetPattern(t) {
  const parts = [];
  if (t.kind === "standard" && t.own) parts.push(`(?:29 CFR\\s*)?(?:§\\s*)?${esc(t.own)}(?![\\d.])(?:\\([A-Za-z0-9]{1,4}\\))*`);
  for (const p of t.phrases ?? []) if (p && p.trim().length >= 4) parts.push(`(?<![\\p{L}\\p{N}])${esc(p.trim()).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`);
  return parts.length ? new RegExp(parts.join("|"), "iu") : null;
}

// Elements whose text never gets a generated link.
const SKIP = new Set(["a", "h1", "h2", "h3", "h4", "h5", "h6", "code", "pre", "script", "style", "button", "title", "option", "label", "summary", "svg", "nav"]);

/**
 * Links first mentions in an HTML fragment.
 * @param {string} html
 * @param {{ path: string, kind: string, own?: string, phrases?: string[] }[]} targets live pages in the same market
 * @param {{ self: string, used?: Set<string> }} ctx the page's own path; `used` carries targets already linked on the page
 * @returns {{ html: string, linked: string[] }}
 */
export function linkHtml(html, targets, { self, used = new Set() }) {
  const pats = targets.filter((t) => t.path !== self && !used.has(t.path)).map((t) => ({ t, re: targetPattern(t) })).filter((x) => x.re);
  if (!pats.length) return { html, linked: [] };
  const linked = [];
  const stack = [];
  let skip = 0;
  const out = [];
  for (const tok of html.split(/(<[^>]+>)/g)) {
    if (!tok) continue;
    if (tok.startsWith("<")) {
      const m = tok.match(/^<\s*(\/)?\s*([a-zA-Z0-9]+)/);
      if (m) {
        const name = m[2].toLowerCase();
        const selfClosing = /\/>$/.test(tok) || ["br", "img", "hr", "input", "meta", "link", "source", "wbr", "col"].includes(name);
        if (!m[1] && !selfClosing) { stack.push(name); if (SKIP.has(name)) skip++; }
        else if (m[1]) {
          const i = stack.lastIndexOf(name);
          if (i >= 0) { for (const n of stack.splice(i)) if (SKIP.has(n)) skip--; }
        }
      }
      out.push(tok);
      continue;
    }
    if (skip > 0) { out.push(tok); continue; }
    let text = tok;
    let acc = "";
    for (;;) {
      let best = null;
      for (const p of pats) {
        if (used.has(p.t.path)) continue;
        const m = p.re.exec(text);
        if (m && (!best || m.index < best.m.index)) best = { p, m };
      }
      if (!best) break;
      const { m, p } = best;
      acc += `${text.slice(0, m.index)}<a href="${p.t.path}" data-gen-link>${m[0]}</a>`;
      text = text.slice(m.index + m[0].length);
      used.add(p.t.path);
      linked.push(p.t.path);
    }
    out.push(acc + text);
  }
  return { html: out.join(""), linked };
}

/** Escapes plain text for HTML. */
export const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
