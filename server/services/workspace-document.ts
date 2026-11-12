import crypto from "node:crypto";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { requireWorkspace } from "@/server/authz/access";
import { Errors } from "@/server/http/errors";
import { limit } from "@/server/http/rate-limit";
import { getStorageProvider } from "@/server/storage";
import type { StorageResourceType } from "@/server/storage/types";
import { documentToMarkdown } from "@/server/files/to-markdown";
import { logActivity } from "@/server/services/activity";

export async function addDocumentToWorkspace(
  actor: Actor,
  workspaceId: string,
  attachmentId: string
) {
  await requireWorkspace(actor, workspaceId, "workspace.upload");
  await limit("document:upload", actor.userId);

  const attachment = await db.attachment.findFirst({
    where: {
      id: attachmentId,
      deletedAt: null,
    },
    include: {
      uploadedDocumentResponse: {
        select: { id: true, deletedAt: true },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  if (!attachment || attachment.workspaceId !== workspaceId) {
    throw Errors.notFound("Attachment");
  }

  if (attachment.ownerId !== actor.userId) {
    throw Errors.forbidden(
      "Only the uploader can add this attachment as a workspace document"
    );
  }

  if (attachment.status !== "READY") {
    throw Errors.badRequest("Attachment is not ready yet");
  }

  if (attachment.kind !== "DOCUMENT") {
    throw Errors.badRequest(
      "Only document attachments (MD, TXT, DOCX, PDF, CSV) can be added to the workspace as documents"
    );
  }

  if (
    attachment.uploadedDocumentResponse &&
    attachment.uploadedDocumentResponse.deletedAt === null
  ) {
    throw Errors.conflict(
      "This attachment has already been added to the workspace as a document"
    );
  }

  const storage = getStorageProvider();
  let buffer: Buffer;
  try {
    buffer = await storage.downloadBuffer(attachment.providerId, {
      resourceType: attachment.resourceType as StorageResourceType,
    });
  } catch (err) {
    throw Errors.badRequest(
      `Failed to read attachment from storage: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let extracted: Awaited<ReturnType<typeof documentToMarkdown>>;
  try {
    extracted = await documentToMarkdown(
      buffer,
      attachment.mime,
      attachment.originalName
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw Errors.badRequest(message);
  }

  const responseId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date();

  const { response, version } = await db.$transaction(async (tx) => {
    // If a previously soft-deleted response pointed to this attachment, clear its reference first
    if (
      attachment.uploadedDocumentResponse &&
      attachment.uploadedDocumentResponse.deletedAt !== null
    ) {
      await tx.response.update({
        where: { id: attachment.uploadedDocumentResponse.id },
        data: { uploadedAttachmentId: null },
      });
    }

    const createdResponse = await tx.response.create({
      data: {
        id: responseId,
        workspaceId,
        kind: "DOCUMENT",
        origin: "UPLOAD",
        prompt: attachment.originalName,
        uploadedAttachmentId: attachment.id,
        createdById: actor.userId,
        sortAt: now,
        createdAt: now,
      },
    });

    const createdVersion = await tx.responseVersion.create({
      data: {
        id: versionId,
        responseId: createdResponse.id,
        number: 1,
        status: "COMPLETE",
        content: extracted.markdown,
        modelKey: "none",
        providerModelId: "none",
        promptVersion: "upload-1",
        generationId: null,
        createdById: actor.userId,
        createdAt: now,
      },
    });

    const updatedResponse = await tx.response.update({
      where: { id: createdResponse.id },
      data: { activeVersionId: createdVersion.id },
    });

    await tx.workspace.update({
      where: { id: workspaceId },
      data: { lastActivityAt: now },
    });

    await logActivity(tx, {
      workspaceId,
      actorId: actor.userId,
      action: "document.uploaded",
      targetType: "Response",
      targetId: createdResponse.id,
      meta: {
        attachmentId: attachment.id,
        name: attachment.originalName,
        bytes: attachment.bytes,
        mime: attachment.mime,
        pageCount: extracted.pageCount ?? null,
        totalRows: extracted.totalRows ?? null,
        truncated: extracted.truncated,
      },
    });

    return { response: updatedResponse, version: createdVersion };
  });

  const activeVersionSummary = {
    id: version.id,
    number: 1,
    status: "COMPLETE" as const,
    content: extracted.markdown,
    originalContent: extracted.markdown,
    thoughtSummary: null,
    modelKey: "none",
    providerModelId: "none",
    promptVersion: "upload-1",
    createdById: actor.userId,
    createdAt: version.createdAt,
    edited: false,
    hasEdits: false,
    editCount: 0,
    citations: [],
    latestEdit: null,
    latestEditContent: null,
  };

  return {
    id: response.id,
    workspaceId,
    createdById: actor.userId,
    kind: "DOCUMENT" as const,
    origin: "UPLOAD" as const,
    prompt: response.prompt,
    quote: null,
    sourceAnnotationId: null,
    sourceWorkspaceId: null,
    sourceChain: null,
    sourceRemoved: false,
    sourceAccessible: false,
    sortAt: response.sortAt,
    createdAt: response.createdAt,
    activeVersionId: version.id,
    activeVersion: activeVersionSummary,
    versionCount: 1,
    author: {
      name: attachment.user.name,
      avatarUrl: attachment.user.image ?? undefined,
    },
    createdBy: attachment.user,
    attachments: [],
    generatedDocuments: [],
    uploadedAttachment: {
      id: attachment.id,
      originalName: attachment.originalName,
      mime: attachment.mime,
      bytes: attachment.bytes,
      createdAt: attachment.createdAt,
    },
    pageCount: extracted.pageCount ?? null,
    totalRows: extracted.totalRows ?? null,
    truncated: extracted.truncated,
    promotedFromAnnotationId: null,
    promotedFromAnnotation: null,
    versions: [
      {
        id: version.id,
        number: 1,
        status: "COMPLETE" as const,
        modelKey: "none",
        providerModelId: "none",
        content: extracted.markdown,
        thinkingText: null,
        errorCode: null,
        errorMessage: null,
        tokenIn: null,
        tokenOut: null,
        latencyMs: null,
        createdAt: version.createdAt,
        createdById: actor.userId,
        latestEdit: null,
        images: [],
      },
    ],
  };
}
