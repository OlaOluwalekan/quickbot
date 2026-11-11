import { route } from "@/server/http/route";
import { z } from "zod";
import {
  createAnnotationMessage,
  streamAnnotationAnswer,
} from "@/server/services/annotation";

const messageBodySchema = z.object({
  content: z.string().min(1).max(20000).optional(),
  prompt: z.string().min(1).max(20000).optional(),
  stream: z.boolean().optional(),
  idempotencyKey: z.string().min(1).max(255).optional(),
  modelKey: z.string().optional().default("text-economy"),
});

export const POST = route({
  body: messageBodySchema,
  handler: async ({ actor, params, body, req }) => {
    const text = (body.prompt || body.content || "").trim();
    const wantsStream =
      body.stream ||
      req.headers.get("accept")?.includes("text/event-stream");

    if (wantsStream) {
      const idempotencyKey =
        body.idempotencyKey ||
        req.headers.get("x-idempotency-key") ||
        req.headers.get("idempotency-key") ||
        crypto.randomUUID();

      const { stream } = await streamAnnotationAnswer(
        actor,
        params.id as string,
        {
          idempotencyKey,
          prompt: text,
          modelKey: body.modelKey,
        }
      );

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
