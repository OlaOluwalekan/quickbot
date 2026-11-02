import { route } from "@/server/http/route";
import { updateWorkspaceSchema } from "@/lib/schemas/workspace";
import {
  deleteWorkspace,
  getWorkspace,
  updateWorkspace,
} from "@/server/services/workspace";

export const GET = route({
  handler: async ({ actor, params }) => getWorkspace(actor, params.id as string),
});

export const PATCH = route({
  body: updateWorkspaceSchema,
  handler: async ({ actor, params, body }) =>
    updateWorkspace(actor, params.id as string, body),
});

export const DELETE = route({
  handler: async ({ actor, params }) => deleteWorkspace(actor, params.id as string),
});
