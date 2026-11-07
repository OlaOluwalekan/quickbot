import { route } from "@/server/http/route";
import { listWorkspaceMembers } from "@/server/services/members";

export const GET = route({
  handler: async ({ actor, params }) =>
    listWorkspaceMembers(actor, params.id as string),
});
