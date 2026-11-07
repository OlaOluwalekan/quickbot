import { route } from "@/server/http/route";
import { updateMemberRoleSchema } from "@/lib/schemas/member";
import {
  updateProjectMemberRole,
  removeProjectMember,
} from "@/server/services/members";

export const PATCH = route({
  body: updateMemberRoleSchema,
  handler: async ({ actor, params, body }) =>
    updateProjectMemberRole(
      actor,
      params.id as string,
      params.userId as string,
      body.role
    ),
});

export const DELETE = route({
  handler: async ({ actor, params }) =>
    removeProjectMember(actor, params.id as string, params.userId as string),
});
