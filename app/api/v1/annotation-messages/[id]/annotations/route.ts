import { route } from "@/server/http/route";
import { createAnnotationSchema } from "@/lib/schemas/annotation";
import {
  createAnnotationOnMessage,
  listAnnotationsForMessage,
} from "@/server/services/annotation";

export const GET = route({
  handler: async ({ actor, params }) => {
    return listAnnotationsForMessage(actor, params.id as string);
  },
});

export const POST = route({
  body: createAnnotationSchema,
  rateLimit: {
    policy: "annotation:create",
    key: (c) => c.actor.userId,
  },
  handler: async ({ actor, params, body }) => {
    return createAnnotationOnMessage(actor, params.id as string, body);
  },
});
