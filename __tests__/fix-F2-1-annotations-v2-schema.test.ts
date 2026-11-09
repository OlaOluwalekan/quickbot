import { db } from "@/server/db/client";

describe("Step F2.1 — Annotations v2 Schema & Database Constraints", () => {
  let userId: string;
  let workspaceId: string;
  let responseId: string;
  let versionId: string;

  beforeAll(async () => {
    // Setup test user, workspace, response, and version
    const user = await db.user.create({
      data: {
        id: `f2_1_user_${Date.now()}`,
        email: `f2_1_${Date.now()}@example.com`,
        name: "Annotations v2 Tester",
      },
    });
    userId = user.id;

    const workspace = await db.workspace.create({
      data: {
        ownerId: userId,
        title: "Annotations v2 Workspace",
      },
    });
    workspaceId = workspace.id;

    const response = await db.response.create({
      data: {
        workspaceId,
        createdById: userId,
        prompt: "Explain distributed consensus",
      },
    });
    responseId = response.id;

    const version = await db.responseVersion.create({
      data: {
        responseId,
        number: 1,
        modelKey: "text-economy",
        providerModelId: "gemini-2.5-flash",
        promptVersion: "1.0",
        createdById: userId,
        content: "Raft and Paxos are consensus algorithms that ensure consistency.",
      },
    });
    versionId = version.id;
  });

  afterAll(async () => {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    await db.user.delete({ where: { id: userId } }).catch(() => {});
  });

  describe("1. CHECK constraint: annotations_one_target", () => {
    it("accepts valid RESPONSE_VERSION target", async () => {
      const annot = await db.annotation.create({
        data: {
          workspaceId,
          createdById: userId,
          kind: "ASK",
          targetType: "RESPONSE_VERSION",
          versionId,
          responseId,
          anchorExact: "Raft and Paxos",
          anchorPrefix: "",
          anchorSuffix: " are consensus",
        },
      });

      expect(annot.id).toBeDefined();
      expect(annot.targetType).toBe("RESPONSE_VERSION");
      expect(annot.versionId).toBe(versionId);
      expect(annot.targetMessageId).toBeNull();
      expect(annot.documentId).toBeNull();

      await db.annotation.delete({ where: { id: annot.id } });
    });

    it("rejects annotation with multiple targets (e.g. versionId AND targetMessageId)", async () => {
      // First create a parent annotation + assistant message to obtain a message ID
      const parentAnnot = await db.annotation.create({
        data: {
          workspaceId,
          createdById: userId,
          kind: "ASK",
          targetType: "RESPONSE_VERSION",
          versionId,
          responseId,
          anchorExact: "Raft",
          anchorPrefix: "",
          anchorSuffix: "",
        },
      });

      const message = await db.annotationMessage.create({
        data: {
          annotationId: parentAnnot.id,
          role: "ASSISTANT",
          content: "Raft decomposes consensus into leader election and log replication.",
        },
      });

      // Try creating row with BOTH versionId and targetMessageId
      await expect(
        db.annotation.create({
          data: {
            workspaceId,
            createdById: userId,
            kind: "ASK",
            targetType: "RESPONSE_VERSION",
            versionId, // target 1
            targetMessageId: message.id, // target 2 (violates check)
            anchorExact: "leader election",
            anchorPrefix: "",
            anchorSuffix: "",
          },
        })
      ).rejects.toThrow();

      await db.annotation.delete({ where: { id: parentAnnot.id } });
    });

    it("rejects annotation with zero targets (no versionId, no targetMessageId, no documentId)", async () => {
      await expect(
        db.annotation.create({
          data: {
            workspaceId,
            createdById: userId,
            kind: "COMMENT",
            targetType: "RESPONSE_VERSION",
            versionId: null, // missing target
            anchorExact: "consensus",
            anchorPrefix: "",
            anchorSuffix: "",
          },
        })
      ).rejects.toThrow();
    });

    it("accepts valid ANNOTATION_MESSAGE target with versionId null", async () => {
      const rootAnnot = await db.annotation.create({
        data: {
          workspaceId,
          createdById: userId,
          kind: "ASK",
          targetType: "RESPONSE_VERSION",
          versionId,
          responseId,
          depth: 0,
          anchorExact: "Raft and Paxos",
          anchorPrefix: "",
          anchorSuffix: "",
        },
      });

      const assistantMsg = await db.annotationMessage.create({
        data: {
          annotationId: rootAnnot.id,
          role: "ASSISTANT",
          content: "Leader election in Raft relies on randomized election timeouts.",
        },
      });

      const childAnnot = await db.annotation.create({
        data: {
          workspaceId,
          createdById: userId,
          kind: "ASK",
          targetType: "ANNOTATION_MESSAGE",
          targetMessageId: assistantMsg.id,
          parentAnnotationId: rootAnnot.id,
          rootAnnotationId: rootAnnot.id,
          depth: 1,
          versionId: null,
          responseId: null,
          anchorExact: "randomized election timeouts",
          anchorPrefix: "relies on ",
          anchorSuffix: ".",
        },
      });

      expect(childAnnot.id).toBeDefined();
      expect(childAnnot.targetType).toBe("ANNOTATION_MESSAGE");
      expect(childAnnot.targetMessageId).toBe(assistantMsg.id);
      expect(childAnnot.versionId).toBeNull();
      expect(childAnnot.depth).toBe(1);
      expect(childAnnot.rootAnnotationId).toBe(rootAnnot.id);

      await db.annotation.delete({ where: { id: rootAnnot.id } });
    });

    it("accepts valid DOCUMENT_REVISION target", async () => {
      const docAnnot = await db.annotation.create({
        data: {
          workspaceId,
          createdById: userId,
          kind: "COMMENT",
          targetType: "DOCUMENT_REVISION",
          documentId: "doc_dummy_123",
          documentRevision: 1,
          versionId: null,
          targetMessageId: null,
          anchorExact: "Project Scope",
          anchorPrefix: "## ",
          anchorSuffix: "",
        },
      });

      expect(docAnnot.id).toBeDefined();
      expect(docAnnot.targetType).toBe("DOCUMENT_REVISION");
      expect(docAnnot.documentId).toBe("doc_dummy_123");
      expect(docAnnot.documentRevision).toBe(1);

      await db.annotation.delete({ where: { id: docAnnot.id } });
    });
  });

  describe("2. CHECK constraint: annotations_depth_nonnegative", () => {
    it("rejects negative depth", async () => {
      await expect(
        db.annotation.create({
          data: {
            workspaceId,
            createdById: userId,
            kind: "COMMENT",
            targetType: "RESPONSE_VERSION",
            versionId,
            responseId,
            depth: -1,
            anchorExact: "Paxos",
            anchorPrefix: "",
            anchorSuffix: "",
          },
        })
      ).rejects.toThrow();
    });

    it("accepts zero or positive depth", async () => {
      const annot = await db.annotation.create({
        data: {
          workspaceId,
          createdById: userId,
          kind: "COMMENT",
          targetType: "RESPONSE_VERSION",
          versionId,
          responseId,
          depth: 2,
          anchorExact: "Paxos",
          anchorPrefix: "",
          anchorSuffix: "",
        },
      });

      expect(annot.depth).toBe(2);
      await db.annotation.delete({ where: { id: annot.id } });
    });
  });

  describe("3. Mentions & Workspace Notes", () => {
    it("creates user mention and @klecx mention on AnnotationMessage", async () => {
      const annot = await db.annotation.create({
        data: {
          workspaceId,
          createdById: userId,
          kind: "COMMENT",
          targetType: "RESPONSE_VERSION",
          versionId,
          responseId,
          anchorExact: "Raft",
          anchorPrefix: "",
          anchorSuffix: "",
        },
      });

      const message = await db.annotationMessage.create({
        data: {
          annotationId: annot.id,
          role: "USER",
          content: "Hey @user please check this, @klecx remember this for next turn",
        },
      });

      // User mention
      const userMention = await db.annotationMention.create({
        data: {
          messageId: message.id,
          userId,
          isKlecx: false,
        },
      });
      expect(userMention.userId).toBe(userId);
      expect(userMention.isKlecx).toBe(false);

      // Klecx mention
      const klecxMention = await db.annotationMention.create({
        data: {
          messageId: message.id,
          userId: null,
          isKlecx: true,
        },
      });
      expect(klecxMention.userId).toBeNull();
      expect(klecxMention.isKlecx).toBe(true);

      // Workspace note
      const note = await db.workspaceNote.create({
        data: {
          workspaceId,
          annotationId: annot.id,
          messageId: message.id,
          createdById: userId,
          quote: "Raft",
          instruction: "remember this for next turn",
          status: "ACTIVE",
        },
      });
      expect(note.status).toBe("ACTIVE");
      expect(note.instruction).toBe("remember this for next turn");

      // Verify clean cascade on annotation deletion
      await db.annotation.delete({ where: { id: annot.id } });

      const countNotes = await db.workspaceNote.count({ where: { id: note.id } });
      expect(countNotes).toBe(0);

      const countMentions = await db.annotationMention.count({
        where: { id: { in: [userMention.id, klecxMention.id] } },
      });
      expect(countMentions).toBe(0);
    });
  });
});
