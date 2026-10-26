import { NextRequest, NextResponse } from "next/server";
import ActionResponse from "@/utils/response";
import { getActor } from "@/server/auth/session";
import { getChatById } from "@/utils/actions/chat";
import { getResponses } from "@/utils/actions/response";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    const actor = await getActor(req);
    if (!actor) {
      return NextResponse.json(
        ActionResponse.error("Unauthorized", null),
        { status: 401 }
      );
    }

    const { chatId } = await context.params;
    const chatRes = await getChatById(chatId);

    if (!chatRes.success || !chatRes.data?.chat) {
      return NextResponse.json(
        ActionResponse.error("Chat not found", null),
        { status: 404 }
      );
    }

    if (chatRes.data.chat.createdBy !== actor.userId) {
      return NextResponse.json(
        ActionResponse.error("Forbidden", null),
        { status: 403 }
      );
    }

    const result = await getResponses(chatId);
    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error("[API GET /api/chats/[chatId]/responses] Error:", error);
    return NextResponse.json(
      ActionResponse.error("Failed to fetch responses", null),
      { status: 500 }
    );
  }
}
