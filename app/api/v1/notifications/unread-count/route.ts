import { route } from "@/server/http/route";
import { getUnreadNotificationCount } from "@/server/services/notify";

export const GET = route({
  handler: async ({ actor }) => {
    const count = await getUnreadNotificationCount(actor.userId);
    return { count };
  },
});
