import { PrismaClient } from "@prisma/client";
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from "@/server/env";

declare global {
  var prima: PrismaClient | undefined;
}

const connectionString = env.DATABASE_URL;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const db = globalThis.prima || new PrismaClient({ adapter });

if (env.NODE_ENV !== "production") globalThis.prima = db;
