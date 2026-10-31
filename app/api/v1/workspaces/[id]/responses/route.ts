import { route } from "@/server/http/route";
import { pageQuery } from "@/server/http/pagination";
import { listWorkspaceResponses } from "@/server/services/response";

export const GET = route({
  query: pageQuery,
  handler: async ({ actor, params, query }) => {
    return listWorkspaceResponses(actor, params.id as string, query);
  },
});
