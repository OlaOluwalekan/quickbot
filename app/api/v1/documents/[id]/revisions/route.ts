import { route } from "@/server/http/route";
import { z } from "zod";
import { createDocumentRevision } from "@/server/services/generated-document";

export const runtime = "nodejs";

const createRevisionSchema = z.object({
  content: z.string().min(1).max(200_000),
  baseRevision: z.number().int().positive().nullable().optional(),
  title: z.string().min(1).max(120).optional(),
  acceptedSuggestionIds: z.array(z.string().min(1)).max(200).optional(),
});

export const POST = route({
  body: createRevisionSchema,
  handler: async ({ actor, params, body }) => {
    const docId = params.id as string;
    const revision = await createDocumentRevision(actor, docId, body);
    return revision;
  },
});
