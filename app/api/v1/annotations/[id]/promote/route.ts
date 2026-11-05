import { route } from "@/server/http/route";
import { promoteAnnotationSchema } from "@/lib/schemas/annotation";
import { promoteAnnotation } from "@/server/services/annotation";

export const POST = route({
  body: promoteAnnotationSchema,
  handler: async ({ actor, params, body }) => {
    return promoteAnnotation(actor, params.id as string, body);
  },
});
