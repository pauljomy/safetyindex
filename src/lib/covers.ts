// Shared cover images by subject (src/assets/covers/<subject>.webp), made by scripts/lib/cover.mjs.
import type { ImageMetadata } from "astro";
import { getImage } from "astro:assets";

const files = import.meta.glob<{ default: ImageMetadata }>("../assets/covers/*.webp", { eager: true });
const bySubject = new Map(Object.entries(files).map(([k, v]) => [k.replace(/^.*\/|\.webp$/g, ""), v.default]));

export const coverFor = (subject?: string) => (subject ? bySubject.get(subject) : undefined);

/** The 1200×630 social card (also the structured-data image), or undefined when there's no image yet. */
export async function socialCard(image?: ImageMetadata) {
  if (!image) return undefined;
  return (await getImage({ src: image, width: 1200, height: 630, fit: "cover", format: "jpg", quality: 80 })).src;
}
