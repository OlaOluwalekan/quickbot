import { route } from "@/server/http/route";
import { listWorkspaceShares } from "@/server/services/share";

export const GET = route({
  handler: async ({ actor, params }) => {
    const { id } = params as { id: string };
    return listWorkspaceShares(actor, id);
  },
});
