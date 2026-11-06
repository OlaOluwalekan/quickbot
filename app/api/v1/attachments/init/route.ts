import { route } from "@/server/http/route";
import { initAttachmentSchema } from "@/lib/schemas/attachment";
import { initAttachment } from "@/server/services/attachment";

export const POST = route({
  auth: "required",
  body: initAttachmentSchema,
  handler: async ({ actor, body }) => {
    const result = await initAttachment(actor, body);
    return Response.json(result, { status: 201 });
  },
});
