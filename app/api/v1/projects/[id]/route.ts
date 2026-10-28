import { route } from "@/server/http/route";
import { updateProjectSchema } from "@/lib/schemas/workspace";
import {
  deleteProject,
  getProject,
  updateProject,
} from "@/server/services/project";

export const GET = route({
  handler: async ({ actor, params }) => getProject(actor, params.id as string),
});

export const PATCH = route({
  body: updateProjectSchema,
  handler: async ({ actor, params, body }) =>
    updateProject(actor, params.id as string, body),
});

export const DELETE = route({
  handler: async ({ actor, params }) => deleteProject(actor, params.id as string),
});
