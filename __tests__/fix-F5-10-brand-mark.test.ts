/**
 * @jest-environment node
 *
 * F5.10 — one source for the "e" mark: lib/brand/mark.ts.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  APP_ICON,
  BRAND,
  MARK_PATH,
  MARK_STROKE,
  markDataUri,
  markSvg,
} from "@/lib/brand/mark";
import { generateImageMetadata } from "@/app/icon";
import { isMetadataImageRoute } from "@/utils/routes";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p));

/** oklch → sRGB hex (CSS Color 4 / Björn Ottosson's OKLab matrices). */
function oklchToHex(L: number, C: number, h: number): string {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    "#" +
    rgb
      .map((x) => {
        const c = Math.min(1, Math.max(0, x));
        const g = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
        return Math.round(g * 255).toString(16).padStart(2, "0");
      })
      .join("")
  );
}

/** Same rendering as scripts/generate-brand-icons.mjs. */
async function pngOf(size: number): Promise<Buffer> {
  return sharp(Buffer.from(markSvg({ ...APP_ICON, size })))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function samePixels(a: Buffer, b: Buffer) {
  const [ra, rb] = await Promise.all([
    sharp(a).raw().toBuffer({ resolveWithObject: true }),
    sharp(b).raw().toBuffer({ resolveWithObject: true }),
  ]);
  expect(ra.info.width).toBe(rb.info.width);
  expect(ra.info.height).toBe(rb.info.height);
  expect(ra.data.equals(rb.data)).toBe(true);
}

describe("F5.10 — brand mark", () => {
  it("BRAND hex colors are the design-system accents from app/globals.css", () => {
    const css = read("app/globals.css").toString();
    const accents = [...css.matchAll(/--accent:\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)].map(
      (m) => oklchToHex(Number(m[1]), Number(m[2]), Number(m[3]))
    );
    expect(accents[0]).toBe(BRAND.accentLight);
    expect(accents).toContain(BRAND.accentDark);
  });

  it("markSvg draws MARK_PATH with MARK_STROKE", () => {
    const svg = markSvg({ color: "#123456" });
    expect(svg).toContain(`d="${MARK_PATH}"`);
    expect(svg).toContain(`stroke-width="${MARK_STROKE}"`);
    expect(Buffer.from(markDataUri(APP_ICON).split(",")[1]!, "base64").toString()).toBe(
      markSvg(APP_ICON)
    );
  });

  it("the generated icon, Apple icon and social images use the shared mark", () => {
    for (const file of ["app/icon.tsx", "app/apple-icon.tsx", "app/opengraph-image.tsx"]) {
      const src = read(file).toString();
      expect(src).toMatch(/from "@\/lib\/brand\/mark"/);
      expect(src).toContain("markDataUri(");
      expect(src).not.toMatch(/M \d+ 36 H 37/); // no inline copy of the path
    }
    // twitter-image re-exports the Open Graph image.
    expect(read("app/twitter-image.tsx").toString()).toContain('from "./opengraph-image"');
  });

  it("favicon.ico holds 16, 32 and 48 px images of the mark", async () => {
    const ico = read("app/favicon.ico");
    expect(ico.readUInt16LE(2)).toBe(1); // icon
    const count = ico.readUInt16LE(4);
    expect(count).toBe(3);
    for (let i = 0; i < count; i++) {
      const entry = 6 + i * 16;
      const size = ico.readUInt8(entry);
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      await samePixels(ico.subarray(offset, offset + length), await pngOf(size));
    }
  });

  it("the manifest's public icons match the mark (run scripts/generate-brand-icons.mjs after changing it)", async () => {
    expect(read("public/icon.svg").toString().trim()).toBe(markSvg(APP_ICON));
    await samePixels(read("public/icon-512.png"), await pngOf(512));
    await samePixels(read("public/apple-touch-icon.png"), await pngOf(180));
  });

  it("no file in the repo carries a different version of the path", () => {
    const skip = new Set(["node_modules", ".next", ".git", "coverage"]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(svg|tsx?|mjs|css)$/.test(entry.name)) {
          const text = fs.readFileSync(full, "utf8");
          // The tail of the path is distinctive; any copy must be the whole MARK_PATH.
          for (const m of text.matchAll(/M [\d.]+ [\d.]+ H 37 V 63\.5[^"'`]*/g)) {
            if (m[0].trim() !== MARK_PATH) offenders.push(path.relative(ROOT, full));
          }
        }
      }
    };
    walk(ROOT);
    expect(offenders).toEqual([]);
  });

  // Rendering through next/og needs dynamic imports Jest doesn't run; the PNG
  // routes (/icon/32, /apple-icon, /opengraph-image) are checked in the running app.
  it("app/icon.tsx declares the 32, 192 and 512 px icons", () => {
    expect(generateImageMetadata().map((m) => [m.id, m.size.width, m.contentType])).toEqual([
      ["32", 32, "image/png"],
      ["192", 192, "image/png"],
      ["512", 512, "image/png"],
    ]);
  });

  it("icon and social-image routes are public, so signed-out visitors and crawlers get the image", () => {
    for (const p of ["/icon/32", "/icon/512", "/apple-icon", "/opengraph-image", "/twitter-image"]) {
      expect(isMetadataImageRoute(p)).toBe(true);
    }
    for (const p of ["/workspaces", "/iconography", "/settings", "/icons"]) {
      expect(isMetadataImageRoute(p)).toBe(false);
    }
  });
});
