import { route } from "@/server/http/route";
import { z } from "zod";
import { ingestLinkAttachment } from "@/server/services/attachment";

const ingestLinkSchema = z.object({
  url: z.string().url(),
});

export const POST = route({
  body: ingestLinkSchema,
  handler: async ({ actor, params, body }) => {
    const attachment = await ingestLinkAttachment(actor, params.id as string, body.url);
    return Response.json(attachment, { status: 201 });
  },
});
