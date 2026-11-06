// The page's canonical path from Astro.url.pathname: no ".html", no trailing slash, "/" for home.
export function pagePath(pathname: string): string {
  const p = pathname.replace(/\.html$/, "").replace(/\/index$/, "/").replace(/(.)\/$/, "$1");
  return p || "/";
}
