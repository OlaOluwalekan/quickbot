import { NextRequest, NextResponse } from "next/server";
import ActionResponse from "@/utils/response";
import { getAuthenticatedUser } from "@/utils/api-auth";
import { searchChat } from "@/utils/actions/chat";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        ActionResponse.error("Unauthorized", null),
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const option = searchParams.get("option") || "all chats";
    const chatId = searchParams.get("chatId") || "";

    if (!q) {
      return NextResponse.json(
        ActionResponse.success("Search results", { results: [] }),
        { status: 200 }
      );
    }

    const results = await searchChat(q, option, user.id, chatId);
    return NextResponse.json(
      ActionResponse.success("Search results", { results }),
      { status: 200 }
    );
  } catch (error) {
    console.error("[API GET /api/chats/search] Error:", error);
    return NextResponse.json(
      ActionResponse.error("Failed to search chats", null),
      { status: 500 }
    );
  }
}
