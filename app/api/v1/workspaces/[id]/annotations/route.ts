import { route } from "@/server/http/route";
import { listWorkspaceAnnotations } from "@/server/services/annotation";

export const GET = route({
  handler: async ({ actor, params }) => {
    return listWorkspaceAnnotations(actor, params.id as string);
  },
});
