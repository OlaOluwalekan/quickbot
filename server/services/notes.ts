import "server-only";

import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { requireWorkspace } from "@/server/authz/access";
import { logActivity } from "@/server/services/activity";
import { selectNotesWithinBudget } from "@/server/ai/notes";
import { assertCanCreateKlecxNote } from "@/server/services/mentions";
import type { Actor } from "@/server/auth/session";
import type { NoteStatus } from "@/server/db/generated/client";

/**
 * Lists the Klecx notes of a workspace (newest first).
 * `canManage` says whether the caller may archive / restore / delete a note
 * (its author, or a workspace admin). `overBudget` is true when the oldest
 * active notes no longer fit into the prompt.
 */
export async function listWorkspaceNotes(
  actor: Actor,
  workspaceId: string,
  status?: NoteStatus
) {
  const { role, capabilities } = await requireWorkspace(
    actor,
    workspaceId,
    "workspace.read"
  );
  const isAdmin = role === "ADMIN" || role === "OWNER";
  const canComment = capabilities.has("workspace.comment");

  const all = await db.workspaceNote.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      annotationId: true,
      quote: true,
      instruction: true,
      status: true,
      createdAt: true,
      archivedAt: true,
      createdById: true,
    },
  });

  const active = all.filter((n) => n.status === "ACTIVE");
  const overBudget = selectNotesWithinBudget(active).length < active.length;
  const notes = status ? all.filter((n) => n.status === status) : all;

  // No email here: every workspace reader can open this list.
  const authors = await db.user.findMany({
    where: { id: { in: Array.from(new Set(notes.map((n) => n.createdById))) } },
    select: { id: true, name: true, username: true, image: true },
  });
  const authorMap = new Map(authors.map((a) => [a.id, a]));

  return {
    overBudget,
    notes: notes.map((n) => {
      const author = authorMap.get(n.createdById);
      return {
        id: n.id,
        annotationId: n.annotationId,
        quote: n.quote,
        instruction: n.instruction,
        status: n.status,
        createdAt: n.createdAt.toISOString(),
        archivedAt: n.archivedAt ? n.archivedAt.toISOString() : null,
        author: {
          name: author?.name ?? null,
          username: author?.username ?? null,
          image: author?.image ?? null,
        },
        canManage: isAdmin || (canComment && n.createdById === actor.userId),
      };
    }),
  };
}

/**
 * Loads a note and checks the caller may manage it: a workspace admin, or the
 * note's author while they can still comment (a suspended or downgraded
 * author is read-only). Someone outside the workspace gets 404.
 */
async function requireManageableNote(actor: Actor, noteId: string) {
  const note = await db.workspaceNote.findUnique({
    where: { id: noteId },
    include: { annotation: { select: { deletedAt: true } } },
  });

  // A note of a deleted account is gone for everyone.
  if (!note || note.deletedAt !== null) {
    throw Errors.notFound("Note");
  }

  const access = await requireWorkspace(
    actor,
    note.workspaceId,
    "workspace.read"
  );

  const isAdmin = access.role === "ADMIN" || access.role === "OWNER";
  const isAuthor = note.createdById === actor.userId;

  if (!isAdmin && !(isAuthor && access.capabilities.has("workspace.comment"))) {
    throw Errors.forbidden();
  }

  return { note, access };
}

export async function updateWorkspaceNoteStatus(
  actor: Actor,
  noteId: string,
  status: NoteStatus
) {
  const { note, access } = await requireManageableNote(actor, noteId);

  if (status === "ACTIVE") {
    // Restoring puts the instruction back into every prompt, so it needs the
    // same right as recording it; a deleted comment can't steer answers.
    assertCanCreateKlecxNote(access.capabilities);
    if (note.annotation.deletedAt) {
      throw Errors.conflict(
        "The comment of this note was deleted",
        "note_annotation_deleted"
      );
    }
  }

  const updated = await db.workspaceNote.update({
    where: { id: noteId },
    data: {
      status,
      archivedAt: status === "ARCHIVED" ? new Date() : null,
    },
    select: { id: true, status: true, archivedAt: true },
  });

  if (note.status !== status) {
    await logActivity(db, {
      workspaceId: note.workspaceId,
      actorId: actor.userId,
      action: status === "ARCHIVED" ? "note.archived" : "note.restored",
      targetType: "note",
      targetId: note.id,
    });
  }

  return {
    id: updated.id,
    status: updated.status,
    archivedAt: updated.archivedAt ? updated.archivedAt.toISOString() : null,
  };
}

export async function deleteWorkspaceNote(actor: Actor, noteId: string) {
  const { note } = await requireManageableNote(actor, noteId);

  await db.workspaceNote.delete({ where: { id: noteId } });

  await logActivity(db, {
    workspaceId: note.workspaceId,
    actorId: actor.userId,
    action: "note.deleted",
    targetType: "note",
    targetId: note.id,
  });

  return { success: true };
}
