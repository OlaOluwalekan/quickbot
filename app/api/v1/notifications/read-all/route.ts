import { route } from "@/server/http/route";
import { markAllNotificationsRead } from "@/server/services/notify";

export const POST = route({
  handler: async ({ actor }) => {
    return markAllNotificationsRead(actor.userId);
  },
});
