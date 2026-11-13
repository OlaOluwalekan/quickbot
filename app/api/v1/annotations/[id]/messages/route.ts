import { route } from "@/server/http/route";
import { z } from "zod";
import { Errors } from "@/server/http/errors";
import {
  createAnnotationMessage,
  streamAnnotationAnswer,
} from "@/server/services/annotation";

export const runtime = "nodejs";

const messageBodySchema = z.object({
  content: z.string().min(1).max(20000).optional(),
  prompt: z.string().min(1).max(20000).optional(),
  stream: z.boolean().optional(),
  idempotencyKey: z.string().min(1).max(255).optional(),
});

/**
 * POST /api/v1/annotations/:id/messages
 * - Comment thread: adds a reply (JSON).
 * - Ask thread, with `stream: true` or `Accept: text/event-stream`: saves the
 *   follow-up question and streams its answer (SSE).
 */
export const POST = route({
  body: messageBodySchema,
  handler: async ({ actor, params, body, req }) => {
    const text = (body.prompt || body.content || "").trim();
    if (!text) {
      throw Errors.badRequest("Message content cannot be empty");
    }
    const wantsStream =
      body.stream ||
      req.headers.get("accept")?.includes("text/event-stream");

    if (wantsStream) {
      const idempotencyKey =
        body.idempotencyKey ||
        req.headers.get("x-idempotency-key") ||
        req.headers.get("idempotency-key");
      if (!idempotencyKey) {
        throw Errors.badRequest("An idempotency key is required");
      }

      const { stream } = await streamAnnotationAnswer(actor, params.id as string, {
        idempotencyKey,
        prompt: text,
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          Connection: "keep-alive",
        },
      });
    }

    return createAnnotationMessage(actor, params.id as string, text);
  },
});
