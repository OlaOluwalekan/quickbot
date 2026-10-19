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
import { streamGeminiInteraction } from "@/utils/ai-models/gemini";

export const dynamic = "force-dynamic";

function formatSSEEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        ActionResponse.error("Unauthorized", null),
        { status: 401 }
      );
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

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, payload: unknown) => {
          controller.enqueue(encoder.encode(formatSSEEvent(event, payload)));
        };

        try {
          let previousInteractionId: string | null = null;
          let historyFallback: Array<{ question: string; response: string }> =
            [];

          if (!chatId) {
            const created = await createChat(user.id, prompt);
            if (!created.success || !created.data?.chatId) {
              send("error", { message: "Failed to create chat" });
              controller.close();
              return;
            }
            chatId = created.data.chatId;
            send("chat_created", {
              chatId,
              title: created.data.chat?.title || prompt.slice(0, 60),
            });
          } else {
            const chatCheck = await getChatById(chatId);
            if (
              !chatCheck.success ||
              !chatCheck.data?.chat ||
              chatCheck.data.chat.createdBy !== user.id
            ) {
              send("error", { message: "Chat not found or unauthorized" });
              controller.close();
              return;
            }

            const existingRes = await getResponses(chatId);
            const responses = existingRes.data?.responses || [];
            if (responses.length > 0) {
              const lastWithInteraction = [...responses]
                .reverse()
                .find((r: any) => Boolean(r.interactionId));
              previousInteractionId =
                lastWithInteraction?.interactionId || null;

              historyFallback = responses.map((r: any) => ({
                question: r.question,
                response: r.response,
              }));
            }
          }

          for await (const chunk of streamGeminiInteraction(
            prompt,
            previousInteractionId,
            historyFallback
          )) {
            if (chunk.type === "delta" && chunk.text) {
              send("delta", { text: chunk.text });
            } else if (chunk.type === "completed") {
              const finalText = chunk.fullText || "";
              const tokenCount = chunk.tokenCount || 1;

              const saved = await createResponse(chatId, prompt, finalText, {
                type: "TEXT",
                interactionId: chunk.interactionId || null,
              });

              const savedResponse = saved.data?.res;
              const remainingTokens = Math.max(0, user.tokens - tokenCount);

              if (savedResponse?.id) {
                await createTokenUsage(user.id, tokenCount, savedResponse.id);
              }
              await updateUserToken(user.id, remainingTokens);

              try {
                revalidatePath("/chat");
                revalidatePath(`/chat/${chatId}`);
              } catch {
                // Ignore revalidatePath warnings inside streaming context
              }

              send("completed", {
                response: savedResponse,
                chatId,
                tokensUsed: tokenCount,
                remainingTokens,
              });
            }
          }
        } catch (err: any) {
          console.error("[SSE /api/chat/stream] Error:", err);
          send("error", {
            message:
              err instanceof Error ? err.message : "Failed to stream AI response",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[API POST /api/chat/stream] Error:", error);
    return NextResponse.json(
      ActionResponse.error("Failed to initialize chat stream", null),
      { status: 500 }
    );
  }
}
