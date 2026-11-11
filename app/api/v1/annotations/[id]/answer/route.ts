import { route } from "@/server/http/route";
import { z } from "zod";
import { streamAnnotationAnswer } from "@/server/services/annotation";

export const runtime = "nodejs";
export const maxDuration = 60;

const answerBodySchema = z.object({
  prompt: z.string().min(1).max(20000).optional(),
  idempotencyKey: z.string().min(1).max(255).optional(),
  modelKey: z.string().optional(),
});

export const POST = route({
  body: answerBodySchema,
  handler: async ({ actor, params, body, req }) => {
    const idempotencyKey =
      body.idempotencyKey ||
      req.headers.get("x-idempotency-key") ||
      req.headers.get("idempotency-key") ||
      crypto.randomUUID();

    const normalizedBody = {
      ...body,
      idempotencyKey,
    };

    const { stream } = await streamAnnotationAnswer(
      actor,
      params.id as string,
      normalizedBody
    );

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
