/**
 * @jest-environment node
 */

import crypto from "node:crypto";
import { db } from "@/server/db/client";
import {
  createAnnotation,
  createAnnotationOnMessage,
  createAnnotationMessage,
  deleteAnnotation,
  updateAnnotation,
} from "@/server/services/annotation";
import { loadActiveNotes } from "@/server/ai/notes";
import { buildContext } from "@/server/ai/context-builder";
import {
  listWorkspaceNotes,
  updateWorkspaceNoteStatus,
  deleteWorkspaceNote,
} from "@/server/services/notes";
import type { Actor } from "@/server/auth/session";

import { Resend } from "resend";
jest.mock("resend");

(Resend as unknown as jest.Mock).mockImplementation(() => ({
  emails: {
    send: jest.fn().mockResolvedValue({
      data: { id: "resend_mock_123" },
      error: null,
    }),
  },
}));

describe("Fix F2.3 — Mentions, notifications and Klecx notes in the AI context", () => {
  let owner: { id: string; email: string; username: string | null };
  let memberCanAsk: { id: string; email: string; username: string | null };
  let memberCommentOnly: { id: string; email: string; username: string | null };
  let workspace: { id: string };

  let ownerActor: Actor;
  let memberCanAskActor: Actor;
  let commentOnlyActor: Actor;

  let versionId: string;
  let responseId: string;

  beforeAll(async () => {
    const timestamp = Date.now();

    // 1. Create users
    owner = await db.user.create({
      data: {
        id: crypto.randomUUID(),
        email: `f23-owner-${timestamp}@example.com`,
        name: "F23 Owner",
        username: `f23owner_${timestamp}`,
      },
    });

    memberCanAsk = await db.user.create({
      data: {
        id: crypto.randomUUID(),
        email: `f23-ask-${timestamp}@example.com`,
        name: "Ask Member",
        username: `f23ask_${timestamp}`,
      },
    });

    memberCommentOnly = await db.user.create({
      data: {
        id: crypto.randomUUID(),
        email: `f23-commentonly-${timestamp}@example.com`,
        name: "Commenter Only",
        username: `f23comment_${timestamp}`,
      },
    });

    ownerActor = {
      userId: owner.id,
      email: owner.email,
      role: "USER",
      sessionId: `sess_f23_owner_${timestamp}`,
    };

    memberCanAskActor = {
      userId: memberCanAsk.id,
      email: memberCanAsk.email,
      role: "USER",
      sessionId: `sess_f23_ask_${timestamp}`,
    };

    commentOnlyActor = {
      userId: memberCommentOnly.id,
      email: memberCommentOnly.email,
      role: "USER",
      sessionId: `sess_f23_comment_${timestamp}`,
    };

    // 2. Create workspace with memberships
    workspace = await db.workspace.create({
      data: {
        title: "F2.3 Workspace",
        ownerId: owner.id,
        members: {
          create: [
            {
              userId: memberCanAsk.id,
              role: "EDITOR",
              canComment: true,
              canAsk: true,
              invitedById: owner.id,
            },
            {
              userId: memberCommentOnly.id,
              role: "VIEWER",
              canComment: true,
              canAsk: false,
              invitedById: owner.id,
            },
          ],
        },
      },
    });

    // 3. Create response and response version with anchor text
    const response = await db.response.create({
      data: {
        workspaceId: workspace.id,
        createdById: owner.id,
        prompt: "Describe our architecture",
      },
    });
    responseId = response.id;

    const version = await db.responseVersion.create({
      data: {
        responseId: response.id,
        number: 1,
        content: "Our app connects to a MongoDB database for persistence and fast reads.",
        modelKey: "text-standard",
        providerModelId: "gemini-pro",
        promptVersion: "1",
        createdById: owner.id,
      },
    });
    versionId = version.id;
  });

  afterAll(async () => {
    await db.annotationMention.deleteMany({
      where: { message: { annotation: { workspaceId: workspace.id } } },
    });
    await db.workspaceNote.deleteMany({ where: { workspaceId: workspace.id } });
    await db.annotationMessage.deleteMany({
      where: { annotation: { workspaceId: workspace.id } },
    });
    await db.annotation.deleteMany({ where: { workspaceId: workspace.id } });
    await db.generation.deleteMany({ where: { workspaceId: workspace.id } });
    await db.notification.deleteMany({
      where: { userId: { in: [owner.id, memberCanAsk.id, memberCommentOnly.id] } },
    });
    await db.activityLog.deleteMany({ where: { workspaceId: workspace.id } });
    await db.responseVersion.deleteMany({ where: { response: { workspaceId: workspace.id } } });
    await db.response.deleteMany({ where: { workspaceId: workspace.id } });
    await db.workspaceMember.deleteMany({ where: { workspaceId: workspace.id } });
    await db.workspace.delete({ where: { id: workspace.id } });
    await db.user.deleteMany({
      where: { id: { in: [owner.id, memberCanAsk.id, memberCommentOnly.id] } },
    });
  });

  describe("1. @klecx Note Creation & AI Context Injection", () => {
    let createdAnnotId: string;
    let createdNoteId: string;

    it("creates note '@klecx use PostgreSQL instead' on 'MongoDB database' and forces WORKSPACE visibility", async () => {
      const annot = await createAnnotation(memberCanAskActor, versionId, {
        kind: "COMMENT",
        visibility: "PRIVATE", // requested private, but mentions @klecx
        anchor: { exact: "MongoDB database", prefix: "", suffix: "" },
        text: "@klecx use PostgreSQL instead",
      });

      createdAnnotId = annot.id;
      expect(annot.visibility).toBe("WORKSPACE");

      // Verify WorkspaceNote created
      const note = await db.workspaceNote.findUnique({
        where: { annotationId: annot.id },
      });
      expect(note).not.toBeNull();
      expect(note?.quote).toBe("MongoDB database");
      expect(note?.instruction).toBe("use PostgreSQL instead");
      expect(note?.status).toBe("ACTIVE");
      createdNoteId = note!.id;

      // Verify AnnotationMention created with isKlecx: true
      const mention = await db.annotationMention.findFirst({
        where: { message: { annotationId: annot.id } },
      });
      expect(mention).not.toBeNull();
      expect(mention?.isKlecx).toBe(true);
      expect(mention?.userId).toBeNull();

      // Verify ActivityLog
      const activity = await db.activityLog.findFirst({
        where: { workspaceId: workspace.id, action: "note.created" },
      });
      expect(activity).not.toBeNull();
    });

    it("includes note in loadActiveNotes() and buildContext() system text", async () => {
      const notesText = await loadActiveNotes(workspace.id);
      expect(notesText).not.toBeNull();
      expect(notesText).toContain("Workspace notes from the user");
      expect(notesText).toContain("1. About «MongoDB database»: use PostgreSQL instead");

      const ctx = await buildContext({
        workspaceId: workspace.id,
        modelKey: "text-standard",
        newPrompt: "What database do we use?",
        language: "en",
      });
      expect(ctx.system).toContain("1. About «MongoDB database»: use PostgreSQL instead");
    });

    it("archiving the note removes it from loadActiveNotes() and buildContext()", async () => {
      // Archive note
      await updateWorkspaceNoteStatus(memberCanAskActor, createdNoteId, "ARCHIVED");

      const notesText = await loadActiveNotes(workspace.id);
      expect(notesText).toBeNull();

      const ctx = await buildContext({
        workspaceId: workspace.id,
        modelKey: "text-standard",
        newPrompt: "What database do we use?",
        language: "en",
      });
      expect(ctx.system).not.toContain("About «MongoDB database»");

      // Restore note
      await updateWorkspaceNoteStatus(memberCanAskActor, createdNoteId, "ACTIVE");
      const restoredNotesText = await loadActiveNotes(workspace.id);
      expect(restoredNotesText).toContain("1. About «MongoDB database»: use PostgreSQL instead");
    });

    it("resolving the annotation archives the note", async () => {
      await updateAnnotation(memberCanAskActor, createdAnnotId, {
        resolved: true,
      });

      const note = await db.workspaceNote.findUnique({
        where: { id: createdNoteId },
      });
      expect(note?.status).toBe("ARCHIVED");
      expect(note?.archivedAt).not.toBeNull();

      const notesText = await loadActiveNotes(workspace.id);
      expect(notesText).toBeNull();
    });
  });

  describe("2. Permissions & 403 on @klecx Notes", () => {
    it("rejects @klecx note creation with 403 klecx_note_forbidden if user lacks workspace.ask/generate", async () => {
      await expect(
        createAnnotation(commentOnlyActor, versionId, {
          kind: "COMMENT",
          anchor: { exact: "MongoDB database", prefix: "", suffix: "" },
          text: "@klecx remember to cache responses",
        })
      ).rejects.toMatchObject({
        status: 403,
        code: "klecx_note_forbidden",
      });

      // Nothing is saved when the note is refused (one transaction).
      const leftover = await db.annotation.count({
        where: { workspaceId: workspace.id, createdById: memberCommentOnly.id },
      });
      expect(leftover).toBe(0);
    });

    it("allows commenter without ask/generate to mention workspace members", async () => {
      const annot = await createAnnotation(commentOnlyActor, versionId, {
        kind: "COMMENT",
        anchor: { exact: "MongoDB database", prefix: "", suffix: "" },
        text: `Hey @${owner.username} please review this configuration`,
      });

      expect(annot.id).toBeDefined();

      const mention = await db.annotationMention.findFirst({
        where: { message: { annotationId: annot.id } },
      });
      expect(mention).not.toBeNull();
      expect(mention?.userId).toBe(owner.id);
      expect(mention?.isKlecx).toBe(false);
    });
  });

  describe("3. Member Mentions, Visibility Upgrades, and Deduplicated Notifications", () => {
    it("does not create mention or notification for non-members", async () => {
      const beforeNotifsCount = await db.notification.count({
        where: { type: "MENTIONED" },
      });

      const annot = await createAnnotation(ownerActor, versionId, {
        kind: "COMMENT",
        anchor: { exact: "persistence", prefix: "", suffix: "" },
        text: "Hey @nonexistent_user_123 please verify this line",
      });

      const mentions = await db.annotationMention.findMany({
        where: { message: { annotationId: annot.id } },
      });
      expect(mentions).toHaveLength(0);

      const afterNotifsCount = await db.notification.count({
        where: { type: "MENTIONED" },
      });
      expect(afterNotifsCount).toBe(beforeNotifsCount);
    });

    it("creates mention, upgrades PRIVATE to WORKSPACE, and creates deduplicated notification", async () => {
      const annot = await createAnnotation(ownerActor, versionId, {
        kind: "COMMENT",
        visibility: "PRIVATE",
        anchor: { exact: "fast reads", prefix: "", suffix: "" },
        text: `Check this out @${memberCanAsk.username}`,
      });

      expect(annot.visibility).toBe("WORKSPACE");

      const mention = await db.annotationMention.findFirst({
        where: { message: { annotationId: annot.id } },
      });
      expect(mention?.userId).toBe(memberCanAsk.id);

      const notif = await db.notification.findFirst({
        where: {
          userId: memberCanAsk.id,
          type: "MENTIONED",
        },
        orderBy: { createdAt: "desc" },
      });
      expect(notif).not.toBeNull();
      expect(notif?.dedupeKey).toContain(`mention:${annot.messages[0]?.id}:${memberCanAsk.id}`);
    });

    it("does not notify the author if the author mentions themself", async () => {
      const beforeNotif = await db.notification.findFirst({
        where: {
          userId: owner.id,
          type: "MENTIONED",
        },
      });

      await createAnnotation(ownerActor, versionId, {
        kind: "COMMENT",
        anchor: { exact: "fast reads", prefix: "", suffix: "" },
        text: `Notes for myself @${owner.username}`,
      });

      const afterNotif = await db.notification.findFirst({
        where: {
          userId: owner.id,
          type: "MENTIONED",
        },
      });
      expect(afterNotif?.id).toBe(beforeNotif?.id);
    });
  });

  describe("4. Notes Management API", () => {
    let noteId: string;

    beforeAll(async () => {
      const annot = await createAnnotation(ownerActor, versionId, {
        kind: "COMMENT",
        anchor: { exact: "fast reads", prefix: "", suffix: "" },
        text: "@klecx always use Redis for caching",
      });
      const note = await db.workspaceNote.findUnique({
        where: { annotationId: annot.id },
      });
      noteId = note!.id;
    });

    it("listWorkspaceNotes returns active notes without the author's email", async () => {
      const { notes, overBudget } = await listWorkspaceNotes(
        ownerActor,
        workspace.id,
        "ACTIVE"
      );
      const note = notes.find((n) => n.id === noteId);
      expect(note?.instruction).toBe("always use Redis for caching");
      expect(note?.author).toEqual({
        name: "F23 Owner",
        username: owner.username,
        image: null,
      });
      expect(note?.canManage).toBe(true);
      expect(overBudget).toBe(false);
      expect(JSON.stringify(notes)).not.toContain(owner.email);
    });

    it("someone outside the workspace gets 404 on list, update and delete", async () => {
      const outsider = await db.user.create({
        data: {
          id: crypto.randomUUID(),
          email: `f23-outsider-${Date.now()}@example.com`,
          name: "Outsider",
        },
      });
      const outsiderActor: Actor = {
        userId: outsider.id,
        email: outsider.email,
        role: "USER",
        sessionId: "sess_f23_outsider",
      };

      try {
        await expect(
          listWorkspaceNotes(outsiderActor, workspace.id)
        ).rejects.toMatchObject({ status: 404 });
        await expect(
          updateWorkspaceNoteStatus(outsiderActor, noteId, "ARCHIVED")
        ).rejects.toMatchObject({ status: 404 });
        await expect(
          deleteWorkspaceNote(outsiderActor, noteId)
        ).rejects.toMatchObject({ status: 404 });
      } finally {
        await db.user.delete({ where: { id: outsider.id } });
      }
    });

    it("a member who is neither the author nor an admin can't manage the note", async () => {
      const { notes } = await listWorkspaceNotes(memberCanAskActor, workspace.id);
      expect(notes.find((n) => n.id === noteId)?.canManage).toBe(false);

      await expect(
        updateWorkspaceNoteStatus(memberCanAskActor, noteId, "ARCHIVED")
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        deleteWorkspaceNote(memberCanAskActor, noteId)
      ).rejects.toMatchObject({ status: 403 });
    });

    it("updateWorkspaceNoteStatus archives the note", async () => {
      const updated = await updateWorkspaceNoteStatus(ownerActor, noteId, "ARCHIVED");
      expect(updated.status).toBe("ARCHIVED");
      expect(updated.archivedAt).not.toBeNull();

      const active = await listWorkspaceNotes(ownerActor, workspace.id, "ACTIVE");
      expect(active.notes.some((n) => n.id === noteId)).toBe(false);
    });

    it("a note can't be restored once its comment is deleted", async () => {
      const note = await db.workspaceNote.findUniqueOrThrow({ where: { id: noteId } });
      await deleteAnnotation(ownerActor, note.annotationId);

      await expect(
        updateWorkspaceNoteStatus(ownerActor, noteId, "ACTIVE")
      ).rejects.toMatchObject({ status: 409, code: "note_annotation_deleted" });
    });

    it("deleteWorkspaceNote removes the note", async () => {
      await deleteWorkspaceNote(ownerActor, noteId);
      const note = await db.workspaceNote.findUnique({
        where: { id: noteId },
      });
      expect(note).toBeNull();
    });
  });

  describe("5. Edits, replies and private threads", () => {
    it("removing @klecx from the comment archives its note; making it private does too", async () => {
      const annot = await createAnnotation(ownerActor, versionId, {
        kind: "COMMENT",
        anchor: { exact: "persistence", prefix: "", suffix: "" },
        text: "@klecx prefer managed storage",
      });

      await updateAnnotation(ownerActor, annot.id, { text: "prefer managed storage" });
      let note = await db.workspaceNote.findUniqueOrThrow({
        where: { annotationId: annot.id },
      });
      expect(note.status).toBe("ARCHIVED");

      await updateAnnotation(ownerActor, annot.id, {
        text: "@klecx prefer managed storage always",
      });
      note = await db.workspaceNote.findUniqueOrThrow({
        where: { annotationId: annot.id },
      });
      expect(note.status).toBe("ACTIVE");
      expect(note.instruction).toBe("prefer managed storage always");

      await updateAnnotation(ownerActor, annot.id, { visibility: "PRIVATE" });
      note = await db.workspaceNote.findUniqueOrThrow({
        where: { annotationId: annot.id },
      });
      expect(note.status).toBe("ARCHIVED");
    });

    it("a reply in a comment thread notifies the mentioned member once", async () => {
      const annot = await createAnnotation(ownerActor, versionId, {
        kind: "COMMENT",
        visibility: "WORKSPACE",
        anchor: { exact: "fast reads", prefix: "", suffix: "" },
        text: "Is this still true?",
      });

      const reply = await createAnnotationMessage(
        ownerActor,
        annot.id,
        `@${memberCanAsk.username} can you confirm?`
      );

      const rows = await db.notification.findMany({
        where: {
          userId: memberCanAsk.id,
          dedupeKey: `mention:${reply.id}:${memberCanAsk.id}`,
        },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.payload).toMatchObject({
        workspaceId: workspace.id,
        annotationId: annot.id,
        href: `/workspaces/${workspace.id}`,
      });
    });

    it("a comment inside a private thread stays private and notifies nobody", async () => {
      const ask = await db.annotation.create({
        data: {
          workspaceId: workspace.id,
          responseId,
          versionId,
          targetType: "RESPONSE_VERSION",
          createdById: memberCanAsk.id,
          kind: "ASK",
          visibility: "PRIVATE",
          anchorExact: "MongoDB database",
          anchorPrefix: "",
          anchorSuffix: "",
          messages: {
            create: [
              { role: "USER", content: "Why MongoDB?", authorId: memberCanAsk.id },
              { role: "ASSISTANT", content: "Because it stores flexible documents." },
            ],
          },
        },
        include: { messages: true },
      });
      const answer = ask.messages.find((m) => m.role === "ASSISTANT")!;

      const child = await createAnnotationOnMessage(memberCanAskActor, answer.id, {
        kind: "COMMENT",
        anchor: { exact: "flexible documents", prefix: "", suffix: "" },
        text: `@${owner.username} @klecx we need strict schemas`,
      });

      const saved = await db.annotation.findUniqueOrThrow({ where: { id: child.id } });
      expect(saved.visibility).toBe("PRIVATE");

      const userMentions = await db.annotationMention.count({
        where: { message: { annotationId: child.id }, isKlecx: false },
      });
      expect(userMentions).toBe(0);

      const notified = await db.notification.count({
        where: { userId: owner.id, payload: { path: ["annotationId"], equals: child.id } },
      });
      expect(notified).toBe(0);

      // The author still asked Klecx to remember it.
      const note = await db.workspaceNote.findUnique({ where: { annotationId: child.id } });
      expect(note?.status).toBe("ACTIVE");
    });
  });
});
