import { route } from "@/server/http/route";
import { deleteAttachment } from "@/server/services/attachment";

export const DELETE = route({
  handler: async ({ actor, params }) => {
    const result = await deleteAttachment(actor, params.id as string);
    return Response.json(result);
  },
});
