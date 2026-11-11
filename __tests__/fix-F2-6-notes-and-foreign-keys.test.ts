/**
 * @jest-environment node
 *
 * Fix F2.6 — server side of the indicators:
 * - the annotation lists carry each annotation's Klecx notes (id + status),
 *   so the gutter mark follows the note (an archived note has no mark);
 * - foreign keys on `workspace_notes.message_id`, `workspace_notes.created_by_id`
 *   and `annotations.root_annotation_id` (migration 20261111_annotation_foreign_keys).
 */

import crypto from "node:crypto";
import { db } from "@/server/db/client";
import {
  createAnnotation,
  createAnnotationMessage,
  createAnnotationOnMessage,
  listAnnotationsForMessage,
  listAnnotationsForResponse,
} from "@/server/services/annotation";
import {
  listWorkspaceNotes,
  updateWorkspaceNoteStatus,
} from "@/server/services/notes";
import type { Actor } from "@/server/auth/session";

import { Resend } from "resend";
jest.mock("resend");

(Resend as unknown as jest.Mock).mockImplementation(() => ({
  emails: {
    send: jest.fn().mockResolvedValue({ data: { id: "resend_mock" }, error: null }),
  },
}));

describe("Fix F2.6 — notes on annotation lists and annotation foreign keys", () => {
  const stamp = Date.now();
  const userIds: string[] = [];
  let ownerActor: Actor;
  let memberActor: Actor;
  let leaverActor: Actor;
  let outsiderActor: Actor;
  let workspaceId: string;
  let responseId: string;
  let versionId: string;

  async function makeUser(label: string): Promise<Actor> {
    const user = await db.user.create({
      data: {
        id: crypto.randomUUID(),
        email: `f26-${label}-${stamp}@example.com`,
        name: `F26 ${label}`,
        username: `f26${label}_${stamp}`,
      },
    });
    userIds.push(user.id);
    return {
      userId: user.id,
      email: user.email,
      role: "USER",
      sessionId: `sess_f26_${label}_${stamp}`,
    };
  }

  beforeAll(async () => {
    ownerActor = await makeUser("owner");
    memberActor = await makeUser("member");
    leaverActor = await makeUser("leaver");
    outsiderActor = await makeUser("outsider");

    const workspace = await db.workspace.create({
      data: {
        title: "F2.6 Workspace",
        ownerId: ownerActor.userId,
        members: {
          create: [memberActor, leaverActor].map((a) => ({
            userId: a.userId,
            role: "EDITOR" as const,
            canComment: true,
            canAsk: true,
            invitedById: ownerActor.userId,
          })),
        },
      },
    });
    workspaceId = workspace.id;

    const response = await db.response.create({
      data: {
        workspaceId,
        createdById: ownerActor.userId,
        prompt: "Describe our retry policy",
      },
    });
    responseId = response.id;

    const version = await db.responseVersion.create({
      data: {
        responseId,
        number: 1,
        content: "Requests are retried three times with idempotency keys and backoff.",
        modelKey: "text-standard",
        providerModelId: "provider-model",
        promptVersion: "1",
        createdById: ownerActor.userId,
      },
    });
    versionId = version.id;
  });

  afterAll(async () => {
    await db.annotationMention.deleteMany({
      where: { message: { annotation: { workspaceId } } },
    });
    await db.workspaceNote.deleteMany({ where: { workspaceId } });
    await db.annotationMessage.deleteMany({ where: { annotation: { workspaceId } } });
    await db.annotation.deleteMany({ where: { workspaceId } });
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    await db.activityLog.deleteMany({ where: { workspaceId } });
    await db.responseVersion.deleteMany({ where: { response: { workspaceId } } });
    await db.response.deleteMany({ where: { workspaceId } });
    await db.workspaceMember.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe("notes on the annotation lists", () => {
    let annotationId: string;

    it("returns the notes of each annotation with their status", async () => {
      const annot = await createAnnotation(memberActor, versionId, {
        kind: "COMMENT",
        visibility: "WORKSPACE",
        anchor: { exact: "idempotency keys", prefix: "", suffix: "" },
        text: "@klecx always mention idempotency keys",
      });
      annotationId = annot.id;
      await createAnnotation(memberActor, versionId, {
        kind: "COMMENT",
        visibility: "WORKSPACE",
        anchor: { exact: "backoff", prefix: "", suffix: "" },
        text: "A plain comment",
      });

      const list = await listAnnotationsForResponse(ownerActor, responseId);
      const withNote = list.find((a) => a.id === annotationId)!;
      expect(withNote.notes).toHaveLength(1);
      expect(withNote.notes[0]!.status).toBe("ACTIVE");
      expect(withNote.messages[0]!.mentions).toEqual([{ isKlecx: true }]);
      expect(list.find((a) => a.id !== annotationId)!.notes).toEqual([]);
    });

    it("reports an archived note as archived (no gutter mark)", async () => {
      const note = await db.workspaceNote.findFirstOrThrow({ where: { annotationId } });
      await updateWorkspaceNoteStatus(ownerActor, note.id, "ARCHIVED");

      const list = await listAnnotationsForResponse(ownerActor, responseId);
      expect(list.find((a) => a.id === annotationId)!.notes).toEqual([
        { id: note.id, status: "ARCHIVED" },
      ]);
    });

    it("includes notes for highlights inside an Ask answer", async () => {
      const ask = await db.annotation.create({
        data: {
          workspaceId,
          responseId,
          versionId,
          createdById: memberActor.userId,
          kind: "ASK",
          visibility: "WORKSPACE",
          anchorExact: "retried three times",
          anchorPrefix: "",
          anchorSuffix: "",
          messages: {
            create: [
              { role: "USER", content: "Why three?", authorId: memberActor.userId },
              { role: "ASSISTANT", content: "Three attempts cover most transient faults." },
            ],
          },
        },
        include: { messages: true },
      });
      const answer = ask.messages.find((m) => m.role === "ASSISTANT")!;

      const nested = await createAnnotationOnMessage(memberActor, answer.id, {
        kind: "COMMENT",
        visibility: "WORKSPACE",
        anchor: { exact: "transient faults", prefix: "", suffix: "" },
        text: "@klecx define transient faults once",
      });

      const list = await listAnnotationsForMessage(ownerActor, answer.id);
      expect(list.map((a) => a.id)).toEqual([nested.id]);
      expect(list[0]!.notes).toHaveLength(1);
      expect(list[0]!.notes[0]!.status).toBe("ACTIVE");
    });

    it("hides the lists from someone outside the workspace (404)", async () => {
      await expect(
        listAnnotationsForResponse(outsiderActor, responseId)
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("foreign keys", () => {
    it("deletes a note together with the message that recorded it", async () => {
      const annot = await createAnnotation(memberActor, versionId, {
        kind: "COMMENT",
        visibility: "WORKSPACE",
        anchor: { exact: "Requests", prefix: "", suffix: "" },
        text: "First comment",
      });
      const reply = await createAnnotationMessage(
        memberActor,
        annot.id,
        "@klecx call them calls, not requests"
      );
      const note = await db.workspaceNote.findUniqueOrThrow({
        where: { messageId: reply.id },
      });

      await db.annotationMessage.delete({ where: { id: reply.id } });

      expect(await db.workspaceNote.findUnique({ where: { id: note.id } })).toBeNull();
    });

    it("keeps a note when its author's account is deleted", async () => {
      const annot = await createAnnotation(ownerActor, versionId, {
        kind: "COMMENT",
        visibility: "WORKSPACE",
        anchor: { exact: "three times", prefix: "", suffix: "" },
        text: "How many?",
      });
      const reply = await createAnnotationMessage(
        leaverActor,
        annot.id,
        "@klecx say up to three times"
      );
      const note = await db.workspaceNote.findUniqueOrThrow({
        where: { messageId: reply.id },
      });
      expect(note.createdById).toBe(leaverActor.userId);

      await db.notification.deleteMany({ where: { userId: leaverActor.userId } });
      await db.activityLog.deleteMany({ where: { actorId: leaverActor.userId } });
      await db.user.delete({ where: { id: leaverActor.userId } });

      const kept = await db.workspaceNote.findUniqueOrThrow({ where: { id: note.id } });
      expect(kept.createdById).toBeNull();

      const listed = await listWorkspaceNotes(ownerActor, workspaceId);
      const row = listed.notes.find((n) => n.id === note.id)!;
      expect(row.instruction).toBe("say up to three times");
      expect(row.author).toEqual({ name: null, username: null, image: null });
    });

    it("refuses a note whose message does not exist", async () => {
      const annot = await db.annotation.findFirstOrThrow({ where: { workspaceId } });
      await expect(
        db.workspaceNote.create({
          data: {
            workspaceId,
            annotationId: annot.id,
            messageId: crypto.randomUUID(),
            createdById: ownerActor.userId,
            quote: "q",
            instruction: "i",
          },
        })
      ).rejects.toThrow();
    });

    it("refuses an annotation whose root does not exist", async () => {
      await expect(
        db.annotation.create({
          data: {
            workspaceId,
            responseId,
            versionId,
            createdById: ownerActor.userId,
            kind: "COMMENT",
            anchorExact: "backoff",
            anchorPrefix: "",
            anchorSuffix: "",
            rootAnnotationId: crypto.randomUUID(),
          },
        })
      ).rejects.toThrow();
    });
  });
});
