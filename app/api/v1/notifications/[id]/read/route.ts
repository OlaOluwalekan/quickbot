import { route } from "@/server/http/route";
import { markNotificationRead } from "@/server/services/notify";

export const POST = route({
  handler: async ({ actor, params }) => {
    const { id } = params as { id: string };
    return markNotificationRead(actor.userId, id);
  },
});
