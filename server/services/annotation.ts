import "server-only";
import crypto from "node:crypto";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { requireWorkspace } from "@/server/authz/access";
import { logActivity } from "./activity";
import {
  syncMentionsAndNotes,
  sendMentionNotifications,
  archiveNoteForAnnotation,
  type SyncMentionsResult,
} from "./mentions";
import { resolveBilledAccount, reserveForWorkspaceGeneration } from "./billing-owner";
import type { Actor } from "@/server/auth/session";
import type {
  CreateAnnotationInput,
  UpdateAnnotationInput,
  PromoteAnnotationInput,
} from "@/lib/schemas/annotation";
import {
  settle,
  release,
} from "@/server/services/credits";
import {
  assertModelAccess,
  getModel,
  creditsFor,
  ModelKey,
} from "@/server/ai/registry";
import { getEntitlements } from "@/server/billing/entitlements";
import { streamAi, type AiProvider } from "@/server/ai";
import { AiError } from "@/server/ai/types";
import { resolveEffectiveAiLanguage } from "@/lib/locale";
import { getCustomProvider } from "@/server/services/generation";
import { ANNOTATION_PROMPT_VERSION } from "@/server/ai/prompts/annotation";
import {
  buildAskContext,
  estimateAskContextTokens,
} from "@/server/ai/ask-context";
import { MAX_ANNOTATION_DEPTH } from "@/lib/annotations/limits";
import { estimateTokens } from "@/server/ai/context-builder";

let customAnnotationProviderForTesting: AiProvider | null = null;

export function setAnnotationCustomProviderForTesting(provider: AiProvider | null) {
  customAnnotationProviderForTesting = provider;
}

/** A source saved with an Ask answer (same shape as response citations). */
type AnswerCitation = {
  index: number;
  url: string;
  title: string | null;
  snippet: string | null;
  source: string;
};

function formatSSEEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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
          mentions: {
            select: { isKlecx: true },
          },
        },
      },
      notes: {
        select: { id: true, status: true },
      },
      createdBy: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Lists the annotations made on one ASSISTANT message of an Ask thread
 * (nested annotations), visible to the calling actor: `WORKSPACE` ones and the
 * caller's own `PRIVATE` ones. A message of a private thread is only found by
 * that thread's author.
 */
export async function listAnnotationsForMessage(actor: Actor, messageId: string) {
  const message = await db.annotationMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      annotation: {
        select: {
          workspaceId: true,
          deletedAt: true,
          visibility: true,
          createdById: true,
        },
      },
    },
  });

  if (!message || message.annotation.deletedAt !== null) {
    throw Errors.notFound("AnnotationMessage");
  }

  await requireWorkspace(actor, message.annotation.workspaceId, "workspace.read");

  if (
    message.annotation.visibility === "PRIVATE" &&
    message.annotation.createdById !== actor.userId
  ) {
    throw Errors.notFound("AnnotationMessage");
  }

  return db.annotation.findMany({
    where: {
      targetMessageId: messageId,
      deletedAt: null,
      OR: [{ visibility: "WORKSPACE" }, { createdById: actor.userId }],
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: { id: true, name: true, image: true },
          },
          mentions: {
            select: { isKlecx: true },
          },
        },
      },
      notes: {
        select: { id: true, status: true },
      },
      createdBy: {
        select: { id: true, name: true, image: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Lists all annotations across an entire workspace visible to the calling actor.
 */
export async function listWorkspaceAnnotations(
  actor: Actor,
  workspaceId: string
) {
  await requireWorkspace(actor, workspaceId, "workspace.read");

  return db.annotation.findMany({
    where: {
      workspaceId,
      deletedAt: null,
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
      version: {
        select: {
          id: true,
          number: true,
          responseId: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Lists question annotations for a workspace created by the calling actor,
 * optionally filtered by `questionState` (e.g. QUEUED).
 * Caller needs `workspace.read` permission.
 */
export async function listWorkspaceQuestions(
  actor: Actor,
  workspaceId: string,
  options?: { state?: "NONE" | "QUEUED" | "ANSWERING" | "ANSWERED" | "CANCELLED" | "FAILED" }
) {
  await requireWorkspace(actor, workspaceId, "workspace.read");

  return db.annotation.findMany({
    where: {
      workspaceId,
      createdById: actor.userId,
      kind: "ASK",
      deletedAt: null,
      ...(options?.state ? { questionState: options.state } : {}),
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
      version: {
        select: {
          id: true,
          number: true,
          responseId: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Creates a new annotation and its initial USER message on a response version.
 * Requires `workspace.comment` (COMMENT) or `workspace.ask` (QUESTION).
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

  // Caller needs workspace.comment for COMMENT, workspace.ask for QUESTION
  const access = await requireWorkspace(
    actor,
    version.response.workspaceId,
    annotationKindPermission(input.kind)
  );

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

  // The comment, its mentions and its Klecx note are saved together.
  const { created, mentionSync } = await db.$transaction(async (tx) => {
  let mentionSync: SyncMentionsResult | null = null;
  const created = await tx.annotation.create({
    data: {
      workspaceId: version.response.workspaceId,
      responseId: version.response.id,
      versionId: version.id,
      targetType: "RESPONSE_VERSION",
      depth: 0,
      authorType: "USER",
      contentSource: input.contentSource ?? "ORIGINAL",
      editRevision: input.editRevision ?? null,
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

  const userMsg = created.messages[0];
  if (input.kind === "COMMENT" && userMsg) {
    mentionSync = await syncMentionsAndNotes(tx, {
      workspaceId: version.response.workspaceId,
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
    workspaceId: version.response.workspaceId,
    actorId: actor.userId,
    action: "annotation.created",
    targetType: "annotation",
    targetId: created.id,
    meta: { kind: created.kind, depth: 0 },
  });

  return { created, mentionSync };
  });

  if (mentionSync) {
    await sendMentionNotifications(mentionSync.pendingNotifications);
  }

  return created;
}

/**
 * Creates a new annotation and its initial USER message on an ASSISTANT annotation message.
 * Requires workspace.comment (COMMENT) or workspace.ask (ASK).
 * Validates that anchor.exact is a true substring of the message text,
 * and ensures that depth does not exceed MAX_ANNOTATION_DEPTH.
 */
export async function createAnnotationOnMessage(
  actor: Actor,
  messageId: string,
  input: CreateAnnotationInput
) {
  const message = await db.annotationMessage.findUnique({
    where: { id: messageId },
    include: {
      annotation: {
        select: {
          id: true,
          workspaceId: true,
          deletedAt: true,
          depth: true,
          rootAnnotationId: true,
          visibility: true,
          createdById: true,
        },
      },
    },
  });

  if (!message || message.annotation.deletedAt !== null) {
    throw Errors.notFound("AnnotationMessage");
  }

  const parent = message.annotation;
  const workspaceId = parent.workspaceId;

  // Authorize before revealing anything about the message (role, text).
  const access = await requireWorkspace(
    actor,
    workspaceId,
    annotationKindPermission(input.kind)
  );

  // A private thread is only visible to its author, so nobody else may
  // annotate (or probe the text of) its answers.
  const parentIsPrivate = parent.visibility === "PRIVATE";
  if (parentIsPrivate && parent.createdById !== actor.userId) {
    throw Errors.notFound("AnnotationMessage");
  }

  if (message.role !== "ASSISTANT") {
    throw Errors.badRequest("Annotations can only be attached to assistant messages");
  }

  const newDepth = parent.depth + 1;
  if (newDepth > MAX_ANNOTATION_DEPTH) {
    throw Errors.badRequest("Maximum annotation depth exceeded");
  }

  if (!message.content.includes(input.anchor.exact)) {
    throw Errors.badRequest(
      "Selected text is not a substring of the message content"
    );
  }

  // A child quotes its parent's answer, so it can't be more visible than it.
  const visibility = parentIsPrivate ? "PRIVATE" : input.visibility ?? "PRIVATE";

  const rootAnnotationId = parent.rootAnnotationId || parent.id;
  const parentAnnotationId = parent.id;

  const { created, mentionSync } = await db.$transaction(async (tx) => {
  let mentionSync: SyncMentionsResult | null = null;
  const created = await tx.annotation.create({
    data: {
      workspaceId,
      targetType: "ANNOTATION_MESSAGE",
      targetMessageId: message.id,
      parentAnnotationId,
      rootAnnotationId,
      depth: newDepth,
      authorType: "USER",
      createdById: actor.userId,
      kind: input.kind,
      questionState: input.kind === "ASK" ? (input.mode === "now" ? "NONE" : "QUEUED") : "NONE",
      visibility,
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

  const userMsg = created.messages[0];
  if (input.kind === "COMMENT" && userMsg) {
    mentionSync = await syncMentionsAndNotes(tx, {
      workspaceId,
      annotationId: created.id,
      messageId: userMsg.id,
      text: input.text,
      anchorExact: created.anchorExact,
      actor,
      capabilities: access.capabilities,
      currentVisibility: created.visibility,
      // Inside a private thread the comment stays private.
      canShare: !parentIsPrivate,
      isNewMessage: true,
    });
    created.visibility = mentionSync.visibility;
  }

  await logActivity(tx, {
    workspaceId,
    actorId: actor.userId,
    action: "annotation.created",
    targetType: "annotation",
    targetId: created.id,
    meta: { kind: created.kind, depth: newDepth },
  });

  return { created, mentionSync };
  });

  if (mentionSync) {
    await sendMentionNotifications(mentionSync.pendingNotifications);
  }

  return created;
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
 * Loads the full ancestor chain from root to the given annotation in one query
 * using a recursive CTE over parent_annotation_id capped at MAX_ANNOTATION_DEPTH.
 * Returns annotations ordered by depth ASC (root at index 0 down to target).
 */
export async function getAnnotationChain(actor: Actor, annotationId: string) {
  // Authorizes the caller on the workspace and on the annotation itself.
  const target = await getAnnotation(actor, annotationId);

  let chainIds = [target.id];
  if (target.parentAnnotationId) {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE chain AS (
        SELECT id, parent_annotation_id, 0 AS step
        FROM annotations
        WHERE id = ${annotationId} AND deleted_at IS NULL

        UNION ALL

        SELECT parent.id, parent.parent_annotation_id, c.step + 1 AS step
        FROM annotations parent
        INNER JOIN chain c ON parent.id = c.parent_annotation_id
        WHERE parent.deleted_at IS NULL AND c.step < ${MAX_ANNOTATION_DEPTH}
      )
      SELECT id FROM chain;
    `;
    chainIds = rows.map((r) => r.id);
  }

  // Only what the columns show: no e-mail addresses of other members.
  const author = { id: true, name: true, image: true, username: true } as const;
  const annotations = await db.annotation.findMany({
    where: {
      id: { in: chainIds },
      workspaceId: target.workspaceId,
      deletedAt: null,
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: author } },
      },
      createdBy: { select: author },
    },
    orderBy: { depth: "asc" },
  });

  // An ancestor the caller may not see hides the whole thread.
  for (const a of annotations) {
    if (a.visibility === "PRIVATE" && a.createdById !== actor.userId) {
      throw Errors.notFound("Annotation");
    }
  }

  return annotations;
}

/** The capability needed to create or change an annotation of this kind. */
function annotationKindPermission(kind: string) {
  return kind === "COMMENT" ? "workspace.comment" : "workspace.ask";
}

/**
 * Updates an annotation (text, resolved status, or visibility).
 * Permissions: creator holding the kind's capability, or workspace admin.
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
      parent: { select: { visibility: true } },
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

  // F1.2: a creator who lost the capability for this kind (toggle off,
  // role lowered, or suspended) can no longer change it. Admins moderate.
  if (!isAdmin && !access.capabilities.has(annotationKindPermission(annot.kind))) {
    throw Errors.forbidden();
  }

  const updateData: {
    resolvedAt?: Date | null;
    visibility?: "PRIVATE" | "WORKSPACE";
    questionState?: "NONE" | "QUEUED" | "ANSWERING" | "ANSWERED" | "CANCELLED" | "FAILED";
  } = {};

  if (input.resolved !== undefined) {
    updateData.resolvedAt = input.resolved ? new Date() : null;
  }
  if (input.visibility !== undefined) {
    updateData.visibility = input.visibility;
  }
  if (input.questionState !== undefined) {
    updateData.questionState = input.questionState;
  }

  const { updated, mentionSync } = await db.$transaction(async (tx) => {
    let mentionSync: SyncMentionsResult | null = null;

    // Update text of creator's initial message if provided
    const targetMsg =
      annot.messages.find((m) => m.authorId === annot.createdById) ??
      annot.messages[0];
    if (input.text !== undefined && targetMsg) {
      await tx.annotationMessage.update({
        where: { id: targetMsg.id },
        data: { content: input.text },
      });

      // Editing a comment re-syncs its mentions and its Klecx note.
      if (annot.kind === "COMMENT") {
        mentionSync = await syncMentionsAndNotes(tx, {
          workspaceId: annot.workspaceId,
          annotationId: annot.id,
          messageId: targetMsg.id,
          text: input.text,
          anchorExact: annot.anchorExact,
          actor,
          capabilities: access.capabilities,
          currentVisibility: annot.visibility,
          canShare: annot.parent?.visibility !== "PRIVATE",
          isNewMessage: false,
        });
      }
    }

    // A resolved or private comment no longer steers the workspace's answers.
    if (input.resolved === true || input.visibility === "PRIVATE") {
      await archiveNoteForAnnotation(annot.id, tx);
    }

    const updated = await tx.annotation.update({
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

    return { updated, mentionSync };
  });

  if (mentionSync) {
    await sendMentionNotifications(mentionSync.pendingNotifications);
  }

  return updated;
}

/**
 * Soft deletes an annotation (`deletedAt = now()`).
 * Permissions: creator holding the kind's capability, or workspace admin.
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

  // F1.2: a creator who lost the capability for this kind (toggle off,
  // role lowered, or suspended) can no longer change it. Admins moderate.
  if (!isAdmin && !access.capabilities.has(annotationKindPermission(annot.kind))) {
    throw Errors.forbidden();
  }

  await db.$transaction(async (tx) => {
    await tx.annotation.update({
      where: { id: annot.id },
      data: { deletedAt: new Date() },
    });
    await archiveNoteForAnnotation(annot.id, tx);
  });

  return { success: true };
}

/**
 * Adds a follow-up user message to an annotation thread.
 */
export async function createAnnotationMessage(
  actor: Actor,
  annotationId: string,
  content: string
) {
  const annot = await db.annotation.findUnique({
    where: { id: annotationId, deletedAt: null },
    include: { parent: { select: { visibility: true } } },
  });

  if (!annot) {
    throw Errors.notFound("Annotation");
  }

  const access = await requireWorkspace(actor, annot.workspaceId, annotationKindPermission(annot.kind));

  if (annot.visibility === "PRIVATE" && annot.createdById !== actor.userId) {
    throw Errors.notFound("Annotation");
  }

  const { createdMsg, mentionSync } = await db.$transaction(async (tx) => {
    const createdMsg = await tx.annotationMessage.create({
      data: {
        annotationId: annot.id,
        role: "USER",
        content,
        authorId: actor.userId,
      },
      include: {
        author: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    // Replies in a comment thread can mention people and @klecx too.
    const mentionSync =
      annot.kind === "COMMENT"
        ? await syncMentionsAndNotes(tx, {
            workspaceId: annot.workspaceId,
            annotationId: annot.id,
            messageId: createdMsg.id,
            text: content,
            anchorExact: annot.anchorExact,
            actor,
            capabilities: access.capabilities,
            currentVisibility: annot.visibility,
            canShare: annot.parent?.visibility !== "PRIVATE",
            isNewMessage: true,
          })
        : null;

    return { createdMsg, mentionSync };
  });

  if (mentionSync) {
    await sendMentionNotifications(mentionSync.pendingNotifications);
  }

  return createdMsg;
}

/** A STREAMING answer older than this was interrupted (the route runs for 60 s at most). */
const ANSWER_STALE_MS = 2 * 60 * 1000;

/**
 * Streams an AI answer for an Ask thread (Step F2.5).
 *
 * - Without `prompt`: answers the question that is waiting (right after
 *   "Ask now", or Retry after a failure). Refused when nothing is waiting, so
 *   a repeated call can't produce (and bill) a second answer.
 * - With `prompt`: a follow-up. The USER message is saved, then answered.
 *
 * The ASSISTANT message is created with status STREAMING before the stream
 * starts and finalized with content, thoughtSummary, citations and status
 * COMPLETE (or FAILED). Context comes from `buildAskContext` (only the text
 * the highlight sits in). Model: the owner's best allowed text model. Billed
 * to the workspace owner, actor recorded.
 *
 * The answer is written to the end even if the reader goes away, so closing
 * the column doesn't lose (or leave half-saved) an answer.
 */
export async function streamAnnotationAnswer(
  actor: Actor,
  annotationId: string,
  input: {
    prompt?: string;
    idempotencyKey: string;
  },
  options: { providerInstance?: AiProvider } = {}
): Promise<{
  stream: ReadableStream<Uint8Array>;
  generationId: string;
  annotationId: string;
  messageId: string;
}> {
  const idempotencyKey = input.idempotencyKey;
  const followUp = input.prompt?.trim() || "";

  const targetAnnotation = await db.annotation.findUnique({
    where: { id: annotationId, deletedAt: null },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!targetAnnotation) {
    throw Errors.notFound("Annotation");
  }

  const workspaceId = targetAnnotation.workspaceId;
  const wsAccess = await requireWorkspace(actor, workspaceId, "workspace.ask");

  if (
    targetAnnotation.visibility === "PRIVATE" &&
    targetAnnotation.createdById !== actor.userId
  ) {
    throw Errors.notFound("Annotation");
  }

  if (targetAnnotation.kind !== "ASK") {
    throw Errors.badRequest("Only Ask threads can be answered");
  }

  // Queued questions are answered by the queue run, not here.
  if (
    targetAnnotation.questionState !== "NONE" &&
    targetAnnotation.questionState !== "ANSWERED"
  ) {
    throw Errors.badRequest("This question is in the queue");
  }

  // A repeated request (same key) must not start a second answer.
  const sameRequest = await db.generation.findUnique({
    where: {
      actorId_idempotencyKey: { actorId: actor.userId, idempotencyKey },
    },
    select: { id: true },
  });
  if (sameRequest) {
    throw Errors.conflict("This request was already sent", "duplicate_request");
  }

  // Answers that failed, or were interrupted, are replaced by the new one.
  const staleBefore = Date.now() - ANSWER_STALE_MS;
  const isDead = (m: { role: string; status: string; createdAt: Date }) =>
    m.role === "ASSISTANT" &&
    (m.status === "FAILED" ||
      (m.status === "STREAMING" && m.createdAt.getTime() < staleBefore));
  const deadIds = targetAnnotation.messages.filter(isDead).map((m) => m.id);
  const thread = targetAnnotation.messages.filter((m) => !isDead(m));
  const last = thread[thread.length - 1];

  if (last?.role === "ASSISTANT" && last.status === "STREAMING") {
    throw Errors.conflict(
      "An answer is already being written",
      "answer_in_progress"
    );
  }
  if (!followUp && last?.role !== "USER") {
    throw Errors.badRequest("This thread has no unanswered question");
  }

  const { billedAccountId } = await resolveBilledAccount(wsAccess.ws);
  const ownerEntitlements = await getEntitlements(wsAccess.ws.ownerId);

  // The workspace owner's best allowed text model (never chosen by the client).
  const modelKey: ModelKey = ownerEntitlements.models.includes("text-standard")
    ? "text-standard"
    : "text-economy";
  const model = getModel(modelKey);
  try {
    assertModelAccess(modelKey, ownerEntitlements.plan);
  } catch (err: unknown) {
    throw Errors.forbidden(
      err instanceof Error
        ? err.message
        : `Model '${modelKey}' is not available on your current plan.`
    );
  }

  if (deadIds.length > 0) {
    await db.annotationMessage.deleteMany({ where: { id: { in: deadIds } } });
  }
  if (followUp) {
    await db.annotationMessage.create({
      data: {
        annotationId: targetAnnotation.id,
        role: "USER",
        content: followUp,
        authorId: actor.userId,
      },
    });
  }

  // Built before anything is reserved: its size is what gets billed.
  const userPref = await db.userPreference.findUnique({
    where: { userId: actor.userId },
    select: { aiLanguage: true, uiLocale: true },
  });
  const askContext = await buildAskContext(targetAnnotation.id, {
    language: resolveEffectiveAiLanguage({
      savedAiLanguage: userPref?.aiLanguage,
      uiLocale: userPref?.uiLocale,
    }),
  });

  const generationId = crypto.randomUUID();
  const estimatedInputTokens = estimateAskContextTokens(askContext);
  const reserveAmount = creditsFor(modelKey, {
    inputTokens: estimatedInputTokens,
    outputTokens: 800,
  });
  const reservationKey = `res_annot_${idempotencyKey}`;
  const settleKey = `stl_annot_${generationId}`;
  const releaseKey = `rel_annot_${generationId}`;

  // Reserve credits (owner billed, collaborator cap enforced)
  await reserveForWorkspaceGeneration({
    workspace: wsAccess.ws,
    actorId: actor.userId,
    amount: reserveAmount,
    reservationKey,
    generationId,
    estimated: true,
  });

  await db.generation.create({
    data: {
      id: generationId,
      workspaceId,
      actorId: actor.userId,
      billedAccountId,
      kind: "ANNOTATION_REPLY",
      status: "RUNNING",
      modelKey,
      providerModelId: model.providerModelId,
      promptVersion: ANNOTATION_PROMPT_VERSION,
      idempotencyKey,
      reservedCredits: reserveAmount,
      startedAt: new Date(),
    },
  });

  const assistantMessage = await db.annotationMessage.create({
    data: {
      annotationId: targetAnnotation.id,
      role: "ASSISTANT",
      content: "",
      generationId,
      status: "STREAMING",
      modelKey,
    },
  });

  const encoder = new TextEncoder();
  const activeProvider =
    options.providerInstance ||
    customAnnotationProviderForTesting ||
    getCustomProvider() ||
    undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The reader may be gone (column closed); keep answering anyway.
      let readerGone = false;
      const send = (event: string, data: unknown) => {
        if (readerGone) return;
        try {
          controller.enqueue(encoder.encode(formatSSEEvent(event, data)));
        } catch {
          readerGone = true;
        }
      };
      const close = () => {
        try {
          controller.close();
        } catch {
          // already closed or cancelled
        }
      };

      let fullAssistantText = "";
      let fullThoughtText = "";
      const citations: AnswerCitation[] = [];
      let usage: { inputTokens: number; outputTokens: number } | null = null;

      try {
        send("started", {
          generationId,
          annotationId: targetAnnotation.id,
          messageId: assistantMessage.id,
        });
        send("status", { stage: "writing" });

        const aiStream = streamAi(
          {
            modelKey,
            system: askContext.system,
            messages: askContext.messages,
            thinking: { summaries: true },
          },
          {
            userPlan: ownerEntitlements.plan,
            providerInstance: activeProvider,
          }
        );

        for await (const chunk of aiStream) {
          if (chunk.type === "text_delta" && chunk.text) {
            fullAssistantText += chunk.text;
            send("delta", { text: chunk.text });
          } else if (chunk.type === "thought_delta" && chunk.text) {
            fullThoughtText += chunk.text;
            send("thought", { text: chunk.text });
          } else if (chunk.type === "citation") {
            if (!chunk.url || citations.some((c) => c.url === chunk.url)) continue;
            const citation: AnswerCitation = {
              index: citations.length + 1,
              url: chunk.url,
              title: chunk.title ?? null,
              snippet: chunk.snippet ?? null,
              source: chunk.source ?? "MODEL_PROVIDED",
            };
            citations.push(citation);
            send("citation", citation);
          } else if (chunk.type === "usage") {
            usage = {
              inputTokens: chunk.inputTokens,
              outputTokens: chunk.outputTokens,
            };
          }
        }

        if (!fullAssistantText.trim()) {
          throw new Error("empty_answer");
        }

        await db.annotationMessage.update({
          where: { id: assistantMessage.id },
          data: {
            content: fullAssistantText,
            thoughtSummary: fullThoughtText || null,
            citations: citations.length > 0 ? citations : undefined,
            status: "COMPLETE",
          },
        });

        // Settle credits
        const chargedCredits = creditsFor(modelKey, {
          inputTokens: usage?.inputTokens || estimatedInputTokens,
          outputTokens: usage?.outputTokens || estimateTokens(fullAssistantText),
        });
        await settle(billedAccountId, generationId, chargedCredits, settleKey);

        await db.generation.update({
          where: { id: generationId },
          data: {
            status: "COMPLETED",
            finishedAt: new Date(),
            chargedCredits,
          },
        });

        send("status", { stage: "complete" });
        send("completed", {
          annotationId: targetAnnotation.id,
          messageId: assistantMessage.id,
        });
        send("done", { generationId, annotationId: targetAnnotation.id });
        close();
      } catch (err: unknown) {
        if (process.env.NODE_ENV !== "test") {
          console.error(
            "[Annotation Answer Stream Error]:",
            err instanceof Error ? err.name : "unknown"
          );
        }
        const errorCode =
          err instanceof AiError ? err.category : "reply_stream_failed";
        try {
          await db.annotationMessage.update({
            where: { id: assistantMessage.id },
            data: { status: "FAILED" },
          });
          await release(billedAccountId, generationId, releaseKey);
          await db.generation.update({
            where: { id: generationId },
            data: { status: "FAILED", finishedAt: new Date(), errorCode },
          });
        } catch {
          // Ignore secondary cleanup error
        }

        send("status", { stage: "failed" });
        send("error", {
          code: "reply_error",
          message:
            err instanceof AiError
              ? err.safeMessage
              : "The answer could not be generated",
        });
        close();
      }
    },
  });

  return {
    stream,
    generationId,
    annotationId: targetAnnotation.id,
    messageId: assistantMessage.id,
  };
}

/**
 * Promotes an AI-answered side-thread message into:
 * - TIMELINE: Adds to workspace history as a promoted Response at original sortAt date.
 *             Requires workspace.generate permission (no credits charged).
 * - NEW_WORKSPACE: Creates a new workspace owned by caller with only this promoted Response.
 *                  Requires workspace.read permission on source workspace.
 * Idempotent by [messageId, target].
 */
export async function promoteAnnotation(
  actor: Actor,
  annotationId: string,
  input: PromoteAnnotationInput
) {
  const annotation = await db.annotation.findFirst({
    where: { id: annotationId, deletedAt: null },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!annotation) {
    throw Errors.notFound("Annotation");
  }

  // Permission check
  if (input.target === "TIMELINE") {
    await requireWorkspace(actor, annotation.workspaceId, "workspace.generate");
  } else {
    await requireWorkspace(actor, annotation.workspaceId, "workspace.read");
  }

  const message = annotation.messages.find((m) => m.id === input.messageId);
  if (!message) {
    throw Errors.notFound("Message");
  }

  if (message.role !== "ASSISTANT") {
    throw Errors.badRequest("Only AI-answered messages can be promoted");
  }

  // Find user's question / reply prompt
  const precedingUserMsg = annotation.messages
    .filter((m) => m.role === "USER" && m.createdAt <= message.createdAt)
    .pop();
  const promptText =
    precedingUserMsg?.content ||
    annotation.messages.find((m) => m.role === "USER")?.content ||
    annotation.anchorExact;

  // Fast-path idempotency check
  const existing = await db.promotion.findUnique({
    where: {
      messageId_target: {
        messageId: input.messageId,
        target: input.target,
      },
    },
  });

  if (existing) {
    return {
      ...existing,
      alreadyPromoted: true,
    };
  }

  try {
    return await db.$transaction(async (tx) => {
      // Check again inside transaction to prevent race conditions
      const existingInTx = await tx.promotion.findUnique({
        where: {
          messageId_target: {
            messageId: input.messageId,
            target: input.target,
          },
        },
      });

      if (existingInTx) {
        return {
          ...existingInTx,
          alreadyPromoted: true,
        };
      }

      if (input.target === "TIMELINE") {
        const response = await tx.response.create({
          data: {
            workspaceId: annotation.workspaceId,
            createdById: annotation.createdById, // annotation author
            origin: "PROMOTED",
            prompt: promptText,
            quote: annotation.anchorExact,
            sourceAnnotationId: annotation.id,
            sortAt: message.createdAt, // lands in timeline by original creation date
            kind: "TEXT",
          },
        });

        const version = await tx.responseVersion.create({
          data: {
            responseId: response.id,
            number: 1,
            status: "COMPLETE",
            content: message.content,
            modelKey: "promoted",
            providerModelId: "promoted",
            promptVersion: "v1",
            sourceMessageId: message.id,
            createdById: actor.userId,
          },
        });

        await tx.response.update({
          where: { id: response.id },
          data: { activeVersionId: version.id },
        });

        const promotion = await tx.promotion.create({
          data: {
            annotationId: annotation.id,
            messageId: message.id,
            target: "TIMELINE",
            destinationResponseId: response.id,
            destinationWorkspaceId: annotation.workspaceId,
            createdById: actor.userId,
          },
        });

        return {
          ...promotion,
          alreadyPromoted: false,
        };
      } else {
        // NEW_WORKSPACE: owned by caller, title = first 60 chars of question
        const title = promptText.trim().slice(0, 60) || "New Workspace";
        const workspace = await tx.workspace.create({
          data: {
            ownerId: actor.userId,
            title,
          },
        });

        const response = await tx.response.create({
          data: {
            workspaceId: workspace.id,
            createdById: actor.userId,
            origin: "PROMOTED",
            prompt: promptText,
            quote: annotation.anchorExact,
            sourceAnnotationId: annotation.id,
            sortAt: message.createdAt,
            kind: "TEXT",
          },
        });

        const version = await tx.responseVersion.create({
          data: {
            responseId: response.id,
            number: 1,
            status: "COMPLETE",
            content: message.content,
            modelKey: "promoted",
            providerModelId: "promoted",
            promptVersion: "v1",
            sourceMessageId: message.id,
            createdById: actor.userId,
          },
        });

        await tx.response.update({
          where: { id: response.id },
          data: { activeVersionId: version.id },
        });

        const promotion = await tx.promotion.create({
          data: {
            annotationId: annotation.id,
            messageId: message.id,
            target: "NEW_WORKSPACE",
            destinationResponseId: response.id,
            destinationWorkspaceId: workspace.id,
            createdById: actor.userId,
          },
        });

        return {
          ...promotion,
          alreadyPromoted: false,
        };
      }
    });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "P2002") {
      const existing = await db.promotion.findUnique({
        where: {
          messageId_target: {
            messageId: input.messageId,
            target: input.target,
          },
        },
      });
      if (existing) {
        return {
          ...existing,
          alreadyPromoted: true,
        };
      }
    }
    throw err;
  }
}
