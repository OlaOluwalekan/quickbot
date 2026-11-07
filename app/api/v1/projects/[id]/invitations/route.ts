import { route } from "@/server/http/route";
import { createInvitationSchema } from "@/lib/schemas/member";
import { createInvitation, listInvitations } from "@/server/services/invitation";

export const POST = route({
  body: createInvitationSchema,
  rateLimit: {
    policy: "invite:send",
    key: (c) => c.actor.userId,
  },
  handler: async ({ actor, params, body }) =>
    createInvitation(actor, {
      projectId: params.id as string,
      emailOrUsername: body.emailOrUsername,
      role: body.role,
    }),
});

export const GET = route({
  handler: async ({ actor, params }) =>
    listInvitations(actor, { projectId: params.id as string }),
});
