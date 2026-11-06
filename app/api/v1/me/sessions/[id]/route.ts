import { route } from "@/server/http/route";
import { Errors } from "@/server/http/errors";
import { revokeUserSession } from "@/server/services/session";

export const DELETE = route({
  auth: "required",
  disableCookieCache: true,
  handler: async (c) => {
    const params = await c.params;
    if (!params?.id) {
      throw Errors.badRequest("Session ID is required");
    }
    const result = await revokeUserSession(c.actor, params.id);
    return result;
  },
});
