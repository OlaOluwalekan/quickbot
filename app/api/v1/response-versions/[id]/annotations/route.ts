import { route } from "@/server/http/route";
import { createAnnotationSchema } from "@/lib/schemas/annotation";
import { createAnnotation } from "@/server/services/annotation";

export const POST = route({
  body: createAnnotationSchema,
  rateLimit: {
    policy: "annotation:create",
    key: (c) => c.actor.userId,
  },
  handler: async ({ actor, params, body }) => {
    return createAnnotation(actor, params.id as string, body);
  },
});
