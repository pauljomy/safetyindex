// robots.txt: everything open, AI crawlers named explicitly, sitemap index linked.
import type { APIRoute } from "astro";
import { site } from "../config/site.mjs";

const aiCrawlers = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot",
  "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "Bingbot", "CCBot",
];

export const GET: APIRoute = () => {
  const body = [
    "User-agent: *", "Allow: /", "",
    `# AI search and answer engines are welcome to read and cite ${site.name}.`,
    ...aiCrawlers.flatMap((bot) => [`User-agent: ${bot}`, "Allow: /", ""]),
    `Sitemap: ${site.url}/sitemap-index.xml`, "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
