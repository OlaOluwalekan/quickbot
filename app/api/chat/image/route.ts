import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import ActionResponse from "@/utils/response";
import { getAuthenticatedUser } from "@/utils/api-auth";
import { createChat, getChatById } from "@/utils/actions/chat";
import { createResponse, getResponses } from "@/utils/actions/response";
import {
  createTokenUsage,
  updateUserToken,
} from "@/utils/actions/response-token";
import { generateGeminiImage } from "@/utils/ai-models/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allows up to 60 seconds for image generation

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(ActionResponse.error("Unauthorized", null), {
        status: 401,
      });
    }

    const body = await req.json();
    const prompt = (body?.prompt || "").trim();
    let chatId: string = (body?.chatId || "").trim();

    if (!prompt) {
      return NextResponse.json(
        ActionResponse.error("Prompt is required", null),
        { status: 400 }
      );
    }

    if (user.tokens <= 0) {
      return NextResponse.json(
        ActionResponse.error("You are out of token, Please purchase", null),
        { status: 402 }
      );
    }

    let previousInteractionId: string | null = null;
    let isNewChat = false;

    if (!chatId) {
      const created = await createChat(user.id, prompt);
      if (!created.success || !created.data?.chatId) {
        return NextResponse.json(
          ActionResponse.error("Failed to create chat", null),
          { status: 500 }
        );
      }
      chatId = created.data.chatId;
      isNewChat = true;
    } else {
      const chatCheck = await getChatById(chatId);
      if (
        !chatCheck.success ||
        !chatCheck.data?.chat ||
        chatCheck.data.chat.createdBy !== user.id
      ) {
        return NextResponse.json(
          ActionResponse.error("Chat not found or unauthorized", null),
          { status: 404 }
        );
      }

      const existingRes = await getResponses(chatId);
      const responses = existingRes.data?.responses || [];
      const lastWithInteraction = [...responses]
        .reverse()
        .find((r: any) => Boolean(r.interactionId));
      previousInteractionId = lastWithInteraction?.interactionId || null;
    }

    const imageResult = await generateGeminiImage(
      prompt,
      previousInteractionId
    );

    if (!imageResult.success || !imageResult.data) {
      return NextResponse.json(
        ActionResponse.error(
          imageResult.message || "Failed to generate image",
          null
        ),
        { status: 500 }
      );
    }

    const { imageUrl, mimeType, caption, interactionId, tokenCount } =
      imageResult.data;

    const saved = await createResponse(chatId, prompt, caption, {
      type: "IMAGE",
      imageUrl,
      mimeType,
      interactionId,
    });

    const savedResponse = saved.data?.res;
    const tokensUsed = tokenCount || 250;
    const remainingTokens = Math.max(0, user.tokens - tokensUsed);

    if (savedResponse?.id) {
      await createTokenUsage(user.id, tokensUsed, savedResponse.id);
    }
    await updateUserToken(user.id, remainingTokens);

    revalidatePath("/chat");
    revalidatePath(`/chat/${chatId}`);

    return NextResponse.json(
      ActionResponse.success("Image generated", {
        response: savedResponse,
        chatId,
        isNewChat,
        tokensUsed,
        remainingTokens,
      }),
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[API POST /api/chat/image] Error:", error);
    return NextResponse.json(
      ActionResponse.error(
        error instanceof Error ? error.message : "Failed to generate image",
        null
      ),
      { status: 500 }
    );
  }
}
