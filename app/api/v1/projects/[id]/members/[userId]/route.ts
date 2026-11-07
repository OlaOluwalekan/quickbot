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
    let res: unknown = { success: true };
    if (body.role !== undefined) {
      res = await updateProjectMemberRole(actor, projectId, targetUserId, body.role);
    }
    if (body.monthlyCreditCap !== undefined) {
      res = await updateProjectMemberCap(actor, projectId, targetUserId, body.monthlyCreditCap);
    }
    return res;
  },
});

export const DELETE = route({
  handler: async ({ actor, params }) =>
    removeProjectMember(actor, params.id as string, params.userId as string),
});
