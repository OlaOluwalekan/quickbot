import { route } from "@/server/http/route";
import { revokeShareLink } from "@/server/services/share";

export const DELETE = route({
  handler: async ({ actor, params }) => {
    const { id } = params as { id: string };
    return revokeShareLink(actor, id);
  },
});
