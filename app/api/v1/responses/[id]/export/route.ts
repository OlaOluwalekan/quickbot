import { z } from "zod";
import { route } from "@/server/http/route";
import { exportResponseDocument } from "@/server/documents";

const exportQuerySchema = z.object({
  format: z.enum(["md", "pdf", "docx"]).default("md"),
  view: z.enum(["original", "edited"]).default("edited"),
});

export const GET = route({
  query: exportQuerySchema,
  handler: async ({ actor, params, query }) => {
    const result = await exportResponseDocument(actor, params.id as string, {
      format: query.format,
      view: query.view,
    });

    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": result.mime,
        "Content-Disposition": result.contentDisposition,
        "Content-Length": String(result.buffer.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  },
});
