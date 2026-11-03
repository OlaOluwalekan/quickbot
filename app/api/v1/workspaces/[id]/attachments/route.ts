import { route } from "@/server/http/route";
import { listWorkspaceAttachments } from "@/server/services/attachment";

export const GET = route({
  handler: async ({ actor, params }) => {
    const attachments = await listWorkspaceAttachments(
      actor,
      params.id as string
    );
    return Response.json({ attachments });
  },
});
