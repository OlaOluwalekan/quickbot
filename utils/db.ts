import { PrismaClient } from "@prisma/client";
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

declare global {
  var prima: PrismaClient | undefined;
}

const connectionString = `${process.env.DATABASE_URL}`

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)

export const db = globalThis.prima || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalThis.prima = db;
