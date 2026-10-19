import { NextRequest, NextResponse } from "next/server";
import ActionResponse from "@/utils/response";
import { getAuthenticatedUser } from "@/utils/api-auth";
import { getTokenUsageByUserId } from "@/utils/actions/response-token";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        ActionResponse.error("Unauthorized", null),
        { status: 401 }
      );
    }

    const usageHistory = (await getTokenUsageByUserId(user.id)) || [];

    return NextResponse.json(
      ActionResponse.success("Token usage fetched", {
        tokens: user.tokens,
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
