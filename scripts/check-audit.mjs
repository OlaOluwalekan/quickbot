// Fails on any high/critical advisory in production dependencies, like
// `npm audit --omit=dev --audit-level=high`, except the advisories listed in
// scripts/audit-exceptions.json. Each exception needs a reason and an expiry
// date; an expired exception fails the check so it gets looked at again.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FAILING = new Set(["high", "critical"]);
const today = new Date().toISOString().slice(0, 10);

const exceptions = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "scripts", "audit-exceptions.json"), "utf8")
);

let raw;
try {
  raw = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  raw = err.stdout;
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error("❌ [audit] Could not read `npm audit --json` output.");
  process.exit(1);
}
if (report.error) {
  console.error(`❌ [audit] npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);
  process.exit(1);
}

let failed = false;
const usedExceptions = new Set();

for (const ex of exceptions) {
  if (!ex.id || !ex.reason || !ex.expires) {
    console.error(`❌ [audit] Exception ${JSON.stringify(ex)} needs id, reason and expires.`);
    failed = true;
  } else if (ex.expires < today) {
    console.error(`❌ [audit] Exception ${ex.id} expired on ${ex.expires}: re-check it, then remove or extend it.`);
    failed = true;
  }
}
const active = new Map(
  exceptions.filter((ex) => ex.id && ex.expires >= today).map((ex) => [ex.id, ex])
);

// Advisories appear as objects in `via`; string entries only point at another package's advisory.
const seen = new Set();
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== "object" || !FAILING.has(via.severity)) continue;
    const id = String(via.url ?? "").split("/").pop() || String(via.source);
    if (seen.has(id)) continue;
    seen.add(id);
    if (active.has(id)) {
      usedExceptions.add(id);
      console.warn(`⚠️  [audit] Allowed until ${active.get(id).expires}: ${id} (${via.name}, ${via.severity}) — ${via.title}`);
      continue;
    }
    console.error(`❌ [audit] ${via.severity}: ${via.name} — ${via.title} (${via.url ?? id})`);
    failed = true;
  }
}

for (const id of active.keys()) {
  if (!usedExceptions.has(id)) {
    console.warn(`⚠️  [audit] Exception ${id} no longer matches any advisory: remove it from scripts/audit-exceptions.json.`);
  }
}

if (failed) {
  console.error("❌ [audit] Failed. Run `npm audit --omit=dev` for details.");
  process.exit(1);
}
console.log("✅ [audit] No high or critical advisories in production dependencies (outside the listed exceptions).");
