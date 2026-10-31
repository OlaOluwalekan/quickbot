import { route } from "@/server/http/route";
import { cancelGeneration } from "@/server/services/generation";

export const POST = route({
  handler: async ({ actor, params }) => {
    return cancelGeneration(actor, params.id as string);
  },
});
