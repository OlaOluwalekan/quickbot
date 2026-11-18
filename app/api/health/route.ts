import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness probe: the process is up. Checks no dependencies (see /api/ready). */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
