import { route } from "@/server/http/route";
import { updateMemberRoleSchema } from "@/lib/schemas/member";
import {
  updateProjectMemberRole,
  updateProjectMemberCap,
  removeProjectMember,
} from "@/server/services/members";
import { setMemberKeepActive } from "@/server/services/member-limits";

export const PATCH = route({
  body: updateMemberRoleSchema,
  handler: async ({ actor, params, body }) => {
    // The schema guarantees exactly one of role/capabilities, monthlyCreditCap or keepActive.
    const projectId = params.id as string;
    const targetUserId = params.userId as string;
    if (body.monthlyCreditCap !== undefined) {
      return updateProjectMemberCap(actor, projectId, targetUserId, body.monthlyCreditCap);
    }
    if (body.keepActive !== undefined) {
      return setMemberKeepActive(actor, {
        projectId: projectId,
        targetUserId,
        keepActive: body.keepActive,
      });
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
