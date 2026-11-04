/**
 * @jest-environment node
 */

import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import {
  createAccountWithFreeGrant,
  getAccountByUserId,
} from "@/server/services/credits";
import {
  setUserPlanOverride,
  clearUserPlanOverrides,
} from "@/server/billing/plans";
import {
  createAndStreamGeneration,
  setCustomProvider,
} from "@/server/services/generation";
import {
  CREATE_DOCUMENT_TOOL,
  exportResponseDocument,
  executeCreateDocumentToolCall,
  isTrustedCloudinaryImageUrl,
  resetExportRateLimitsForTesting,
  sanitizeDocumentMarkdown,
  sanitizeDocumentTitle,
  setDailyExportCapForTesting,
} from "@/server/documents";
import { MockStorageProvider, setStorageProvider } from "@/server/storage";
import { GET as exportResponseRoute } from "@/app/api/v1/responses/[id]/export/route";
import { GET as exportWorkspaceRoute } from "@/app/api/v1/workspaces/[id]/export/route";
import { GET as downloadAttachmentRoute } from "@/app/api/v1/attachments/[id]/download/route";
import type { AiProvider, GenerateRequest, StreamEvent } from "@/server/ai/types";

let mockActorId: string | null = null;

jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(async () => {
    if (!mockActorId) return null;
    return {
      userId: mockActorId,
      sessionId: "sess_step_5_6",
      email: `${mockActorId}@example.com`,
      role: "USER",
    };
  }),
}));

async function consumeStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) text += decoder.decode(value, { stream: true });
  }
  return text;
}

describe("Step 5.6 — Document generation and export (Markdown, PDF, DOCX)", () => {
  jest.setTimeout(30_000);
  let ownerId: string;
  let adminId: string;
  let editorId: string;
  let viewerId: string;
  let outsiderId: string;
  let workspaceId: string;
  let responseId: string;
  let mockStorage: MockStorageProvider;

  const richMarkdown = [
    "# Plan Trimestral / الخطة الفصلية",
    "",
    "Welcome to our **bold**, *italic*, and ~~strikethrough~~ overview with `inlineCode` and a [Klecx Portal](https://klecx.example.com/docs) link.",
    "",
    "Spanish greeting: ¡Hola mundo! Diseño de arquitectura sólida.",
    "",
    "Arabic greeting: مرحبا بالعالم — خطة العمل للربع القادم.",
    "",
    "| Quarter | Deliverable | Status |",
    "| :--- | :--- | :--- |",
    "| Q1 | Core Engine | Complete |",
    "| Q2 | Document Exports | In Progress |",
    "",
    "- First bullet item",
    "- Second bullet item",
    "",
    "```ts",
    "export function calculateVelocity(points: number, weeks: number): number {",
    "  return Number((points / Math.max(weeks, 1)).toFixed(2));",
    "}",
    "```",
    "",
    "> Key takeaway: Always render documents server-side with sanitized inputs.",
  ].join("\n");

  beforeAll(async () => {
    const suffix = Date.now();
    const [owner, admin, editor, viewer, outsider] = await Promise.all([
      db.user.create({
        data: {
          id: crypto.randomUUID(),
          email: `owner_5_6_${suffix}@example.com`,
          name: "SecretOwnerName",
        },
      }),
      db.user.create({
        data: {
          id: crypto.randomUUID(),
          email: `admin_5_6_${suffix}@example.com`,
          name: "SecretAdminName",
        },
      }),
      db.user.create({
        data: {
          id: crypto.randomUUID(),
          email: `editor_5_6_${suffix}@example.com`,
          name: "SecretEditorName",
        },
      }),
      db.user.create({
        data: {
          id: crypto.randomUUID(),
          email: `viewer_5_6_${suffix}@example.com`,
          name: "SecretViewerName",
        },
      }),
      db.user.create({
        data: {
          id: crypto.randomUUID(),
          email: `outsider_5_6_${suffix}@example.com`,
          name: "SecretOutsiderName",
        },
      }),
    ]);

    ownerId = owner.id;
    adminId = admin.id;
    editorId = editor.id;
    viewerId = viewer.id;
    outsiderId = outsider.id;

    await createAccountWithFreeGrant(ownerId);

    const ws = await db.workspace.create({
      data: {
        ownerId,
        title: "Step 5.6 Export Workspace",
        members: {
          create: [
            { userId: adminId, role: "ADMIN", invitedById: ownerId },
            { userId: editorId, role: "EDITOR", invitedById: ownerId },
            { userId: viewerId, role: "VIEWER", invitedById: ownerId },
          ],
        },
      },
    });
    workspaceId = ws.id;

    // Create target response with citations
    const resp1 = await db.response.create({
      data: {
        workspaceId,
        createdById: ownerId,
        prompt: "Draft the Q1-Q2 multilingual architecture plan",
        kind: "TEXT",
        origin: "DIRECT",
      },
    });
    responseId = resp1.id;

    const ver1 = await db.responseVersion.create({
      data: {
        responseId: resp1.id,
        number: 1,
        status: "COMPLETE",
        content: richMarkdown,
        modelKey: "text-standard",
        providerModelId: "gemini-2.5-pro",
        promptVersion: "v1",
        createdById: ownerId,
      },
    });

    await db.citation.createMany({
      data: [
        {
          versionId: ver1.id,
          index: 1,
          url: "https://klecx.example.com/architecture",
          title: "Klecx Architecture Guide",
          snippet: "System design principles",
          source: "GROUNDING",
        },
        {
          versionId: ver1.id,
          index: 2,
          url: "https://klecx.example.com/security",
          title: "Security Checklist",
          snippet: "SSRF and export isolation",
          source: "ATTACHMENT",
        },
      ],
    });

    await db.response.update({
      where: { id: resp1.id },
      data: { activeVersionId: ver1.id },
    });

    // Create a second response in the same workspace to verify single-response export isolation
    const resp2 = await db.response.create({
      data: {
        workspaceId,
        createdById: ownerId,
        prompt: "CONFIDENTIAL_SECOND_PROMPT_DO_NOT_LEAK",
        kind: "TEXT",
        origin: "DIRECT",
      },
    });

    const ver2 = await db.responseVersion.create({
      data: {
        responseId: resp2.id,
        number: 1,
        status: "COMPLETE",
        content: "CONFIDENTIAL_SECOND_RESPONSE_BODY_DO_NOT_LEAK",
        modelKey: "text-economy",
        providerModelId: "gemini-2.5-flash-lite",
        promptVersion: "v1",
        createdById: ownerId,
      },
    });

    await db.response.update({
      where: { id: resp2.id },
      data: { activeVersionId: ver2.id },
    });
  });

  beforeEach(() => {
    resetExportRateLimitsForTesting();
    mockStorage = new MockStorageProvider();
    setStorageProvider(mockStorage);
    setUserPlanOverride(ownerId, "PRO");
    setUserPlanOverride(adminId, "PRO");
    setUserPlanOverride(editorId, "PRO");
    setUserPlanOverride(viewerId, "PRO");
    mockActorId = ownerId;
  });

  afterEach(() => {
    setStorageProvider(null);
  });

  afterAll(async () => {
    setCustomProvider(null);
    setStorageProvider(null);
    clearUserPlanOverrides();
    resetExportRateLimitsForTesting();
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({
      where: { id: { in: [ownerId, adminId, editorId, viewerId, outsiderId] } },
    });
  });

  test("1. Exports a response with table, code, formatting, link, citations, and Spanish/Arabic text to MD, PDF, and DOCX", async () => {
    const actor = {
      userId: ownerId,
      sessionId: "sess_owner",
      email: "owner@example.com",
      role: "USER" as const,
    };

    const accBefore = await getAccountByUserId(ownerId);

    // 1A. Markdown (.md) export
    const mdExport = await exportResponseDocument(actor, responseId, {
      format: "md",
      userPlan: "PRO",
    });

    expect(mdExport.filename.endsWith(".md")).toBe(true);
    expect(mdExport.contentDisposition).toContain("attachment;");
    expect(mdExport.contentDisposition).toContain("filename*=UTF-8''");
    const mdText = mdExport.buffer.toString("utf-8");

    // Front-matter checks (includes source workspace URL because exporter is owner)
    expect(mdText).toContain("title: \"Draft the Q1-Q2 multilingual architecture plan\"");
    expect(mdText).toContain(`source: "http`);
    expect(mdText).toContain(`/workspaces/${workspaceId}"`);
    expect(mdText).toContain("model: \"text-standard\"");
    expect(mdText).toContain("version: 1");

    // Body content checks (table, code, link, Spanish & Arabic)
    expect(mdText).toContain("| Quarter | Deliverable | Status |");
    expect(mdText).toContain("calculateVelocity");
    expect(mdText).toContain("[Klecx Portal](https://klecx.example.com/docs)");
    expect(mdText).toContain("¡Hola mundo!");
    expect(mdText).toContain("مرحبا بالعالم");

    // References section
    expect(mdText).toContain("## References");
    expect(mdText).toContain("1. [Klecx Architecture Guide](https://klecx.example.com/architecture)");
    expect(mdText).toContain("2. [Security Checklist](https://klecx.example.com/security)");

    // Isolation check: never contains other responses or member names
    expect(mdText).not.toContain("CONFIDENTIAL_SECOND_RESPONSE_BODY_DO_NOT_LEAK");
    expect(mdText).not.toContain("CONFIDENTIAL_SECOND_PROMPT_DO_NOT_LEAK");
    expect(mdText).not.toContain("SecretOwnerName");
    expect(mdText).not.toContain("SecretEditorName");

    // 1B. PDF (.pdf) export
    const pdfExport = await exportResponseDocument(actor, responseId, {
      format: "pdf",
      userPlan: "PRO",
    });
    expect(pdfExport.filename.endsWith(".pdf")).toBe(true);
    expect(pdfExport.mime).toBe("application/pdf");
    expect(pdfExport.buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdfExport.buffer.byteLength).toBeGreaterThan(500);

    // 1C. Word (.docx) export
    const docxExport = await exportResponseDocument(actor, responseId, {
      format: "docx",
      userPlan: "PRO",
    });
    expect(docxExport.filename.endsWith(".docx")).toBe(true);
    expect(docxExport.mime).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    // DOCX is a ZIP archive starting with PK\x03\x04
    expect(docxExport.buffer[0]).toBe(0x50);
    expect(docxExport.buffer[1]).toBe(0x4b);
    expect(docxExport.buffer[2]).toBe(0x03);
    expect(docxExport.buffer[3]).toBe(0x04);
    expect(docxExport.buffer.byteLength).toBeGreaterThan(1000);

    // Exports cost 0 credits
    const accAfter = await getAccountByUserId(ownerId);
    expect(accAfter?.planBalance).toBe(accBefore?.planBalance);

    // Verify GENERATED_DOCUMENT attachment rows were stored with responseId: null (for 24h TTL cleanup)
    const storedAtt = await db.attachment.findUnique({
      where: { id: pdfExport.attachmentId },
    });
    expect(storedAtt).not.toBeNull();
    expect(storedAtt?.kind).toBe("GENERATED_DOCUMENT");
    expect(storedAtt?.responseId).toBeNull();
  });

  test("2. Source workspace URL is included ONLY when the exporter owns the workspace", async () => {
    const editorActor = {
      userId: editorId,
      sessionId: "sess_editor",
      email: "editor@example.com",
      role: "USER" as const,
    };

    const editorExport = await exportResponseDocument(editorActor, responseId, {
      format: "md",
      userPlan: "PRO",
    });

    const mdText = editorExport.buffer.toString("utf-8");
    expect(mdText).toContain("title: \"Draft the Q1-Q2 multilingual architecture plan\"");
    expect(mdText).not.toContain("source:");
    expect(mdText).not.toContain(`/workspaces/${workspaceId}`);
  });

  test("3. Authorization: another user or viewer cannot export a response; workspace export requires OWNER or ADMIN", async () => {
    // Outsider cannot export response -> 404 (notFound to avoid leaking workspace existence)
    mockActorId = outsiderId;
    const outsiderReq = new NextRequest(
      `http://localhost:3000/api/v1/responses/${responseId}/export?format=md`
    );
    const outsiderRes = await exportResponseRoute(outsiderReq, {
      params: Promise.resolve({ id: responseId }),
    });
    expect(outsiderRes.status).toBe(404);

    // Viewer cannot export response (lacks workspace.export) -> 403
    mockActorId = viewerId;
    const viewerReq = new NextRequest(
      `http://localhost:3000/api/v1/responses/${responseId}/export?format=md`
    );
    const viewerRes = await exportResponseRoute(viewerReq, {
      params: Promise.resolve({ id: responseId }),
    });
    expect(viewerRes.status).toBe(403);

    // Editor can export single response (has workspace.export), but CANNOT export entire workspace -> 403
    mockActorId = editorId;
    const editorWsReq = new NextRequest(
      `http://localhost:3000/api/v1/workspaces/${workspaceId}/export?format=md`
    );
    const editorWsRes = await exportWorkspaceRoute(editorWsReq, {
      params: Promise.resolve({ id: workspaceId }),
    });
    expect(editorWsRes.status).toBe(403);

    // Admin CAN export entire workspace (200), and sourceUrl is omitted since admin != owner
    mockActorId = adminId;
    const adminWsReq = new NextRequest(
      `http://localhost:3000/api/v1/workspaces/${workspaceId}/export?format=md`
    );
    const adminWsRes = await exportWorkspaceRoute(adminWsReq, {
      params: Promise.resolve({ id: workspaceId }),
    });
    expect(adminWsRes.status).toBe(200);
    expect(adminWsRes.headers.get("Content-Disposition")).toContain(
      "attachment;"
    );
    const wsMd = await adminWsRes.text();
    expect(wsMd).toContain("Draft the Q1-Q2 multilingual architecture plan");
    expect(wsMd).toContain("CONFIDENTIAL_SECOND_RESPONSE_BODY_DO_NOT_LEAK");
    expect(wsMd).not.toContain("source:");
    expect(wsMd).not.toContain("SecretOwnerName");
  });

  test("4. Plan gates & daily export cap: FREE plan allows MD but blocks PDF/DOCX; daily cap returns 429", async () => {
    setUserPlanOverride(ownerId, "FREE");
    mockActorId = ownerId;

    // FREE user can export Markdown
    const mdReq = new NextRequest(
      `http://localhost:3000/api/v1/responses/${responseId}/export?format=md`
    );
    const mdRes = await exportResponseRoute(mdReq, {
      params: Promise.resolve({ id: responseId }),
    });
    expect(mdRes.status).toBe(200);

    // FREE user is blocked from PDF and DOCX
    const pdfReq = new NextRequest(
      `http://localhost:3000/api/v1/responses/${responseId}/export?format=pdf`
    );
    const pdfRes = await exportResponseRoute(pdfReq, {
      params: Promise.resolve({ id: responseId }),
    });
    expect(pdfRes.status).toBe(403);

    const docxReq = new NextRequest(
      `http://localhost:3000/api/v1/responses/${responseId}/export?format=docx`
    );
    const docxRes = await exportResponseRoute(docxReq, {
      params: Promise.resolve({ id: responseId }),
    });
    expect(docxRes.status).toBe(403);

    // Daily export cap check
    setDailyExportCapForTesting(2);
    const secondMdRes = await exportResponseRoute(mdReq, {
      params: Promise.resolve({ id: responseId }),
    });
    expect(secondMdRes.status).toBe(200);

    const thirdMdRes = await exportResponseRoute(mdReq, {
      params: Promise.resolve({ id: responseId }),
    });
    expect(thirdMdRes.status).toBe(429);
  });

  test("5. Natural-language document request ('Make a PDF of this plan') via create_document tool creates a downloadable card", async () => {
    setUserPlanOverride(ownerId, "PRO");
    mockActorId = ownerId;

    let capturedTools: unknown[] | undefined;

    const fakeDocToolProvider: AiProvider = {
      id: "gemini",
      async *stream(req: GenerateRequest): AsyncIterable<StreamEvent> {
        capturedTools = req.tools;
        yield {
          type: "text_delta",
          text: "Here is the PDF of your quarterly plan:",
        };
        yield {
          type: "tool_call",
          name: "create_document",
          args: {
            format: "pdf",
            title: "Quarterly\u0000 Plan \u00072026",
            markdown: "# Quarterly Plan 2026\n\n- Milestone 1: Launch\n- Milestone 2: Scale",
          },
        };
        yield {
          type: "usage",
          inputTokens: 40,
          outputTokens: 35,
          estimated: false,
        };
        yield { type: "done", finishReason: "stop" };
      },
    };

    const actor = {
      userId: ownerId,
      sessionId: "sess_owner",
      email: "owner@example.com",
      role: "USER" as const,
    };

    const { stream, generationId } = await createAndStreamGeneration(
      actor,
      workspaceId,
      {
        prompt: "Make a PDF of this plan",
        modelKey: "text-standard",
        idempotencyKey: `idem_doc_${Date.now()}`,
      },
      {
        providerInstance: fakeDocToolProvider,
        userPlan: "PRO",
      }
    );

    const sseOutput = await consumeStream(stream);

    // Verify CREATE_DOCUMENT_TOOL was passed to the provider
    expect(capturedTools).toBeDefined();
    expect(capturedTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: CREATE_DOCUMENT_TOOL.name }),
      ])
    );

    // Verify SSE output contains downloadable card
    expect(sseOutput).toContain("Quarterly-Plan-2026.pdf");
    expect(sseOutput).toContain("/api/v1/attachments/");
    expect(sseOutput).toContain("/download");

    const gen = await db.generation.findUnique({ where: { id: generationId } });
    expect(gen?.status).toBe("COMPLETED");

    // Verify the GENERATED_DOCUMENT attachment is linked to the response
    const docAtt = await db.attachment.findFirst({
      where: {
        responseId: gen!.responseId!,
        kind: "GENERATED_DOCUMENT",
      },
    });
    expect(docAtt).not.toBeNull();
    expect(docAtt?.originalName).toBe("Quarterly-Plan-2026.pdf");
    expect(docAtt?.mime).toBe("application/pdf");

    // Verify the download route streams the generated PDF to the workspace member
    const dlReq = new NextRequest(
      `http://localhost:3000/api/v1/attachments/${docAtt!.id}/download`
    );
    const dlRes = await downloadAttachmentRoute(dlReq, {
      params: Promise.resolve({ id: docAtt!.id }),
    });
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get("Content-Type")).toBe("application/pdf");
    expect(dlRes.headers.get("Content-Disposition")).toContain(
      "Quarterly-Plan-2026.pdf"
    );
    const downloadedBytes = Buffer.from(await dlRes.arrayBuffer());
    expect(downloadedBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    // Verify outsider cannot download the generated document
    mockActorId = outsiderId;
    const outsiderDlRes = await downloadAttachmentRoute(dlReq, {
      params: Promise.resolve({ id: docAtt!.id }),
    });
    expect(outsiderDlRes.status).toBe(404);
  });

  test("6. Validation: create_document tool enforces title <= 120 chars, markdown <= 200k chars, and Cloudinary-only image rule", async () => {
    // Title > 120 chars rejected
    expect(() => sanitizeDocumentTitle("A".repeat(121))).toThrow();

    // Control characters stripped from title
    expect(sanitizeDocumentTitle("Report\u0000\u0007\nTitle")).toBe(
      "Report Title"
    );

    // Markdown > 200,000 chars rejected
    expect(() => sanitizeDocumentMarkdown("M".repeat(200_001))).toThrow();

    // executeCreateDocumentToolCall rejects oversized title
    await expect(
      executeCreateDocumentToolCall({
        actorId: ownerId,
        workspaceId,
        responseId,
        args: {
          format: "md",
          title: "T".repeat(130),
          markdown: "# Valid body",
        },
      })
    ).rejects.toThrow();

    // Cloudinary-only image check refuses arbitrary third-party image URLs
    expect(
      isTrustedCloudinaryImageUrl("https://evil.example.com/tracker.png")
    ).toBe(false);
    expect(
      isTrustedCloudinaryImageUrl("http://169.254.169.254/latest/meta-data/")
    ).toBe(false);
  });
});
