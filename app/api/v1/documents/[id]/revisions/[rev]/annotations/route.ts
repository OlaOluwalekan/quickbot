import { route } from "@/server/http/route";
import { Errors } from "@/server/http/errors";
import { createAnnotationSchema } from "@/lib/schemas/annotation";
import { createDocumentAnnotation } from "@/server/services/generated-document";

export const runtime = "nodejs";

export const POST = route({
  body: createAnnotationSchema,
  handler: async ({ actor, params, body }) => {
    const docId = params.id as string;
    const revNum = parseInt(params.rev as string, 10);
    if (isNaN(revNum) || revNum < 1) {
      throw Errors.badRequest("Invalid revision number");
    }

    const annotation = await createDocumentAnnotation(actor, docId, revNum, body);
    return { data: annotation };
  },
});
