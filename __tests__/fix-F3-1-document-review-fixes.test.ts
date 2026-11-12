/**
 * @jest-environment node
 */

import crypto from "node:crypto";
import katex from "katex";
import { db } from "@/server/db/client";
import { addDocumentToWorkspace } from "@/server/services/workspace-document";
import { createAnnotation } from "@/server/services/annotation";
import { regenerateResponse } from "@/server/services/response";
import { ASK_TARGET_INCLUDE, loadAskTarget } from "@/server/ai/ask-context";
import {
  quoteIsFromStoredText,
  renderMathAsPageText,
} from "@/server/services/quote-source";
import { quoteIsFromSource } from "@/lib/annotations/quote-match";
import {
  MAX_WORKSPACE_DOCUMENTS,
  isWorkspaceDocumentFile,
} from "@/lib/documents/workspace-document-types";

const mockStorageBuffers = new Map<string, Buffer>();

jest.mock("../server/storage", () => ({
  getStorageProvider: () => ({
    downloadBuffer: jest.fn(async (key: string) => {
      const buf = mockStorageBuffers.get(key);
      if (!buf) throw new Error(`secret-bucket/internal/path/${key} not found`);
      return buf;
    }),
  }),
}));

/** The text a browser's selection holds for the visible part of a formula. */
function visibleFormulaText(tex: string, displayMode = false): string {
  const html = katex.renderToString(tex, { displayMode });
  const visible = html.slice(html.indexOf('<span class="katex-html"'));
  return visible.replace(/<[^>]*>/g, "");
}

/** The text of the whole rendered formula (hidden accessible copy + visible part). */
function wholeFormulaText(tex: string, displayMode = false): string {
  return katex
    .renderToString(tex, { displayMode })
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const GAUSS = "\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}";
const DOCUMENT = [
  "# Notes",
  "",
  "Mass and energy are related by $E = mc^2$ in every frame.",
  "",
  "$$",
  GAUSS,
  "$$",
  "",
  "The end.",
].join("\n");

describe("Step F3.1 review — formulas can be highlighted", () => {
  it("accepts a highlight made of a formula alone", () => {
    // The whole inline formula, as the page text holds it.
    expect(quoteIsFromStoredText(DOCUMENT, wholeFormulaText("E = mc^2"))).toBe(true);
    // Only what the reader sees of the block formula.
    const visible = visibleFormulaText(GAUSS, true);
    expect(visible).toContain("π");
    expect(visible).not.toContain("\\frac");
    // Compared with the LaTeX source alone, it was refused.
    expect(quoteIsFromSource(DOCUMENT, visible)).toBe(false);
    expect(quoteIsFromStoredText(DOCUMENT, visible)).toBe(true);
    // A formula with the words around it.
    expect(
      quoteIsFromStoredText(
        DOCUMENT,
        `related by ${wholeFormulaText("E = mc^2")} in every frame`
      )
    ).toBe(true);
  });

  it("still refuses text that isn't in the document", () => {
    expect(quoteIsFromStoredText(DOCUMENT, "a sentence nobody wrote here")).toBe(false);
    expect(quoteIsFromStoredText(DOCUMENT, wholeFormulaText("a^2 + b^2 = c^2"))).toBe(false);
  });

  it("leaves text without formulas untouched", () => {
    expect(renderMathAsPageText("Costs $5 today")).toBe("Costs $5 today");
    expect(renderMathAsPageText("No maths here.")).toBe("No maths here.");
  });
});

describe("Step F3.1 review — document service", () => {
  const userIds: string[] = [];
  const workspaceIds: string[] = [];

  const actorOf = (userId: string) => ({
    userId,
    sessionId: `sess-${userId}`,
    email: `user-${userId}@example.com`,
    role: "USER" as const,
  });

  async function seed() {
    const ownerId = crypto.randomUUID();
    const strangerId = crypto.randomUUID();
    userIds.push(ownerId, strangerId);
    await db.user.createMany({
      data: [
        { id: ownerId, email: `o-${ownerId}@example.com`, name: "Ada", emailVerified: true },
        { id: strangerId, email: `s-${strangerId}@example.com`, name: "Sam", emailVerified: true },
      ],
    });
    const workspaceId = crypto.randomUUID();
    workspaceIds.push(workspaceId);
    await db.workspace.create({
      data: {
        id: workspaceId,
        ownerId,
        title: "Docs",
        members: { create: [{ userId: ownerId, role: "ADMIN", invitedById: ownerId }] },
      },
    });
    return { ownerId, strangerId, workspaceId };
  }

  async function attach(
    ownerId: string,
    workspaceId: string,
    file: { name: string; mime: string; content: string | null }
  ) {
    const id = crypto.randomUUID();
    const providerId = `test/${workspaceId}/${id}`;
    if (file.content !== null) {
      mockStorageBuffers.set(providerId, Buffer.from(file.content, "utf-8"));
    }
    await db.attachment.create({
      data: {
        id,
        ownerId,
        workspaceId,
        kind: "DOCUMENT",
        status: "READY",
        providerId,
        resourceType: "raw",
        originalName: file.name,
        mime: file.mime,
        bytes: file.content?.length ?? 1,
      },
    });
    return id;
  }

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("does not offer or accept PDFs as workspace documents", async () => {
    expect(isWorkspaceDocumentFile({ name: "paper.pdf", type: "application/pdf" })).toBe(false);
    expect(isWorkspaceDocumentFile({ name: "paper.PDF", type: "" })).toBe(false);
    expect(isWorkspaceDocumentFile({ name: "notes.md", type: "" })).toBe(true);
    expect(
      isWorkspaceDocumentFile({
        name: "spec",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
    ).toBe(true);

    const { ownerId, workspaceId } = await seed();
    const pdfId = await attach(ownerId, workspaceId, {
      name: "paper.pdf",
      mime: "application/pdf",
      content: "%PDF-1.4",
    });

    await expect(
      addDocumentToWorkspace(actorOf(ownerId), workspaceId, pdfId)
    ).rejects.toMatchObject({ status: 400, code: "document_type_unsupported" });
    expect(await db.response.count({ where: { workspaceId } })).toBe(0);
  });

  it("answers 404 to someone who isn't in the workspace", async () => {
    const { ownerId, strangerId, workspaceId } = await seed();
    const attachmentId = await attach(ownerId, workspaceId, {
      name: "notes.md",
      mime: "text/markdown",
      content: "# Notes",
    });

    await expect(
      addDocumentToWorkspace(actorOf(strangerId), workspaceId, attachmentId)
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses an empty file and hides storage errors", async () => {
    const { ownerId, workspaceId } = await seed();
    const emptyId = await attach(ownerId, workspaceId, {
      name: "empty.txt",
      mime: "text/plain",
      content: "  \n ",
    });
    await expect(
      addDocumentToWorkspace(actorOf(ownerId), workspaceId, emptyId)
    ).rejects.toMatchObject({ code: "document_empty" });

    const missingId = await attach(ownerId, workspaceId, {
      name: "gone.md",
      mime: "text/markdown",
      content: null,
    });
    const error = await addDocumentToWorkspace(
      actorOf(ownerId),
      workspaceId,
      missingId
    ).catch((e: Error & { code?: string }) => e);
    expect(error).toMatchObject({ code: "document_unreadable" });
    expect((error as Error).message).not.toContain("secret-bucket");
  });

  it("limits a workspace to 3 documents and frees a place when one is deleted", async () => {
    const { ownerId, workspaceId } = await seed();
    const owner = actorOf(ownerId);
    const added: string[] = [];
    for (let i = 1; i <= MAX_WORKSPACE_DOCUMENTS; i++) {
      const id = await attach(ownerId, workspaceId, {
        name: `doc-${i}.md`,
        mime: "text/markdown",
        content: `# Document ${i}`,
      });
      added.push((await addDocumentToWorkspace(owner, workspaceId, id)).id);
    }
    expect(MAX_WORKSPACE_DOCUMENTS).toBe(3);

    const extraId = await attach(ownerId, workspaceId, {
      name: "one-too-many.md",
      mime: "text/markdown",
      content: "# Extra",
    });
    await expect(
      addDocumentToWorkspace(owner, workspaceId, extraId)
    ).rejects.toMatchObject({
      status: 409,
      code: "document_limit",
      details: { limit: 3 },
    });

    await db.response.update({
      where: { id: added[0]! },
      data: { deletedAt: new Date() },
    });
    const replaced = await addDocumentToWorkspace(owner, workspaceId, extraId);
    expect(replaced.kind).toBe("DOCUMENT");
  }, 15_000);

  it("lets a member comment on a formula, describes the document to an Ask, and can't regenerate it", async () => {
    const { ownerId, workspaceId } = await seed();
    const owner = actorOf(ownerId);
    const attachmentId = await attach(ownerId, workspaceId, {
      name: "physics.md",
      mime: "text/markdown",
      content: DOCUMENT,
    });
    const doc = await addDocumentToWorkspace(owner, workspaceId, attachmentId);

    // The request that failed with "Selected text is not a substring…".
    const comment = await createAnnotation(owner, doc.activeVersionId, {
      kind: "COMMENT",
      anchor: { exact: visibleFormulaText(GAUSS, true), prefix: "", suffix: "" },
      contentSource: "ORIGINAL",
      text: "Is this the Gaussian integral?",
    });
    expect(comment.id).toBeTruthy();

    const ask = await createAnnotation(owner, doc.activeVersionId, {
      kind: "ASK",
      mode: "queue",
      anchor: { exact: wholeFormulaText("E = mc^2"), prefix: "", suffix: "" },
      contentSource: "ORIGINAL",
      text: "Explain this",
    });
    const stored = await db.annotation.findUniqueOrThrow({
      where: { id: ask.id },
      include: ASK_TARGET_INCLUDE,
    });
    const target = await loadAskTarget(stored);
    expect(target?.description).toBe('The user uploaded the document "physics.md"');
    expect(target?.text).toBe(DOCUMENT);

    await expect(
      regenerateResponse(owner, doc.id, { idempotencyKey: crypto.randomUUID() })
    ).rejects.toMatchObject({ status: 400, code: "document_not_regenerable" });
  }, 15_000);
});
