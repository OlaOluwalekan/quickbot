import { route } from "@/server/http/route";
import { pageQuery } from "@/server/http/pagination";
import { responseViewQuerySchema } from "@/lib/schemas/response";
import { listWorkspaceResponses } from "@/server/services/response";

const workspaceResponsesQuery = pageQuery.merge(responseViewQuerySchema);

export const GET = route({
  query: workspaceResponsesQuery,
  handler: async ({ actor, params, query }) => {
    return listWorkspaceResponses(actor, params.id as string, query);
  },
});
