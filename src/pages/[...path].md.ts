// Markdown mirror: /blog/<slug>.md (and /fr/blog/<slug>.md …) for every post.
import type { APIRoute, GetStaticPaths } from "astro";
import { mirrors } from "../lib/mirror";

export const getStaticPaths: GetStaticPaths = async () =>
  (await mirrors()).map((m) => ({ params: { path: m.path.slice(1) }, props: { markdown: m.markdown } }));

export const GET: APIRoute = ({ props }) =>
  new Response(props.markdown, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
