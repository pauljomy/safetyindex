import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { entity, site } from "../config/site.mjs";
import { getPosts, url } from "../lib/content";

export const GET: APIRoute = async (context) =>
  rss({
    title: site.name,
    description: entity.definition,
    site: context.site!,
    items: (await getPosts("en")).filter((p) => !p.data.noindex).map((p) => ({
      title: p.data.title, description: p.data.description, pubDate: p.data.date, link: url.post(p.id),
    })),
  });
