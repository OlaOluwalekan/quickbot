import { route } from "@/server/http/route";
import { acceptOwnershipTransfer } from "@/server/services/ownership-transfer";

export const POST = route({
  handler: async ({ actor, params }) => {
    return acceptOwnershipTransfer(actor, params.id as string);
  },
});
