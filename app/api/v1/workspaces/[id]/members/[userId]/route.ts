import { route } from "@/server/http/route";
import { updateMemberRoleSchema } from "@/lib/schemas/member";
import {
  updateWorkspaceMemberRole,
  updateWorkspaceMemberCap,
  removeWorkspaceMember,
} from "@/server/services/members";

export const PATCH = route({
  body: updateMemberRoleSchema,
  handler: async ({ actor, params, body }) => {
    const workspaceId = params.id as string;
    const targetUserId = params.userId as string;
    // The schema guarantees exactly one of role / monthlyCreditCap.
    if (body.monthlyCreditCap !== undefined) {
      return updateWorkspaceMemberCap(actor, workspaceId, targetUserId, body.monthlyCreditCap);
    }
    return updateWorkspaceMemberRole(actor, workspaceId, targetUserId, body.role as string);
  },
});

export const DELETE = route({
  handler: async ({ actor, params }) =>
    removeWorkspaceMember(actor, params.id as string, params.userId as string),
});
