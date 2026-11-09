import { route } from "@/server/http/route";
import { declineOwnershipTransfer } from "@/server/services/ownership-transfer";

export const POST = route({
  handler: async ({ actor, params }) => {
    return declineOwnershipTransfer(actor, params.id as string);
  },
});
