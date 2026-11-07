import { route } from "@/server/http/route";
import { z } from "zod";
import {
  getInvitationInfoById,
  getInvitationInfoByToken,
} from "@/server/services/invitation";

/** Look up by emailed `token`, or by invitation `id` (signed-in invitee only). */
const infoQuerySchema = z.union([
  z.object({ token: z.string().min(1) }),
  z.object({ id: z.string().min(1) }),
]);

export const GET = route({
  auth: "optional",
  query: infoQuerySchema,
  handler: async ({ actor, query }) =>
    "token" in query
      ? getInvitationInfoByToken(query.token, actor)
      : getInvitationInfoById(actor, query.id),
});
