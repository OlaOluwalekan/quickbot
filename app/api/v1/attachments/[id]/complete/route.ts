import { route } from "@/server/http/route";
import { completeAttachmentSchema } from "@/lib/schemas/attachment";
import { completeAttachment } from "@/server/services/attachment";

export const POST = route({
  body: completeAttachmentSchema.optional(),
  handler: async ({ actor, params, body }) => {
    const attachment = await completeAttachment(
      actor,
      params.id as string,
      body
    );
    return Response.json({ attachment });
  },
});
