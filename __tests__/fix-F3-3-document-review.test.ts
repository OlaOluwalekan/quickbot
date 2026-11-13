/**
 * @jest-environment node
 */

import crypto from "node:crypto";
import { db } from "@/server/db/client";
import {
  chunkDocumentByHeadings,
  validateFinding,
  startDocumentReview,
  estimateDocumentReview,
} from "@/server/services/document-review";
import { buildMarkdownTextMap } from "@/lib/documents/markdown-text";
import { exportResponseDocument } from "@/server/documents";
import { MockStorageProvider, setStorageProvider } from "@/server/storage";
import type { StreamEvent } from "@/server/ai/types";
import { updateAnnotation } from "@/server/services/annotation";
import { createResponseEdit } from "@/server/services/response";
import type { AiProvider } from "@/server/ai";

let mockActorId = "";
jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(async () =>
    mockActorId
      ? {
          userId: mockActorId,
          sessionId: `sess-${mockActorId}`,
          email: `user-${mockActorId}@example.com`,
          role: "USER" as const,
        }
      : null
  ),
  requireActor: jest.fn(async () => ({
    userId: mockActorId,
    sessionId: `sess-${mockActorId}`,
    email: `user-${mockActorId}@example.com`,
    role: "USER" as const,
  })),
}));

describe("Step F3.3 — Document Review Service & Validation", () => {
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    if (createdWorkspaceIds.length > 0) {
      await db.annotation.deleteMany({
        where: { workspaceId: { in: createdWorkspaceIds } },
      });
      await db.workspace.deleteMany({
        where: { id: { in: createdWorkspaceIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await db.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  const chunkOf = (markdown: string) => ({
    index: 1,
    total: 1,
    markdown,
    charOffset: 0,
  });

  describe("chunkDocumentByHeadings", () => {
    it("keeps a short document in one chunk", () => {
      const doc = "# One\nIntro.\n\n## Two\nMore.";
      const chunks = chunkDocumentByHeadings(doc, 8000);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.markdown).toBe(doc);
      expect(chunks[0]?.index).toBe(1);
      expect(chunks[0]?.total).toBe(1);
    });

    it("cuts at headings, and every chunk is an exact slice of the document", () => {
      const section = (n: number) => `## Section ${n}\n\n${"word ".repeat(60)}\n\n`;
      const doc = [1, 2, 3, 4, 5].map(section).join("");
      // 100 tokens ≈ 400 characters: one section (≈ 315 chars) per chunk.
      const chunks = chunkDocumentByHeadings(doc, 100);
      expect(chunks.length).toBe(5);
      for (const c of chunks) {
        expect(c.markdown.startsWith("## Section")).toBe(true);
        expect(doc.slice(c.charOffset, c.charOffset + c.markdown.length)).toBe(c.markdown);
        expect(c.total).toBe(chunks.length);
      }
      expect(chunks.map((c) => c.markdown).join("")).toBe(doc);
    });

    it("cuts a long section between paragraphs without losing text", () => {
      const doc = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} ${"x".repeat(90)}`).join(
        "\n\n\n"
      );
      const chunks = chunkDocumentByHeadings(doc, 60);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.map((c) => c.markdown).join("")).toBe(doc);
      for (const c of chunks) {
        expect(c.markdown.length).toBeLessThanOrEqual(240);
        expect(doc.slice(c.charOffset, c.charOffset + c.markdown.length)).toBe(c.markdown);
      }
    });

    it("returns nothing for an empty document", () => {
      expect(chunkDocumentByHeadings("  \n ")).toEqual([]);
    });
  });

  describe("buildMarkdownTextMap", () => {
    it("gives the text shown on the page for a span of Markdown", () => {
      const source = "# Title\n\nWe use **JavScript** and [React](https://example.com) here.";
      const map = buildMarkdownTextMap(source);
      const start = source.indexOf("use **JavScript** and");
      const span = map.locate(start, start + "use **JavScript** and".length);
      expect(span?.exact).toBe("use JavScript and");
      expect(map.pageText.slice(span!.start, span!.end)).toBe("use JavScript and");
      expect(span?.prefix.endsWith("We ")).toBe(true);
    });

    it("refuses spans in code, and spans that cross a paragraph", () => {
      const source = "Run `npm instal` first.\n\nSecond paragraph.";
      const map = buildMarkdownTextMap(source);
      const code = source.indexOf("npm instal");
      expect(map.locate(code, code + 10)).toBeNull();
      const cross = source.indexOf("first.");
      expect(map.locate(cross, source.indexOf("paragraph"))).toBeNull();
    });
  });

  describe("validateFinding", () => {
    it("accepts a finding copied from the text and keeps a fix that applies cleanly", () => {
      const source = "We use JavScript for frontend development.";
      const found = validateFinding(
        chunkOf(source),
        {
          exact: "JavScript",
          prefix: "We use ",
          suffix: " for frontend",
          comment: "Typo in JavaScript",
          category: "spelling",
          severity: "low",
          replacement: "JavaScript",
        },
        source
      );
      expect(found?.anchor.exact).toBe("JavScript");
      expect(found?.sourceStart).toBe(7);
      expect(found?.suggestion).toEqual({
        exact: "JavScript",
        prefix: "We use ",
        suffix: " for frontend development.",
        replacement: "JavaScript",
      });
    });

    it("anchors to the text on the page, and fixes the Markdown source", () => {
      const source = "Please use **JavScript** here.";
      const found = validateFinding(
        chunkOf(source),
        {
          exact: "**JavScript**",
          comment: "Typo",
          category: "spelling",
          severity: "low",
          replacement: "**JavaScript**",
        },
        source
      );
      // The reader sees "JavScript": that is what the highlight looks for.
      expect(found?.anchor.exact).toBe("JavScript");
      expect(found?.suggestion?.exact).toBe("**JavScript**");
    });

    it("drops a finding whose text is not in the document", () => {
      const source = "We use TypeScript for all services.";
      expect(
        validateFinding(
          chunkOf(source),
          { exact: "Python", comment: "Wrong language", category: "factual", severity: "medium" },
          source
        )
      ).toBeNull();
    });

    it("drops a finding that could be in several places", () => {
      const source = "the cat sat. the cat ran. the cat slept.";
      expect(
        validateFinding(
          chunkOf(source),
          { exact: "the cat", prefix: "", suffix: "", comment: "Repeated", category: "clarity", severity: "low" },
          source
        )
      ).toBeNull();
    });

    it("picks the occurrence the context points at", () => {
      const source = "First teh word. Then teh other one.";
      const found = validateFinding(
        chunkOf(source),
        {
          exact: "teh",
          prefix: "Then ",
          suffix: " other one.",
          comment: "Typo",
          category: "spelling",
          severity: "low",
          replacement: "the",
        },
        source
      );
      expect(found?.sourceStart).toBe(source.lastIndexOf("teh"));
      expect(found?.suggestion?.replacement).toBe("the");
    });

    it("keeps the comment without a fix when no replacement is given", () => {
      const source = "We use TypeScript for all services.";
      const found = validateFinding(
        chunkOf(source),
        { exact: "TypeScript", comment: "Say which version.", category: "clarity", severity: "low" },
        source
      );
      expect(found?.anchor.exact).toBe("TypeScript");
      expect(found?.suggestion).toBeNull();
    });

    it("falls back to safe values for an unknown category or severity", () => {
      const source = "We use TypeScript for all services.";
      const found = validateFinding(
        chunkOf(source),
        { exact: "TypeScript", comment: "Hm.", category: "style", severity: "urgent" },
        source
      );
      expect(found?.category).toBe("other");
      expect(found?.severity).toBe("low");
    });
  });

  describe("startDocumentReview", () => {
    let workspaceId: string;
    let ownerId: string;
    let viewerId: string;
    let editorId: string;
    let outsiderId: string;
    let responseId: string;
    let versionId: string;

    beforeAll(async () => {
      const stamp = Date.now();
      const owner = await db.user.create({
        data: {
          id: `f33-owner-${stamp}`,
          name: "Owner User",
          email: `f33-owner-${stamp}@example.com`,
          emailVerified: true,
        },
      });
      ownerId = owner.id;
      createdUserIds.push(ownerId);

      await db.creditAccount.create({
        data: {
          userId: ownerId,
          planBalance: 100,
          topupBalance: 0,
        },
      });

      const viewer = await db.user.create({
        data: {
          id: `f33-viewer-${stamp}`,
          name: "Viewer User",
          email: `f33-viewer-${stamp}@example.com`,
          emailVerified: true,
        },
      });
      viewerId = viewer.id;
      createdUserIds.push(viewerId);

      const editor = await db.user.create({
        data: {
          id: `f33-editor-${stamp}`,
          name: "Editor User",
          email: `f33-editor-${stamp}@example.com`,
          emailVerified: true,
        },
      });
      editorId = editor.id;
      const outsider = await db.user.create({
        data: {
          id: `f33-outsider-${stamp}`,
          name: "Outsider",
          email: `f33-outsider-${stamp}@example.com`,
          emailVerified: true,
        },
      });
      outsiderId = outsider.id;
      createdUserIds.push(editorId, outsiderId);

      const ws = await db.workspace.create({
        data: {
          id: `f33-ws-${stamp}`,
          title: "F3.3 Review Test Workspace",
          ownerId,
          members: {
            create: [
              { userId: ownerId, role: "ADMIN", invitedById: ownerId },
              { userId: viewerId, role: "VIEWER", invitedById: ownerId },
              { userId: editorId, role: "EDITOR", invitedById: ownerId },
            ],
          },
        },
      });
      workspaceId = ws.id;
      createdWorkspaceIds.push(workspaceId);

      versionId = crypto.randomUUID();
      const resp = await db.response.create({
        data: {
          id: `f33-resp-${stamp}`,
          workspaceId,
          createdById: ownerId,
          kind: "DOCUMENT",
          prompt: "Draft PRD",
          versions: {
            create: {
              id: versionId,
              number: 1,
              status: "COMPLETE",
              content: "# PRD\n\nWe use JavScript for building apps.",
              modelKey: "text-economy",
              providerModelId: "text-economy",
              promptVersion: "review-test",
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
    });

    const actorOf = (userId: string) => ({
      userId,
      sessionId: `sess-${userId}`,
      email: `${userId}@example.com`,
      role: "USER" as const,
    });

    /** A provider that answers every part of the document with `findings`. */
    const providerReturning = (findings: unknown, calls = { n: 0 }): AiProvider => ({
      id: "gemini",
      stream: async function* (): AsyncIterable<StreamEvent> {
        calls.n++;
        yield {
          type: "text_delta",
          text: typeof findings === "string" ? findings : JSON.stringify(findings),
        };
        yield { type: "usage", inputTokens: 100, outputTokens: 50, estimated: false };
      },
    });

    async function readEvents(stream: ReadableStream<Uint8Array>) {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      return text
        .split("\n\n")
        .filter(Boolean)
        .map((block) => {
          const type = /^event: (.*)$/m.exec(block)?.[1] ?? "";
          const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "null");
          return { type, data };
        });
    }

    const typoFinding = {
      exact: "JavScript",
      prefix: "We use ",
      suffix: " for building",
      comment: "Did you mean JavaScript?",
      category: "spelling",
      severity: "low",
      replacement: "JavaScript",
    };

    it("saves valid findings as Klecx comments, drops invented ones, charges once", async () => {
      mockActorId = ownerId;
      const actor = actorOf(ownerId);
      const calls = { n: 0 };

      const { stream, generationId } = await startDocumentReview(
        actor,
        versionId,
        { preset: "errors", visibility: "WORKSPACE", idempotencyKey: `review-${crypto.randomUUID()}` },
        {
          providerInstance: providerReturning(
            [
              typoFinding,
              {
                exact: "NonExistentWord",
                prefix: "Foo ",
                suffix: " Bar",
                comment: "Invented issue",
                category: "factual",
                severity: "high",
              },
            ],
            calls
          ),
        }
      );
      const events = await readEvents(stream);

      expect(calls.n).toBe(1);
      expect(events.some((e) => e.type === "progress")).toBe(true);

      const findings = events.filter((e) => e.type === "finding");
      expect(findings).toHaveLength(1);
      expect(findings[0]?.data.anchor.exact).toBe("JavScript");
      expect(findings[0]?.data.replacement).toBe("JavaScript");

      const summary = events.find((e) => e.type === "summary");
      expect(summary?.data).toMatchObject({ total: 1, fixes: 1, incomplete: false });
      expect(summary?.data.byCategory.spelling).toBe(1);

      const saved = await db.annotation.findUnique({
        where: { id: findings[0]?.data.annotationId },
        include: { messages: true },
      });
      expect(saved?.authorType).toBe("AI");
      expect(saved?.kind).toBe("COMMENT");
      expect(saved?.visibility).toBe("WORKSPACE");
      expect(saved?.createdById).toBe(ownerId);
      expect(saved?.suggestionState).toBe("PENDING");
      expect(saved?.suggestion).toMatchObject({
        category: "spelling",
        severity: "low",
        exact: "JavScript",
        replacement: "JavaScript",
      });
      expect(saved?.messages[0]?.role).toBe("ASSISTANT");
      expect(saved?.messages[0]?.content).toBe("Did you mean JavaScript?");

      // Credits: one generation, reserved once and settled once.
      const generation = await db.generation.findUnique({ where: { id: generationId } });
      expect(generation?.kind).toBe("DOCUMENT_REVIEW");
      expect(generation?.status).toBe("COMPLETED");
      expect(generation?.actorId).toBe(ownerId);
      expect(generation?.chargedCredits).toBeGreaterThan(0);
      expect(
        await db.generation.count({ where: { workspaceId, kind: "DOCUMENT_REVIEW" } })
      ).toBe(1);
    });

    it("does not report the same open finding twice", async () => {
      const { stream } = await startDocumentReview(
        actorOf(ownerId),
        versionId,
        { preset: "errors", visibility: "WORKSPACE", idempotencyKey: `review-${crypto.randomUUID()}` },
        { providerInstance: providerReturning([typoFinding]) }
      );
      const events = await readEvents(stream);
      expect(events.filter((e) => e.type === "finding")).toHaveLength(0);
      expect(events.find((e) => e.type === "summary")?.data.total).toBe(0);
    });

    it("refuses a repeated request with the same idempotency key", async () => {
      const key = `review-${crypto.randomUUID()}`;
      const first = await startDocumentReview(
        actorOf(ownerId),
        versionId,
        { preset: "clarity", visibility: "PRIVATE", idempotencyKey: key },
        { providerInstance: providerReturning([]) }
      );
      await readEvents(first.stream);
      await expect(
        startDocumentReview(
          actorOf(ownerId),
          versionId,
          { preset: "clarity", visibility: "PRIVATE", idempotencyKey: key },
          { providerInstance: providerReturning([]) }
        )
      ).rejects.toMatchObject({ status: 409, code: "duplicate_request" });
    });

    it("fails without charging when the answer can't be read", async () => {
      const { stream, generationId } = await startDocumentReview(
        actorOf(ownerId),
        versionId,
        { preset: "errors", visibility: "PRIVATE", idempotencyKey: `review-${crypto.randomUUID()}` },
        { providerInstance: providerReturning("this is not JSON") }
      );
      const events = await readEvents(stream);
      expect(events.find((e) => e.type === "error")?.data).toMatchObject({
        code: "review_failed",
        total: 0,
      });
      const generation = await db.generation.findUnique({ where: { id: generationId } });
      expect(generation?.status).toBe("FAILED");
      expect(generation?.chargedCredits ?? 0).toBe(0);
    });

    it("a viewer without workspace.ask can't start a review (403), before any stream", async () => {
      const provider = providerReturning([typoFinding]);
      await expect(
        startDocumentReview(
          actorOf(viewerId),
          versionId,
          { preset: "errors", visibility: "PRIVATE", idempotencyKey: `review-${crypto.randomUUID()}` },
          { providerInstance: provider }
        )
      ).rejects.toMatchObject({ status: 403 });
    });

    it("someone outside the workspace gets 404 for the review and its estimate", async () => {
      await expect(
        startDocumentReview(
          actorOf(outsiderId),
          versionId,
          { preset: "errors", visibility: "PRIVATE", idempotencyKey: `review-${crypto.randomUUID()}` },
          { providerInstance: providerReturning([]) }
        )
      ).rejects.toMatchObject({ status: 404 });
      await expect(estimateDocumentReview(actorOf(outsiderId), versionId)).rejects.toMatchObject({
        status: 404,
      });
    });

    it("estimates what a review reserves", async () => {
      const estimate = await estimateDocumentReview(actorOf(viewerId), versionId);
      expect(estimate.sections).toBe(1);
      expect(estimate.estimatedCredits).toBeGreaterThan(0);
    });

    describe("deciding on a quick fix", () => {
      const openFix = () =>
        db.annotation.findFirstOrThrow({
          where: { versionId, authorType: "AI", suggestionState: "PENDING" },
        });

      it("'accepted' can't be set directly, only by saving the corrected text", async () => {
        const fix = await openFix();
        const { updateAnnotationSchema } = await import("@/lib/schemas/annotation");
        expect(updateAnnotationSchema.safeParse({ suggestionState: "ACCEPTED" }).success).toBe(
          false
        );
        expect(fix.suggestionState).toBe("PENDING");
      });

      it("an editor can dismiss a fix and bring it back; a viewer can't", async () => {
        const fix = await openFix();

        await expect(
          updateAnnotation(actorOf(viewerId), fix.id, { suggestionState: "REJECTED" })
        ).rejects.toMatchObject({ status: 403 });

        const dismissed = await updateAnnotation(actorOf(editorId), fix.id, {
          suggestionState: "REJECTED",
        });
        expect(dismissed.suggestionState).toBe("REJECTED");
        expect(dismissed.resolvedAt).not.toBeNull();

        const restored = await updateAnnotation(actorOf(editorId), fix.id, {
          suggestionState: "PENDING",
        });
        expect(restored.suggestionState).toBe("PENDING");
        expect(restored.resolvedAt).toBeNull();
      });

      it("Klecx's comment text can't be rewritten", async () => {
        const fix = await openFix();
        await expect(
          updateAnnotation(actorOf(ownerId), fix.id, { text: "I wrote this" })
        ).rejects.toMatchObject({ status: 400 });
      });

      it("saving the corrected text accepts the fix and resolves the comment", async () => {
        const fix = await openFix();
        const edit = await createResponseEdit(actorOf(editorId), versionId, {
          content: "# PRD\n\nWe use JavaScript for building apps.",
          baseRevision: null,
          acceptedSuggestionIds: [fix.id],
        });
        expect(edit.revision).toBe(1);

        const after = await db.annotation.findUniqueOrThrow({ where: { id: fix.id } });
        expect(after.suggestionState).toBe("ACCEPTED");
        expect(after.resolvedAt).not.toBeNull();

        // Decided: it can't be dismissed any more.
        await expect(
          updateAnnotation(actorOf(editorId), fix.id, { suggestionState: "REJECTED" })
        ).rejects.toMatchObject({ status: 409 });
      });

      it("a fix whose passage was rewritten by hand becomes stale", async () => {
        const { stream } = await startDocumentReview(
          actorOf(ownerId),
          versionId,
          { preset: "errors", visibility: "WORKSPACE", idempotencyKey: `review-${crypto.randomUUID()}` },
          {
            providerInstance: providerReturning([
              {
                exact: "building apps",
                prefix: "for ",
                suffix: ".",
                comment: "Be specific.",
                category: "clarity",
                severity: "low",
                replacement: "building web apps",
              },
            ]),
          }
        );
        const events = await readEvents(stream);
        const id = events.find((e) => e.type === "finding")?.data.annotationId as string;
        expect(id).toBeTruthy();

        // The review ran on the saved edit (revision 1).
        const created = await db.annotation.findUniqueOrThrow({ where: { id } });
        expect(created.contentSource).toBe("EDIT");
        expect(created.editRevision).toBe(1);

        await createResponseEdit(actorOf(editorId), versionId, {
          content: "# PRD\n\nWe use JavaScript for everything.",
          baseRevision: 1,
        });
        const after = await db.annotation.findUniqueOrThrow({ where: { id } });
        expect(after.suggestionState).toBe("STALE");
      });
    });

    describe("downloading the corrected document", () => {
      beforeAll(() => {
        setStorageProvider(new MockStorageProvider());
      });

      it("the edited version is the saved text, and nothing else", async () => {
        const edited = await exportResponseDocument(actorOf(ownerId), responseId, {
          format: "md",
          view: "edited",
        });
        // The member's own file: no front matter, model or workspace link.
        expect(edited.buffer.toString("utf-8")).toBe(
          "# PRD\n\nWe use JavaScript for everything."
        );
        expect(edited.filename).toBe("Draft-PRD.md");

        const original = await exportResponseDocument(actorOf(ownerId), responseId, {
          format: "md",
          view: "original",
        });
        expect(original.buffer.toString("utf-8")).toBe(
          "# PRD\n\nWe use JavScript for building apps."
        );
      });

      it("someone outside the workspace can't download it (404)", async () => {
        await expect(
          exportResponseDocument(actorOf(outsiderId), responseId, { format: "md" })
        ).rejects.toMatchObject({ status: 404 });
      });
    });
  });
});
