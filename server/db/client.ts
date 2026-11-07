import "server-only";
import { PrismaClient } from "./generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/server/env";

const CURRENT_SCHEMA_VER = "20261107110000_add_share_links_v2";

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
      !("shareLink" in g.__db))
  ) {
    g.__db.$disconnect().catch(() => {});
    g.__db = undefined;
  }

  if (!g.__db) {
    g.__db = make();
    if (env.NODE_ENV !== "production") {
      g.__dbSchemaVer = CURRENT_SCHEMA_VER;
    }
  }

  return g.__db;
}

const initialClient = getClient();

export const db: PrismaClient = new Proxy(initialClient, {
  get(_target, prop, _receiver) {
    const active = getClient();
    const val = Reflect.get(active, prop, active);
    return typeof val === "function" ? val.bind(active) : val;
  },
  has(_target, prop) {
    const active = getClient();
    return prop in active;
  },
});
