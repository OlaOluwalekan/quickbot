import { NextRequest, NextResponse } from "next/server";
import ActionResponse from "@/utils/response";
import { getActor } from "@/server/auth/session";
import { createChat, getChats } from "@/utils/actions/chat";

export async function GET(req: NextRequest) {
  try {
    const actor = await getActor(req);
    if (!actor) {
      return NextResponse.json(
        ActionResponse.error("Unauthorized", null),
        { status: 401 }
      );
    }

    const result = await getChats(actor.userId);
    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error("[API GET /api/chats] Error:", error);
    return NextResponse.json(
      ActionResponse.error("Failed to retrieve chats", null),
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getActor(req);
    if (!actor) {
      return NextResponse.json(
        ActionResponse.error("Unauthorized", null),
        { status: 401 }
      );
    }

    const body = await req.json();
    const { prompt } = body || {};

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        ActionResponse.error("Prompt is required", null),
        { status: 400 }
      );
    }

    const result = await createChat(actor.userId, prompt.trim());
    return NextResponse.json(result, {
      status: result.success ? 201 : 500,
    });
  } catch (error) {
    console.error("[API POST /api/chats] Error:", error);
    return NextResponse.json(
      ActionResponse.error("Failed to create chat", null),
      { status: 500 }
    );
  }
}
