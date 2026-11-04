import { route } from "@/server/http/route";
import { listAnnotationsQuerySchema } from "@/lib/schemas/annotation";
import { listAnnotationsForResponse } from "@/server/services/annotation";

export const GET = route({
  query: listAnnotationsQuerySchema,
  handler: async ({ actor, params, query }) => {
    return listAnnotationsForResponse(actor, params.id as string, query);
  },
});
