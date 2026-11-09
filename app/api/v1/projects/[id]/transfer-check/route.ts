import { route } from "@/server/http/route";
import { z } from "zod";
import { checkTransferFits } from "@/server/services/ownership-transfer";

const checkSchema = z.object({
  toUserId: z.string().min(1),
  previousOwnerAction: z.enum(["STAY_ADMIN", "LEAVE"]).default("STAY_ADMIN"),
});

export const POST = route({
  body: checkSchema,
  handler: async ({ params, body }) => {
    return checkTransferFits({
      projectId: params.id as string,
      toUserId: body.toUserId,
      previousOwnerAction: body.previousOwnerAction,
    });
  },
});
