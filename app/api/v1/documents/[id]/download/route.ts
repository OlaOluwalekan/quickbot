import { route } from "@/server/http/route";
import { downloadDocument } from "@/server/services/generated-document";

export const runtime = "nodejs";

export const GET = route({
  handler: async ({ actor, params, req }) => {
    const docId = params.id as string;
    const url = new URL(req.url);
    const format = url.searchParams.get("format") || undefined;
    const revParam = url.searchParams.get("revision");
    const revision = revParam ? parseInt(revParam, 10) : undefined;

    const { buffer, filename, contentType } = await downloadDocument(actor, docId, {
      format,
      revision,
    });

    const encoded = encodeURIComponent(filename).replace(
      /['()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    );

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  },
});
