import { route } from "@/server/http/route";
import { setActiveVersionSchema } from "@/lib/schemas/response";
import { setActiveVersion } from "@/server/services/response";

export const PUT = route({
  body: setActiveVersionSchema,
  handler: async ({ actor, params, body }) => {
    return setActiveVersion(actor, params.id as string, body.versionId);
  },
});
