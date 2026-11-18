import { NextResponse } from "next/server";
import { checkSystemReadiness } from "@/server/services/system-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await checkSystemReadiness();
  const statusCode = readiness.services.db === "degraded" ? 503 : 200;

  return NextResponse.json(readiness, { status: statusCode });
}
