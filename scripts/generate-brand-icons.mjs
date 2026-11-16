#!/usr/bin/env node
/**
 * Regenerates the static brand icons from lib/brand/mark.ts (F5.10):
 *   app/favicon.ico            16, 32 and 48 px (browsers still request /favicon.ico)
 *   public/icon.svg            manifest icon (any size)
 *   public/icon-512.png        manifest icon
 *   public/apple-touch-icon.png  manifest icon (180 px)
 *
 * app/icon.tsx and app/apple-icon.tsx are generated at request time from the
 * same source and need no script. Run after changing the mark, then commit:
 *
 *   node scripts/generate-brand-icons.mjs
 *
 * Needs Node 22.18+ (loads the .ts file with built-in type stripping) and
 * sharp (installed with Next.js). The .ico container is written here: a
 * 6-byte header, one 16-byte entry per image, then the PNGs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { APP_ICON, markSvg } = await import(path.join(root, "lib/brand/mark.ts"));

async function pngOf(size) {
  return sharp(Buffer.from(markSvg({ ...APP_ICON, size })))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

const icoImages = [];
for (const size of [16, 32, 48]) icoImages.push({ size, png: await pngOf(size) });

const outputs = {
  "app/favicon.ico": buildIco(icoImages),
  "public/icon.svg": Buffer.from(markSvg(APP_ICON) + "\n"),
  "public/icon-512.png": await pngOf(512),
  "public/apple-touch-icon.png": await pngOf(180),
};
for (const [file, data] of Object.entries(outputs)) {
  fs.writeFileSync(path.join(root, file), data);
  console.log(`wrote ${file} (${data.length} bytes)`);
}
