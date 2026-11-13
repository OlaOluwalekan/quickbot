import { route } from "@/server/http/route";
import { Errors } from "@/server/http/errors";
import { createAnnotationSchema } from "@/lib/schemas/annotation";
import {
  createDocumentAnnotation,
  listDocumentAnnotations,
} from "@/server/services/generated-document";

export const runtime = "nodejs";

function parseRevision(raw: unknown): number {
  const revNum = Number(raw);
  if (!Number.isInteger(revNum) || revNum < 1) {
    throw Errors.badRequest("Invalid revision number");
  }
  return revNum;
}

export const GET = route({
  handler: async ({ actor, params }) => {
    const rows = await listDocumentAnnotations(
      actor,
      params.id as string,
      parseRevision(params.rev)
    );
    return rows;
  },
});

export const POST = route({
  body: createAnnotationSchema,
  rateLimit: {
    policy: "annotation:create",
    key: (c) => c.actor.userId,
  },
  handler: async ({ actor, params, body }) => {
    return createDocumentAnnotation(
      actor,
      params.id as string,
      parseRevision(params.rev),
      body
    );
  },
});
