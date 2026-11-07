import { route } from "@/server/http/route";
import { listNotificationsQuerySchema } from "@/lib/schemas/notification";
import { listNotifications } from "@/server/services/notify";

export const GET = route({
  query: listNotificationsQuerySchema,
  handler: async ({ actor, query }) => {
    return listNotifications(actor.userId, {
      status: query.status,
      cursor: query.cursor,
      limit: query.limit,
    });
  },
});
