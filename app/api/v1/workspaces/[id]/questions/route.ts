import { route } from "@/server/http/route";
import { listQuestionsQuerySchema } from "@/lib/schemas/annotation";
import { listWorkspaceQuestions } from "@/server/services/annotation";

export const GET = route({
  query: listQuestionsQuerySchema,
  handler: async ({ actor, params, query }) => {
    return listWorkspaceQuestions(actor, params.id as string, {
      state: query.state,
    });
  },
});
