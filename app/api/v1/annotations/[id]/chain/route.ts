import { route } from "@/server/http/route";
import { getAnnotationChain } from "@/server/services/annotation";

export const GET = route({
  handler: async ({ actor, params }) => {
    return getAnnotationChain(actor, params.id as string);
  },
});
