import { route } from "@/server/http/route";
import { updateMemberRoleSchema } from "@/lib/schemas/member";
import {
  updateProjectMemberRole,
  updateProjectMemberCap,
  removeProjectMember,
} from "@/server/services/members";

export const PATCH = route({
  body: updateMemberRoleSchema,
  handler: async ({ actor, params, body }) => {
    const projectId = params.id as string;
    const targetUserId = params.userId as string;
    // The schema guarantees exactly one of role/capabilities / monthlyCreditCap.
    if (body.monthlyCreditCap !== undefined) {
      return updateProjectMemberCap(actor, projectId, targetUserId, body.monthlyCreditCap);
    }
    return updateProjectMemberRole(actor, projectId, targetUserId, {
      role: body.role,
      canComment: body.canComment,
      canAsk: body.canAsk,
    });
  },
});

export const DELETE = route({
  handler: async ({ actor, params }) =>
    removeProjectMember(actor, params.id as string, params.userId as string),
});
