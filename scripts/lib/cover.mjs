// The one cover-image helper for every page type (guides, standard, industry, report and penalty pages).
// Shared subject images go to src/assets/covers/<subject>.webp (pass `dir`); the original guides keep
// src/content/posts/images/. Featured image for each post: one realistic photograph per topic, generated
// by a Gemini Flash Image model on Vertex AI, saved as a compressed WebP in
// src/content/posts/images/<english-slug>.webp. Translations reuse the same file
// with their own alt text. The key (GOOGLE_CLOUD_API_KEY) is only read by this
// Node script; nothing here reaches the browser.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

export const COVER_CONFIG = {
  /** Google Cloud project the key belongs to; override with GOOGLE_CLOUD_PROJECT. */
  project: process.env.GOOGLE_CLOUD_PROJECT || "conform-blog-513213",
  location: "global",
  /** Override with GEMINI_IMAGE_MODEL. */
  model: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image",
  imageSize: "1K",
  aspectRatio: "16:9",
  style:
    "realistic photograph of a real workplace in bright natural daylight, true-to-life colours, sharp focus, equipment shown worn and used correctly and safely, no visible text, letters, numbers, signs with writing, logos or watermarks",
  width: 1600,
  webpQuality: 72,
  dir: "src/content/posts/images",
  timeoutMs: 120_000,
  retries: 3,
  retryAfterMs: 45_000,
};

/** IPTC DigitalSourceType "trainedAlgorithmicMedia": the label Google asks for on AI-generated images. */
const AI_XMP = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
 Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/>
</rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;

async function generate(prompt, apiKey, c) {
  const url = `https://aiplatform.googleapis.com/v1/projects/${c.project}/locations/${c.location}/publishers/google/models/${c.model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    // Header, not ?key=, so the key never appears in a URL or a log of one.
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${prompt}. Style: ${c.style}.` }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: c.aspectRatio, imageSize: c.imageSize } },
    }),
    signal: AbortSignal.timeout(c.timeoutMs),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Vertex AI ${res.status}: ${body.error?.message ?? res.statusText}`), { status: res.status });
  const candidate = body.candidates?.[0];
  const part = candidate?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error(`Vertex AI returned no image (${candidate?.finishReason ?? body.promptFeedback?.blockReason ?? "empty response"})`);
  return Buffer.from(part.inlineData.data, "base64");
}

/**
 * Generates the cover and writes it. Retries rate limits and server errors.
 * @returns {Promise<{file: string, kb: number}>} path relative to the repo
 */
export async function makeCover(slug, prompt, { apiKey = process.env.GOOGLE_CLOUD_API_KEY, config = COVER_CONFIG, log = console.log, dir = config.dir } = {}) {
  if (!apiKey) throw new Error("GOOGLE_CLOUD_API_KEY is not set (needed for the featured image)");
  let raw;
  for (let attempt = 0; ; attempt++) {
    try {
      raw = await generate(prompt, apiKey, config);
      break;
    } catch (err) {
      const retryable = err.status === 429 || err.status >= 500 || err.name === "TimeoutError" || /no image/.test(err.message);
      if (!retryable || attempt >= config.retries) throw err;
      log(`  … image attempt ${attempt + 1} failed (${err.message}); retrying in ${config.retryAfterMs / 1000}s`);
      await new Promise((r) => setTimeout(r, config.retryAfterMs));
    }
  }
  const webp = await sharp(raw)
    .trim({ threshold: 12 })
    .resize({ width: config.width, withoutEnlargement: true })
    .withXmp(AI_XMP)
    .webp({ quality: config.webpQuality, effort: 6 })
    .toBuffer();
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${slug}.webp`);
  writeFileSync(file, webp);
  return { file, kb: Math.round(webp.length / 1024) };
}
