import { route } from "@/server/http/route";
import { z } from "zod";
import {
  getDocument,
  renameDocument,
} from "@/server/services/generated-document";

export const runtime = "nodejs";

const patchDocSchema = z.object({
  title: z.string().min(1).max(120),
});

export const GET = route({
  handler: async ({ actor, params }) => {
    const docId = params.id as string;
    const doc = await getDocument(actor, docId);
    return doc;
  },
});

export const PATCH = route({
  body: patchDocSchema,
  handler: async ({ actor, params, body }) => {
    const docId = params.id as string;
    const updated = await renameDocument(actor, docId, body.title);
    return updated;
  },
});
