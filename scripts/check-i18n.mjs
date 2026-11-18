import fs from "node:fs";
import path from "node:path";
import { parse as parseIcu } from "@formatjs/icu-messageformat-parser";

const rootDir = process.cwd();
const messagesDir = path.join(rootDir, "messages");
const helpDir = path.join(rootDir, "content", "help");
const allowIdenticalPath = path.join(rootDir, "scripts", "i18n-allow-identical.json");

let hasErrors = false;

function logError(msg) {
  console.error(`❌ [check:i18n] ${msg}`);
  hasErrors = true;
}

function logSuccess(msg) {
  console.log(`✅ [check:i18n] ${msg}`);
}

// 1. Load Messages
const locales = ["en", "es", "fr"];
const messages = {};
for (const loc of locales) {
  const filePath = path.join(messagesDir, `${loc}.json`);
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

const flat = {
  en: flatten(messages.en),
  es: flatten(messages.es),
  fr: flatten(messages.fr),
};

// Check 1: Key Parity & Array Length Parity
const enKeys = new Set(Object.keys(flat.en));
const esKeys = new Set(Object.keys(flat.es));
const frKeys = new Set(Object.keys(flat.fr));

let parityFailed = false;
for (const key of enKeys) {
  if (!esKeys.has(key)) {
    logError(`Missing key in 'es': ${key}`);
    parityFailed = true;
  }
  if (!frKeys.has(key)) {
    logError(`Missing key in 'fr': ${key}`);
    parityFailed = true;
  }
}
for (const key of esKeys) {
  if (!enKeys.has(key)) {
    logError(`Extra key in 'es' not in 'en': ${key}`);
    parityFailed = true;
  }
}
for (const key of frKeys) {
  if (!enKeys.has(key)) {
    logError(`Extra key in 'fr' not in 'en': ${key}`);
    parityFailed = true;
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
  compareArrays(key, flat.en[key], flat.es[key], "es");
  compareArrays(key, flat.en[key], flat.fr[key], "fr");
}

if (!parityFailed) {
  logSuccess(`Key parity verified: ${enKeys.size} keys identical across en, es, fr.`);
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
  const esVal = flat.es[key];
  const frVal = flat.fr[key];

  if (typeof enVal === "string") {
    const enVars = extractIcuVars(enVal);
    const esVars = extractIcuVars(esVal);
    const frVars = extractIcuVars(frVal);

    if (JSON.stringify(enVars) !== JSON.stringify(esVars)) {
      logError(`ICU placeholder mismatch on key '${key}' between 'en' and 'es' (en: ${JSON.stringify(enVars)}, es: ${JSON.stringify(esVars)})`);
      icuFailed = true;
    }
    if (JSON.stringify(enVars) !== JSON.stringify(frVars)) {
      logError(`ICU placeholder mismatch on key '${key}' between 'en' and 'fr' (en: ${JSON.stringify(enVars)}, fr: ${JSON.stringify(frVars)})`);
      icuFailed = true;
    }
  }
}
if (!icuFailed) {
  logSuccess("ICU placeholder parity verified across all locales.");
}

// Check 3: Untranslated copies (> 20 chars identical to English, not in allowlist)
let untranslatedFailed = false;
for (const key of enKeys) {
  const enVal = flat.en[key];
  const esVal = flat.es[key];
  const frVal = flat.fr[key];

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
  const walk = (k, enItem, esItem, frItem) => {
    if (Array.isArray(enItem)) {
      enItem.forEach((item, idx) => walk(`${k}[${idx}]`, item, esItem?.[idx], frItem?.[idx]));
      return;
    }
    checkValue(k, enItem, esItem, "es");
    checkValue(k, enItem, frItem, "fr");
  };
  walk(key, enVal, esVal, frVal);
}
if (!untranslatedFailed) {
  logSuccess("No untranslated copies (>20 chars) in es/fr.");
}

// Check 4: Encoding Sanity (no ? between letters /\p{L}\?\p{L}/u, no replacement char \uFFFD)
let encodingFailed = false;
const letterQuestionRegex = /\p{L}\?\p{L}/u;

for (const loc of locales) {
  const raw = fs.readFileSync(path.join(messagesDir, `${loc}.json`), "utf8");
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
    for (const targetLoc of ["es", "fr"]) {
      const targetPath = path.join(helpDir, targetLoc, file);
      if (!fs.existsSync(targetPath)) {
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
  logSuccess("Help content parity verified: all English help articles have es/fr siblings with matching versions.");
}

if (hasErrors) {
  console.error("\n❌ [check:i18n] Validation failed with errors above.\n");
  process.exit(1);
} else {
  console.log("\n✅ [check:i18n] All i18n checks passed successfully.\n");
  process.exit(0);
}
