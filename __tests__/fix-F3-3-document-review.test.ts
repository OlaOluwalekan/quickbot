/**
 * @jest-environment node
 */

import crypto from "node:crypto";
import { db } from "@/server/db/client";
import {
  chunkDocumentByHeadings,
  validateFinding,
  executeDocumentReview,
} from "@/server/services/document-review";
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

  describe("chunkDocumentByHeadings", () => {
    it("splits document by markdown headings into chunks", () => {
      const doc = `# Section One
This is the introduction.

## Section Two
This is the second section.

### Section Three
Details and conclusion.`;

      const chunks = chunkDocumentByHeadings(doc, 8000);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].total).toBe(chunks.length);
      expect(chunks[0].index).toBe(1);
    });

    it("handles documents without headings gracefully", () => {
      const doc = "A single paragraph of text without any markdown headers.";
      const chunks = chunkDocumentByHeadings(doc, 8000);
      expect(chunks.length).toBe(1);
      expect(chunks[0].markdown).toBe(doc);
    });
  });

  describe("validateFinding", () => {
    it("validates finding with exact text match and applies clean replacement", () => {
      const fullSource = "We use JavScript for frontend development.";
      const chunk = {
        index: 1,
        total: 1,
        title: "Test",
        markdown: fullSource,
        charOffset: 0,
      };

      const finding = {
        exact: "JavScript",
        prefix: "We use ",
        suffix: " for frontend",
        comment: "Typo in JavaScript",
        category: "spelling" as const,
        severity: "low" as const,
        replacement: "JavaScript",
      };

      const validated = validateFinding(chunk, finding, fullSource);
      expect(validated).not.toBeNull();
      expect(validated?.valid).toBe(true);
      expect(validated?.anchor.exact).toBe("JavScript");
      expect(validated?.suggestion).toEqual({
        exact: "JavScript",
        prefix: "We use ",
        suffix: " for frontend development.",
        replacement: "JavaScript",
      });
    });

    it("drops finding when exact text does not exist in the document", () => {
      const fullSource = "We use TypeScript for all services.";
      const chunk = {
        index: 1,
        total: 1,
        title: "Test",
        markdown: fullSource,
        charOffset: 0,
      };

      const finding = {
        exact: "Python",
        prefix: "We use ",
        suffix: " for all",
        comment: "Wrong language",
        category: "factual" as const,
        severity: "medium" as const,
        replacement: "TypeScript",
      };

      const validated = validateFinding(chunk, finding, fullSource);
      expect(validated).toBeNull();
    });

    it("keeps anchor but omits suggestion when replacement is not provided", () => {
      const fullSource = "We use TypeScript for all services.";
      const chunk = {
        index: 1,
        total: 1,
        title: "Test",
        markdown: fullSource,
        charOffset: 0,
      };

      const finding = {
        exact: "TypeScript",
        prefix: "We use ",
        suffix: " for all",
        comment: "Great choice of language.",
        category: "clarity" as const,
        severity: "low" as const,
      };

      const validated = validateFinding(chunk, finding, fullSource);
      expect(validated).not.toBeNull();
      expect(validated?.valid).toBe(true);
      expect(validated?.anchor.exact).toBe("TypeScript");
      expect(validated?.suggestion).toBeNull();
    });
  });

  describe("executeDocumentReview integration", () => {
    let workspaceId: string;
    let ownerId: string;
    let viewerId: string;
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

      const ws = await db.workspace.create({
        data: {
          id: `f33-ws-${stamp}`,
          title: "F3.3 Review Test Workspace",
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

    it("executes review, drops invalid finding, streams findings, creates AI comments with suggestions", async () => {
      mockActorId = ownerId;
      const actor = {
        userId: ownerId,
        sessionId: `sess-${ownerId}`,
        email: `f33-owner@example.com`,
        role: "USER" as const,
      };

      // Mock AI provider that returns structured JSON with 1 valid finding and 1 invalid finding
      const mockProvider: AiProvider = {
        name: "mock-ai",
        generate: jest.fn(),
        stream: jest.fn(async function* () {
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
              {
                exact: "NonExistentWord",
                prefix: "Foo ",
                suffix: " Bar",
                comment: "Hallucinated issue",
                category: "factual",
                severity: "high",
              },
            ]),
          };
          yield {
            type: "usage",
            inputTokens: 100,
            outputTokens: 50,
            estimated: false,
          };
        }),
      };

      const events: Array<{ type: string; data: any }> = [];

      await executeDocumentReview({
        actor,
        versionId,
        input: { preset: "errors", visibility: "WORKSPACE" },
        send: (type, data) => events.push({ type, data }),
        close: () => {},
        options: { providerInstance: mockProvider },
      });

      // Verify SSE events streamed
      const progressEvents = events.filter((e) => e.type === "progress");
      expect(progressEvents.length).toBeGreaterThanOrEqual(1);

      const findingEvents = events.filter((e) => e.type === "finding");
      expect(findingEvents.length).toBe(1); // NonExistentWord dropped!
      expect(findingEvents[0].data.anchor.exact).toBe("JavScript");
      expect(findingEvents[0].data.suggestion.replacement).toBe("JavaScript");
      expect(findingEvents[0].data.authorType).toBe("AI");
      expect(findingEvents[0].data.suggestionState).toBe("PENDING");

      const summaryEvents = events.filter((e) => e.type === "summary");
      expect(summaryEvents.length).toBe(1);
      expect(summaryEvents[0].data.total).toBe(1);
      expect(summaryEvents[0].data.byCategory.spelling).toBe(1);

      // Verify db row
      const annotationInDb = await db.annotation.findUnique({
        where: { id: findingEvents[0].data.annotationId },
        include: { messages: true },
      });
      expect(annotationInDb).not.toBeNull();
      expect(annotationInDb?.authorType).toBe("AI");
      expect(annotationInDb?.kind).toBe("COMMENT");
      expect(annotationInDb?.suggestionState).toBe("PENDING");
      expect(annotationInDb?.messages[0]?.role).toBe("ASSISTANT");

      // Verify createResponseEdit resolves accepted suggestions
      const editResult = await createResponseEdit(actor, versionId, {
        content: "# PRD\n\nWe use JavaScript for building apps.",
        baseRevision: null,
        acceptedSuggestionIds: [annotationInDb!.id],
      });
      expect(editResult.revision).toBe(1);

      const reloadedAnnotation = await db.annotation.findUnique({
        where: { id: annotationInDb!.id },
      });
      expect(reloadedAnnotation?.suggestionState).toBe("ACCEPTED");
      expect(reloadedAnnotation?.resolvedAt).not.toBeNull();

      // Verify suggestionState can also be updated directly via updateAnnotation (e.g. Dismiss / REJECTED)
      const updated = await updateAnnotation(
        actor,
        annotationInDb!.id,
        { suggestionState: "REJECTED" }
      );
      expect(updated.suggestionState).toBe("REJECTED");
    });

    it("rejects review request when user does not have workspace.ask permission", async () => {
      mockActorId = viewerId;
      const viewerActor = {
        userId: viewerId,
        sessionId: `sess-${viewerId}`,
        email: `f33-viewer@example.com`,
        role: "USER" as const,
      };

      await expect(
        executeDocumentReview({
          actor: viewerActor,
          versionId,
          input: { preset: "errors" },
          send: () => {},
          close: () => {},
        })
      ).rejects.toThrow();
    });
  });
});
