import { route } from "@/server/http/route";
import { revertLatestResponseEdit } from "@/server/services/response";

export const DELETE = route({
  handler: async ({ actor, params }) => {
    return revertLatestResponseEdit(actor, params.id as string);
  },
});
