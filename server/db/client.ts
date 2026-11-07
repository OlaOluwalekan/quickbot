import "server-only";
import { PrismaClient } from "./generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/server/env";

// Bump to the latest migration name so dev hot-reload drops a client generated
// against an older schema.
const CURRENT_SCHEMA_VER = "20261107120000_add_notifications";

const make = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 10 }),
  });

const g = globalThis as unknown as {
  __db?: PrismaClient;
  __dbSchemaVer?: string;
};

// Runs once per module evaluation (i.e. on each dev hot reload), never per query.
if (
  g.__db &&
  (g.__dbSchemaVer !== CURRENT_SCHEMA_VER ||
    !("auditLog" in g.__db) ||
    !("shareLink" in g.__db) ||
    !("notification" in g.__db))
) {
  g.__db.$disconnect().catch(() => {});
  g.__db = undefined;
}

export const db = g.__db ?? make();
if (env.NODE_ENV !== "production") {
  g.__db = db;
  g.__dbSchemaVer = CURRENT_SCHEMA_VER;
}
