import { route } from "@/server/http/route";
import { transferOwnershipSchema } from "@/lib/schemas/member";
import { requestOwnershipTransfer } from "@/server/services/ownership-transfer";

export const POST = route({
  body: transferOwnershipSchema,
  handler: async ({ actor, params, body }) =>
    requestOwnershipTransfer(actor, { workspaceId: params.id as string }, body),
});
