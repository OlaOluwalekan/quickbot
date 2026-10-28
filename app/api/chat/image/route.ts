import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import ActionResponse from "@/utils/response";
import { getActor } from "@/server/auth/session";
import { createWorkspace } from "@/server/services/workspace";
import { requireWorkspace } from "@/server/authz/access";
import { ApiError } from "@/server/http/errors";
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
    const actor = await getActor(req);
    if (!actor) {
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

    let previousInteractionId: string | null = null;
    let isNewChat = false;

    if (!chatId) {
      const workspace = await createWorkspace(actor, {
        title: prompt.slice(0, 60),
      });
      chatId = workspace.id;
      isNewChat = true;
    } else {
      try {
        await requireWorkspace(actor, chatId, "workspace.generate");
      } catch (err: any) {
        if (err instanceof ApiError) {
          return NextResponse.json(
            ActionResponse.error(err.message, null),
            { status: err.status }
          );
        }
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
    const remainingTokens = 0;

    if (savedResponse?.id) {
      await createTokenUsage(actor.userId, tokensUsed, savedResponse.id);
    }
    await updateUserToken(actor.userId, remainingTokens);

    revalidatePath("/workspaces");
    revalidatePath(`/workspaces/${chatId}`);

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
