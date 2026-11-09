import { route } from "@/server/http/route";
import { updateMemberRoleSchema } from "@/lib/schemas/member";
import {
  updateWorkspaceMemberRole,
  updateWorkspaceMemberCap,
  removeWorkspaceMember,
} from "@/server/services/members";
import { setMemberKeepActive } from "@/server/services/member-limits";

export const PATCH = route({
  body: updateMemberRoleSchema,
  handler: async ({ actor, params, body }) => {
    // The schema guarantees exactly one of role/capabilities, monthlyCreditCap or keepActive.
    const workspaceId = params.id as string;
    const targetUserId = params.userId as string;
    if (body.monthlyCreditCap !== undefined) {
      return updateWorkspaceMemberCap(actor, workspaceId, targetUserId, body.monthlyCreditCap);
    }
    if (body.keepActive !== undefined) {
      return setMemberKeepActive(actor, {
        workspaceId: workspaceId,
        targetUserId,
        keepActive: body.keepActive,
      });
    }
    return updateWorkspaceMemberRole(actor, workspaceId, targetUserId, {
      role: body.role,
      canComment: body.canComment,
      canAsk: body.canAsk,
    });
  },
});

export const DELETE = route({
  handler: async ({ actor, params }) =>
    removeWorkspaceMember(actor, params.id as string, params.userId as string),
});
