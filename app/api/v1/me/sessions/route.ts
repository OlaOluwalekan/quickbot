import { z } from "zod";
import { route } from "@/server/http/route";
import { Errors } from "@/server/http/errors";
import {
  listUserSessions,
  revokeOtherUserSessions,
  revokeAllUserSessions,
  revokeUserSession,
} from "@/server/services/session";

export const GET = route({
  auth: "required",
  disableCookieCache: true,
  handler: async (c) => {
    const sessions = await listUserSessions(c.actor.userId, c.actor.sessionId);
    return sessions;
  },
});

export const DELETE = route({
  auth: "required",
  disableCookieCache: true,
  query: z.object({
    scope: z.enum(["others", "all"]).optional(),
    id: z.string().optional(),
  }).optional(),
  body: z.object({
    password: z.string().optional(),
  }).optional(),
  handler: async (c) => {
    const scope = c.query?.scope;
    const sessionId = c.query?.id;

    if (scope === "others") {
      const result = await revokeOtherUserSessions(c.actor, c.body?.password);
      return result;
    }

    if (scope === "all") {
      const result = await revokeAllUserSessions(c.actor, c.body?.password);
      return result;
    }

    if (sessionId) {
      const result = await revokeUserSession(c.actor, sessionId);
      return result;
    }

    throw Errors.badRequest(
      "Must provide query parameter scope ('others' or 'all') or session id"
    );
  },
});
