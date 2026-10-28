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
import { streamGeminiInteraction } from "@/utils/ai-models/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allows streaming to run up to 60 seconds

function formatSSEEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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

    // If existing workspace provided, enforce "workspace.generate" authorization upfront
    if (chatId) {
      try {
        await requireWorkspace(actor, chatId, "workspace.generate");
      } catch (err: any) {
        if (err instanceof ApiError) {
          return NextResponse.json(ActionResponse.error(err.message, null), {
            status: err.status,
          });
        }
        return NextResponse.json(
          ActionResponse.error("Chat not found or unauthorized", null),
          { status: 404 }
        );
      }
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
            const workspace = await createWorkspace(actor, {
              title: prompt.slice(0, 60),
            });
            chatId = workspace.id;
            send("chat_created", {
              chatId,
              title: workspace.title || prompt.slice(0, 60),
            });
          } else {
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
              const remainingTokens = 0;

              if (savedResponse?.id) {
                await createTokenUsage(actor.userId, tokenCount, savedResponse.id);
              }
              await updateUserToken(actor.userId, remainingTokens);

              try {
                revalidatePath("/workspaces");
                revalidatePath(`/workspaces/${chatId}`);
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
              err instanceof Error
                ? err.message
                : "Failed to stream AI response",
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
