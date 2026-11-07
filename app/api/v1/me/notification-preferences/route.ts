import { route } from "@/server/http/route";
import { updateNotificationPrefsSchema } from "@/lib/schemas/notification";
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from "@/server/services/notify";

export const GET = route({
  handler: async ({ actor }) => {
    const preferences = await getUserNotificationPreferences(actor.userId);
    return { preferences };
  },
});

export const PATCH = route({
  body: updateNotificationPrefsSchema,
  handler: async ({ actor, body }) => {
    const preferences = await updateUserNotificationPreferences(
      actor.userId,
      body
    );
    return { preferences };
  },
});
