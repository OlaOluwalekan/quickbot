import "server-only";
import crypto from "node:crypto";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import type { Actor } from "@/server/auth/session";
import { requireWorkspace } from "@/server/authz/access";
import { Errors } from "@/server/http/errors";
import { logActivity } from "@/server/services/activity";
import { notify } from "@/server/services/notify";
import { getStorageProvider } from "@/server/storage";
import { ALLOWED_MIME_TYPES } from "@/server/services/attachment";
import type { StorageResourceType } from "@/server/storage/types";
import type { CreateShareLinkInput } from "@/lib/schemas/share";

export function hashShareToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getPublicShareHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
  };
}

/**
 * Rate-limit key for anonymous share views (`share:view`, 60/min).
 * Keyed by client IP when a trusted proxy supplies one. Without a trusted IP we
 * key by the link itself, so one abusive client can never exhaust a single
 * site-wide bucket and lock every public link for everyone.
 */
export function shareViewRateLimitKey(
  clientIp: string | null,
  rawToken: string
): string {
  if (clientIp) return `ip:${clientIp}`;
  return `link:${hashShareToken((rawToken || "").trim())}`;
}

export type ShareLinkStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

export function computeShareStatus(
  link: { revokedAt: Date | null; expiresAt: Date | null },
  now = new Date()
): ShareLinkStatus {
  if (link.revokedAt) return "REVOKED";
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "ACTIVE";
}

function getAppBaseUrl(): string {
  const base = env.APP_URL || "http://localhost:3000";
  return base.replace(/\/$/, "");
}

/**
 * Step 7.6: Create a public share link for a workspace or single response.
 * Requires `workspace.share` (owner or admin).
 * Returns the full share URL once on creation; only SHA-256 hash + 6-char prefix are stored.
 */
export async function createShareLink(
  actor: Actor,
  input: CreateShareLinkInput
) {
  const { ws } = await requireWorkspace(actor, input.workspaceId, "workspace.share");

  if (input.scope === "RESPONSE") {
    if (!input.responseId) {
      throw Errors.badRequest("responseId is required when sharing a single response");
    }
    const resp = await db.response.findUnique({
      where: { id: input.responseId },
      select: { id: true, workspaceId: true, deletedAt: true },
    });
    if (!resp || resp.deletedAt || resp.workspaceId !== ws.id) {
      throw Errors.notFound("Response");
    }
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashShareToken(rawToken);
  const tokenPrefix = rawToken.slice(0, 6);

  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const shareLink = await db.shareLink.create({
    data: {
      workspaceId: ws.id,
      responseId: input.scope === "RESPONSE" ? input.responseId ?? null : null,
      scope: input.scope,
      view: input.view || "EDITED_IF_AVAILABLE",
      tokenHash,
      tokenPrefix,
      showAuthor: Boolean(input.showAuthor),
      expiresAt,
      createdById: actor.userId,
    },
  });

  const url = `${getAppBaseUrl()}/s/${rawToken}`;

  await logActivity(db, {
    workspaceId: ws.id,
    projectId: ws.projectId ?? null,
    actorId: actor.userId,
    action: "share.created",
    targetType: "ShareLink",
    targetId: shareLink.id,
    meta: {
      scope: shareLink.scope,
      responseId: shareLink.responseId,
      view: shareLink.view,
      tokenPrefix: shareLink.tokenPrefix,
      expiresAt: shareLink.expiresAt ? shareLink.expiresAt.toISOString() : null,
      showAuthor: shareLink.showAuthor,
    },
  });

  // Notify the workspace owner (in-app + email per their SHARE_CREATED
  // preferences). Never fail share creation on a notification error.
  try {
    const fullWs = await db.workspace.findUnique({
      where: { id: ws.id },
      select: { title: true },
    });
    const title = fullWs?.title || "Untitled Workspace";
    await notify(
      ws.ownerId,
      "SHARE_CREATED",
      {
        workspaceId: ws.id,
        shareId: shareLink.id,
        scope: shareLink.scope,
        responseId: shareLink.responseId,
        title,
        href: `/workspaces/${ws.id}`,
      },
      {
        dedupeKey: `share_created:${shareLink.id}`,
        // The live share URL carries the raw token: only send it by email,
        // never persist it in the notification payload.
        emailData: { template: "share-created", data: { title, shareUrl: url } },
      }
    );
  } catch (err) {
    console.warn("[share] Failed to send share-created notification:", err);
  }

  return {
    id: shareLink.id,
    workspaceId: shareLink.workspaceId,
    responseId: shareLink.responseId,
    scope: shareLink.scope,
    view: shareLink.view,
    tokenPrefix: shareLink.tokenPrefix,
    showAuthor: shareLink.showAuthor,
    expiresAt: shareLink.expiresAt ? shareLink.expiresAt.toISOString() : null,
    revokedAt: null,
    status: "ACTIVE" as ShareLinkStatus,
    viewCount: 0,
    lastViewedAt: null,
    createdAt: shareLink.createdAt.toISOString(),
    url,
  };
}

/**
 * Step 7.6: List all share links for a workspace with status, view count, and expiry.
 * Requires `workspace.share` (owner or admin).
 */
export async function listWorkspaceShares(actor: Actor, workspaceId: string) {
  await requireWorkspace(actor, workspaceId, "workspace.share");

  const links = await db.shareLink.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      workspaceId: true,
      responseId: true,
      scope: true,
      view: true,
      tokenPrefix: true,
      showAuthor: true,
      expiresAt: true,
      revokedAt: true,
      viewCount: true,
      lastViewedAt: true,
      createdAt: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      response: {
        select: {
          id: true,
          prompt: true,
        },
      },
    },
  });

  const now = new Date();
  return links.map((link) => ({
    id: link.id,
    workspaceId: link.workspaceId,
    responseId: link.responseId,
    responsePrompt: link.response?.prompt
      ? link.response.prompt.slice(0, 80)
      : null,
    scope: link.scope,
    view: link.view,
    tokenPrefix: link.tokenPrefix,
    showAuthor: link.showAuthor,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    revokedAt: link.revokedAt ? link.revokedAt.toISOString() : null,
    status: computeShareStatus(link, now),
    viewCount: link.viewCount,
    lastViewedAt: link.lastViewedAt ? link.lastViewedAt.toISOString() : null,
    createdAt: link.createdAt.toISOString(),
    createdBy: {
      id: link.createdBy.id,
      name: link.createdBy.name,
      username: link.createdBy.username,
    },
  }));
}

/**
 * Step 7.6: Immediately revoke a share link (`DELETE /api/v1/shares/:id`).
 * Requires `workspace.share` on the owning workspace.
 */
export async function revokeShareLink(actor: Actor, shareId: string) {
  const link = await db.shareLink.findUnique({
    where: { id: shareId },
    select: {
      id: true,
      workspaceId: true,
      scope: true,
      responseId: true,
      tokenPrefix: true,
      revokedAt: true,
    },
  });

  if (!link) {
    throw Errors.notFound("ShareLink");
  }

  const { ws } = await requireWorkspace(actor, link.workspaceId, "workspace.share");

  // Already revoked: idempotent no-op (no second update, no duplicate activity entry)
  if (link.revokedAt) {
    return {
      id: link.id,
      revokedAt: link.revokedAt.toISOString(),
      status: "REVOKED" as ShareLinkStatus,
    };
  }

  const updated = await db.shareLink.update({
    where: { id: shareId },
    data: { revokedAt: new Date() },
    select: { id: true, revokedAt: true },
  });

  await logActivity(db, {
    workspaceId: ws.id,
    projectId: ws.projectId ?? null,
    actorId: actor.userId,
    action: "share.revoked",
    targetType: "ShareLink",
    targetId: link.id,
    meta: {
      scope: link.scope,
      responseId: link.responseId,
      tokenPrefix: link.tokenPrefix,
    },
  });

  return {
    id: updated.id,
    revokedAt: (updated.revokedAt ?? new Date()).toISOString(),
    status: "REVOKED" as ShareLinkStatus,
  };
}

export interface PublicShareAttachmentDto {
  id: string;
  kind: string;
  originalName: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  signedUrl: string;
}

export interface PublicShareCitationDto {
  id: string;
  index: number;
  source: string;
  title: string;
  url: string;
  snippet: string | null;
}

export interface PublicShareResponseDto {
  id: string;
  prompt: string;
  kind: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
  citations: PublicShareCitationDto[];
  attachments: PublicShareAttachmentDto[];
  generatedDocuments: PublicShareAttachmentDto[];
}

export interface PublicSharePayloadDto {
  scope: "WORKSPACE" | "RESPONSE";
  title: string;
  authorName: string | null;
  createdAt: string;
  responses: PublicShareResponseDto[];
}

async function signAttachmentForPublicShare(att: {
  id: string;
  kind: string;
  originalName: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  providerId: string;
  resourceType: string;
}): Promise<PublicShareAttachmentDto> {
  const storage = getStorageProvider();
  let signedUrl: string;
  if (
    att.providerId.startsWith("http://") ||
    att.providerId.startsWith("https://")
  ) {
    signedUrl = att.providerId;
  } else {
    signedUrl = await storage.privateUrl(att.providerId, {
      resourceType: (att.resourceType as StorageResourceType) || "image",
      expiresInSeconds: 300,
      format: ALLOWED_MIME_TYPES[att.mime]?.format,
    });
  }

  return {
    id: att.id,
    kind: att.kind,
    originalName: att.originalName,
    mime: att.mime,
    bytes: att.bytes,
    width: att.width ?? null,
    height: att.height ?? null,
    signedUrl,
  };
}

const attachmentSignSelect = {
  id: true,
  kind: true,
  originalName: true,
  mime: true,
  bytes: true,
  width: true,
  height: true,
  providerId: true,
  resourceType: true,
} as const;

function isDirectUrl(val: string): boolean {
  return (
    val.startsWith("http://") ||
    val.startsWith("https://") ||
    val.startsWith("data:image/")
  );
}

/**
 * Step 7.6: Resolve a public share token into a strictly minimal public representation.
 *
 * Security & Privacy guarantees:
 * 1. Hash token -> lookup; invalid / revoked / expired / soft-deleted workspace or response -> identical generic 404.
 * 2. Load minimal public representation:
 *    - Workspace title (for WORKSPACE scope) or "Shared response" (for RESPONSE scope)
 *    - Prompts + displayed version content (ORIGINAL or EDITED_IF_AVAILABLE)
 *    - Citations + attachments of ONLY the included responses as short-lived signed URLs generated per request
 *    - Author name ONLY if `showAuthor === true`
 * 3. NEVER include: annotations/comments/questions, members, credits, activity,
 *    other responses (RESPONSE scope only queries the single response), edit history, model/prompt internals.
 * 4. Increments `viewCount` and updates `lastViewedAt`.
 */
export async function resolvePublicShareByToken(
  rawToken: string
): Promise<PublicSharePayloadDto> {
  const trimmed = (rawToken || "").trim();
  if (!trimmed || trimmed.length < 10) {
    throw Errors.notFound("ShareLink");
  }

  const tokenHash = hashShareToken(trimmed);

  const share = await db.shareLink.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      workspaceId: true,
      responseId: true,
      scope: true,
      view: true,
      showAuthor: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      workspace: {
        select: {
          id: true,
          title: true,
          deletedAt: true,
          owner: {
            select: {
              name: true,
              username: true,
            },
          },
        },
      },
    },
  });

  if (!share || !share.workspace || share.workspace.deletedAt) {
    throw Errors.notFound("ShareLink");
  }

  const now = new Date();
  if (share.revokedAt) {
    throw Errors.notFound("ShareLink");
  }
  if (share.expiresAt && share.expiresAt.getTime() <= now.getTime()) {
    throw Errors.notFound("ShareLink");
  }

  // Strictly scope the response query: RESPONSE scope must NOT query sibling responses
  if (share.scope === "RESPONSE" && !share.responseId) {
    throw Errors.notFound("ShareLink");
  }

  const responseWhere =
    share.scope === "RESPONSE"
      ? {
          id: share.responseId as string,
          workspaceId: share.workspaceId,
          deletedAt: null,
        }
      : {
          workspaceId: share.workspaceId,
          deletedAt: null,
        };

  const rawResponses = await db.response.findMany({
    where: responseWhere,
    orderBy: [{ sortAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      prompt: true,
      kind: true,
      activeVersionId: true,
      createdAt: true,
      // Fallback when activeVersionId is unset: only the latest version's id
      versions: {
        orderBy: { number: "desc" },
        take: 1,
        select: { id: true },
      },
      attachments: {
        where: {
          deletedAt: null,
          status: "READY",
        },
        select: attachmentSignSelect,
      },
    },
  });

  if (share.scope === "RESPONSE" && rawResponses.length === 0) {
    throw Errors.notFound("ShareLink");
  }

  // Load ONLY the displayed version of each response (not its whole history)
  const displayedVersionIdByResponse = new Map<string, string>();
  for (const r of rawResponses) {
    const vid = r.activeVersionId ?? r.versions[0]?.id;
    if (vid) displayedVersionIdByResponse.set(r.id, vid);
  }
  const displayedVersionIds = [...displayedVersionIdByResponse.values()];

  const versions = displayedVersionIds.length
    ? await db.responseVersion.findMany({
        where: {
          id: { in: displayedVersionIds },
          responseId: { in: rawResponses.map((r) => r.id) },
        },
        select: {
          id: true,
          content: true,
          edits: {
            orderBy: { revision: "desc" },
            take: 1,
            select: { content: true },
          },
          citations: {
            orderBy: { index: "asc" },
            select: {
              id: true,
              index: true,
              source: true,
              title: true,
              url: true,
              snippet: true,
            },
          },
        },
      })
    : [];
  const versionById = new Map(versions.map((v) => [v.id, v]));

  const displayedContentByResponse = new Map<string, string>();
  for (const r of rawResponses) {
    const vid = displayedVersionIdByResponse.get(r.id);
    const ver = vid ? versionById.get(vid) : undefined;
    const originalContent = ver?.content ?? "";
    const latestEditContent = ver?.edits?.[0]?.content ?? null;
    displayedContentByResponse.set(
      r.id,
      share.view === "ORIGINAL"
        ? originalContent
        : latestEditContent ?? originalContent
    );
  }

  // IMAGE responses store an attachment id as content: resolve them in one query
  const imageAttachmentIds = rawResponses
    .filter((r) => r.kind === "IMAGE")
    .map((r) => displayedContentByResponse.get(r.id) ?? "")
    .filter((c) => c && !isDirectUrl(c));
  const imageAttachments = imageAttachmentIds.length
    ? await db.attachment.findMany({
        where: {
          id: { in: imageAttachmentIds },
          workspaceId: share.workspaceId,
          status: "READY",
          deletedAt: null,
        },
        select: attachmentSignSelect,
      })
    : [];
  const imageAttachmentById = new Map(imageAttachments.map((a) => [a.id, a]));

  // Increment viewCount and update lastViewedAt
  await db.shareLink.update({
    where: { id: share.id },
    data: {
      viewCount: { increment: 1 },
      lastViewedAt: now,
    },
  });

  const serializedResponses: PublicShareResponseDto[] = await Promise.all(
    rawResponses.map(async (r) => {
      const vid = displayedVersionIdByResponse.get(r.id);
      const ver = vid ? versionById.get(vid) : undefined;
      const displayedContent = displayedContentByResponse.get(r.id) ?? "";

      let imageUrl: string | null = null;
      if (r.kind === "IMAGE" && displayedContent) {
        if (isDirectUrl(displayedContent)) {
          imageUrl = displayedContent;
        } else {
          const imgAtt = imageAttachmentById.get(displayedContent);
          if (imgAtt) {
            imageUrl = (await signAttachmentForPublicShare(imgAtt)).signedUrl;
          }
        }
      }

      const signed = await Promise.all(
        r.attachments.map(async (att) => ({
          kind: att.kind,
          dto: await signAttachmentForPublicShare(att),
        }))
      );
      const promptAttachments = signed
        .filter((x) => x.kind !== "GENERATED_DOCUMENT")
        .map((x) => x.dto);
      const generatedDocuments = signed
        .filter((x) => x.kind === "GENERATED_DOCUMENT")
        .map((x) => x.dto);

      const citations: PublicShareCitationDto[] = (ver?.citations ?? []).map(
        (c) => ({
          id: c.id,
          index: c.index,
          source: c.source,
          title: c.title || c.url,
          url: c.url,
          snippet: c.snippet ?? null,
        })
      );

      return {
        id: r.id,
        prompt: r.prompt,
        kind: r.kind,
        content: r.kind === "IMAGE" && imageUrl ? imageUrl : displayedContent,
        imageUrl,
        createdAt: r.createdAt.toISOString(),
        citations,
        attachments: promptAttachments,
        generatedDocuments,
      };
    })
  );

  const authorName = share.showAuthor
    ? share.workspace.owner.name ||
      (share.workspace.owner.username ? `@${share.workspace.owner.username}` : null)
    : null;

  return {
    scope: share.scope,
    title:
      share.scope === "WORKSPACE"
        ? share.workspace.title || "Untitled Workspace"
        : "Shared response",
    authorName,
    createdAt: share.createdAt.toISOString(),
    responses: serializedResponses,
  };
}
