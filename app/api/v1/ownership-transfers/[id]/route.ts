import { route } from "@/server/http/route";
import { cancelOwnershipTransfer } from "@/server/services/ownership-transfer";

export const DELETE = route({
  handler: async ({ actor, params }) => {
    return cancelOwnershipTransfer(actor, params.id as string);
  },
});
