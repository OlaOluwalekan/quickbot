import "server-only";
import { PrismaClient } from "./generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/server/env";

// Bump to the latest migration name so dev hot-reload drops a client generated
// against an older schema.
const CURRENT_SCHEMA_VER = "20261107132500_add_notification_prefs";

const make = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 10 }),
  });

const g = globalThis as unknown as {
  __db?: PrismaClient;
  __dbSchemaVer?: string;
};

function getClient(): PrismaClient {
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

  if (!g.__db) {
    g.__db = make();
    g.__dbSchemaVer = CURRENT_SCHEMA_VER;
  }

  return g.__db;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
