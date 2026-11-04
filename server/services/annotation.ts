import "server-only";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { requireWorkspace } from "@/server/authz/access";
import type { Actor } from "@/server/auth/session";
import type {
  CreateAnnotationInput,
  UpdateAnnotationInput,
} from "@/lib/schemas/annotation";

/**
 * Lists annotations for a response visible to the calling actor:
 * - Includes all `WORKSPACE`-visibility annotations
 * - Includes caller's own `PRIVATE` annotations
 * - Filters by optional `versionId`
 * - Excludes soft-deleted annotations (`deletedAt != null`)
 */
export async function listAnnotationsForResponse(
  actor: Actor,
  responseId: string,
  options?: { versionId?: string }
) {
  const response = await db.response.findFirst({
    where: { id: responseId, deletedAt: null },
    select: { id: true, workspaceId: true },
  });

  if (!response) {
    throw Errors.notFound("Response");
  }

  await requireWorkspace(actor, response.workspaceId, "workspace.read");

  return db.annotation.findMany({
    where: {
      responseId,
      deletedAt: null,
      ...(options?.versionId ? { versionId: options.versionId } : {}),
      OR: [
        { visibility: "WORKSPACE" },
        { createdById: actor.userId },
      ],
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
      createdBy: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Creates a new annotation and its initial USER message on a response version.
 * Requires `workspace.annotate` permission.
 * Validates that `anchor.exact` is a true substring of the version text.
 */
export async function createAnnotation(
  actor: Actor,
  versionId: string,
  input: CreateAnnotationInput
) {
  const version = await db.responseVersion.findUnique({
    where: { id: versionId },
    include: {
      response: {
        select: { id: true, workspaceId: true, deletedAt: true },
      },
    },
  });

  if (!version || version.response.deletedAt !== null) {
    throw Errors.notFound("ResponseVersion");
  }

  // Caller needs workspace.annotate (COMMENTER, EDITOR, ADMIN, OWNER)
  await requireWorkspace(actor, version.response.workspaceId, "workspace.annotate");

  // Re-check anchor.exact substring on server against stored text
  let targetContent = version.content;
  if (input.contentSource === "EDIT") {
    if (input.editRevision) {
      const edit = await db.responseEdit.findUnique({
        where: {
          versionId_revision: {
            versionId,
            revision: input.editRevision,
          },
        },
      });
      if (!edit) {
        throw Errors.badRequest("Edit revision not found");
      }
      targetContent = edit.content;
    } else {
      const latestEdit = await db.responseEdit.findFirst({
        where: { versionId },
        orderBy: { revision: "desc" },
      });
      if (latestEdit) {
        targetContent = latestEdit.content;
      }
    }
  }

  if (!targetContent.includes(input.anchor.exact)) {
    throw Errors.badRequest(
      "Selected text is not a substring of the response content"
    );
  }

  return db.annotation.create({
    data: {
      workspaceId: version.response.workspaceId,
      responseId: version.response.id,
      versionId: version.id,
      contentSource: input.contentSource ?? "ORIGINAL",
      editRevision: input.editRevision ?? null,
      createdById: actor.userId,
      kind: input.kind,
      questionState: input.kind === "QUESTION" ? "QUEUED" : "NONE",
      visibility: "PRIVATE",
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
          author: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
      createdBy: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });
}

/**
 * Retrieves a single annotation by ID if accessible to the actor.
 */
export async function getAnnotation(actor: Actor, annotationId: string) {
  const annot = await db.annotation.findUnique({
    where: { id: annotationId, deletedAt: null },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
      createdBy: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });

  if (!annot) {
    throw Errors.notFound("Annotation");
  }

  await requireWorkspace(actor, annot.workspaceId, "workspace.read");

  if (annot.visibility === "PRIVATE" && annot.createdById !== actor.userId) {
    throw Errors.notFound("Annotation");
  }

  return annot;
}

/**
 * Updates an annotation (text, resolved status, or visibility).
 * Permissions: creator only (or workspace admin for WORKSPACE-visible annotations).
 */
export async function updateAnnotation(
  actor: Actor,
  annotationId: string,
  input: UpdateAnnotationInput
) {
  const annot = await db.annotation.findUnique({
    where: { id: annotationId, deletedAt: null },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!annot) {
    throw Errors.notFound("Annotation");
  }

  const access = await requireWorkspace(actor, annot.workspaceId, "workspace.read");

  // Private annotations are invisible to other users (even admins) to prevent privacy leak
  if (annot.visibility === "PRIVATE" && annot.createdById !== actor.userId) {
    throw Errors.notFound("Annotation");
  }

  const isCreator = annot.createdById === actor.userId;
  const isAdmin = access.role === "ADMIN" || access.role === "OWNER";

  if (!isCreator && !isAdmin) {
    throw Errors.forbidden(
      "Only the creator or workspace admin can update this annotation"
    );
  }

  // Update text of creator's initial message if provided
  if (input.text !== undefined) {
    const targetMsg =
      annot.messages.find((m) => m.authorId === annot.createdById) ??
      annot.messages[0];
    if (targetMsg) {
      await db.annotationMessage.update({
        where: { id: targetMsg.id },
        data: { content: input.text },
      });
    }
  }

  const updateData: {
    resolvedAt?: Date | null;
    visibility?: "PRIVATE" | "WORKSPACE";
  } = {};

  if (input.resolved !== undefined) {
    updateData.resolvedAt = input.resolved ? new Date() : null;
  }

  if (input.visibility !== undefined) {
    updateData.visibility = input.visibility;
  }

  return db.annotation.update({
    where: { id: annot.id },
    data: updateData,
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
      createdBy: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });
}

/**
 * Soft deletes an annotation (`deletedAt = now()`).
 * Permissions: creator or workspace admin.
 */
export async function deleteAnnotation(actor: Actor, annotationId: string) {
  const annot = await db.annotation.findUnique({
    where: { id: annotationId, deletedAt: null },
  });

  if (!annot) {
    throw Errors.notFound("Annotation");
  }

  const access = await requireWorkspace(actor, annot.workspaceId, "workspace.read");

  if (annot.visibility === "PRIVATE" && annot.createdById !== actor.userId) {
    throw Errors.notFound("Annotation");
  }

  const isCreator = annot.createdById === actor.userId;
  const isAdmin = access.role === "ADMIN" || access.role === "OWNER";

  if (!isCreator && !isAdmin) {
    throw Errors.forbidden(
      "Only the creator or workspace admin can delete this annotation"
    );
  }

  await db.annotation.update({
    where: { id: annot.id },
    data: { deletedAt: new Date() },
  });

  return { success: true };
}
