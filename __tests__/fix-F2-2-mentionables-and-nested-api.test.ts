/**
 * @jest-environment node
 */

import crypto from "node:crypto";
import { db } from "@/server/db/client";
import {
  createAnnotation,
  createAnnotationOnMessage,
  createAndStreamAnnotationReply,
  setAnnotationCustomProviderForTesting,
} from "@/server/services/annotation";
import type { AiProvider, StreamEvent } from "@/server/ai/types";
import {
  listMentionables,
} from "@/server/services/members";
import type { Actor } from "@/server/auth/session";
import { MAX_ANNOTATION_DEPTH } from "@/lib/annotations/limits";

class FakeAskProvider implements AiProvider {
  id = "gemini" as const;
  async *stream(): AsyncIterable<StreamEvent> {
    yield { type: "text_delta", text: "Paxos is harder to implement than Raft." };
    yield { type: "usage", inputTokens: 50, outputTokens: 10, estimated: false };
  }
}

async function drain(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  while (!(await reader.read()).done) {
    // read to the end
  }
}

describe("Fix F2.2 — Mentionables & Nested Annotation API", () => {
  let owner: { id: string; email: string };
  let member1: { id: string; email: string; username: string | null };
  let suspendedMember: { id: string; email: string; username: string | null };
  let workspace: { id: string };
  let ownerActor: Actor;
  let memberActor: Actor;

  let outsider: { id: string; email: string };
  let noUsername: { id: string };
  let outsiderActor: Actor;
  let versionId: string;

  let assistantMsgId: string;
  let userMsgId: string;
  let rootAnnotId: string;
  let privateAssistantMsgId: string;

  beforeAll(async () => {
    // 1. Create users
    owner = await db.user.create({
      data: {
        id: crypto.randomUUID(),
        email: `f22-owner-${Date.now()}@example.com`,
        name: "F22 Owner",
        username: `f22owner_${Date.now()}`,
      },
    });

    member1 = await db.user.create({
      data: {
        id: crypto.randomUUID(),
        email: `f22-member-${Date.now()}@example.com`,
        name: "Alice Developer",
        username: `alicedev_${Date.now()}`,
      },
    });

    suspendedMember = await db.user.create({
      data: {
        id: crypto.randomUUID(),
        email: `f22-suspended-${Date.now()}@example.com`,
        name: "Suspended User",
        username: `suspended_${Date.now()}`,
      },
    });

    outsider = await db.user.create({
      data: {
        id: crypto.randomUUID(),
        email: `f22-outsider-${Date.now()}@example.com`,
        name: "Outsider",
        username: `outsider_${Date.now()}`,
      },
    });
    outsiderActor = {
      userId: outsider.id,
      email: outsider.email,
      role: "USER",
      sessionId: "sess_f22_outsider",
    };

    noUsername = await db.user.create({
      data: {
        id: crypto.randomUUID(),
        email: `f22-nousername-${Date.now()}@example.com`,
        name: "Nameless Alice",
      },
    });

    ownerActor = {
      userId: owner.id,
      email: owner.email,
      role: "USER",
      sessionId: "sess_f22_owner",
    };

    memberActor = {
      userId: member1.id,
      email: member1.email,
      role: "USER",
      sessionId: "sess_f22_member",
    };

    // 2. Create workspace
    workspace = await db.workspace.create({
      data: {
        title: "F2.2 Workspace",
        ownerId: owner.id,
        members: {
          create: [
            {
              userId: member1.id,
              role: "EDITOR",
              canComment: true,
              canAsk: true,
              invitedById: owner.id,
            },
            {
              userId: noUsername.id,
              role: "VIEWER",
              invitedById: owner.id,
            },
            {
              userId: suspendedMember.id,
              role: "EDITOR",
              suspendedAt: new Date(),
              suspendedReason: "PLAN_LIMIT",
              invitedById: owner.id,
            },
          ],
        },
      },
    });

    // 3. Create response & version
    const response = await db.response.create({
      data: {
        workspaceId: workspace.id,
        createdById: owner.id,
        prompt: "What is Raft?",
      },
    });

    const version = await db.responseVersion.create({
      data: {
        responseId: response.id,
        number: 1,
        content: "Root version content",
        modelKey: "text-standard",
        providerModelId: "gemini-pro",
        promptVersion: "1",
        createdById: owner.id,
      },
    });

    // 4. Create a parent annotation with an ASSISTANT message and a USER message
    const parentAnnot = await db.annotation.create({
      data: {
        workspaceId: workspace.id,
        responseId: response.id,
        versionId: version.id,
        kind: "ASK",
        visibility: "WORKSPACE",
        targetType: "RESPONSE_VERSION",
        depth: 0,
        authorType: "USER",
        anchorExact: "some root anchor",
        anchorPrefix: "",
        anchorSuffix: "",
        createdById: owner.id,
        messages: {
          create: [
            {
              role: "USER",
              content: "What is Raft consensus?",
              authorId: owner.id,
            },
            {
              role: "ASSISTANT",
              content: "Raft is a consensus algorithm designed to be easy to understand.",
            },
          ],
        },
      },
      include: {
        messages: true,
      },
    });

    rootAnnotId = parentAnnot.id;
    const userMsg = parentAnnot.messages.find((m) => m.role === "USER")!;
    const assistantMsg = parentAnnot.messages.find((m) => m.role === "ASSISTANT")!;
    userMsgId = userMsg.id;
    assistantMsgId = assistantMsg.id;
    versionId = version.id;

    // 5. The owner's PRIVATE Ask thread (the default visibility)
    const privateAnnot = await db.annotation.create({
      data: {
        workspaceId: workspace.id,
        responseId: response.id,
        versionId: version.id,
        kind: "ASK",
        visibility: "PRIVATE",
        anchorExact: "Root version",
        anchorPrefix: "",
        anchorSuffix: "",
        createdById: owner.id,
        messages: {
          create: [
            { role: "USER", content: "A private question", authorId: owner.id },
            { role: "ASSISTANT", content: "A private answer only the owner may read." },
          ],
        },
      },
      include: { messages: true },
    });
    privateAssistantMsgId = privateAnnot.messages.find((m) => m.role === "ASSISTANT")!.id;

    setAnnotationCustomProviderForTesting(new FakeAskProvider());
  });

  afterAll(async () => {
    setAnnotationCustomProviderForTesting(null);
    await db.annotation.deleteMany({ where: { workspaceId: workspace.id } });
    await db.generation.deleteMany({ where: { workspaceId: workspace.id } });
    await db.responseVersion.deleteMany({ where: { response: { workspaceId: workspace.id } } });
    await db.response.deleteMany({ where: { workspaceId: workspace.id } });
    await db.workspaceMember.deleteMany({ where: { workspaceId: workspace.id } });
    await db.workspace.delete({ where: { id: workspace.id } });
    await db.user.deleteMany({
      where: {
        id: { in: [owner.id, member1.id, suspendedMember.id, outsider.id, noUsername.id] },
      },
    });
  });

  describe("1. listMentionables", () => {
    it("returns Klecx first and includes owner and active members (excludes suspended)", async () => {
      const items = await listMentionables(ownerActor, workspace.id, "");

      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items[0]).toEqual({ kind: "klecx" });

      const usernames = items
        .filter((i) => i.kind === "user")
        .map((i) => (i as { username: string }).username);

      expect(usernames).toContain(member1.username);
      expect(usernames).not.toContain(suspendedMember.username);
    });

    it("filters mentionables by query 'alice'", async () => {
      const items = await listMentionables(ownerActor, workspace.id, "alice");

      // Klecx doesn't match "alice"
      expect(items.some((i) => i.kind === "klecx")).toBe(false);

      const userItems = items.filter((i) => i.kind === "user");
      expect(userItems.length).toBe(1);
      expect((userItems[0] as { username: string }).username).toBe(member1.username);
    });

    it("leaves out members without a username (they can't be mentioned)", async () => {
      const items = await listMentionables(ownerActor, workspace.id, "nameless");
      expect(items.filter((i) => i.kind === "user")).toEqual([]);
    });

    it("returns 404 to a user who is not a member", async () => {
      await expect(
        listMentionables(outsiderActor, workspace.id, "")
      ).rejects.toMatchObject({ status: 404 });
    });

    it("matches Klecx when query is 'kl'", async () => {
      const items = await listMentionables(ownerActor, workspace.id, "kl");

      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0]).toEqual({ kind: "klecx" });
    });
  });

  describe("2. createAnnotationOnMessage", () => {
    it("successfully creates nested ASK annotation on an ASSISTANT message", async () => {
      const created = await createAnnotationOnMessage(memberActor, assistantMsgId, {
        kind: "ASK",
        mode: "now",
        anchor: {
          exact: "consensus algorithm",
          prefix: "Raft is a ",
          suffix: " designed to be",
        },
        text: "How does it compare to Paxos?",
      });

      expect(created.id).toBeDefined();
      expect(created.targetType).toBe("ANNOTATION_MESSAGE");
      expect(created.targetMessageId).toBe(assistantMsgId);
      expect(created.parentAnnotationId).toBe(rootAnnotId);
      expect(created.rootAnnotationId).toBe(rootAnnotId);
      expect(created.depth).toBe(1);
      expect(created.kind).toBe("ASK");
      expect(created.questionState).toBe("NONE"); // mode === "now"
    });

    it("successfully creates nested COMMENT annotation on an ASSISTANT message", async () => {
      const created = await createAnnotationOnMessage(memberActor, assistantMsgId, {
        kind: "COMMENT",
        anchor: {
          exact: "easy to understand",
          prefix: "designed to be ",
          suffix: ".",
        },
        text: "Very true, Ongaro paper explains this nicely.",
      });

      expect(created.id).toBeDefined();
      expect(created.targetType).toBe("ANNOTATION_MESSAGE");
      expect(created.depth).toBe(1);
      expect(created.kind).toBe("COMMENT");
    });

    it("rejects annotation creation on a USER message", async () => {
      await expect(
        createAnnotationOnMessage(memberActor, userMsgId, {
          kind: "ASK",
          anchor: {
            exact: "What is",
            prefix: "",
            suffix: "",
          },
          text: "Can I annotate this user message?",
        })
      ).rejects.toThrow("Annotations can only be attached to assistant messages");
    });

    it("rejects annotation creation when anchor text is not a substring", async () => {
      await expect(
        createAnnotationOnMessage(memberActor, assistantMsgId, {
          kind: "ASK",
          anchor: {
            exact: "non-existent text in answer",
            prefix: "",
            suffix: "",
          },
          text: "Question on missing text",
        })
      ).rejects.toThrow("Selected text is not a substring of the message content");
    });

    it("returns 404 to a user who is not a member", async () => {
      await expect(
        createAnnotationOnMessage(outsiderActor, assistantMsgId, {
          kind: "COMMENT",
          anchor: { exact: "consensus algorithm", prefix: "", suffix: "" },
          text: "Let me in",
        })
      ).rejects.toMatchObject({ status: 404 });
    });

    it("returns 404 when the parent thread is another member's private thread", async () => {
      // Same answer whether or not the quote exists, so the text can't be probed.
      for (const exact of ["private answer", "text that is not there"]) {
        await expect(
          createAnnotationOnMessage(memberActor, privateAssistantMsgId, {
            kind: "COMMENT",
            anchor: { exact, prefix: "", suffix: "" },
            text: "Peeking",
          })
        ).rejects.toMatchObject({ status: 404 });
      }
    });

    it("keeps a child of a private thread private", async () => {
      const created = await createAnnotationOnMessage(ownerActor, privateAssistantMsgId, {
        kind: "COMMENT",
        visibility: "WORKSPACE",
        anchor: { exact: "private answer", prefix: "", suffix: "" },
        text: "Note to self",
      });
      expect(created.visibility).toBe("PRIVATE");
    });
  });

  describe("3. Ask now is answered", () => {
    async function threadOf(annotationId: string) {
      return db.annotationMessage.findMany({
        where: { annotationId },
        orderBy: { createdAt: "asc" },
      });
    }

    it("answers a nested Ask created with mode 'now' without repeating the question", async () => {
      const ask = await createAnnotationOnMessage(ownerActor, assistantMsgId, {
        kind: "ASK",
        mode: "now",
        anchor: { exact: "consensus algorithm", prefix: "", suffix: "" },
        text: "How does it compare to Paxos?",
      });

      const { stream } = await createAndStreamAnnotationReply(ownerActor, ask.id, {
        idempotencyKey: `asknow_${ask.id}`,
      });
      await drain(stream);

      const thread = await threadOf(ask.id);
      expect(thread.map((m) => m.role)).toEqual(["USER", "ASSISTANT"]);
      expect(thread[1]?.content).toContain("Paxos");

      // Already answered: a second prompt-less call is refused.
      await expect(
        createAndStreamAnnotationReply(ownerActor, ask.id, {
          idempotencyKey: `asknow_again_${ask.id}`,
        })
      ).rejects.toMatchObject({ status: 400 });
    });

    it("answers an Ask created with mode 'now' on a response version", async () => {
      const ask = await createAnnotation(ownerActor, versionId, {
        kind: "ASK",
        mode: "now",
        anchor: { exact: "Root version", prefix: "", suffix: "" },
        text: "What is this?",
      });

      const { stream } = await createAndStreamAnnotationReply(ownerActor, ask.id, {
        idempotencyKey: `asknow_${ask.id}`,
      });
      await drain(stream);

      expect((await threadOf(ask.id)).map((m) => m.role)).toEqual(["USER", "ASSISTANT"]);
    });

    it("does not start an answer for a queued Ask or for someone else's private Ask", async () => {
      const queued = await createAnnotation(ownerActor, versionId, {
        kind: "ASK",
        mode: "queue",
        anchor: { exact: "Root version", prefix: "", suffix: "" },
        text: "Later",
      });
      await expect(
        createAndStreamAnnotationReply(ownerActor, queued.id, {})
      ).rejects.toMatchObject({ status: 400 });

      await expect(
        createAndStreamAnnotationReply(memberActor, queued.id, {})
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
