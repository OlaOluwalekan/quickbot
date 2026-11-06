import "server-only";
import { PrismaClient } from "./generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/server/env";

const CURRENT_SCHEMA_VER = "20261106090000_add_session_device_metadata";

const make = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 10 }),
  });

const g = globalThis as unknown as {
  __db?: PrismaClient;
  __dbSchemaVer?: string;
};

if (
  g.__db &&
  (g.__dbSchemaVer !== CURRENT_SCHEMA_VER || !("auditLog" in g.__db))
) {
  g.__db.$disconnect().catch(() => {});
  g.__db = undefined;
}

export const db = g.__db ?? make();
if (env.NODE_ENV !== "production") {
  g.__db = db;
  g.__dbSchemaVer = CURRENT_SCHEMA_VER;
}
