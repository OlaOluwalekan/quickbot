import { route } from "@/server/http/route";
import {
  createWorkspaceSchema,
  listWorkspacesQuerySchema,
} from "@/lib/schemas/workspace";
import {
  createWorkspace,
  listWorkspaces,
} from "@/server/services/workspace";

export const GET = route({
  query: listWorkspacesQuerySchema,
  handler: async ({ actor, query }) => listWorkspaces(actor, query),
});

export const POST = route({
  body: createWorkspaceSchema,
  handler: async ({ actor, body }) => createWorkspace(actor, body),
});
