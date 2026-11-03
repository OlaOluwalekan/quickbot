import { route } from "@/server/http/route";
import { initAttachmentSchema } from "@/lib/schemas/attachment";
import { initAttachment } from "@/server/services/attachment";

export const POST = route({
  body: initAttachmentSchema,
  handler: async ({ actor, params, body }) => {
    const result = await initAttachment(actor, {
      ...body,
      workspaceId: params.id as string,
    });
    return Response.json(result, { status: 201 });
  },
});
