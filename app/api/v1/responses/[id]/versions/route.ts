import { route } from "@/server/http/route";
import {
  responseViewQuerySchema,
  setActiveVersionSchema,
} from "@/lib/schemas/response";
import {
  listResponseVersions,
  setActiveVersion,
} from "@/server/services/response";

export const GET = route({
  query: responseViewQuerySchema,
  handler: async ({ actor, params, query }) => {
    return listResponseVersions(actor, params.id as string, query);
  },
});

export const PATCH = route({
  body: setActiveVersionSchema,
  handler: async ({ actor, params, body }) => {
    return setActiveVersion(actor, params.id as string, body.versionId);
  },
});
