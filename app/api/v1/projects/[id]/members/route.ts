import { route } from "@/server/http/route";
import { listProjectMembers } from "@/server/services/members";

export const GET = route({
  handler: async ({ actor, params }) =>
    listProjectMembers(actor, params.id as string),
});
