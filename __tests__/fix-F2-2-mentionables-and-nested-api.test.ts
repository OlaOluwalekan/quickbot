/**
 * @jest-environment node
 */

import crypto from "node:crypto";
import { db } from "@/server/db/client";
import {
  createAnnotationOnMessage,
} from "@/server/services/annotation";
import {
  listMentionables,
} from "@/server/services/members";
import type { Actor } from "@/server/auth/session";
import { MAX_ANNOTATION_DEPTH } from "@/lib/annotations/limits";

describe("Fix F2.2 — Mentionables & Nested Annotation API", () => {
  let owner: { id: string; email: string };
  let member1: { id: string; email: string; username: string | null };
  let suspendedMember: { id: string; email: string; username: string | null };
  let workspace: { id: string };
  let ownerActor: Actor;
  let memberActor: Actor;

  let assistantMsgId: string;
  let userMsgId: string;
  let rootAnnotId: string;

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
  });

  afterAll(async () => {
    await db.annotation.deleteMany({ where: { workspaceId: workspace.id } });
    await db.responseVersion.deleteMany({ where: { response: { workspaceId: workspace.id } } });
    await db.response.deleteMany({ where: { workspaceId: workspace.id } });
    await db.workspaceMember.deleteMany({ where: { workspaceId: workspace.id } });
    await db.workspace.delete({ where: { id: workspace.id } });
    await db.user.deleteMany({
      where: { id: { in: [owner.id, member1.id, suspendedMember.id] } },
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
  });
});
