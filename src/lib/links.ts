// Applies generated in-body links to rendered HTML (see src/lib/linker.mjs).
import { linkHtml } from "./linker.mjs";
import { livePages } from "./content";
import { marketOf } from "../i18n/ui";

/** Links first mentions in `html` to live pages in the same market. `used` is shared across a page's blocks. */
export async function withLinks(html: string, self: string, used: Set<string> = new Set()): Promise<string> {
  const m = marketOf(self);
  const targets = (await livePages()).filter((p) => p.market === m);
  return linkHtml(html, targets, { self, used }).html;
}
