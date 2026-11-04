import { route } from "@/server/http/route";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { requireWorkspace } from "@/server/authz/access";
import { getStorageProvider, type StorageResourceType } from "@/server/storage";
import { sanitizeFilename } from "@/server/services/attachment";

export const GET = route({
  handler: async ({ actor, params }) => {
    const attachmentId = params.id as string;

    const attachment = await db.attachment.findUnique({
      where: { id: attachmentId, deletedAt: null },
    });

    if (!attachment || attachment.status !== "READY") {
      throw Errors.notFound("Attachment");
    }

    if (attachment.workspaceId) {
      await requireWorkspace(actor, attachment.workspaceId, "workspace.read");
    } else if (attachment.ownerId !== actor.userId) {
      throw Errors.notFound("Attachment");
    }

    const storage = getStorageProvider();
    const buffer = await storage.downloadBuffer(attachment.providerId, {
      resourceType: (attachment.resourceType as StorageResourceType) || "raw",
      isPublic: false,
    });

    const filename = sanitizeFilename(
      attachment.originalName || `attachment-${attachment.id}`
    );
    const encoded = encodeURIComponent(filename).replace(
      /['()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    );

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": attachment.mime || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  },
});
