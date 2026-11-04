import { route } from "@/server/http/route";
import { updateAnnotationSchema } from "@/lib/schemas/annotation";
import {
  getAnnotation,
  updateAnnotation,
  deleteAnnotation,
} from "@/server/services/annotation";

export const GET = route({
  handler: async ({ actor, params }) => {
    return getAnnotation(actor, params.id as string);
  },
});

export const PATCH = route({
  body: updateAnnotationSchema,
  handler: async ({ actor, params, body }) => {
    return updateAnnotation(actor, params.id as string, body);
  },
});

export const DELETE = route({
  handler: async ({ actor, params }) => {
    return deleteAnnotation(actor, params.id as string);
  },
});
