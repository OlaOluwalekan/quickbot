/**
 * The Klecx "e" mark: the single source for the in-app logo
 * (components/logo/Logo.tsx), the favicon, app and Apple icons, the PWA
 * icons and the Open Graph / Twitter images (F5.10).
 *
 * No imports: scripts/generate-brand-icons.mjs loads this file directly with Node.
 */

export const MARK_VIEWBOX = "0 0 100 100";
export const MARK_PATH = "M 60 36 H 37 V 63.5 H 91.75 V 8.25 H 8.25 V 91.75 H 91.75";
export const MARK_STROKE = 12;

/**
 * Hex versions of the design-system accent (`--accent` in app/globals.css),
 * for images that can't read CSS variables. A test converts the oklch values
 * again and compares, so they can't drift apart.
 */
export const BRAND = {
  /** oklch(0.50 0.17 270), light theme */
  accentLight: "#4057c2",
  /** oklch(0.68 0.16 270), dark theme */
  accentDark: "#7290fa",
  /** Background of icon tiles and social images. */
  tileDark: "#0d0f17",
} as const;

export interface MarkSvgOptions {
  /** Stroke color of the mark. */
  color: string;
  /** Tile color behind the mark; omit for a transparent background. */
  background?: string;
  /** Space around the mark, as a fraction of the size (0.18 = 18 % on each side). */
  padding?: number;
  /** Corner radius of the tile, as a fraction of the size (0.22 = 22 %). */
  radius?: number;
  /** Width and height attributes, in px (the drawing is always 100 × 100). */
  size?: number;
}

/** The mark as a standalone SVG document. */
export function markSvg({ color, background, padding = 0, radius = 0, size }: MarkSvgOptions): string {
  const scale = 1 - 2 * padding;
  const offset = padding * 100;
  const sizeAttrs = size ? ` width="${size}" height="${size}"` : "";
  const tile = background
    ? `<rect width="100" height="100" rx="${radius * 100}" fill="${background}"/>`
    : "";
  const transform =
    padding > 0 ? ` transform="translate(${offset} ${offset}) scale(${scale})"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}"${sizeAttrs}>` +
    tile +
    `<path d="${MARK_PATH}" stroke="${color}" stroke-width="${MARK_STROKE}" ` +
    `stroke-linecap="square" stroke-linejoin="miter" fill="none"${transform}/>` +
    `</svg>`
  );
}

/** The mark as a data: URI, for <img> in ImageResponse (next/og). */
export function markDataUri(options: MarkSvgOptions): string {
  const svg = markSvg(options);
  const base64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(svg).toString("base64")
      : btoa(svg);
  return `data:image/svg+xml;base64,${base64}`;
}

/** The look of every app icon: dark tile, dark-theme accent, 18 % padding, 22 % radius. */
export const APP_ICON: MarkSvgOptions = {
  color: BRAND.accentDark,
  background: BRAND.tileDark,
  padding: 0.18,
  radius: 0.22,
};
