import "server-only";

import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { requireWorkspace } from "@/server/authz/access";
import { logActivity } from "@/server/services/activity";
import type { Actor } from "@/server/auth/session";
import type { NoteStatus } from "@/server/db/generated/client";

export async function listWorkspaceNotes(
  actor: Actor,
  workspaceId: string,
  status?: NoteStatus
) {
  await requireWorkspace(actor, workspaceId, "workspace.read");

  const notes = await db.workspaceNote.findMany({
    where: {
      workspaceId,
      ...(status ? { status } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      annotation: {
        select: {
          id: true,
          anchorExact: true,
          versionId: true,
          responseId: true,
        },
      },
    },
  });

  // Fetch author details
  const authorIds = Array.from(new Set(notes.map((n) => n.createdById)));
  const authors = await db.user.findMany({
    where: { id: { in: authorIds } },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      image: true,
    },
  });
  const authorMap = new Map(authors.map((a) => [a.id, a]));

  return notes.map((n) => ({
    id: n.id,
    workspaceId: n.workspaceId,
    annotationId: n.annotationId,
    messageId: n.messageId,
    quote: n.quote,
    instruction: n.instruction,
    status: n.status,
    createdAt: n.createdAt.toISOString(),
    archivedAt: n.archivedAt ? n.archivedAt.toISOString() : null,
    createdById: n.createdById,
    author: authorMap.get(n.createdById) ?? {
      id: n.createdById,
      name: "Unknown",
      username: null,
      email: "",
      image: null,
    },
    annotation: n.annotation,
  }));
}

export async function updateWorkspaceNoteStatus(
  actor: Actor,
  noteId: string,
  status: NoteStatus
) {
  const note = await db.workspaceNote.findUnique({
    where: { id: noteId },
  });

  if (!note) {
    throw Errors.notFound("Note");
  }

  const { role } = await requireWorkspace(
    actor,
    note.workspaceId,
    "workspace.read"
  );

  const isAuthor = note.createdById === actor.userId;
  const isAdmin = role === "ADMIN" || role === "OWNER";

  if (!isAuthor && !isAdmin) {
    throw Errors.forbidden(
      "Only the author or workspace admin can modify this note"
    );
  }

  const updated = await db.workspaceNote.update({
    where: { id: noteId },
    data: {
      status,
      archivedAt: status === "ARCHIVED" ? new Date() : null,
    },
  });

  await logActivity(db, {
    workspaceId: note.workspaceId,
    actorId: actor.userId,
    action: status === "ARCHIVED" ? "note.archived" : "note.restored",
    targetType: "note",
    targetId: note.id,
    meta: { status },
  });

  return updated;
}

export async function deleteWorkspaceNote(actor: Actor, noteId: string) {
  const note = await db.workspaceNote.findUnique({
    where: { id: noteId },
  });

  if (!note) {
    throw Errors.notFound("Note");
  }

  const { role } = await requireWorkspace(
    actor,
    note.workspaceId,
    "workspace.read"
  );

  const isAuthor = note.createdById === actor.userId;
  const isAdmin = role === "ADMIN" || role === "OWNER";

  if (!isAuthor && !isAdmin) {
    throw Errors.forbidden(
      "Only the author or workspace admin can delete this note"
    );
  }

  await db.workspaceNote.delete({
    where: { id: noteId },
  });

  await logActivity(db, {
    workspaceId: note.workspaceId,
    actorId: actor.userId,
    action: "note.deleted",
    targetType: "note",
    targetId: note.id,
  });

  return { success: true };
}
