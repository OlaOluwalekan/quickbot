import { route } from "@/server/http/route";
import { pageQuery } from "@/server/http/pagination";
import { getProjectWorkspaces } from "@/server/services/project";

export const GET = route({
  query: pageQuery,
  handler: async ({ actor, params, query }) =>
    getProjectWorkspaces(actor, params.id as string, query),
});
