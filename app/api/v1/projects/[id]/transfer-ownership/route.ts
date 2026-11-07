import { route } from "@/server/http/route";
import { transferOwnershipSchema } from "@/lib/schemas/member";
import { transferProjectOwnership } from "@/server/services/members";

export const POST = route({
  body: transferOwnershipSchema,
  handler: async ({ actor, params, body }) =>
    transferProjectOwnership(actor, params.id as string, body),
});
