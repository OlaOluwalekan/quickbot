import { route } from "@/server/http/route";
import { listProjectWorkspacesQuerySchema } from "@/lib/schemas/workspace";
import { getProjectWorkspaces } from "@/server/services/project";

export const GET = route({
  query: listProjectWorkspacesQuerySchema,
  handler: async ({ actor, params, query }) =>
    getProjectWorkspaces(actor, params.id as string, query),
});
