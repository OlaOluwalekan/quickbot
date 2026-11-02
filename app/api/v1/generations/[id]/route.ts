import { route } from "@/server/http/route";
import { getGenerationStatus } from "@/server/services/generation";

export const GET = route({
  handler: async ({ actor, params }) => {
    return getGenerationStatus(actor, params.id as string);
  },
});
