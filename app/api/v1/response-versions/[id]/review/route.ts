import { NextRequest } from "next/server";
import { z } from "zod";
import { requireActor } from "@/server/auth/session";
import { Errors } from "@/server/http/errors";
import { executeDocumentReview } from "@/server/services/document-review";

const ReviewBodySchema = z.object({
  instruction: z.string().max(2000).optional(),
  preset: z.enum(["errors", "consistency", "clarity", "custom"]).optional(),
  visibility: z.enum(["PRIVATE", "WORKSPACE"]).optional(),
  idempotencyKey: z.string().optional(),
});

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await requireActor();
  const { id: versionId } = await context.params;

  let body: z.infer<typeof ReviewBodySchema> = {};
  try {
    const raw = await req.json();
    body = ReviewBodySchema.parse(raw);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      throw Errors.badRequest("Invalid review request parameters");
    }
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const send = (event: string, data: unknown) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    writer.write(encoder.encode(payload)).catch(() => {});
  };

  const close = () => {
    writer.close().catch(() => {});
  };

  void executeDocumentReview({
    actor,
    versionId,
    input: body,
    send,
    close,
  });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
