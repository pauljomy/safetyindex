// One-off: draws the icon, favicon and default social image into public/.
// Run `node scripts/make-assets.mjs` after changing the name or colours; the output is committed.
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const green = "#0b6b3a";
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="${green}"/><path d="M256 76 112 130v118c0 94 60 158 144 188 84-30 144-94 144-188V130z" fill="#fff"/><path d="M226 330 168 272l30-30 28 28 88-88 30 30z" fill="${green}"/></svg>`;
writeFileSync("public/icon.svg", icon);
for (const [name, size] of [["icon-512.png", 512], ["icon-192.png", 192], ["icon-180.png", 180]])
  await sharp(Buffer.from(icon)).resize(size, size).png().toFile(`public/${name}`);

// favicon.ico = ICO container holding one 48×48 PNG.
const png = await sharp(Buffer.from(icon)).resize(48, 48).png().toBuffer();
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head[6] = 48; head[7] = 48; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
writeFileSync("public/favicon.ico", Buffer.concat([head, png]));

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="${green}"/><g transform="translate(90 175) scale(0.55)">${icon.replace(/<svg[^>]*>|<\/svg>/g, "")}</g><text x="420" y="300" font-family="DejaVu Sans, Arial, sans-serif" font-size="96" font-weight="700" fill="#fff">Safety Index</text><text x="420" y="380" font-family="DejaVu Sans, Arial, sans-serif" font-size="40" fill="#d6f0e0">Workplace safety guides</text></svg>`;
await sharp(Buffer.from(og)).png().toFile("public/og-default.png");
console.log("assets written");
