import { route } from "@/server/http/route";
import { documentReviewSchema } from "@/lib/schemas/document-review";
import {
  estimateDocumentReview,
  startDocumentReview,
} from "@/server/services/document-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/documents/:id/review (SSE) — "Ask Klecx to review" on a
 * generated document (F3.4). Reads the current revision. Needs
 * `workspace.ask`; billed to the workspace owner, once per review.
 */
export const POST = route({
  body: documentReviewSchema,
  rateLimit: { policy: "gen:start", key: (c) => c.actor.userId },
  handler: async ({ actor, params, body }) => {
    const { stream } = await startDocumentReview(
      actor,
      { kind: "document", documentId: params.id as string },
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

/** GET — what a review of the current revision would cost (the amount reserved). */
export const GET = route({
  handler: async ({ actor, params }) => {
    return estimateDocumentReview(actor, {
      kind: "document",
      documentId: params.id as string,
    });
  },
});
