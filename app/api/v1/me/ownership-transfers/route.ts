import { route } from "@/server/http/route";
import { z } from "zod";
import { listMyPendingTransfers } from "@/server/services/ownership-transfer";
import { ownershipTransferStatusSchema } from "@/lib/schemas/member";

const querySchema = z.object({
  status: ownershipTransferStatusSchema.optional(),
});

export const GET = route({
  query: querySchema,
  handler: async ({ actor, query }) => {
    const transfers = await listMyPendingTransfers(actor.userId, query.status);
    return { transfers };
  },
});
