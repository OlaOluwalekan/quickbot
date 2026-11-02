import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["components", "app"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);

const TAILWIND_COLORS = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "white",
  "black",
];

const UTILITY_PREFIXES = [
  "bg",
  "text",
  "border",
  "border-t",
  "border-r",
  "border-b",
  "border-l",
  "border-x",
  "border-y",
  "ring",
  "ring-offset",
  "from",
  "via",
  "to",
  "divide",
  "outline",
  "fill",
  "stroke",
  "placeholder",
  "decoration",
  "caret",
];

const PALETTE_REGEX = new RegExp(
  `(?<![\\w-])(?:[a-z0-9-]+:)*(?:${UTILITY_PREFIXES.join("|")})-(?:${TAILWIND_COLORS.join("|")})(?:-(?:50|[1-9]00|950))?(?:\\/[0-9]+)?(?![\\w-])`,
  "g"
);

// Matches raw hex color literals like #fff, #1a2b3c, #1a2b3c80, excluding href="#anchor" or url(#id)
const HEX_REGEX = /(?<!href=["']|url\()#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

// Matches raw color functions rgb(...), rgba(...), hsl(...), hsla(...)
const COLOR_FN_REGEX = /\b(?:rgba?|hsla?)\s*\(/g;

function isAllowedFile(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  if (normalized === "app/globals.css") return true;
  if (/^app\/.*opengraph-image\.tsx$/.test(normalized)) return true;
  return false;
}

function collectFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];

for (const dir of SCAN_DIRS) {
  const files = collectFiles(path.join(ROOT, dir));
  for (const file of files) {
    const relPath = path.relative(ROOT, file);
    if (isAllowedFile(relPath)) continue;

    const content = fs.readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      for (const match of line.matchAll(PALETTE_REGEX)) {
        violations.push({
          file: relPath,
          line: lineNum,
          kind: "Tailwind palette class",
          token: match[0],
        });
      }

      for (const match of line.matchAll(HEX_REGEX)) {
        violations.push({
          file: relPath,
          line: lineNum,
          kind: "Raw hex color",
          token: match[0],
        });
      }

      for (const match of line.matchAll(COLOR_FN_REGEX)) {
        violations.push({
          file: relPath,
          line: lineNum,
          kind: "Raw color function",
          token: match[0],
        });
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`Design token check failed with ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — ${v.kind}: "${v.token}"`);
  }
  process.exit(1);
} else {
  console.log("Design token check passed: 0 raw color or palette class violations.");
}
