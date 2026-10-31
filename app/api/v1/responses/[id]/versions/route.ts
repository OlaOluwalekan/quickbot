import { route } from "@/server/http/route";
import { listResponseVersions } from "@/server/services/response";

export const GET = route({
  handler: async ({ actor, params }) => {
    return listResponseVersions(actor, params.id as string);
  },
});
