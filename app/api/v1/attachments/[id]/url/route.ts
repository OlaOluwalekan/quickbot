import { route } from "@/server/http/route";
import { getAttachmentUrl } from "@/server/services/attachment";

export const GET = route({
  handler: async ({ actor, params }) => {
    const result = await getAttachmentUrl(actor, params.id as string);
    return Response.json(result);
  },
});
