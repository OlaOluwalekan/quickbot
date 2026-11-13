import { route } from "@/server/http/route";
import { Errors } from "@/server/http/errors";
import { getDocumentRevision } from "@/server/services/generated-document";

export const runtime = "nodejs";

export const GET = route({
  handler: async ({ actor, params }) => {
    const docId = params.id as string;
    const revNum = parseInt(params.rev as string, 10);
    if (isNaN(revNum) || revNum < 1) {
      throw Errors.badRequest("Invalid revision number");
    }

    const revision = await getDocumentRevision(actor, docId, revNum);
    return { data: revision };
  },
});
