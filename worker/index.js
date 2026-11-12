// Cloudflare Worker in front of the static assets (wrangler.jsonc). It only runs for requests that
// don't match a built file:
//  - POST /e: a cookie-free analytics event (checklist downloads, app button taps, store clicks), written
//    to Workers Analytics Engine (binding EVENTS) with the market; no cookies, no IP or user agent stored;
//  - any URL with capital letters: 301 to its lowercase form;
//  - retired URLs listed in /_gone.json: 410 Gone;
//  - everything else: the static assets (a real 404 page for unknown URLs). Moved pages 301 via public/_redirects.
const EVENTS = new Set(["download_pdf", "download_xlsx", "download_csv", "app_tap", "store_click"]);
let gone;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/e") {
      if (request.method !== "POST") return new Response(null, { status: 405 });
      try {
        const e = await request.json();
        if (EVENTS.has(e.e) && env.EVENTS) {
          env.EVENTS.writeDataPoint({ blobs: [e.e, String(e.m ?? "").slice(0, 4), String(e.c ?? "").slice(0, 120), String(e.p ?? "").slice(0, 200), String(e.s ?? "").slice(0, 20)], indexes: [e.e] });
        }
      } catch {}
      return new Response(null, { status: 204 });
    }
    if (/[A-Z]/.test(url.pathname)) {
      url.pathname = url.pathname.toLowerCase();
      return Response.redirect(url.toString(), 301);
    }
    if (!gone) {
      try { gone = new Set(await (await env.ASSETS.fetch(new URL("/_gone.json", url))).json()); } catch { gone = new Set(); }
    }
    if (gone.has(url.pathname.replace(/\/$/, ""))) {
      return new Response("<!doctype html><title>410 Gone</title><h1>This page has been removed</h1><p><a href=\"/\">Safety Index home</a></p>", { status: 410, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return env.ASSETS.fetch(request);
  },
};
