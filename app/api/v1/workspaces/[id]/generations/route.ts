import { route } from "@/server/http/route";
import { createGenerationSchema } from "@/lib/schemas/generation";
import { createAndStreamGeneration } from "@/server/services/generation";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = route({
  body: createGenerationSchema,
  handler: async ({ actor, params, body }) => {
    const { stream } = await createAndStreamGeneration(
      actor,
      params.id as string,
      body
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
