import { route } from "@/server/http/route";
import { resendInvitation } from "@/server/services/invitation";

export const POST = route({
  rateLimit: {
    policy: "invite:send",
    key: (c) => c.actor.userId,
  },
  handler: async ({ actor, params }) =>
    resendInvitation(actor, {
      workspaceId: params.id as string,
      invitationId: params.inviteId as string,
    }),
});
