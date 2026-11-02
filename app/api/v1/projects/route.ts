import { route } from "@/server/http/route";
import {
  createProjectSchema,
  listProjectsQuerySchema,
} from "@/lib/schemas/workspace";
import { createProject, listProjects } from "@/server/services/project";

export const GET = route({
  query: listProjectsQuerySchema,
  handler: async ({ actor, query }) => listProjects(actor, query),
});

export const POST = route({
  body: createProjectSchema,
  handler: async ({ actor, body }) => createProject(actor, body),
});
