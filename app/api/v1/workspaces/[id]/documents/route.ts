import { z } from "zod";
import { route } from "@/server/http/route";
import { addDocumentToWorkspace } from "@/server/services/workspace-document";

const AddDocumentBodySchema = z.object({
  attachmentId: z.string().min(1),
});

export const POST = route({
  auth: "required",
  body: AddDocumentBodySchema,
  handler: async ({ actor, params, body }) => {
    const { id: workspaceId } = params as { id: string };
    return addDocumentToWorkspace(actor, workspaceId, body.attachmentId);
  },
});
