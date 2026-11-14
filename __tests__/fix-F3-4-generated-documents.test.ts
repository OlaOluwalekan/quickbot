/**
 * @jest-environment node
 */

import crypto from "node:crypto";
import { db } from "@/server/db/client";
import { executeCreateDocumentToolCall } from "@/server/documents";
import {
  getDocument,
  getDocumentRevision,
  createDocumentRevision,
  downloadDocument,
  renameDocument,
  createDocumentAnnotation,
  listDocumentAnnotations,
} from "@/server/services/generated-document";
import { startDocumentReview } from "@/server/services/document-review";
import { buildAskContext, loadAskTarget } from "@/server/ai/ask-context";
import { createAndStreamGeneration, setCustomProvider } from "@/server/services/generation";
import type { AiProvider, GenerateRequest, StreamEvent } from "@/server/ai/types";

let mockActorId: string | null = null;
jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(async () => {
    if (!mockActorId) return null;
    return {
      userId: mockActorId,
      sessionId: `sess_${mockActorId}`,
      email: `${mockActorId}@example.com`,
      role: "USER",
    };
  }),
  requireActor: jest.fn(async () => {
    if (!mockActorId) throw new Error("Unauthorized");
    return {
      userId: mockActorId,
      sessionId: `sess_${mockActorId}`,
      email: `${mockActorId}@example.com`,
      role: "USER",
    };
  }),
}));

describe("Step F3.4 — Generated Documents (Service, Revisions, Annotations, Tool Round Trip)", () => {
  jest.setTimeout(60000);

  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  let workspaceId: string;
  let ownerId: string;
  let viewerId: string;
  let outsiderId: string;
  let responseId: string;
  let versionId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const owner = await db.user.create({
      data: {
        id: `f34-owner-${stamp}`,
        name: "Owner User",
        email: `f34-owner-${stamp}@example.com`,
        emailVerified: true,
      },
    });
    ownerId = owner.id;
    createdUserIds.push(ownerId);

    await db.creditAccount.create({
      data: {
        userId: ownerId,
        planBalance: 1000,
        topupBalance: 0,
      },
    });

    const viewer = await db.user.create({
      data: {
        id: `f34-viewer-${stamp}`,
        name: "Viewer User",
        email: `f34-viewer-${stamp}@example.com`,
        emailVerified: true,
      },
    });
    viewerId = viewer.id;
    createdUserIds.push(viewerId);

    const outsider = await db.user.create({
      data: {
        id: `f34-outsider-${stamp}`,
        name: "Outsider User",
        email: `f34-outsider-${stamp}@example.com`,
        emailVerified: true,
      },
    });
    outsiderId = outsider.id;
    createdUserIds.push(outsiderId);

    const ws = await db.workspace.create({
      data: {
        id: `f34-ws-${stamp}`,
        title: "F3.4 Document Test Workspace",
        ownerId,
        members: {
          create: [
            { userId: ownerId, role: "ADMIN", invitedById: ownerId },
            { userId: viewerId, role: "VIEWER", invitedById: ownerId },
          ],
        },
      },
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(workspaceId);

    versionId = crypto.randomUUID();
    const resp = await db.response.create({
      data: {
        id: `f34-resp-${stamp}`,
        workspaceId,
        createdById: ownerId,
        kind: "TEXT",
        prompt: "Write a PRD as a document",
        versions: {
          create: {
            id: versionId,
            number: 1,
            status: "COMPLETE",
            content: "Here is your PRD document.",
            modelKey: "text-economy",
            providerModelId: "text-economy",
            promptVersion: "v1",
            createdById: ownerId,
          },
        },
      },
    });
    responseId = resp.id;
    await db.response.update({
      where: { id: responseId },
      data: { activeVersionId: versionId },
    });
  }, 60000);

  afterAll(async () => {
    setCustomProvider(null);
    for (const wsId of createdWorkspaceIds) {
      await db.documentRevision.deleteMany({ where: { document: { workspaceId: wsId } } });
      await db.annotation.deleteMany({ where: { workspaceId: wsId } });
      await db.document.deleteMany({ where: { workspaceId: wsId } });
      await db.responseVersion.deleteMany({ where: { response: { workspaceId: wsId } } });
      await db.response.deleteMany({ where: { workspaceId: wsId } });
      await db.generation.deleteMany({ where: { workspaceId: wsId } });
      await db.workspaceMember.deleteMany({ where: { workspaceId: wsId } });
      await db.workspace.deleteMany({ where: { id: wsId } });
    }
    for (const uid of createdUserIds) {
      await db.creditAccount.deleteMany({ where: { userId: uid } });
      await db.user.deleteMany({ where: { id: uid } });
    }
  }, 60000);

  it("executeCreateDocumentToolCall creates Document and revision 1", async () => {
    const result = await executeCreateDocumentToolCall({
      actorId: ownerId,
      workspaceId,
      versionId,
      args: {
        format: "md",
        title: "PRD for Todo App",
        markdown: "# PRD\n\n## Overview\nThis is a todo application.",
      },
    });

    expect(result.documentId).toBeDefined();
    expect(result.title).toBe("PRD for Todo App");
    expect(result.format).toBe("md");
    expect(result.currentRevision).toBe(1);

    // Verify in db
    const docInDb = await db.document.findUnique({
      where: { id: result.documentId },
      include: { revisions: true },
    });
    expect(docInDb).not.toBeNull();
    expect(docInDb?.title).toBe("PRD for Todo App");
    expect(docInDb?.currentRevision).toBe(1);
    expect(docInDb?.revisions.length).toBe(1);
    expect(docInDb?.revisions[0]?.revision).toBe(1);
    expect(docInDb?.revisions[0]?.content).toContain("This is a todo application.");
    expect(docInDb?.revisions[0]?.editorId).toBeNull(); // null = generated by Klecx
  });

  it("getDocument, getDocumentRevision, renameDocument, and downloadDocument work with permissions", async () => {
    mockActorId = ownerId;
    const actor = {
      userId: ownerId,
      sessionId: `sess_${ownerId}`,
      email: `${ownerId}@example.com`,
      role: "USER" as const,
    };

    const created = await executeCreateDocumentToolCall({
      actorId: ownerId,
      workspaceId,
      versionId,
      args: {
        format: "md",
        title: "API Design",
        markdown: "# API Design\n\nREST endpoints specification.",
      },
    });

    const docDetails = await getDocument(actor, created.documentId);
    expect(docDetails.document.title).toBe("API Design");
    expect(docDetails.latestRevision.content).toContain("REST endpoints specification.");
    expect(docDetails.capabilities.canEdit).toBe(true);

    const rev1 = await getDocumentRevision(actor, created.documentId, 1);
    expect(rev1.revision).toBe(1);
    expect(rev1.content).toContain("REST endpoints specification.");

    // Rename document
    await renameDocument(actor, created.documentId, "Updated API Design");
    const docAfterRename = await getDocument(actor, created.documentId);
    expect(docAfterRename.document.title).toBe("Updated API Design");

    // Download document as markdown
    const dl = await downloadDocument(actor, created.documentId, { format: "md", revision: 1 });
    expect(dl.filename).toContain("Updated-API-Design");
    expect(dl.contentType).toBe("text/markdown; charset=utf-8");
    expect(dl.buffer.toString("utf-8")).toContain("REST endpoints specification.");
  });

  it("createDocumentRevision increments currentRevision and handles optimistic conflicts", async () => {
    mockActorId = ownerId;
    const actor = {
      userId: ownerId,
      sessionId: `sess_${ownerId}`,
      email: `${ownerId}@example.com`,
      role: "USER" as const,
    };

    const created = await executeCreateDocumentToolCall({
      actorId: ownerId,
      workspaceId,
      versionId,
      args: {
        format: "md",
        title: "Editable Doc",
        markdown: "# Revision 1 content",
      },
    });

    // Valid revision 2 save
    const rev2 = await createDocumentRevision(actor, created.documentId, {
      content: "# Revision 2 edited content",
      baseRevision: 1,
    });
    expect(rev2?.revision).toBe(2);

    const docAfterRev2 = await getDocument(actor, created.documentId);
    expect(docAfterRev2.document.currentRevision).toBe(2);
    expect(docAfterRev2.latestRevision.content).toBe("# Revision 2 edited content");

    // Stale baseRevision conflict check
    await expect(
      createDocumentRevision(actor, created.documentId, {
        content: "# Conflicting edit",
        baseRevision: 1, // Current is 2!
      })
    ).rejects.toThrow("Document was modified since you started editing");
  });

  it("createDocumentAnnotation and loadAskTarget support DOCUMENT_REVISION targets", async () => {
    mockActorId = ownerId;
    const actor = {
      userId: ownerId,
      sessionId: `sess_${ownerId}`,
      email: `${ownerId}@example.com`,
      role: "USER" as const,
    };

    const created = await executeCreateDocumentToolCall({
      actorId: ownerId,
      workspaceId,
      versionId,
      args: {
        format: "md",
        title: "Annotatable Doc",
        markdown: "# Spec\n\nWe require PostgreSQL 16 for the database.",
      },
    });

    // Create Ask annotation on the document revision
    const annot = await createDocumentAnnotation(actor, created.documentId, 1, {
      kind: "ASK",
      mode: "now",
      anchor: {
        exact: "PostgreSQL 16",
        prefix: "We require ",
        suffix: " for the database.",
      },
      text: "Can we use Supabase instead?",
    });

    expect(annot.targetType).toBe("DOCUMENT_REVISION");
    expect(annot.documentId).toBe(created.documentId);
    expect(annot.documentRevision).toBe(1);
    expect(annot.anchorExact).toBe("PostgreSQL 16");

    // Verify loadAskTarget builds containing text and description for Ask context
    const askTarget = await loadAskTarget({
      id: annot.id,
      targetType: "DOCUMENT_REVISION",
      anchorExact: "PostgreSQL 16",
      contentSource: "ORIGINAL",
      editRevision: null,
      documentId: created.documentId,
      documentRevision: 1,
      version: null,
      targetMessage: null,
    });

    expect(askTarget).not.toBeNull();
    expect(askTarget?.key).toBe(`document:${created.documentId}:r1`);
    expect(askTarget?.text).toContain("We require PostgreSQL 16 for the database.");
    expect(askTarget?.description).toContain("Annotatable Doc");

    // Verify buildAskContext builds prompt without error
    const context = await buildAskContext(annot.id, { language: null });
    expect(context.messages.length).toBeGreaterThanOrEqual(1);
    expect(context.messages[0]?.parts[0]?.type).toBe("text");
  });

  it("generation loop executes tool round trip when create_document is emitted", async () => {
    mockActorId = ownerId;
    const actor = {
      userId: ownerId,
      sessionId: `sess_${ownerId}`,
      email: `${ownerId}@example.com`,
      role: "USER" as const,
    };

    let step = 0;
    const mockProvider: AiProvider = {
      id: "gemini",
      stream: async function* (req: GenerateRequest): AsyncIterable<StreamEvent> {
        if (step === 0) {
          step++;
          // First turn emits create_document tool call with thought signature
          yield {
            type: "tool_call",
            name: "create_document",
            thoughtSignature: "enc_thought_sig_xyz",
            args: {
              format: "docx",
              title: "Product Requirements Document",
              markdown: "# PRD\n\nRequirements list.",
            },
          };
          yield {
            type: "usage",
            inputTokens: 50,
            outputTokens: 20,
            estimated: false,
          };
        } else {
          // Verify thoughtSignature was preserved on the latest assistant tool_call in req.messages
          const assistantMsg = [...req.messages].reverse().find((m) => m.role === "assistant");
          const toolCallPart = assistantMsg?.parts.find((p) => p.type === "tool_call");
          expect((toolCallPart as any)?.thoughtSignature).toBe("enc_thought_sig_xyz");

          // Second turn streams the summary, assumptions, and questions
          const summaryText =
            "This document outlines the PRD for the app.\n\nAssumptions:\n- Users are authenticated\n\nQuestions:\n- What is the target launch date?";
          yield {
            type: "text_delta",
            text: summaryText,
          };
          yield {
            type: "usage",
            inputTokens: 70,
            outputTokens: 40,
            estimated: false,
          };
        }
      },
    };

    setCustomProvider(mockProvider);

    const { stream } = await createAndStreamGeneration(
      actor,
      workspaceId,
      {
        prompt: "Create PRD as a word document",
        modelKey: "text-economy",
        idempotencyKey: "test-prd-123",
      },
      { providerInstance: mockProvider }
    );

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let accumulatedSSE = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) accumulatedSSE += decoder.decode(value, { stream: true });
    }

    // Verify SSE emitted document event
    expect(accumulatedSSE).toContain("event: document");
    expect(accumulatedSSE).toContain("Product Requirements Document");

    // Verify text delta contains summary and assumptions
    expect(accumulatedSSE).toContain("This document outlines the PRD");
    expect(accumulatedSSE).toContain("Assumptions:");
    expect(accumulatedSSE).toContain("Questions:");
  });
  const actorOf = (userId: string) => ({
    userId,
    sessionId: `sess_${userId}`,
    email: `${userId}@example.com`,
    role: "USER" as const,
  });

  const newDoc = (markdown: string, title = "Access Doc") =>
    executeCreateDocumentToolCall({
      actorId: ownerId,
      workspaceId,
      versionId,
      args: { format: "docx", title, markdown },
    });

  it("someone outside the workspace gets 404 on every document endpoint", async () => {
    const created = await newDoc("# Secret\n\nInternal plan.");
    const outsider = actorOf(outsiderId);

    await expect(getDocument(outsider, created.documentId)).rejects.toMatchObject({ status: 404 });
    await expect(getDocumentRevision(outsider, created.documentId, 1)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      downloadDocument(outsider, created.documentId, { format: "md" })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createDocumentRevision(outsider, created.documentId, { content: "# Hacked" })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      listDocumentAnnotations(outsider, created.documentId, 1)
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createDocumentAnnotation(outsider, created.documentId, 1, {
        kind: "COMMENT",
        anchor: { exact: "Internal plan", prefix: "", suffix: "" },
        text: "hi",
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("a viewer can read and take Markdown, but can't edit or export Word / PDF", async () => {
    const created = await newDoc("# Viewer\n\nRead only.");
    const viewer = actorOf(viewerId);

    const doc = await getDocument(viewer, created.documentId);
    expect(doc.capabilities).toMatchObject({ canEdit: false, canExport: false });

    const md = await downloadDocument(viewer, created.documentId, { format: "md" });
    expect(md.buffer.toString("utf-8")).toContain("Read only.");

    await expect(
      downloadDocument(viewer, created.documentId, { format: "docx" })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createDocumentRevision(viewer, created.documentId, { content: "# Changed" })
    ).rejects.toMatchObject({ status: 403 });
    await expect(renameDocument(viewer, created.documentId, "New")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("lists a revision's annotations: workspace ones and the caller's own private ones", async () => {
    const created = await newDoc("# Notes\n\nAlpha beta gamma.");
    const owner = actorOf(ownerId);

    const priv = await createDocumentAnnotation(owner, created.documentId, 1, {
      kind: "COMMENT",
      anchor: { exact: "beta", prefix: "Alpha ", suffix: " gamma" },
      text: "private note",
    });
    await expect(
      createDocumentAnnotation(owner, created.documentId, 1, {
        kind: "COMMENT",
        anchor: { exact: "not in the text", prefix: "", suffix: "" },
        text: "x",
      })
    ).rejects.toMatchObject({ status: 400 });

    const mine = await listDocumentAnnotations(owner, created.documentId, 1);
    expect(mine.map((a) => a.id)).toContain(priv.id);

    const viewerList = await listDocumentAnnotations(actorOf(viewerId), created.documentId, 1);
    expect(viewerList.map((a) => a.id)).not.toContain(priv.id);

    // Another revision has its own annotations.
    expect(await listDocumentAnnotations(owner, created.documentId, 2)).toHaveLength(0);
  });

  it("reviews a generated document and records an accepted quick fix on Save", async () => {
    const created = await newDoc("# Stack\n\nWe use JavScript for building the app.");
    const owner = actorOf(ownerId);

    const provider: AiProvider = {
      id: "gemini",
      stream: async function* (): AsyncIterable<StreamEvent> {
        yield {
          type: "text_delta",
          text: JSON.stringify([
            {
              exact: "JavScript",
              prefix: "We use ",
              suffix: " for building",
              comment: "Did you mean JavaScript?",
              category: "spelling",
              severity: "low",
              replacement: "JavaScript",
            },
          ]),
        };
        yield { type: "usage", inputTokens: 100, outputTokens: 50, estimated: false };
      },
    };

    const { stream } = await startDocumentReview(
      owner,
      { kind: "document", documentId: created.documentId },
      { preset: "errors", visibility: "WORKSPACE", idempotencyKey: `f34-review-${crypto.randomUUID()}` },
      { providerInstance: provider }
    );
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let sse = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sse += decoder.decode(value, { stream: true });
    }
    expect(sse).toContain("event: finding");

    const findings = await db.annotation.findMany({
      where: { documentId: created.documentId, authorType: "AI" },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      targetType: "DOCUMENT_REVISION",
      documentRevision: 1,
      versionId: null,
      suggestionState: "PENDING",
    });

    // The finding shows on the revision it was made on.
    const listed = await listDocumentAnnotations(owner, created.documentId, 1);
    expect(listed.map((a) => a.id)).toContain(findings[0]!.id);

    // Accepting the fix and saving records it as accepted.
    await createDocumentRevision(owner, created.documentId, {
      content: "# Stack\n\nWe use JavaScript for building the app.",
      baseRevision: 1,
      acceptedSuggestionIds: [findings[0]!.id],
    });
    const after = await db.annotation.findUnique({ where: { id: findings[0]!.id } });
    expect(after?.suggestionState).toBe("ACCEPTED");
    expect(after?.resolvedAt).not.toBeNull();
  });
});
