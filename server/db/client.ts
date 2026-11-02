import "server-only";
import { PrismaClient } from "./generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/server/env";

const make = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 10 }),
  });
const g = globalThis as unknown as { __db?: PrismaClient };
export const db = g.__db ?? make();
if (env.NODE_ENV !== "production") g.__db = db;
