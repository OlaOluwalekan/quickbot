/**
 * @jest-environment node
 */

import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { applySuggestion } from "@/lib/documents/apply-suggestion";
import { createResponseEdit } from "@/server/services/response";

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

describe("Step F3.2 — applySuggestion & versioned edits with conflict detection", () => {
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    if (createdWorkspaceIds.length > 0) {
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

  describe("applySuggestion", () => {
    it("replaces a unique exact match cleanly", () => {
      const res = applySuggestion("We use JavScript for the frontend.", {
        exact: "JavScript",
        prefix: "We use ",
        suffix: " for the",
        replacement: "JavaScript",
      });
      expect(res).toEqual({
        ok: true,
        next: "We use JavaScript for the frontend.",
      });
    });

    it("disambiguates multiple occurrences using prefix and suffix", () => {
      const source = "Alpha: foo bar.\nBeta: foo baz.";
      const res = applySuggestion(source, {
        exact: "foo",
        prefix: "Beta: ",
        suffix: " baz.",
        replacement: "qux",
      });
      expect(res).toEqual({
        ok: true,
        next: "Alpha: foo bar.\nBeta: qux baz.",
      });
    });

    it("returns ambiguous when multiple occurrences cannot be disambiguated", () => {
      const res = applySuggestion("foo and foo", {
        exact: "foo",
        prefix: "",
        suffix: "",
        replacement: "bar",
      });
      expect(res).toEqual({ ok: false, reason: "ambiguous" });
    });

    it("returns not_found when exact text does not exist", () => {
      const res = applySuggestion("Hello world", {
        exact: "missing",
        prefix: "",
        suffix: "",
        replacement: "found",
      });
      expect(res).toEqual({ ok: false, reason: "not_found" });
    });
  });

  describe("POST /api/v1/response-versions/:id/edits", () => {
    it("creates revision, marks acceptedSuggestionIds ACCEPTED + resolved, and returns 409 edit_conflict on stale baseRevision", async () => {
      const ownerId = crypto.randomUUID();
      const viewerId = crypto.randomUUID();
      createdUserIds.push(ownerId, viewerId);

      await db.user.createMany({
        data: [
          {
            id: ownerId,
            email: `owner-${ownerId}@example.com`,
            name: "Owner",
            emailVerified: true,
          },
          {
            id: viewerId,
            email: `viewer-${viewerId}@example.com`,
            name: "Viewer",
            emailVerified: true,
          },
        ],
      });

      const workspaceId = crypto.randomUUID();
      createdWorkspaceIds.push(workspaceId);
      await db.workspace.create({
        data: {
          id: workspaceId,
          ownerId,
          title: "F3.2 Doc Edit WS",
          members: {
            create: [
              { userId: ownerId, role: "ADMIN", invitedById: ownerId },
              { userId: viewerId, role: "VIEWER", invitedById: ownerId },
            ],
          },
        },
      });

      const responseId = crypto.randomUUID();
      const versionId = crypto.randomUUID();
      await db.response.create({
        data: {
          id: responseId,
          workspaceId,
          kind: "DOCUMENT",
          origin: "UPLOAD",
          prompt: "PRD.md",
          createdById: ownerId,
          versions: {
            create: {
              id: versionId,
              number: 1,
              status: "COMPLETE",
              content: "# PRD\n\nInitial JavScript spec.",
              modelKey: "none",
              providerModelId: "none",
              promptVersion: "upload-1",
              createdById: ownerId,
            },
          },
        },
      });
      await db.response.update({
        where: { id: responseId },
        data: { activeVersionId: versionId },
      });

      const suggestionAnnId = crypto.randomUUID();
      await db.annotation.create({
        data: {
          id: suggestionAnnId,
          workspaceId,
          responseId,
          versionId,
          targetType: "RESPONSE_VERSION",
          authorType: "AI",
          kind: "COMMENT",
          visibility: "WORKSPACE",
          createdById: ownerId,
          anchorExact: "JavScript",
          anchorPrefix: "Initial ",
          anchorSuffix: " spec.",
          suggestion: {
            exact: "JavScript",
            prefix: "Initial ",
            suffix: " spec.",
            replacement: "JavaScript",
          },
          suggestionState: "PENDING",
        },
      });

      // Viewer cannot edit
      await expect(
        createResponseEdit(
          {
            userId: viewerId,
            sessionId: `sess-${viewerId}`,
            email: `viewer-${viewerId}@example.com`,
            role: "USER",
          },
          versionId,
          { content: "hacked", baseRevision: null }
        )
      ).rejects.toMatchObject({ status: 403 });

      // Owner saves edit 1 with baseRevision: null and acceptedSuggestionIds
      mockActorId = ownerId;
      const { POST } = await import(
        "@/app/api/v1/response-versions/[id]/edits/route"
      );
      const req1 = new NextRequest(
        `http://localhost:3000/api/v1/response-versions/${versionId}/edits`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content: "# PRD\n\nInitial JavaScript spec.",
            baseRevision: null,
            acceptedSuggestionIds: [suggestionAnnId],
          }),
        }
      );
      const res1 = await POST(req1, {
        params: Promise.resolve({ id: versionId }),
      });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      const edit1 = json1?.data ?? json1;
      expect(edit1.revision).toBe(1);

      // Annotation should now be ACCEPTED and resolved
      const updatedAnn = await db.annotation.findUnique({
        where: { id: suggestionAnnId },
      });
      expect(updatedAnn?.suggestionState).toBe("ACCEPTED");
      expect(updatedAnn?.resolvedAt).not.toBeNull();

      // Second tab tries to save with stale baseRevision: null -> 409 edit_conflict
      const req2 = new NextRequest(
        `http://localhost:3000/api/v1/response-versions/${versionId}/edits`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content: "# PRD\n\nConflicting edit.",
            baseRevision: null,
          }),
        }
      );
      const res2 = await POST(req2, {
        params: Promise.resolve({ id: versionId }),
      });
      expect(res2.status).toBe(409);
      const errJson = await res2.json();
      expect(errJson.error?.code).toBe("edit_conflict");
      expect(errJson.error?.details).toEqual({
        latestRevision: 1,
        latestContent: "# PRD\n\nInitial JavaScript spec.",
      });
    });
  });
});
