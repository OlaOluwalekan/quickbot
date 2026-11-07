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
    let res: unknown = { success: true };
    if (body.role !== undefined) {
      res = await updateWorkspaceMemberRole(actor, workspaceId, targetUserId, body.role);
    }
    if (body.monthlyCreditCap !== undefined) {
      res = await updateWorkspaceMemberCap(actor, workspaceId, targetUserId, body.monthlyCreditCap);
    }
    return res;
  },
});

export const DELETE = route({
  handler: async ({ actor, params }) =>
    removeWorkspaceMember(actor, params.id as string, params.userId as string),
});
