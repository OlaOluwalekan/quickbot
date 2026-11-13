import { route } from "@/server/http/route";
import { getQuestionBatch } from "@/server/services/question-batch";

/** GET — the questions answered by one "Ask all" run, with their answers. */
export const GET = route({
  handler: async ({ actor, params }) => {
    return getQuestionBatch(
      actor,
      params.id as string,
      params.generationId as string
    );
  },
});
