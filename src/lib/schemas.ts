// Frontmatter pieces for posts.
import { z } from "astro/zod";

const words = (s: string) => s.trim().split(/\s+/).length;

/** The answer-first paragraph under the H1: 40–60 words, quotable alone. */
export const summary = z.string().superRefine((s, ctx) => {
  const n = words(s);
  if (n < 40 || n > 60) ctx.addIssue({ code: "custom", message: `summary must be 40–60 words (has ${n})` });
});
export const faq = z.array(z.object({ question: z.string(), answer: z.string() }));
export const sources = z.array(z.object({ title: z.string(), url: z.url() }));
export const keyTakeaways = z.array(z.string()).min(3).max(5);

export type Faq = z.infer<typeof faq>;
export type Sources = z.infer<typeof sources>;
