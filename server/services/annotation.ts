import "server-only";
import crypto from "node:crypto";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { requireWorkspace } from "@/server/authz/access";
import { logActivity } from "./activity";
import { resolveBilledAccount, reserveForWorkspaceGeneration } from "./billing-owner";
import type { Actor } from "@/server/auth/session";
import type {
  CreateAnnotationInput,
  UpdateAnnotationInput,
  ReplyAnnotationInput,
  PromoteAnnotationInput,
} from "@/lib/schemas/annotation";
import {
  getAccountByUserId,
  createAccountWithFreeGrant,
  reserve,
  settle,
  release,
} from "@/server/services/credits";
import {
  getModel,
  creditsFor,
  ModelKey,
} from "@/server/ai/registry";
import { getProvider, streamAi, type AiProvider } from "@/server/ai";
import { getCustomProvider } from "@/server/services/generation";
import {
  buildAnnotationReplyPrompt,
  ANNOTATION_PROMPT_VERSION,
} from "@/server/ai/prompts/annotation";
import { estimateTokens } from "@/server/ai/context-builder";

let customAnnotationProviderForTesting: AiProvider | null = null;

export function setAnnotationCustomProviderForTesting(provider: AiProvider | null) {
  customAnnotationProviderForTesting = provider;
}

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
      kind: "QUESTION",
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

  const created = await db.annotation.create({
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

  await logActivity(db, {
    workspaceId: version.response.workspaceId,
    actorId: actor.userId,
    action: "annotation.created",
    targetType: "annotation",
    targetId: created.id,
    meta: { kind: created.kind },
  });

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
  });

  if (!annot) {
    throw Errors.notFound("Annotation");
  }

  await requireWorkspace(actor, annot.workspaceId, "workspace.annotate");

  if (annot.visibility === "PRIVATE" && annot.createdById !== actor.userId) {
    throw Errors.notFound("Annotation");
  }

  return db.annotationMessage.create({
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
}

/**
 * Streams an AI reply for an annotation thread (Step 6.4):
 * - Creates annotation (kind REPLY) if called for a new passage selection.
 * - Adds user prompt as USER AnnotationMessage.
 * - Streams assistant completion via SSE without modifying main response timeline.
 * - Saves completed assistant message as ASSISTANT AnnotationMessage with generationId.
 * - Bills credits to workspace owner with calling actor recorded.
 */
export async function createAndStreamAnnotationReply(
  actor: Actor,
  annotationIdOrNew: string,
  input: ReplyAnnotationInput,
  options: { providerInstance?: AiProvider } = {}
): Promise<{
  stream: ReadableStream<Uint8Array>;
  generationId: string;
  annotationId: string;
}> {
  const effectivePrompt = (input.prompt || input.content || "").trim();
  if (!effectivePrompt) {
    throw Errors.badRequest("Prompt cannot be empty");
  }
  const idempotencyKey = input.idempotencyKey || crypto.randomUUID();

  let targetAnnotation: any;
  let targetVersion: any;
  let workspaceId: string;

  if (annotationIdOrNew === "new") {
    if (!input.anchor || !input.versionId) {
      throw Errors.badRequest(
        "Anchor and versionId are required to start a new reply thread"
      );
    }

    targetVersion = await db.responseVersion.findUnique({
      where: { id: input.versionId },
      include: {
        response: {
          select: { id: true, workspaceId: true, prompt: true, deletedAt: true },
        },
      },
    });

    if (!targetVersion || targetVersion.response.deletedAt !== null) {
      throw Errors.notFound("ResponseVersion");
    }

    workspaceId = targetVersion.response.workspaceId;

    // Enforce workspace.generate permission upfront
    const access = await requireWorkspace(actor, workspaceId, "workspace.generate");

    // Re-check substring
    let targetContent = targetVersion.content;
    if (input.contentSource === "EDIT") {
      if (input.editRevision) {
        const edit = await db.responseEdit.findUnique({
          where: {
            versionId_revision: {
              versionId: targetVersion.id,
              revision: input.editRevision,
            },
          },
        });
        if (edit) targetContent = edit.content;
      } else {
        const latestEdit = await db.responseEdit.findFirst({
          where: { versionId: targetVersion.id },
          orderBy: { revision: "desc" },
        });
        if (latestEdit) targetContent = latestEdit.content;
      }
    }

    if (!targetContent.includes(input.anchor.exact)) {
      throw Errors.badRequest(
        "Selected text is not a substring of the response content"
      );
    }

    // Create Annotation (kind REPLY) + initial USER message
    targetAnnotation = await db.annotation.create({
      data: {
        workspaceId,
        responseId: targetVersion.response.id,
        versionId: targetVersion.id,
        contentSource: input.contentSource ?? "ORIGINAL",
        editRevision: input.editRevision ?? null,
        createdById: actor.userId,
        kind: "REPLY",
        questionState: "NONE",
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
              content: effectivePrompt,
              authorId: actor.userId,
            },
          ],
        },
      },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
  } else {
    // Existing annotation thread
    targetAnnotation = await db.annotation.findUnique({
      where: { id: annotationIdOrNew, deletedAt: null },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        version: {
          include: {
            response: {
              select: { id: true, workspaceId: true, prompt: true, deletedAt: true },
            },
          },
        },
      },
    });

    if (!targetAnnotation || targetAnnotation.version.response.deletedAt !== null) {
      throw Errors.notFound("Annotation");
    }

    workspaceId = targetAnnotation.workspaceId;
    targetVersion = targetAnnotation.version;

    // Enforce workspace.generate
    await requireWorkspace(actor, workspaceId, "workspace.generate");

    if (
      targetAnnotation.visibility === "PRIVATE" &&
      targetAnnotation.createdById !== actor.userId
    ) {
      throw Errors.notFound("Annotation");
    }

    // Add user message to thread
    await db.annotationMessage.create({
      data: {
        annotationId: targetAnnotation.id,
        role: "USER",
        content: effectivePrompt,
        authorId: actor.userId,
      },
    });
  }

  // Resolve billing account = workspace owner's credit account
  const wsAccess = await requireWorkspace(actor, workspaceId, "workspace.generate");
  const { billedAccountId } = await resolveBilledAccount(wsAccess.ws);

  // Idempotency & Generation creation
  const modelKey = (input.modelKey || "text-economy") as ModelKey;
  const model = getModel(modelKey);
  const generationId = crypto.randomUUID();

  const estimatedInputTokens = estimateTokens(effectivePrompt) + 500;
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
      idempotencyKey: idempotencyKey,
      reservedCredits: reserveAmount,
      startedAt: new Date(),
    },
  });

  // Construct prompt
  const fullPrompt = buildAnnotationReplyPrompt({
    exact: targetAnnotation.anchorExact,
    versionText: targetVersion.content,
    originalPrompt: targetVersion.response.prompt,
    prompt: effectivePrompt,
  });

  const encoder = new TextEncoder();
  const activeProvider =
    options.providerInstance ||
    customAnnotationProviderForTesting ||
    getCustomProvider() ||
    undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullAssistantText = "";

      try {
        controller.enqueue(
          encoder.encode(
            formatSSEEvent("started", {
              generationId,
              annotationId: targetAnnotation.id,
            })
          )
        );
        controller.enqueue(
          encoder.encode(formatSSEEvent("status", { stage: "queued" }))
        );
        controller.enqueue(
          encoder.encode(
            formatSSEEvent("status", { stage: "preparing", truncated: false })
          )
        );
        controller.enqueue(
          encoder.encode(formatSSEEvent("status", { stage: "writing" }))
        );

        const aiStream = streamAi(
          {
            modelKey,
            messages: [
              {
                role: "user",
                parts: [{ type: "text", text: fullPrompt }],
              },
            ],
            thinking: { summaries: false },
          },
          {
            providerInstance: activeProvider,
          }
        );

        for await (const chunk of aiStream) {
          if (chunk.type === "text_delta" && chunk.text) {
            fullAssistantText += chunk.text;
            controller.enqueue(
              encoder.encode(formatSSEEvent("delta", { text: chunk.text }))
            );
          }
        }

        // Save completed assistant message to thread
        await db.annotationMessage.create({
          data: {
            annotationId: targetAnnotation.id,
            role: "ASSISTANT",
            content: fullAssistantText,
            generationId,
          },
        });

        // Settle credits
        const outputTokens = estimateTokens(fullAssistantText);
        const chargedCredits = creditsFor(modelKey, {
          inputTokens: estimatedInputTokens,
          outputTokens,
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

        controller.enqueue(
          encoder.encode(formatSSEEvent("status", { stage: "complete" }))
        );
        controller.enqueue(
          encoder.encode(
            formatSSEEvent("done", {
              generationId,
              annotationId: targetAnnotation.id,
            })
          )
        );
        controller.close();
      } catch (err: unknown) {
        console.error("[Annotation Reply Stream Error]:", err);
        try {
          await release(billedAccountId, generationId, releaseKey);
          await db.generation.update({
            where: { id: generationId },
            data: {
              status: "FAILED",
              finishedAt: new Date(),
              errorCode: "reply_stream_failed",
            },
          });
        } catch {
          // Ignore secondary cleanup error
        }

        controller.enqueue(
          encoder.encode(formatSSEEvent("status", { stage: "failed" }))
        );
        controller.enqueue(
          encoder.encode(
            formatSSEEvent("error", {
              code: "reply_error",
              message:
                err instanceof Error ? err.message : "Annotation reply failed",
            })
          )
        );
        controller.close();
      }
    },
  });

  return {
    stream,
    generationId,
    annotationId: targetAnnotation.id,
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
