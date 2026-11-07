import { route } from "@/server/http/route";
import { dismissNotification } from "@/server/services/notify";

export const DELETE = route({
  handler: async ({ actor, params }) => {
    const { id } = params as { id: string };
    return dismissNotification(actor.userId, id);
  },
});
