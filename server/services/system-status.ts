import "server-only";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { getRedisClient } from "@/server/http/rate-limit";

export type ServiceStatus = "operational" | "degraded";

export interface SystemReadiness {
  status: ServiceStatus;
  timestamp: string;
  services: {
    ai: ServiceStatus;
    auth: ServiceStatus;
    db: ServiceStatus;
    storage: ServiceStatus;
    email: ServiceStatus;
  };
}

/** What the readiness check probes. Tests pass failing probes; the app uses the real ones. */
export interface ReadinessProbes {
  /** Database round trip (`SELECT 1`). */
  database: () => Promise<unknown>;
  /** Redis ping, or `null` when Redis isn't configured (dev/test in-memory fallback). */
  cache: (() => Promise<unknown>) | null;
}

/** A probe slower than this counts as down, so a hung connection can't stall /status. */
const PROBE_TIMEOUT_MS = 3_000;

function defaultProbes(): ReadinessProbes {
  const redis = getRedisClient();
  return {
    database: () => db.$queryRaw`SELECT 1`,
    cache: redis ? () => redis.ping() : null,
  };
}

async function probe(run: () => Promise<unknown>): Promise<ServiceStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), PROBE_TIMEOUT_MS);
      }),
    ]);
    return "operational";
  } catch {
    return "degraded";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Outside production, missing provider keys fall back to mocks, so only production needs them. */
function configured(...values: (string | undefined)[]): ServiceStatus {
  if (env.NODE_ENV !== "production") return "operational";
  return values.every(Boolean) ? "operational" : "degraded";
}

/**
 * Readiness of the services behind Klecx, for `/api/ready` and the status page.
 * The database and Redis are pinged; the AI, storage and email providers are only
 * checked for configuration (pinging them would cost money or quota).
 * The result holds statuses and a timestamp only: never hosts, keys or error text.
 */
export async function checkSystemReadiness(
  probes: ReadinessProbes = defaultProbes()
): Promise<SystemReadiness> {
  const [database, cache] = await Promise.all([
    probe(probes.database),
    probes.cache ? probe(probes.cache) : Promise.resolve<ServiceStatus>("operational"),
  ]);

  // The "Database & Cache" row covers both stores (Redis holds the rate limits).
  const dbStatus: ServiceStatus =
    database === "operational" && cache === "operational" ? "operational" : "degraded";

  const services: SystemReadiness["services"] = {
    ai: configured(env.GEMINI_API_KEY),
    // Sessions and verification tokens live in the database.
    auth: database,
    db: dbStatus,
    storage: configured(
      env.CLOUDINARY_CLOUD_NAME,
      env.CLOUDINARY_API_KEY,
      env.CLOUDINARY_API_SECRET
    ),
    email: configured(env.RESEND_API_KEY),
  };

  const degraded = Object.values(services).some((s) => s === "degraded");

  return {
    status: degraded ? "degraded" : "operational",
    timestamp: new Date().toISOString(),
    services,
  };
}
