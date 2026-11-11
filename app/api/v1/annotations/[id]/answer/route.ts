import { route } from "@/server/http/route";
import { z } from "zod";
import { Errors } from "@/server/http/errors";
import { streamAnnotationAnswer } from "@/server/services/annotation";

export const runtime = "nodejs";
export const maxDuration = 60;

const answerBodySchema = z.object({
  idempotencyKey: z.string().min(1).max(255).optional(),
});

/**
 * POST /api/v1/annotations/:id/answer (SSE) — answers the waiting question of
 * an Ask thread: right after "Ask now", or Retry after a failure. Follow-ups
 * go through POST /annotations/:id/messages.
 */
export const POST = route({
  body: answerBodySchema,
  handler: async ({ actor, params, body, req }) => {
    const idempotencyKey =
      body.idempotencyKey ||
      req.headers.get("x-idempotency-key") ||
      req.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw Errors.badRequest("An idempotency key is required");
    }

    const { stream } = await streamAnnotationAnswer(actor, params.id as string, {
      idempotencyKey,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      },
    });
  },
});
