import { route } from "@/server/http/route";
import { z } from "zod";
import { checkTransferFitsForOwner } from "@/server/services/ownership-transfer";

const checkSchema = z.object({
  toUserId: z.string().min(1),
  previousOwnerAction: z.enum(["STAY_ADMIN", "LEAVE"]).default("STAY_ADMIN"),
});

// Owner-only plan-fit preview for the transfer dialog (strangers get 404).
export const POST = route({
  body: checkSchema,
  handler: async ({ actor, params, body }) =>
    checkTransferFitsForOwner(actor, { workspaceId: params.id as string }, body),
});
