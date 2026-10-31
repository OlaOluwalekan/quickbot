import "server-only";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import type { Actor } from "@/server/auth/session";
import { requireWorkspace, resolveWorkspaceRole } from "@/server/authz/access";
import { toPage } from "@/server/http/pagination";
import { createAndStreamGeneration } from "./generation";
import type {
  RegenerateResponseInput,
  CreateResponseEditInput,
} from "@/lib/schemas/response";
import type { AiProvider } from "@/server/ai";

export interface WorkspaceResponsesQuery {
  cursor?: string;
  limit?: number;
  view?: "original" | "edited";
}

/**
 * Lists responses for a workspace, ordered chronologically by (sortAt, id).
 * Returns each response with its activeVersion summary and versionCount.
 * Supports ?view=original|edited.
 */
export async function listWorkspaceResponses(
  actor: Actor,
  workspaceId: string,
  query?: WorkspaceResponsesQuery
) {
  await requireWorkspace(actor, workspaceId, "workspace.read");

  const limit = query?.limit ?? 20;
  const cursor = query?.cursor;
  const view = query?.view ?? "edited";

  const responses = await db.response.findMany({
    where: {
      workspaceId,
      deletedAt: null,
    },
    take: limit + 1,
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
    orderBy: [{ sortAt: "asc" }, { id: "asc" }],
    include: {
      versions: {
        orderBy: { number: "asc" },
        include: {
          edits: {
            orderBy: { revision: "desc" },
            take: 1,
          },
          _count: {
            select: { edits: true },
          },
        },
      },
    },
  });

  const formatted = responses.map((r) => {
    const versionCount = r.versions.length;
    // activeVersion is either the explicit activeVersionId or the latest version
    const activeVer =
      r.versions.find((v) => v.id === r.activeVersionId) ??
      r.versions.at(-1) ??
      null;

    let activeVersionSummary = null;
    if (activeVer) {
      const latestEdit = activeVer.edits[0] ?? null;
      const effectiveContent =
        view === "original"
          ? activeVer.content
          : (latestEdit?.content ?? activeVer.content);

      activeVersionSummary = {
        id: activeVer.id,
        number: activeVer.number,
        status: activeVer.status,
        content: effectiveContent,
        originalContent: activeVer.content,
        thoughtSummary: activeVer.thoughtSummary,
        modelKey: activeVer.modelKey,
        providerModelId: activeVer.providerModelId,
        promptVersion: activeVer.promptVersion,
        createdById: activeVer.createdById,
        createdAt: activeVer.createdAt,
        edited: (activeVer._count?.edits ?? 0) > 0,
        hasEdits: (activeVer._count?.edits ?? 0) > 0,
        editCount: activeVer._count?.edits ?? 0,
        latestEdit: latestEdit
          ? {
              id: latestEdit.id,
              revision: latestEdit.revision,
              editorId: latestEdit.editorId,
              createdAt: latestEdit.createdAt,
            }
          : null,
        latestEditContent: latestEdit?.content ?? null,
      };
    }

    return {
      id: r.id,
      workspaceId: r.workspaceId,
      createdById: r.createdById,
      prompt: r.prompt,
      kind: r.kind,
      origin: r.origin,
      sortAt: r.sortAt,
      activeVersionId: r.activeVersionId,
      createdAt: r.createdAt,
      activeVersion: activeVersionSummary,
      versionCount,
    };
  });

  return toPage(formatted, limit);
}

/**
 * Lists all versions of a response (metadata + content + edit summary).
 * Supports ?view=original|edited.
 */
export async function listResponseVersions(
  actor: Actor,
  responseId: string,
  options?: { view?: "original" | "edited" }
) {
  const response = await db.response.findUnique({
    where: { id: responseId, deletedAt: null },
    select: { id: true, workspaceId: true, activeVersionId: true },
  });

  if (!response) {
    throw Errors.notFound("Response");
  }

  await requireWorkspace(actor, response.workspaceId, "workspace.read");

  const view = options?.view ?? "edited";

  const versions = await db.responseVersion.findMany({
    where: { responseId },
    orderBy: { number: "asc" },
    include: {
      edits: {
        orderBy: { revision: "desc" },
        take: 1,
      },
      _count: {
        select: { edits: true },
      },
    },
  });

  return versions.map((v) => {
    const latestEdit = v.edits[0] ?? null;
    const effectiveContent =
      view === "original"
        ? v.content
        : (latestEdit?.content ?? v.content);

    return {
      id: v.id,
      responseId: v.responseId,
      number: v.number,
      status: v.status,
      content: effectiveContent,
      originalContent: v.content,
      thoughtSummary: v.thoughtSummary,
      modelKey: v.modelKey,
      providerModelId: v.providerModelId,
      promptVersion: v.promptVersion,
      generationId: v.generationId,
      createdById: v.createdById,
      createdAt: v.createdAt,
      isActive: v.id === response.activeVersionId,
      edited: (v._count?.edits ?? 0) > 0,
      hasEdits: (v._count?.edits ?? 0) > 0,
      editCount: v._count?.edits ?? 0,
      latestEdit: latestEdit
        ? {
            id: latestEdit.id,
            revision: latestEdit.revision,
            editorId: latestEdit.editorId,
            createdAt: latestEdit.createdAt,
          }
        : null,
      latestEditContent: latestEdit?.content ?? null,
    };
  });
}

/**
 * Switches the active version of a response for all workspace members.
 * Requires workspace.regenerate permission.
 */
export async function setActiveVersion(
  actor: Actor,
  responseId: string,
  versionId: string
) {
  const response = await db.response.findUnique({
    where: { id: responseId, deletedAt: null },
  });

  if (!response) {
    throw Errors.notFound("Response");
  }

  // Switching changes what everyone sees by default, so requires workspace.regenerate
  await requireWorkspace(actor, response.workspaceId, "workspace.regenerate");

  const version = await db.responseVersion.findFirst({
    where: { id: versionId, responseId },
  });

  if (!version) {
    throw Errors.notFound("ResponseVersion");
  }

  await db.response.update({
    where: { id: responseId },
    data: { activeVersionId: versionId },
  });

  return {
    responseId,
    activeVersionId: versionId,
  };
}

/**
 * Regenerates a response turn (creates version N+1).
 * Uses context up to that response only.
 * Requires workspace.regenerate permission.
 */
export async function regenerateResponse(
  actor: Actor,
  responseId: string,
  input: RegenerateResponseInput,
  options: { providerInstance?: AiProvider } = {}
) {
  const targetResponse = await db.response.findUnique({
    where: { id: responseId, deletedAt: null },
  });

  if (!targetResponse) {
    throw Errors.notFound("Response");
  }

  // Authorization check upfront
  await requireWorkspace(actor, targetResponse.workspaceId, "workspace.regenerate");

  // Calls generation service with regenerateResponseId
  return createAndStreamGeneration(
    actor,
    targetResponse.workspaceId,
    {
      idempotencyKey: input.idempotencyKey,
      prompt: targetResponse.prompt,
      modelKey: input.modelKey ?? "text-economy",
      regenerateResponseId: responseId,
      think: input.think,
      language: input.language,
    },
    options
  );
}

/**
 * Creates an append-only user edit on a response version (revision = max + 1).
 * ResponseVersion.content remains untouched (byte-identical).
 * Edits cost no credits.
 * Requires workspace.edit_response permission.
 */
export async function createResponseEdit(
  actor: Actor,
  versionId: string,
  input: CreateResponseEditInput
) {
  const version = await db.responseVersion.findUnique({
    where: { id: versionId },
    include: {
      response: {
        select: { id: true, workspaceId: true, deletedAt: true },
      },
    },
  });

  if (!version || version.response.deletedAt) {
    throw Errors.notFound("ResponseVersion");
  }

  await requireWorkspace(actor, version.response.workspaceId, "workspace.edit_response");

  let attempts = 0;
  while (attempts < 3) {
    try {
      const edit = await db.$transaction(async (tx) => {
        const maxEdit = await tx.responseEdit.findFirst({
          where: { versionId },
          orderBy: { revision: "desc" },
          select: { revision: true },
        });

        const nextRevision = (maxEdit?.revision ?? 0) + 1;

        return tx.responseEdit.create({
          data: {
            versionId,
            revision: nextRevision,
            content: input.content,
            editorId: actor.userId,
          },
        });
      });

      return edit;
    } catch (err: any) {
      if (err?.code === "P2002" && attempts < 2) {
        attempts++;
        continue;
      }
      throw err;
    }
  }

  throw new Error("Failed to create response edit after multiple attempts");
}

/**
 * Lists the revision history of edits for a response version.
 * Requires workspace.read permission.
 */
export async function listResponseEdits(actor: Actor, versionId: string) {
  const version = await db.responseVersion.findUnique({
    where: { id: versionId },
    include: {
      response: {
        select: { id: true, workspaceId: true, deletedAt: true },
      },
    },
  });

  if (!version || version.response.deletedAt) {
    throw Errors.notFound("ResponseVersion");
  }

  await requireWorkspace(actor, version.response.workspaceId, "workspace.read");

  const edits = await db.responseEdit.findMany({
    where: { versionId },
    orderBy: { revision: "desc" },
  });

  return {
    versionId,
    originalContent: version.content,
    total: edits.length,
    items: edits,
  };
}

/**
 * Reverts the latest edit for a response version.
 * Requires workspace owner, admin, or the editor who made that latest edit.
 */
export async function revertLatestResponseEdit(actor: Actor, versionId: string) {
  const version = await db.responseVersion.findUnique({
    where: { id: versionId },
    include: {
      response: {
        select: { id: true, workspaceId: true, deletedAt: true },
      },
    },
  });

  if (!version || version.response.deletedAt) {
    throw Errors.notFound("ResponseVersion");
  }

  // Basic permission check on the workspace
  await requireWorkspace(actor, version.response.workspaceId, "workspace.edit_response");

  const latestEdit = await db.responseEdit.findFirst({
    where: { versionId },
    orderBy: { revision: "desc" },
  });

  if (!latestEdit) {
    throw Errors.notFound("ResponseEdit");
  }

  // Detailed role check: owner, admin, or the author of this specific edit
  const access = await resolveWorkspaceRole(actor.userId, version.response.workspaceId);
  if (!access) {
    throw Errors.notFound("Workspace");
  }

  const isOwnerOrAdmin = access.role === "OWNER" || access.role === "ADMIN";
  if (!isOwnerOrAdmin && latestEdit.editorId !== actor.userId) {
    throw Errors.forbidden(
      "Only workspace owner, admin, or the editor can revert this edit"
    );
  }

  await db.responseEdit.delete({
    where: { id: latestEdit.id },
  });

  const remainingEdits = await db.responseEdit.count({
    where: { versionId },
  });

  return {
    revertedEdit: latestEdit,
    remainingEdits,
  };
}
