import { NextResponse } from "next/server";
import { checkSystemReadiness } from "@/server/services/system-status";

export const dynamic = "force-dynamic";

/** Readiness probe: 200 when every service is ready, 503 otherwise. No secrets in the body. */
export async function GET() {
  const readiness = await checkSystemReadiness();
  return NextResponse.json(readiness, {
    status: readiness.status === "operational" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
