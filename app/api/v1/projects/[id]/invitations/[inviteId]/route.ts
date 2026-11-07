import { route } from "@/server/http/route";
import { revokeInvitation } from "@/server/services/invitation";

export const DELETE = route({
  handler: async ({ actor, params }) =>
    revokeInvitation(actor, {
      projectId: params.id as string,
      invitationId: params.inviteId as string,
    }),
});
