import { route } from "@/server/http/route";
import { runQuestionBatchSchema } from "@/lib/schemas/annotation";
import { runQuestionBatch } from "@/server/services/question-batch";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = route({
  body: runQuestionBatchSchema,
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

    const { stream } = await runQuestionBatch(
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
