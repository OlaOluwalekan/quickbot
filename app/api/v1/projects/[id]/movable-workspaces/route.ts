import { route } from "@/server/http/route";
import { listMovableWorkspacesQuerySchema } from "@/lib/schemas/workspace";
import { listMovableWorkspaces } from "@/server/services/project";

export const GET = route({
  query: listMovableWorkspacesQuerySchema,
  handler: async ({ actor, params, query }) =>
    listMovableWorkspaces(actor, params.id as string, query),
});
