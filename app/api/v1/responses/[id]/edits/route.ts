import { route } from "@/server/http/route";
import { createResponseEditSchema } from "@/lib/schemas/response";
import { createResponseEdit } from "@/server/services/response";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";

export const POST = route({
  body: createResponseEditSchema,
  handler: async ({ actor, params, body }) => {
    const responseId = params.id as string;
    const response = await db.response.findUnique({
      where: { id: responseId, deletedAt: null },
      include: {
        versions: {
          orderBy: { number: "desc" },
          take: 1,
        },
      },
    });

    if (!response) {
      throw Errors.notFound("Response");
    }

    const versionId = response.activeVersionId || response.versions[0]?.id;
    if (!versionId) {
      throw Errors.badRequest("Response has no versions to edit");
    }

    return createResponseEdit(actor, versionId, body);
  },
});
