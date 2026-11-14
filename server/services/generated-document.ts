import "server-only";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import type { Actor } from "@/server/auth/session";
import { requireWorkspace } from "@/server/authz/access";
import { logActivity } from "@/server/services/activity";
import {
  type ExportFormat,
  renderDocumentBuffer,
  buildExportFilename,
  EXPORT_MIME_TYPES,
  sanitizeDocumentTitle,
  sanitizeDocumentMarkdown,
  assertExportAllowed,
  exportFormatsForOwner,
} from "@/server/documents";
import { quoteIsFromStoredText } from "@/server/services/quote-source";
import { applySuggestion, toSuggestionTarget } from "@/lib/documents/apply-suggestion";
import { type CreateAnnotationInput } from "@/lib/schemas/annotation";
import { syncMentionsAndNotes, sendMentionNotifications } from "./mentions";

export interface DocumentSummary {
  id: string;
  workspaceId: string;
  versionId: string;
  responseId?: string | null;
  title: string;
  format: string;
  currentRevision: number;
  createdById: string;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface DocumentRevisionSummary {
  id: string;
  documentId: string;
  revision: number;
  content: string;
  editorId: string | null;
  editor?: { id: string; name: string; image?: string | null } | null;
  createdAt: Date;
}

export interface DocumentWithDetails {
  document: DocumentSummary;
  latestRevision: DocumentRevisionSummary;
  revisions: DocumentRevisionSummary[];
  capabilities: {
    canEdit: boolean;
    canComment: boolean;
    canAsk: boolean;
    canExport: boolean;
  };
  /** Formats the workspace owner's plan allows (Word / PDF gating in the UI). */
  exportFormats: ExportFormat[];
  /** The caller owns the workspace (an upgrade would unlock a format). */
  isOwner: boolean;
}

/**
 * Retrieves a generated document, its latest revision, history of revisions, and actor capabilities.
 */
export async function getDocument(
  actor: Actor,
  documentId: string
): Promise<DocumentWithDetails> {
  const doc = await db.document.findUnique({
    where: { id: documentId, deletedAt: null },
    include: {
      version: {
        select: {
          id: true,
          responseId: true,
        },
      },
      revisions: {
        orderBy: { revision: "desc" },
        include: {
          editor: {
            select: { id: true, name: true, image: true },
          },
        },
      },
    },
  });

  if (!doc) {
    throw Errors.notFound("Document");
  }

  const access = await requireWorkspace(actor, doc.workspaceId, "workspace.read");

  const latestRevision = doc.revisions[0];
  if (!latestRevision) {
    throw Errors.notFound("DocumentRevision");
  }

  return {
    document: {
      id: doc.id,
      workspaceId: doc.workspaceId,
      versionId: doc.versionId,
      responseId: doc.version.responseId,
      title: doc.title,
      format: doc.format,
      currentRevision: doc.currentRevision,
      createdById: doc.createdById,
      createdAt: doc.createdAt,
      deletedAt: doc.deletedAt,
    },
    latestRevision: {
      id: latestRevision.id,
      documentId: latestRevision.documentId,
      revision: latestRevision.revision,
      content: latestRevision.content,
      editorId: latestRevision.editorId,
      editor: latestRevision.editor,
      createdAt: latestRevision.createdAt,
    },
    revisions: doc.revisions.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      revision: r.revision,
      content: r.content,
      editorId: r.editorId,
      editor: r.editor,
      createdAt: r.createdAt,
    })),
    capabilities: {
      canEdit: access.capabilities.has("workspace.edit_response"),
      canComment: access.capabilities.has("workspace.comment"),
      canAsk: access.capabilities.has("workspace.ask"),
      canExport: access.capabilities.has("workspace.export"),
    },
    exportFormats: await exportFormatsForOwner(access.ws.ownerId),
    isOwner: access.ws.ownerId === actor.userId,
  };
}

/**
 * Retrieves a specific revision of a generated document.
 */
export async function getDocumentRevision(
  actor: Actor,
  documentId: string,
  revisionNumber: number
): Promise<DocumentRevisionSummary> {
  const doc = await db.document.findUnique({
    where: { id: documentId, deletedAt: null },
    select: { workspaceId: true },
  });

  if (!doc) {
    throw Errors.notFound("Document");
  }

  await requireWorkspace(actor, doc.workspaceId, "workspace.read");

  const revision = await db.documentRevision.findUnique({
    where: {
      documentId_revision: {
        documentId,
        revision: revisionNumber,
      },
    },
    include: {
      editor: {
        select: { id: true, name: true, image: true },
      },
    },
  });

  if (!revision) {
    throw Errors.notFound("DocumentRevision");
  }

  return {
    id: revision.id,
    documentId: revision.documentId,
    revision: revision.revision,
    content: revision.content,
    editorId: revision.editorId,
    editor: revision.editor,
    createdAt: revision.createdAt,
  };
}

/**
 * Creates a new revision of a document (editable format saved).
 * Requires workspace.edit_response permission.
 * Checks baseRevision against currentRevision for optimistic concurrency conflict.
 */
export async function createDocumentRevision(
  actor: Actor,
  documentId: string,
  input: {
    content: string;
    baseRevision?: number | null;
    title?: string;
    /** Quick fixes (F3.3 review comments) the editor accepted into this text. */
    acceptedSuggestionIds?: string[];
  }
) {
  const doc = await db.document.findUnique({
    where: { id: documentId, deletedAt: null },
    include: {
      workspace: { select: { id: true } },
    },
  });

  if (!doc) {
    throw Errors.notFound("Document");
  }

  await requireWorkspace(actor, doc.workspaceId, "workspace.edit_response");

  const sanitizedContent = sanitizeDocumentMarkdown(input.content);
  const sanitizedTitle = input.title ? sanitizeDocumentTitle(input.title) : undefined;

  let attempts = 0;
  while (attempts < 3) {
    try {
      const created = await db.$transaction(async (tx) => {
        const currentDoc = await tx.document.findUnique({
          where: { id: documentId },
          select: { currentRevision: true },
        });

        if (!currentDoc) {
          throw Errors.notFound("Document");
        }

        if (input.baseRevision !== undefined && input.baseRevision !== null) {
          if (currentDoc.currentRevision !== input.baseRevision) {
            throw Errors.conflict(
              "Document was modified since you started editing",
              "edit_conflict",
              { latestRevision: currentDoc.currentRevision }
            );
          }
        }

        const nextRevision = currentDoc.currentRevision + 1;

        const rev = await tx.documentRevision.create({
          data: {
            documentId,
            revision: nextRevision,
            content: sanitizedContent,
            editorId: actor.userId,
          },
        });

        await tx.document.update({
          where: { id: documentId },
          data: {
            currentRevision: nextRevision,
            ...(sanitizedTitle ? { title: sanitizedTitle } : {}),
          },
        });

        if (input.acceptedSuggestionIds && input.acceptedSuggestionIds.length > 0) {
          await tx.annotation.updateMany({
            where: {
              id: { in: input.acceptedSuggestionIds },
              workspaceId: doc.workspaceId,
              documentId,
              deletedAt: null,
              // Only quick fixes waiting for an answer: the ids come from the
              // client and must not resolve other people's comments.
              suggestionState: "PENDING",
            },
            data: { suggestionState: "ACCEPTED", resolvedAt: new Date() },
          });
        }

        // Quick fixes whose passage this revision changed can't be applied
        // any more: they become STALE (the comment stays, the button goes).
        const pendingFixes = await tx.annotation.findMany({
          where: { documentId, deletedAt: null, suggestionState: "PENDING" },
          select: { id: true, suggestion: true },
        });
        const staleIds = pendingFixes
          .filter((a) => {
            const target = toSuggestionTarget(a.suggestion);
            return !target || !applySuggestion(sanitizedContent, target).ok;
          })
          .map((a) => a.id);
        if (staleIds.length > 0) {
          await tx.annotation.updateMany({
            where: { id: { in: staleIds }, suggestionState: "PENDING" },
            data: { suggestionState: "STALE" },
          });
        }

        await tx.workspace.update({
          where: { id: doc.workspaceId },
          data: { lastActivityAt: new Date() },
        });

        return rev;
      });

      await logActivity(db, {
        workspaceId: doc.workspaceId,
        actorId: actor.userId,
        action: "response.edited",
        targetType: "document",
        targetId: documentId,
        meta: { revision: created.revision },
      });

      return created;
    } catch (err: any) {
      if (err?.code === "P2002" && attempts < 2) {
        attempts++;
        continue;
      }
      throw err;
    }
  }
}

/**
 * Renames a document.
 */
export async function renameDocument(
  actor: Actor,
  documentId: string,
  newTitle: string
) {
  const doc = await db.document.findUnique({
    where: { id: documentId, deletedAt: null },
  });

  if (!doc) {
    throw Errors.notFound("Document");
  }

  await requireWorkspace(actor, doc.workspaceId, "workspace.edit_response");

  const title = sanitizeDocumentTitle(newTitle);

  return db.document.update({
    where: { id: documentId },
    data: { title },
  });
}

/**
 * Renders or serves the document in the requested format and revision.
 * Requires workspace.read + workspace.export for non-md formats.
 */
export async function downloadDocument(
  actor: Actor,
  documentId: string,
  query: {
    format?: string;
    revision?: number;
  }
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  const doc = await db.document.findUnique({
    where: { id: documentId, deletedAt: null },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      format: true,
      currentRevision: true,
      workspace: { select: { ownerId: true } },
    },
  });

  if (!doc) {
    throw Errors.notFound("Document");
  }

  const access = await requireWorkspace(actor, doc.workspaceId, "workspace.read");

  const reqFormat = (query.format || doc.format).toLowerCase().trim();
  if (reqFormat !== "md" && reqFormat !== "docx" && reqFormat !== "pdf") {
    throw Errors.badRequest("Invalid format requested");
  }
  const format = reqFormat as ExportFormat;

  // Markdown is the document's own text: anyone who can read it may take it.
  // Word and PDF are exports (permission + the workspace owner's plan, as for
  // response exports). Every download counts towards the daily export cap.
  if (format !== "md" && !access.capabilities.has("workspace.export")) {
    throw Errors.forbidden("Workspace export permission required");
  }

  const targetRevisionNum = query.revision ?? doc.currentRevision;
  const revision = await db.documentRevision.findUnique({
    where: {
      documentId_revision: {
        documentId,
        revision: targetRevisionNum,
      },
    },
  });

  if (!revision) {
    throw Errors.notFound("DocumentRevision");
  }

  await assertExportAllowed({
    ownerId: doc.workspace.ownerId,
    downloaderId: actor.userId,
    format,
  });

  const buffer = await renderDocumentBuffer({
    format,
    title: doc.title,
    date: revision.createdAt,
    modelKey: null,
    versionNumber: revision.revision,
    markdown: revision.content,
  });

  const { filename } = buildExportFilename(doc.title, format);
  const contentType = EXPORT_MIME_TYPES[format];

  return {
    buffer,
    filename,
    contentType,
  };
}

/**
 * Creates an annotation on a generated document revision.
 * TargetType: DOCUMENT_REVISION.
 */
export async function createDocumentAnnotation(
  actor: Actor,
  documentId: string,
  revisionNumber: number,
  input: CreateAnnotationInput
) {
  const doc = await db.document.findUnique({
    where: { id: documentId, deletedAt: null },
    include: {
      version: { select: { id: true, responseId: true } },
    },
  });

  if (!doc) {
    throw Errors.notFound("Document");
  }

  const revision = await db.documentRevision.findUnique({
    where: {
      documentId_revision: {
        documentId,
        revision: revisionNumber,
      },
    },
  });

  if (!revision) {
    throw Errors.notFound("DocumentRevision");
  }

  const access = await requireWorkspace(
    actor,
    doc.workspaceId,
    input.kind === "COMMENT" ? "workspace.comment" : "workspace.ask"
  );

  if (!quoteIsFromStoredText(revision.content, input.anchor.exact)) {
    throw Errors.badRequest("Selected text is not a substring of the document content");
  }

  const { created, mentionSync } = await db.$transaction(async (tx) => {
    let mentionSync: any = null;
    const created = await tx.annotation.create({
      data: {
        workspaceId: doc.workspaceId,
        responseId: doc.version?.responseId ?? null,
        versionId: null,
        targetType: "DOCUMENT_REVISION",
        documentId: doc.id,
        documentRevision: revisionNumber,
        depth: 0,
        authorType: "USER",
        createdById: actor.userId,
        kind: input.kind,
        questionState: input.kind === "ASK" ? (input.mode === "now" ? "NONE" : "QUEUED") : "NONE",
        visibility: input.visibility ?? "PRIVATE",
        anchorExact: input.anchor.exact,
        anchorPrefix: input.anchor.prefix ?? "",
        anchorSuffix: input.anchor.suffix ?? "",
        anchorStart: input.anchor.start ?? null,
        anchorEnd: input.anchor.end ?? null,
        messages: {
          create: [
            {
              role: "USER",
              content: input.text,
              authorId: actor.userId,
            },
          ],
        },
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    const userMsg = created.messages[0];
    if (input.kind === "COMMENT" && userMsg) {
      mentionSync = await syncMentionsAndNotes(tx, {
        workspaceId: doc.workspaceId,
        annotationId: created.id,
        messageId: userMsg.id,
        text: input.text,
        anchorExact: created.anchorExact,
        actor,
        capabilities: access.capabilities,
        currentVisibility: created.visibility,
        canShare: true,
        isNewMessage: true,
      });
      created.visibility = mentionSync.visibility;
    }

    await logActivity(tx, {
      workspaceId: doc.workspaceId,
      actorId: actor.userId,
      action: "annotation.created",
      targetType: "annotation",
      targetId: created.id,
      meta: { kind: created.kind, depth: 0, documentId: doc.id, revision: revisionNumber },
    });

    return { created, mentionSync };
  });

  if (mentionSync) {
    await sendMentionNotifications(mentionSync.pendingNotifications);
  }

  return created;
}

/**
 * Lists the annotations on one revision of a generated document visible to
 * the caller: `WORKSPACE` ones and the caller's own `PRIVATE` ones.
 */
export async function listDocumentAnnotations(
  actor: Actor,
  documentId: string,
  revisionNumber: number
) {
  const doc = await db.document.findUnique({
    where: { id: documentId, deletedAt: null },
    select: { workspaceId: true },
  });
  if (!doc) {
    throw Errors.notFound("Document");
  }

  await requireWorkspace(actor, doc.workspaceId, "workspace.read");

  return db.annotation.findMany({
    where: {
      documentId,
      documentRevision: revisionNumber,
      deletedAt: null,
      OR: [{ visibility: "WORKSPACE" }, { createdById: actor.userId }],
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, image: true } },
          mentions: { select: { isKlecx: true } },
        },
      },
      notes: {
        where: { deletedAt: null },
        select: { id: true, status: true },
      },
      createdBy: { select: { id: true, name: true, image: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}
