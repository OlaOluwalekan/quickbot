import "server-only";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import type { Actor } from "@/server/auth/session";
import { requireWorkspace } from "@/server/authz/access";
import { PageQuery, toPage } from "@/server/http/pagination";
import { createAndStreamGeneration } from "./generation";
import type { RegenerateResponseInput } from "@/lib/schemas/response";
import type { AiProvider } from "@/server/ai";

/**
 * Lists responses for a workspace, ordered chronologically by (sortAt, id).
 * Returns each response with its activeVersion summary and versionCount.
 */
export async function listWorkspaceResponses(
  actor: Actor,
  workspaceId: string,
  query?: PageQuery
) {
  await requireWorkspace(actor, workspaceId, "workspace.read");

  const limit = query?.limit ?? 20;
  const cursor = query?.cursor;

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
      activeVersionSummary = {
        id: activeVer.id,
        number: activeVer.number,
        status: activeVer.status,
        content: activeVer.content,
        thoughtSummary: activeVer.thoughtSummary,
        modelKey: activeVer.modelKey,
        providerModelId: activeVer.providerModelId,
        promptVersion: activeVer.promptVersion,
        createdById: activeVer.createdById,
        createdAt: activeVer.createdAt,
        hasEdits: (activeVer._count?.edits ?? 0) > 0,
        editCount: activeVer._count?.edits ?? 0,
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
 * Lists all versions of a response (metadata + content + edit count).
 */
export async function listResponseVersions(actor: Actor, responseId: string) {
  const response = await db.response.findUnique({
    where: { id: responseId, deletedAt: null },
    select: { id: true, workspaceId: true, activeVersionId: true },
  });

  if (!response) {
    throw Errors.notFound("Response");
  }

  await requireWorkspace(actor, response.workspaceId, "workspace.read");

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
    return {
      id: v.id,
      responseId: v.responseId,
      number: v.number,
      status: v.status,
      content: v.content,
      thoughtSummary: v.thoughtSummary,
      modelKey: v.modelKey,
      providerModelId: v.providerModelId,
      promptVersion: v.promptVersion,
      generationId: v.generationId,
      createdById: v.createdById,
      createdAt: v.createdAt,
      isActive: v.id === response.activeVersionId,
      hasEdits: (v._count?.edits ?? 0) > 0,
      editCount: v._count?.edits ?? 0,
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
