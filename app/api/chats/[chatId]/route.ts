import { NextRequest, NextResponse } from "next/server";
import ActionResponse from "@/utils/response";
import { getActor } from "@/server/auth/session";
import {
  deleteChat,
  getChatById,
  updateChatTitle,
} from "@/utils/actions/chat";

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
    const result = await getChatById(chatId);

    if (!result.success || !result.data?.chat) {
      return NextResponse.json(
        ActionResponse.error("Chat not found", null),
        { status: 404 }
      );
    }

    if (result.data.chat.createdBy !== actor.userId) {
      return NextResponse.json(
        ActionResponse.error("Forbidden", null),
        { status: 403 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[API GET /api/chats/[chatId]] Error:", error);
    return NextResponse.json(
      ActionResponse.error("Failed to retrieve chat", null),
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const existing = await getChatById(chatId);
    if (!existing.success || !existing.data?.chat) {
      return NextResponse.json(
        ActionResponse.error("Chat not found", null),
        { status: 404 }
      );
    }

    if (existing.data.chat.createdBy !== actor.userId) {
      return NextResponse.json(
        ActionResponse.error("Forbidden", null),
        { status: 403 }
      );
    }

    const body = await req.json();
    const { title } = body || {};

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        ActionResponse.error("Title is required", null),
        { status: 400 }
      );
    }

    const result = await updateChatTitle(chatId, title.trim());
    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error("[API PATCH /api/chats/[chatId]] Error:", error);
    return NextResponse.json(
      ActionResponse.error("Failed to update chat title", null),
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    const existing = await getChatById(chatId);
    if (!existing.success || !existing.data?.chat) {
      return NextResponse.json(
        ActionResponse.error("Chat not found", null),
        { status: 404 }
      );
    }

    if (existing.data.chat.createdBy !== actor.userId) {
      return NextResponse.json(
        ActionResponse.error("Forbidden", null),
        { status: 403 }
      );
    }

    const result = await deleteChat(chatId);
    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error("[API DELETE /api/chats/[chatId]] Error:", error);
    return NextResponse.json(
      ActionResponse.error("Failed to delete chat", null),
      { status: 500 }
    );
  }
}
