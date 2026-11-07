import { route } from "@/server/http/route";
import { acceptInvitationSchema } from "@/lib/schemas/member";
import { acceptInvitation } from "@/server/services/invitation";

export const POST = route({
  body: acceptInvitationSchema,
  handler: async ({ actor, body }) => acceptInvitation(actor, body.token),
});
