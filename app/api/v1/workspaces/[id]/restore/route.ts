import { route } from "@/server/http/route";
import { restoreWorkspace } from "@/server/services/workspace";

export const POST = route({
  handler: async ({ actor, params }) => restoreWorkspace(actor, params.id as string),
});
