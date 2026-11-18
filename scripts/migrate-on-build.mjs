// Runs `prisma migrate deploy` as part of `npm run build`.
//
// - Vercel preview builds skip it (unless MIGRATE_ON_PREVIEW=true): previews share
//   the database with production, so an unmerged PR's migration must not reach it,
//   and several previews building at once fight over Prisma's migration lock (P1002).
// - Production, CI and local builds run it. A P1002 (lock held by another build) is
//   retried a few times before failing.
import { spawnSync } from "node:child_process";

const vercelEnv = process.env.VERCEL_ENV;
if (vercelEnv === "preview" && process.env.MIGRATE_ON_PREVIEW !== "true") {
  console.log("[migrate] Vercel preview build: skipping `prisma migrate deploy`.");
  process.exit(0);
}

const ATTEMPTS = 4;
const WAIT_MS = 20_000;

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status === 0) process.exit(0);

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const lockTimeout = output.includes("P1002") || output.includes("pg_advisory_lock");
  if (!lockTimeout || attempt === ATTEMPTS) process.exit(result.status ?? 1);

  console.log(`[migrate] Migration lock busy (attempt ${attempt}/${ATTEMPTS}); retrying in ${WAIT_MS / 1000} s.`);
  await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
}
