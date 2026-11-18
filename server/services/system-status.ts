import { db as defaultDb } from "@/server/db/client";
import { env } from "@/server/env";

export type ServiceStatus = "operational" | "degraded";

export interface SystemReadiness {
  status: "operational" | "degraded";
  timestamp: string;
  services: {
    ai: ServiceStatus;
    auth: ServiceStatus;
    db: ServiceStatus;
    storage: ServiceStatus;
    email: ServiceStatus;
  };
}

/**
 * Checks system readiness across core infrastructure dependencies.
 * Strictly outputs service health statuses and timestamps with ZERO secrets.
 */
export async function checkSystemReadiness(dbOverride?: any): Promise<SystemReadiness> {
  const activeDb = dbOverride || defaultDb;

  let dbStatus: ServiceStatus = "operational";
  try {
    if (activeDb?.$queryRawUnsafe) {
      await activeDb.$queryRawUnsafe("SELECT 1");
    } else if (activeDb?.$queryRaw) {
      await activeDb.$queryRaw`SELECT 1`;
    }
  } catch {
    dbStatus = "degraded";
  }

  // Auth requires a healthy database for session storage and verification tokens
  const authStatus: ServiceStatus = dbStatus === "operational" ? "operational" : "degraded";

  // AI model inference endpoint configuration
  const aiStatus: ServiceStatus =
    Boolean(env.GEMINI_API_KEY || process.env.NODE_ENV !== "production") ? "operational" : "degraded";

  // File storage configuration (Cloudinary in prod, mock in test/dev)
  const storageStatus: ServiceStatus =
    Boolean(env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_API_KEY || process.env.NODE_ENV !== "production")
      ? "operational"
      : "degraded";

  // Email delivery configuration (Resend in prod, mock in test/dev)
  const emailStatus: ServiceStatus =
    Boolean(env.RESEND_API_KEY || process.env.NODE_ENV !== "production") ? "operational" : "degraded";

  const isDegraded =
    dbStatus === "degraded" ||
    authStatus === "degraded" ||
    aiStatus === "degraded" ||
    storageStatus === "degraded" ||
    emailStatus === "degraded";

  return {
    status: isDegraded ? "degraded" : "operational",
    timestamp: new Date().toISOString(),
    services: {
      ai: aiStatus,
      auth: authStatus,
      db: dbStatus,
      storage: storageStatus,
      email: emailStatus,
    },
  };
}
