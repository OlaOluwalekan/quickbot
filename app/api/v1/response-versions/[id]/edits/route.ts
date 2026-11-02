import { route } from "@/server/http/route";
import { createResponseEditSchema } from "@/lib/schemas/response";
import {
  createResponseEdit,
  listResponseEdits,
} from "@/server/services/response";

export const POST = route({
  body: createResponseEditSchema,
  handler: async ({ actor, params, body }) => {
    return createResponseEdit(actor, params.id as string, body);
  },
});

export const GET = route({
  handler: async ({ actor, params }) => {
    return listResponseEdits(actor, params.id as string);
  },
});
