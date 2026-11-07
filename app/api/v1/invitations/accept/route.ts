import { route } from "@/server/http/route";
import { acceptInvitationSchema } from "@/lib/schemas/member";
import {
  acceptInvitation,
  acceptInvitationById,
} from "@/server/services/invitation";

export const POST = route({
  body: acceptInvitationSchema,
  handler: async ({ actor, body }) =>
    "token" in body
      ? acceptInvitation(actor, body.token)
      : acceptInvitationById(actor, body.invitationId),
});
