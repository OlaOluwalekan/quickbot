import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // The CLI (migrate deploy/diff) needs a direct, session-mode connection: its
    // advisory lock breaks behind a transaction-mode pooler. Set DIRECT_URL to the
    // non-pooled URL when DATABASE_URL points at a pooler; the app keeps DATABASE_URL.
    url: process.env.DIRECT_URL || env("DATABASE_URL"),
  },
});
