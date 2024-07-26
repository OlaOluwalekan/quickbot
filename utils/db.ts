import { PrismaClient } from "@prisma/client";

declare global {
  var prima: PrismaClient | undefined;
}

export const db = globalThis.prima || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalThis.prima = db;
