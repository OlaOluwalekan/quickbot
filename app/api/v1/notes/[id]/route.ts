import { route } from "@/server/http/route";
import { patchNoteSchema } from "@/lib/schemas/note";
import {
  updateWorkspaceNoteStatus,
  deleteWorkspaceNote,
} from "@/server/services/notes";

export const PATCH = route({
  body: patchNoteSchema,
  rateLimit: {
    policy: "notes:mutate",
    key: (c) => c.actor.userId,
  },
  handler: async ({ actor, params, body }) => {
    const updated = await updateWorkspaceNoteStatus(
      actor,
      params.id as string,
      body.status
    );
    return { note: updated };
  },
});

export const DELETE = route({
  rateLimit: {
    policy: "notes:mutate",
    key: (c) => c.actor.userId,
  },
  handler: async ({ actor, params }) => {
    return deleteWorkspaceNote(actor, params.id as string);
  },
});
