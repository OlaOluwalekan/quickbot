import "server-only";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import type { Actor } from "@/server/auth/session";
import { requireWorkspace, resolveWorkspaceRole } from "@/server/authz/access";
import { logActivity } from "./activity";
import { resolveAvatarUrl } from "@/lib/avatar";
import { toPage } from "@/server/http/pagination";
import { createAndStreamGeneration } from "./generation";
import { MAX_ANNOTATION_DEPTH } from "@/lib/annotations/limits";
import type {
  RegenerateResponseInput,
  CreateResponseEditInput,
} from "@/lib/schemas/response";
import type { AiProvider, PlanTier } from "@/server/ai";

export interface WorkspaceResponsesQuery {
  cursor?: string;
  limit?: number;
  view?: "original" | "edited";
}

export type SourceChainStep = {
  id: string;
  quote: string;
  depth: number;
};

type ResponseSourceProvenance = {
  sourceWorkspaceId: string | null;
  sourceChain: SourceChainStep[] | null;
  sourceRemoved: boolean;
  sourceAccessible: boolean;
};

async function loadResponseProvenanceMap(
  actor: Actor,
  currentWorkspaceId: string,
  annotationIds: string[]
): Promise<Map<string, ResponseSourceProvenance>> {
  const result = new Map<string, ResponseSourceProvenance>();
  const uniqueIds = Array.from(new Set(annotationIds));
  if (uniqueIds.length === 0) return result;

  // Walk upward from each distinct sourceAnnotationId in a single SQL CTE.
  type RawChainRow = {
    leaf_id: string;
    id: string;
    workspace_id: string;
    anchor_exact: string;
    depth: number;
    visibility: string;
    created_by_id: string;
    deleted_at: Date | null;
    parent_annotation_id: string | null;
  };

  const rows = await db.$queryRaw<RawChainRow[]>`
    WITH RECURSIVE chain AS (
      SELECT
        id AS leaf_id,
        id,
        workspace_id,
        anchor_exact,
        depth,
        visibility,
        created_by_id,
        deleted_at,
        parent_annotation_id,
        0 AS step
      FROM annotations
      WHERE id = ANY(${uniqueIds}::text[])

      UNION ALL

      SELECT
        c.leaf_id,
        parent.id,
        parent.workspace_id,
        parent.anchor_exact,
        parent.depth,
        parent.visibility,
        parent.created_by_id,
        parent.deleted_at,
        parent.parent_annotation_id,
        c.step + 1 AS step
      FROM annotations parent
      INNER JOIN chain c ON parent.id = c.parent_annotation_id
      WHERE c.step < ${MAX_ANNOTATION_DEPTH}
    )
    SELECT
      leaf_id,
      id,
      workspace_id,
      anchor_exact,
      depth,
      visibility,
      created_by_id,
      deleted_at,
      parent_annotation_id
    FROM chain
    ORDER BY leaf_id ASC, depth ASC;
  `;

  const rowsByLeaf = new Map<string, RawChainRow[]>();
  const otherWorkspaceIds = new Set<string>();
  for (const row of rows) {
    const list = rowsByLeaf.get(row.leaf_id) ?? [];
    list.push(row);
    rowsByLeaf.set(row.leaf_id, list);
    if (row.workspace_id !== currentWorkspaceId) {
      otherWorkspaceIds.add(row.workspace_id);
    }
  }

  // Verify access for any annotation originating in a different workspace.
  const accessibleOtherWs = new Map<string, boolean>();
  const removedOtherWs = new Set<string>();
  if (otherWorkspaceIds.size > 0) {
    const otherList = Array.from(otherWorkspaceIds);
    const otherWsRows = await db.workspace.findMany({
      where: { id: { in: otherList } },
      select: { id: true, deletedAt: true },
    });
    const deletedSet = new Set(
      otherWsRows.filter((w) => w.deletedAt !== null).map((w) => w.id)
    );
    const existingSet = new Set(otherWsRows.map((w) => w.id));

    await Promise.all(
      otherList.map(async (wsId) => {
        if (!existingSet.has(wsId) || deletedSet.has(wsId)) {
          accessibleOtherWs.set(wsId, false);
          removedOtherWs.add(wsId);
          return;
        }
        const access = await resolveWorkspaceRole(actor.userId, wsId);
        accessibleOtherWs.set(wsId, Boolean(access));
      })
    );
  }

  for (const leafId of uniqueIds) {
    const chainRows = rowsByLeaf.get(leafId);
    if (!chainRows || chainRows.length === 0) {
      result.set(leafId, {
        sourceWorkspaceId: null,
        sourceChain: null,
        sourceRemoved: true,
        sourceAccessible: false,
      });
      continue;
    }

    const leaf = chainRows.find((r) => r.id === leafId);
    const srcWsId = leaf?.workspace_id ?? chainRows[0]!.workspace_id;

    // Check if source workspace itself is deleted or inaccessible
    if (srcWsId !== currentWorkspaceId && !accessibleOtherWs.get(srcWsId)) {
      const wsRemoved = removedOtherWs.has(srcWsId);
      result.set(leafId, {
        sourceWorkspaceId: null,
        sourceChain: null,
        sourceRemoved: wsRemoved || !leaf || leaf.deleted_at !== null,
        sourceAccessible: false,
      });
      continue;
    }

    const anyDeleted = chainRows.some((r) => r.deleted_at !== null);
    if (anyDeleted || !leaf) {
      result.set(leafId, {
        sourceWorkspaceId: srcWsId,
        sourceChain: null,
        sourceRemoved: true,
        sourceAccessible: false,
      });
      continue;
    }

    const anyPrivateHidden = chainRows.some(
      (r) => r.visibility === "PRIVATE" && r.created_by_id !== actor.userId
    );
    if (anyPrivateHidden) {
      result.set(leafId, {
        sourceWorkspaceId: srcWsId,
        sourceChain: null,
        sourceRemoved: false,
        sourceAccessible: false,
      });
      continue;
    }

    result.set(leafId, {
      sourceWorkspaceId: srcWsId,
      sourceChain: chainRows.map((r) => ({
        id: r.id,
        quote: r.anchor_exact,
        depth: r.depth,
      })),
      sourceRemoved: false,
      sourceAccessible: true,
    });
  }

  return result;
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
      uploadedAttachment: {
        select: {
          id: true,
          originalName: true,
          mime: true,
          bytes: true,
          createdAt: true,
          deletedAt: true,
        },
      },
      attachments: {
        where: {
          deletedAt: null,
          kind: { in: ["IMAGE", "DOCUMENT", "GENERATED_DOCUMENT"] },
        },
        select: {
          id: true,
          kind: true,
          originalName: true,
          mime: true,
          bytes: true,
          width: true,
          height: true,
        },
      },
      versions: {
        orderBy: { number: "asc" },
        include: {
          edits: {
            orderBy: { revision: "desc" },
            take: 1,
          },
          citations: {
            orderBy: { index: "asc" },
          },
          _count: {
            select: { edits: true },
          },
        },
      },
    },
  });

  const userIds = Array.from(
    new Set(responses.map((r) => r.createdById).filter(Boolean))
  );
  const users =
    userIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          include: { avatarAttachment: true },
        })
      : [];
  const authorMap = new Map<string, { name: string; avatarUrl: string | null }>();
  for (const u of users) {
    authorMap.set(u.id, {
      name: u.name,
      avatarUrl: resolveAvatarUrl(u),
    });
  }

  const provenanceMap = await loadResponseProvenanceMap(
    actor,
    workspaceId,
    responses
      .map((r) => r.sourceAnnotationId)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );

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
        citations: activeVer.citations ?? [],
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

    const author = authorMap.get(r.createdById) ?? null;
    const prov = r.sourceAnnotationId
      ? provenanceMap.get(r.sourceAnnotationId) ?? {
          sourceWorkspaceId: null,
          sourceChain: null,
          sourceRemoved: true,
          sourceAccessible: false,
        }
      : null;

    return {
      id: r.id,
      workspaceId: r.workspaceId,
      createdById: r.createdById,
      prompt: r.prompt,
      kind: r.kind,
      origin: r.origin,
      quote: r.quote,
      sourceAnnotationId: r.sourceAnnotationId,
      sourceWorkspaceId: prov?.sourceWorkspaceId ?? null,
      sourceChain: prov?.sourceChain ?? null,
      sourceRemoved: prov?.sourceRemoved ?? false,
      sourceAccessible: prov?.sourceAccessible ?? false,
      sortAt: r.sortAt,
      activeVersionId: r.activeVersionId,
      createdAt: r.createdAt,
      activeVersion: activeVersionSummary,
      versionCount,
      author: author ? { name: author.name, avatarUrl: author.avatarUrl ?? undefined } : undefined,
      attachments: (r.attachments ?? []).filter((a) => a.kind !== "GENERATED_DOCUMENT"),
      generatedDocuments: (r.attachments ?? []).filter((a) => a.kind === "GENERATED_DOCUMENT"),
      uploadedAttachment:
        r.uploadedAttachment && r.uploadedAttachment.deletedAt === null
          ? {
              id: r.uploadedAttachment.id,
              originalName: r.uploadedAttachment.originalName,
              mime: r.uploadedAttachment.mime,
              bytes: r.uploadedAttachment.bytes,
              createdAt: r.uploadedAttachment.createdAt,
            }
          : null,
    };
  });

  return toPage(formatted, limit);
}

/**
 * Lists all versions of a response (metadata + content + edit summary + citations).
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
      citations: {
        orderBy: { index: "asc" },
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
      citations: v.citations ?? [],
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
  options: { providerInstance?: AiProvider; userPlan?: PlanTier } = {}
) {
  const targetResponse = await db.response.findUnique({
    where: { id: responseId, deletedAt: null },
    include: {
      attachments: {
        where: {
          deletedAt: null,
          kind: { in: ["IMAGE", "DOCUMENT", "GENERATED_DOCUMENT"] },
        },
        select: { id: true },
      },
      versions: {
        orderBy: { number: "desc" },
        take: 1,
        include: {
          citations: {
            where: { source: "GROUNDING" },
            take: 1,
          },
        },
      },
    },
  });

  if (!targetResponse) {
    throw Errors.notFound("Response");
  }

  // Authorization check upfront
  await requireWorkspace(actor, targetResponse.workspaceId, "workspace.regenerate");

  // An uploaded document has no prompt to run again.
  if (targetResponse.kind === "DOCUMENT") {
    throw Errors.badRequest(
      "An uploaded document can't be regenerated",
      "document_not_regenerable"
    );
  }

  const isImageTurn = targetResponse.kind === "IMAGE";
  const defaultModelKey = isImageTurn ? "image-standard" : "text-economy";
  const priorHadGrounding = Boolean(
    targetResponse.versions?.[0]?.citations &&
      targetResponse.versions[0].citations.length > 0
  );

  // Calls generation service with regenerateResponseId
  return createAndStreamGeneration(
    actor,
    targetResponse.workspaceId,
    {
      idempotencyKey: input.idempotencyKey,
      prompt: targetResponse.prompt,
      modelKey: input.modelKey ?? defaultModelKey,
      kind: isImageTurn ? "IMAGE" : "TEXT",
      regenerateResponseId: responseId,
      think: input.think,
      grounding: input.grounding ?? priorHadGrounding,
      language: input.language,
      attachmentIds: isImageTurn
        ? undefined
        : targetResponse.attachments.map((a) => a.id),
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
          select: { revision: true, content: true },
        });

        const latestRevision = maxEdit?.revision ?? null;
        if (input.baseRevision !== undefined) {
          const expected = input.baseRevision === 0 ? null : input.baseRevision;
          if (latestRevision !== expected) {
            throw Errors.conflict(
              "Document was modified since you started editing",
              "edit_conflict",
              {
                latestRevision,
                latestContent: maxEdit?.content ?? version.content,
              }
            );
          }
        }

        const nextRevision = (maxEdit?.revision ?? 0) + 1;

        const created = await tx.responseEdit.create({
          data: {
            versionId,
            revision: nextRevision,
            content: input.content,
            editorId: actor.userId,
          },
        });

        if (input.acceptedSuggestionIds && input.acceptedSuggestionIds.length > 0) {
          await tx.annotation.updateMany({
            where: {
              id: { in: input.acceptedSuggestionIds },
              workspaceId: version.response.workspaceId,
              deletedAt: null,
              OR: [{ versionId }, { responseId: version.response.id }],
            },
            data: {
              suggestionState: "ACCEPTED",
              resolvedAt: new Date(),
            },
          });
        }

        return created;
      });

      await logActivity(db, {
        workspaceId: version.response.workspaceId,
        actorId: actor.userId,
        action: "response.edited",
        targetType: "response",
        targetId: version.response.id,
        meta: { versionId, revision: edit.revision },
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
