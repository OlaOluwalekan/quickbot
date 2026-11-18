import fs from "node:fs";
import path from "node:path";
import { parse as parseIcu } from "@formatjs/icu-messageformat-parser";

// I18N_CHECK_ROOT lets a test run the checks on a temporary copy (a fake beta locale).
const rootDir = process.env.I18N_CHECK_ROOT || process.cwd();
const messagesDir = path.join(rootDir, "messages");
const helpDir = path.join(rootDir, "content", "help");
const allowIdenticalPath = path.join(rootDir, "scripts", "i18n-allow-identical.json");

let hasErrors = false;

function logError(msg) {
  console.error(`❌ [check:i18n] ${msg}`);
  hasErrors = true;
}

function logWarning(msg) {
  console.warn(`⚠️  [check:i18n] ${msg}`);
}

function logSuccess(msg) {
  console.log(`✅ [check:i18n] ${msg}`);
}

// 1. Load Messages
// The locale list comes from i18n/locales.ts (code + status). "live" locales
// must be complete; "beta" locales may lack keys and help articles (the app
// fills them with English), but what they do have is checked.
function getRegisteredLocales() {
  const raw = fs.readFileSync(path.join(rootDir, "i18n", "locales.ts"), "utf8");
  const start = raw.indexOf("export const LOCALES");
  const entries = [...raw.slice(start).matchAll(/\{[^{}]*?code:\s*["']([a-z]{2,3})["'][^{}]*?status:\s*["'](live|beta)["'][^{}]*?\}/g)];
  if (entries.length === 0) {
    logError("No locales found in i18n/locales.ts");
    process.exit(1);
  }
  return entries.map((m) => ({ code: m[1], status: m[2] }));
}
const registry = getRegisteredLocales();
const locales = registry.map((l) => l.code);
const others = registry.filter((l) => l.code !== "en");
const messages = {};
for (const { code: loc, status } of registry) {
  const filePath = path.join(messagesDir, `${loc}.json`);
  if (!fs.existsSync(filePath) && status === "beta") {
    logWarning(`Beta locale '${loc}' has no message file yet (shown in English).`);
    messages[loc] = {};
    continue;
  }
  if (!fs.existsSync(filePath)) {
    logError(`Missing message bundle: ${filePath}`);
    process.exit(1);
  }
  try {
    messages[loc] = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    logError(`Failed to parse ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

// Allow-list for identical text across locales (> 20 chars, e.g. brand names, code snippets, legal references)
let allowIdentical = new Set();
if (fs.existsSync(allowIdenticalPath)) {
  try {
    const list = JSON.parse(fs.readFileSync(allowIdenticalPath, "utf8"));
    allowIdentical = new Set(Array.isArray(list) ? list : list.keys || []);
  } catch (err) {
    logError(`Failed to parse ${allowIdenticalPath}: ${err.message}`);
  }
}

function flatten(obj, prefix = "") {
  const res = {};
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v) && v.some((item) => item && typeof item === "object")) {
      // Arrays of objects (e.g. legal `sections`): check every field of every
      // item, so key parity, placeholders and untranslated text cover them too.
      v.forEach((item, i) => {
        if (item && typeof item === "object") Object.assign(res, flatten(item, `${full}.${i}`));
        else res[`${full}.${i}`] = item;
      });
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(res, flatten(v, full));
    } else {
      res[full] = v;
    }
  }
  return res;
}

const flat = Object.fromEntries(locales.map((loc) => [loc, flatten(messages[loc])]));

// Check 1: Key Parity & Array Length Parity
const enKeys = new Set(Object.keys(flat.en));

let parityFailed = false;
for (const { code: loc, status } of others) {
  const keys = new Set(Object.keys(flat[loc]));
  let missing = 0;
  for (const key of enKeys) {
    if (keys.has(key)) continue;
    if (status === "live") {
      logError(`Missing key in '${loc}': ${key}`);
      parityFailed = true;
    } else missing++;
  }
  if (missing > 0) logWarning(`Beta locale '${loc}' lacks ${missing} keys (shown in English).`);
  for (const key of keys) {
    if (!enKeys.has(key)) {
      logError(`Extra key in '${loc}' not in 'en': ${key}`);
      parityFailed = true;
    }
  }
}

// Compare array lengths where value is an array (recursively: e.g. table rows of cells)
function compareArrays(key, enVal, otherVal, loc) {
  if (!Array.isArray(enVal)) return;
  if (!Array.isArray(otherVal) || otherVal.length !== enVal.length) {
    logError(`Array length mismatch for ${key} in '${loc}' (expected ${enVal.length}, got ${Array.isArray(otherVal) ? otherVal.length : typeof otherVal})`);
    parityFailed = true;
    return;
  }
  enVal.forEach((item, idx) => compareArrays(`${key}[${idx}]`, item, otherVal[idx], loc));
}
for (const key of enKeys) {
  for (const { code: loc } of others) {
    if (key in flat[loc]) compareArrays(key, flat.en[key], flat[loc][key], loc);
  }
}

if (!parityFailed) {
  logSuccess(`Key parity verified: ${enKeys.size} keys across ${locales.join(", ")}.`);
}

// Check 2: ICU Placeholders Parity
function extractIcuVars(str) {
  if (typeof str !== "string" || !str.includes("{")) return [];
  try {
    const ast = parseIcu(str);
    const vars = new Set();
    function walk(els) {
      for (const el of els) {
        if (el.type !== 0 && el.type !== 7 && typeof el.value === "string") {
          vars.add(el.value);
        }
        if (el.options) {
          for (const opt of Object.values(el.options)) {
            walk(opt.value);
          }
        }
      }
    }
    walk(ast);
    return [...vars].sort();
  } catch (err) {
    return [`__PARSE_ERROR__: ${err.message}`];
  }
}

let icuFailed = false;
for (const key of enKeys) {
  const enVal = flat.en[key];
  if (typeof enVal !== "string") continue;
  const enVars = extractIcuVars(enVal);
  for (const { code: loc } of others) {
    if (!(key in flat[loc])) continue; // a beta locale's gap: English is shown
    const vars = extractIcuVars(flat[loc][key]);
    if (JSON.stringify(enVars) !== JSON.stringify(vars)) {
      logError(`ICU placeholder mismatch on key '${key}' between 'en' and '${loc}' (en: ${JSON.stringify(enVars)}, ${loc}: ${JSON.stringify(vars)})`);
      icuFailed = true;
    }
  }
}
if (!icuFailed) {
  logSuccess("ICU placeholder parity verified across all locales.");
}

// Check 3: Untranslated copies (> 20 chars identical to English, not in allowlist)
let untranslatedFailed = false;
const liveOthers = others.filter((l) => l.status === "live");
for (const key of enKeys) {
  const checkValue = (k, enStr, targetStr, loc) => {
    if (typeof enStr === "string" && typeof targetStr === "string") {
      const trimmed = enStr.trim();
      if (trimmed.length > 20 && targetStr.trim() === trimmed) {
        if (!allowIdentical.has(k)) {
          logError(`Untranslated copy in '${loc}' for key '${k}' (>20 chars identical to 'en'): "${trimmed.slice(0, 50)}..."`);
          untranslatedFailed = true;
        }
      }
    }
  };

  // Walk nested arrays (e.g. table rows of cells); allow-list entries use the indexed path, e.g. key[0][1].
  const walk = (k, enItem, target, loc) => {
    if (Array.isArray(enItem)) {
      enItem.forEach((item, idx) => walk(`${k}[${idx}]`, item, target?.[idx], loc));
      return;
    }
    checkValue(k, enItem, target, loc);
  };
  // Live locales only: a beta locale may still carry English while it is translated.
  for (const { code: loc } of liveOthers) walk(key, flat.en[key], flat[loc][key], loc);
}
if (!untranslatedFailed) {
  logSuccess(`No untranslated copies (>20 chars) in ${liveOthers.map((l) => l.code).join(", ") || "any live locale"}.`);
}

// Check 4: Encoding Sanity (no ? between letters /\p{L}\?\p{L}/u, no replacement char \uFFFD)
let encodingFailed = false;
const letterQuestionRegex = /\p{L}\?\p{L}/u;

for (const loc of locales) {
  const file = path.join(messagesDir, `${loc}.json`);
  if (!fs.existsSync(file)) continue;
  const raw = fs.readFileSync(file, "utf8");
  if (letterQuestionRegex.test(raw)) {
    logError(`Encoding corruption in '${loc}.json': detected '?' between letters.`);
    encodingFailed = true;
  }
  if (raw.includes("\uFFFD")) {
    logError(`Encoding corruption in '${loc}.json': detected Unicode replacement character (U+FFFD).`);
    encodingFailed = true;
  }
}
if (!encodingFailed) {
  logSuccess("Encoding sanity check passed: no corrupted characters found.");
}

// Check 6: counted nouns use ICU plurals ("{count} credits" reads "1 credits")
let pluralFailed = false;
for (const loc of locales) {
  for (const [key, value] of Object.entries(flat[loc])) {
    if (typeof value !== "string") continue;
    if (/\{count\}\s+\p{L}/u.test(value) && !/\{count,\s*plural/.test(value)) {
      logError(`'${loc}' key '${key}' puts a word after {count} without a plural form: use {count, plural, one {…} other {…}}.`);
      pluralFailed = true;
    }
  }
}
if (!pluralFailed) {
  logSuccess("Counted nouns use ICU plural forms.");
}

// Check 5: Help Content Parity
let helpFailed = false;
const enHelpDir = path.join(helpDir, "en");
if (fs.existsSync(enHelpDir)) {
  const enArticles = fs.readdirSync(enHelpDir).filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));

  for (const file of enArticles) {
    for (const { code: targetLoc, status } of others) {
      const targetPath = path.join(helpDir, targetLoc, file);
      if (!fs.existsSync(targetPath)) {
        if (status === "beta") continue; // the help loader falls back to English
        logError(`Help content missing: '${targetLoc}/${file}' does not exist.`);
        helpFailed = true;
        continue;
      }

      // Check frontmatter version / sourceVersion
      const enRaw = fs.readFileSync(path.join(enHelpDir, file), "utf8");
      const targetRaw = fs.readFileSync(targetPath, "utf8");

      const enVerMatch = enRaw.match(/version:\s*(\d+)/);
      const targetVerMatch = targetRaw.match(/(?:sourceVersion|version):\s*(\d+)/);

      const enVer = enVerMatch ? Number.parseInt(enVerMatch[1], 10) : 1;
      const targetVer = targetVerMatch ? Number.parseInt(targetVerMatch[1], 10) : 1;

      if (enVer !== targetVer) {
        logError(`Help version mismatch for '${file}' in '${targetLoc}': English is v${enVer}, but translation is v${targetVer}.`);
        helpFailed = true;
      }
    }
  }
}
if (!helpFailed) {
  logSuccess("Help content parity verified: every live locale has each English article, with matching versions.");
}

if (hasErrors) {
  console.error("\n❌ [check:i18n] Validation failed with errors above.\n");
  process.exit(1);
} else {
  console.log("\n✅ [check:i18n] All i18n checks passed successfully.\n");
  process.exit(0);
}
