import { NextRequest, NextResponse } from "next/server";
import ActionResponse from "@/utils/response";
import { getActor } from "@/server/auth/session";
import { getTokenUsageByUserId } from "@/utils/actions/response-token";

export async function GET(req: NextRequest) {
  try {
    const actor = await getActor(req);
    if (!actor) {
      return NextResponse.json(
        ActionResponse.error("Unauthorized", null),
        { status: 401 }
      );
    }

    const usageHistory = (await getTokenUsageByUserId(actor.userId)) || [];

    return NextResponse.json(
      ActionResponse.success("Token usage fetched", {
        tokens: 0,
        usageHistory,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("[API GET /api/user/tokens] Error:", error);
    return NextResponse.json(
      ActionResponse.error("Failed to fetch token usage", null),
      { status: 500 }
    );
  }
}
