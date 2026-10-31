import { route } from "@/server/http/route";
import { responseViewQuerySchema } from "@/lib/schemas/response";
import { listResponseVersions } from "@/server/services/response";

export const GET = route({
  query: responseViewQuerySchema,
  handler: async ({ actor, params, query }) => {
    return listResponseVersions(actor, params.id as string, query);
  },
});
