import { route } from "@/server/http/route";
import { searchWorkspacesQuerySchema } from "@/lib/schemas/workspace";
import { searchWorkspaces } from "@/server/services/workspace";

export const GET = route({
  query: searchWorkspacesQuerySchema,
  handler: async ({ actor, query }) => searchWorkspaces(actor, query),
});
