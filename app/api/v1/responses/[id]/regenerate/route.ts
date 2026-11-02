import { route } from "@/server/http/route";
import { regenerateResponseSchema } from "@/lib/schemas/response";
import { regenerateResponse } from "@/server/services/response";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = route({
  body: regenerateResponseSchema,
  handler: async ({ actor, params, body }) => {
    const { stream } = await regenerateResponse(
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
