import "server-only";

import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { requireWorkspace } from "@/server/authz/access";
import { notify } from "@/server/services/notify";
import { logActivity } from "@/server/services/activity";
import type { Actor } from "@/server/auth/session";

/**
 * Regex matching valid usernames (3-30 chars, lowercase letter followed by letters/digits/underscores).
 * Same rules as usernames across the app.
 */
export const MENTION_RE = /(^|[\s(])@([a-z][a-z0-9_]{2,29})\b/g;

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
 * Resolves mentions from a given text inside a workspace.
 * Returns only the user IDs of active, non-suspended workspace members / project members / owner.
 * Also returns `klecx: true` if `@klecx` was mentioned.
 */
export async function resolveMentions(
  workspaceId: string,
  text: string
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

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      ownerId: true,
      projectId: true,
    },
  });

  if (!workspace) {
    return { userIds: [], klecx };
  }

  const lowerUsernames = Array.from(handles);
  const candidateUsers = await db.user.findMany({
    where: {
      username: { in: lowerUsernames, mode: "insensitive" },
    },
    select: {
      id: true,
      username: true,
      workspaceMemberships: {
        where: { workspaceId: workspace.id, suspendedAt: null },
        select: { userId: true },
      },
      projectMemberships: workspace.projectId
        ? {
            where: { projectId: workspace.projectId, suspendedAt: null },
            select: { userId: true },
          }
        : false,
    },
  });

  const validUserIds: string[] = [];
  for (const u of candidateUsers) {
    const isOwner = u.id === workspace.ownerId;
    const isDirectMember = u.workspaceMemberships.length > 0;
    const isProjectMember = Boolean(
      u.projectMemberships && u.projectMemberships.length > 0
    );

    if (isOwner || isDirectMember || isProjectMember) {
      validUserIds.push(u.id);
    }
  }

  return {
    userIds: Array.from(new Set(validUserIds)),
    klecx,
  };
}

export interface SyncMentionsOptions {
  workspaceId: string;
  annotationId: string;
  messageId: string;
  text: string;
  anchorExact: string;
  actor: Actor;
  currentVisibility: "PRIVATE" | "WORKSPACE";
  isNewMessage?: boolean;
}

/**
 * Synchronizes mentions, notifications, and Klecx notes for an annotation message.
 * Called inside createAnnotation, createAnnotationMessage, and updateAnnotation.
 */
export async function syncMentionsAndNotes(
  options: SyncMentionsOptions
): Promise<{
  visibility: "PRIVATE" | "WORKSPACE";
  userIds: string[];
  klecx: boolean;
}> {
  const {
    workspaceId,
    annotationId,
    messageId,
    text,
    anchorExact,
    actor,
    currentVisibility,
    isNewMessage = true,
  } = options;

  const { userIds, klecx } = await resolveMentions(workspaceId, text);

  // If @klecx is present, verify permission
  if (klecx) {
    const { capabilities } = await requireWorkspace(
      actor,
      workspaceId,
      "workspace.read"
    );
    const canAskOrGenerate =
      capabilities.has("workspace.ask") ||
      capabilities.has("workspace.generate");

    if (!canAskOrGenerate) {
      throw Errors.forbidden(
        "klecx_note_forbidden",
        "klecx_note_forbidden"
      );
    }
  }

  // Force WORKSPACE visibility if @klecx is present or any member was mentioned
  let newVisibility = currentVisibility;
  if ((klecx || userIds.length > 0) && currentVisibility === "PRIVATE") {
    newVisibility = "WORKSPACE";
    await db.annotation.update({
      where: { id: annotationId },
      data: { visibility: "WORKSPACE" },
    });
  }

  // Sync AnnotationMention rows
  const existingMentions = await db.annotationMention.findMany({
    where: { messageId },
  });

  const existingUserIds = new Set(
    existingMentions
      .map((m) => m.userId)
      .filter((id): id is string => Boolean(id))
  );
  const existingHasKlecx = existingMentions.some((m) => m.isKlecx);

  // Insert missing user mentions
  const newUserIdsToInsert = userIds.filter((id) => !existingUserIds.has(id));
  if (newUserIdsToInsert.length > 0) {
    await db.annotationMention.createMany({
      data: newUserIdsToInsert.map((userId) => ({
        messageId,
        userId,
        isKlecx: false,
      })),
      skipDuplicates: true,
    });
  }

  // Insert missing Klecx mention
  if (klecx && !existingHasKlecx) {
    await db.annotationMention.create({
      data: {
        messageId,
        userId: null,
        isKlecx: true,
      },
    });
  }

  // If updating, delete removed mentions
  if (!isNewMessage) {
    const desiredUserIds = new Set(userIds);
    const mentionsToDelete = existingMentions.filter((m) => {
      if (m.isKlecx && !klecx) return true;
      if (!m.isKlecx && m.userId && !desiredUserIds.has(m.userId)) return true;
      return false;
    });

    if (mentionsToDelete.length > 0) {
      await db.annotationMention.deleteMany({
        where: { id: { in: mentionsToDelete.map((m) => m.id) } },
      });
    }
  }

  // Handle WorkspaceNote
  if (klecx) {
    const instruction = extractInstructionFromKlecx(text);
    const existingNote = await db.workspaceNote.findUnique({
      where: { annotationId },
    });

    if (existingNote) {
      await db.workspaceNote.update({
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
      const newNote = await db.workspaceNote.create({
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

      await logActivity(db, {
        workspaceId,
        actorId: actor.userId,
        action: "note.created",
        targetType: "note",
        targetId: newNote.id,
        meta: { quote: anchorExact, instruction },
      });
    }
  } else if (!isNewMessage) {
    // If not a new message and @klecx was removed, archive the note
    await archiveNoteForAnnotation(annotationId);
  }

  // Send notifications for newly mentioned users (excluding the author)
  const targetUserIds = isNewMessage ? userIds : newUserIdsToInsert;
  const excerpt = text.length > 200 ? `${text.slice(0, 197)}...` : text;

  for (const targetUserId of targetUserIds) {
    if (targetUserId === actor.userId) continue;

    await notify(
      targetUserId,
      "MENTIONED",
      {
        workspaceId,
        annotationId,
        quote: anchorExact,
        excerpt,
        authorName: actor.name || "A member",
      },
      {
        dedupeKey: `mention:${messageId}:${targetUserId}`,
        email: true,
      }
    );
  }

  return {
    visibility: newVisibility,
    userIds,
    klecx,
  };
}

/**
 * Archives any active WorkspaceNote associated with an annotation (on delete, resolve, or note removal).
 */
export async function archiveNoteForAnnotation(
  annotationId: string
): Promise<void> {
  await db.workspaceNote.updateMany({
    where: {
      annotationId,
      status: "ACTIVE",
    },
    data: {
      status: "ARCHIVED",
      archivedAt: new Date(),
    },
  });
}
