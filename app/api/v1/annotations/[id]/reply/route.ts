import { route } from "@/server/http/route";
import { replyAnnotationSchema } from "@/lib/schemas/annotation";
import { createAndStreamAnnotationReply } from "@/server/services/annotation";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = route({
  body: replyAnnotationSchema,
  handler: async ({ actor, params, body, req }) => {
    const idempotencyKey =
      body.idempotencyKey ||
      req.headers.get("x-idempotency-key") ||
      req.headers.get("idempotency-key") ||
      crypto.randomUUID();

    const normalizedBody = {
      ...body,
      idempotencyKey,
      prompt: body.prompt || body.content,
    };

    const { stream } = await createAndStreamAnnotationReply(
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
