import { route } from "@/server/http/route";
import { pageQuery } from "@/server/http/pagination";
import { listWorkspaceActivity } from "@/server/services/activity";

export const GET = route({
  query: pageQuery,
  handler: async ({ actor, params, query }) =>
    listWorkspaceActivity(actor, params.id as string, query),
});
