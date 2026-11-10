import "server-only";

import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { notify } from "@/server/services/notify";
import { logActivity } from "@/server/services/activity";
import type { Actor } from "@/server/auth/session";
import type { Permission } from "@/server/authz/permissions";
import type { Prisma } from "@/server/db/generated/client";

type DbOrTx = Prisma.TransactionClient | typeof db;

/**
 * Regex matching valid usernames (3-30 chars, lowercase letter followed by letters/digits/underscores).
 * Same rules as usernames across the app.
 */
export const MENTION_RE = /(^|[\s(])@([a-z][a-z0-9_]{2,29})\b/g;

const EXCERPT_MAX = 200;

/**
 * Strips the `@klecx` mention token and cleans up remaining whitespace.
 */
export function extractInstructionFromKlecx(text: string): string {
  return text
    .replace(/(^|[\s(])@klecx\b/gi, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * `@klecx` records a note that steers later answers, so it needs the right to
 * ask or generate. Everyone else can still mention people.
 */
export function assertCanCreateKlecxNote(capabilities: Set<Permission>): void {
  if (
    !capabilities.has("workspace.ask") &&
    !capabilities.has("workspace.generate")
  ) {
    throw Errors.forbidden(
      "You don't have permission to record Klecx notes",
      "klecx_note_forbidden"
    );
  }
}

/**
 * Resolves mentions from a given text inside a workspace.
 * Returns only the ids of people who are mentionable here (same set as
 * `listMentionables`): the workspace owner, the project owner, and
 * non-suspended workspace / project members. Unknown names stay plain text.
 * Also returns `klecx: true` if `@klecx` was mentioned.
 */
export async function resolveMentions(
  workspaceId: string,
  text: string,
  client: DbOrTx = db
): Promise<{ userIds: string[]; klecx: boolean }> {
  if (!text) {
    return { userIds: [], klecx: false };
  }

  const handles = new Set<string>();
  const re = new RegExp(MENTION_RE.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const handle = match[2];
    if (handle) {
      handles.add(handle.toLowerCase());
    }
  }

  const klecx = handles.has("klecx");
  handles.delete("klecx");

  if (handles.size === 0) {
    return { userIds: [], klecx };
  }

  const workspace = await client.workspace.findFirst({
    where: { id: workspaceId, deletedAt: null },
    select: {
      id: true,
      ownerId: true,
      projectId: true,
      project: { select: { ownerId: true, deletedAt: true } },
    },
  });

  if (!workspace) {
    return { userIds: [], klecx };
  }

  const project =
    workspace.projectId && workspace.project && !workspace.project.deletedAt
      ? { id: workspace.projectId, ownerId: workspace.project.ownerId }
      : null;

  const candidateUsers = await client.user.findMany({
    where: {
      username: { in: Array.from(handles), mode: "insensitive" },
    },
    select: {
      id: true,
      workspaceMemberships: {
        where: { workspaceId: workspace.id, suspendedAt: null },
        select: { userId: true },
      },
      projectMemberships: project
        ? {
            where: { projectId: project.id, suspendedAt: null },
            select: { userId: true },
          }
        : false,
    },
  });

  const validUserIds = new Set<string>();
  for (const u of candidateUsers) {
    const isOwner = u.id === workspace.ownerId || u.id === project?.ownerId;
    const isDirectMember = u.workspaceMemberships.length > 0;
    const isProjectMember = Boolean(
      u.projectMemberships && u.projectMemberships.length > 0
    );

    if (isOwner || isDirectMember || isProjectMember) {
      validUserIds.add(u.id);
    }
  }

  return { userIds: Array.from(validUserIds), klecx };
}

export interface SyncMentionsOptions {
  workspaceId: string;
  annotationId: string;
  messageId: string;
  text: string;
  anchorExact: string;
  actor: Actor;
  capabilities: Set<Permission>;
  currentVisibility: "PRIVATE" | "WORKSPACE";
  /**
   * False when the annotation sits inside a private thread: it quotes a
   * private answer, so it can't become visible to the workspace. People
   * can't open it, so `@user` stays plain text there; `@klecx` still records
   * a note.
   */
  canShare: boolean;
  isNewMessage: boolean;
}

export interface SyncMentionsResult {
  visibility: "PRIVATE" | "WORKSPACE";
  userIds: string[];
  klecx: boolean;
  /** Pass to `sendMentionNotifications` after the transaction commits. */
  pendingNotifications: {
    workspaceId: string;
    annotationId: string;
    messageId: string;
    quote: string;
    excerpt: string;
    authorName: string;
    href: string;
    userIds: string[];
  };
}

/**
 * Synchronizes mention rows, visibility and the Klecx note for one annotation
 * message. Runs on the caller's transaction, so the message, its mentions and
 * its note are saved together or not at all. It does not send anything:
 * call `sendMentionNotifications(result.pendingNotifications)` after commit.
 */
export async function syncMentionsAndNotes(
  tx: DbOrTx,
  options: SyncMentionsOptions
): Promise<SyncMentionsResult> {
  const {
    workspaceId,
    annotationId,
    messageId,
    text,
    anchorExact,
    actor,
    capabilities,
    currentVisibility,
    canShare,
    isNewMessage,
  } = options;

  const resolved = await resolveMentions(workspaceId, text, tx);
  const klecx = resolved.klecx;
  const userIds = canShare ? resolved.userIds : [];

  if (klecx) {
    assertCanCreateKlecxNote(capabilities);
  }

  // A mention makes the comment visible to the workspace (the client warned).
  let visibility = currentVisibility;
  if (
    canShare &&
    (klecx || userIds.length > 0) &&
    currentVisibility === "PRIVATE"
  ) {
    visibility = "WORKSPACE";
    await tx.annotation.update({
      where: { id: annotationId },
      data: { visibility: "WORKSPACE" },
    });
  }

  const existingMentions = isNewMessage
    ? []
    : await tx.annotationMention.findMany({ where: { messageId } });

  const existingUserIds = new Set(
    existingMentions
      .map((m) => m.userId)
      .filter((id): id is string => Boolean(id))
  );
  const existingHasKlecx = existingMentions.some((m) => m.isKlecx);

  const newUserIds = userIds.filter((id) => !existingUserIds.has(id));
  if (newUserIds.length > 0) {
    await tx.annotationMention.createMany({
      data: newUserIds.map((userId) => ({ messageId, userId, isKlecx: false })),
      skipDuplicates: true,
    });
  }

  if (klecx && !existingHasKlecx) {
    await tx.annotationMention.create({
      data: { messageId, userId: null, isKlecx: true },
    });
  }

  // On edit, drop the mentions that are no longer in the text.
  const desiredUserIds = new Set(userIds);
  const staleIds = existingMentions
    .filter((m) =>
      m.isKlecx ? !klecx : Boolean(m.userId && !desiredUserIds.has(m.userId))
    )
    .map((m) => m.id);
  if (staleIds.length > 0) {
    await tx.annotationMention.deleteMany({ where: { id: { in: staleIds } } });
  }

  if (klecx) {
    const instruction = extractInstructionFromKlecx(text);
    const existingNote = await tx.workspaceNote.findUnique({
      where: { annotationId },
      select: { id: true },
    });

    if (existingNote) {
      // One note per annotation: the latest @klecx message replaces it.
      await tx.workspaceNote.update({
        where: { id: existingNote.id },
        data: {
          messageId,
          quote: anchorExact,
          instruction,
          status: "ACTIVE",
          archivedAt: null,
        },
      });
    } else {
      const note = await tx.workspaceNote.create({
        data: {
          workspaceId,
          annotationId,
          messageId,
          createdById: actor.userId,
          quote: anchorExact,
          instruction,
          status: "ACTIVE",
        },
      });

      // No note text in the activity log (rule: no user content in logs).
      await logActivity(tx, {
        workspaceId,
        actorId: actor.userId,
        action: "note.created",
        targetType: "note",
        targetId: note.id,
      });
    }
  } else if (existingHasKlecx) {
    // `@klecx` was removed from the message that recorded the note.
    await tx.workspaceNote.updateMany({
      where: { annotationId, messageId, status: "ACTIVE" },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
  }

  return {
    visibility,
    userIds,
    klecx,
    pendingNotifications: {
      workspaceId,
      annotationId,
      messageId,
      quote: anchorExact,
      excerpt:
        text.length > EXCERPT_MAX
          ? `${text.slice(0, EXCERPT_MAX - 1)}…`
          : text,
      authorName: actor.name ?? "",
      href: `/workspaces/${workspaceId}`,
      // New messages notify everyone mentioned; edits only the newly added.
      userIds: newUserIds.filter((id) => id !== actor.userId),
    },
  };
}

/**
 * Sends the MENTIONED notifications collected by `syncMentionsAndNotes`.
 * Call it after the transaction commits. A failed notification never fails
 * the comment that was already saved.
 */
export async function sendMentionNotifications(
  pending: SyncMentionsResult["pendingNotifications"]
): Promise<void> {
  const { userIds, messageId, ...payload } = pending;
  for (const userId of userIds) {
    try {
      await notify(userId, "MENTIONED", payload, {
        dedupeKey: `mention:${messageId}:${userId}`,
        email: true,
      });
    } catch (err) {
      console.error(
        "[mentions] notification failed:",
        err instanceof Error ? err.name : "unknown"
      );
    }
  }
}

/**
 * Archives the active WorkspaceNote of an annotation (on delete, resolve, or
 * when the annotation becomes private).
 */
export async function archiveNoteForAnnotation(
  annotationId: string,
  client: DbOrTx = db
): Promise<void> {
  await client.workspaceNote.updateMany({
    where: { annotationId, status: "ACTIVE" },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
}
