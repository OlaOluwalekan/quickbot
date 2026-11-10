import { route } from "@/server/http/route";
import { listNotesQuerySchema } from "@/lib/schemas/note";
import { listWorkspaceNotes } from "@/server/services/notes";

export const GET = route({
  query: listNotesQuerySchema,
  rateLimit: {
    policy: "notes:list",
    key: (c) => c.actor.userId,
  },
  handler: async ({ actor, params, query }) => {
    return listWorkspaceNotes(actor, params.id as string, query.status);
  },
});
