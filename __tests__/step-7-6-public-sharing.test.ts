/** @jest-environment node */
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import {
  createShareLink,
  listWorkspaceShares,
  revokeShareLink,
  resolvePublicShareByToken,
  getPublicShareHeaders,
  hashShareToken,
} from "@/server/services/share";
import { GET as publicShareGet } from "@/app/api/v1/s/[token]/route";
import { POST as sharesPost } from "@/app/api/v1/shares/route";
import { DELETE as shareDelete } from "@/app/api/v1/shares/[id]/route";
import { GET as workspaceSharesGet } from "@/app/api/v1/workspaces/[id]/shares/route";
import { getActor } from "@/server/auth/session";

jest.mock("../server/auth/session", () => ({
  ...jest.requireActual("../server/auth/session"),
  getActor: jest.fn(),
}));
import { getStorageProvider } from "@/server/storage";
import { resetInMemoryRateLimits } from "@/server/http/rate-limit";

describe("Step 7.6 — Public sharing (workspace or single response)", () => {
  const uid = () => crypto.randomBytes(6).toString("hex");

  let owner: { id: string; email: string; name: string };
  let collaborator: { id: string; email: string; name: string };
  let outsider: { id: string; email: string; name: string };
  let workspaceId: string;
  let response1Id: string;
  let response1VerId: string;
  let response2Id: string;
  let response2VerId: string;
  let attachment1Id: string;
  let attachment2Id: string;

  const ownerActor = (): Actor => ({
    userId: owner.id,
    sessionId: "sess-owner",
    email: owner.email,
    role: "USER",
  });

  const collabActor = (): Actor => ({
    userId: collaborator.id,
    sessionId: "sess-collab",
    email: collaborator.email,
    role: "USER",
  });

  const outsiderActor = (): Actor => ({
    userId: outsider.id,
    sessionId: "sess-outsider",
    email: outsider.email,
    role: "USER",
  });

  beforeEach(async () => {
    resetInMemoryRateLimits();
    const suffix = uid();

    owner = await db.user.create({
      data: {
        id: `user-owner-${suffix}`,
        email: `owner-${suffix}@example.com`,
        name: "Alice Owner",
        username: `alice_${suffix}`,
        emailVerified: true,
      },
    });

    collaborator = await db.user.create({
      data: {
        id: `user-collab-${suffix}`,
        email: `collab-${suffix}@example.com`,
        name: "Bob Editor",
        username: `bob_${suffix}`,
        emailVerified: true,
      },
    });

    outsider = await db.user.create({
      data: {
        id: `user-outsider-${suffix}`,
        email: `outsider-${suffix}@example.com`,
        name: "Mallory Outsider",
        username: `mallory_${suffix}`,
        emailVerified: true,
      },
    });

    const ws = await db.workspace.create({
      data: {
        ownerId: owner.id,
        title: `Public Share Test Workspace ${suffix}`,
      },
    });
    workspaceId = ws.id;

    // Add collaborator as EDITOR (cannot share, since workspace.share requires OWNER or ADMIN)
    await db.workspaceMember.create({
      data: {
        workspaceId,
        userId: collaborator.id,
        role: "EDITOR",
        monthlyCreditCap: 250,
        invitedById: owner.id,
      },
    });

    // Response 1 with original content, an edit, citations, and annotations/comments/questions
    const r1 = await db.response.create({
      data: {
        workspaceId,
        createdById: owner.id,
        prompt: "First prompt: explain architecture",
        kind: "TEXT",
        sortAt: new Date(Date.now() - 10_000),
      },
    });
    response1Id = r1.id;

    const v1 = await db.responseVersion.create({
      data: {
        responseId: r1.id,
        number: 1,
        status: "COMPLETE",
        modelKey: "secret-internal-model-v99",
        providerModelId: "gemini-internal-v99",
        promptVersion: "v1.0-secret",
        createdById: owner.id,
        content: "Original AI content for response 1.",
        thoughtSummary: "Secret internal chain of thought summary.",
      },
    });
    response1VerId = v1.id;

    await db.response.update({
      where: { id: r1.id },
      data: { activeVersionId: v1.id },
    });

    // Add two edits to Response 1 (only latest edit should be used when EDITED_IF_AVAILABLE, and edit history must never leak)
    await db.responseEdit.create({
      data: {
        versionId: v1.id,
        editorId: owner.id,
        revision: 1,
        content: "Intermediate draft edit v1 (should never leak).",
      },
    });
    await db.responseEdit.create({
      data: {
        versionId: v1.id,
        editorId: owner.id,
        revision: 2,
        content: "Polished edited content for response 1.",
      },
    });

    // Add citation to Response 1
    await db.citation.create({
      data: {
        versionId: v1.id,
        index: 1,
        source: "GROUNDING",
        title: "Architecture Reference",
        url: "https://example.com/arch",
        snippet: "Reference snippet for response 1.",
      },
    });

    // Create Attachment 1 linked to Response 1
    const att1 = await db.attachment.create({
      data: {
        ownerId: owner.id,
        workspaceId,
        responseId: r1.id,
        kind: "IMAGE",
        status: "READY",
        providerId: `klecx/test/att1-${suffix}`,
        resourceType: "image",
        mime: "image/png",
        bytes: 1234,
        originalName: "diagram-one.png",
        width: 400,
        height: 300,
      },
    });
    attachment1Id = att1.id;

    // Add private annotations (comment + question + reply) on Response 1 that MUST NEVER leak
    await db.annotation.create({
      data: {
        workspaceId,
        responseId: r1.id,
        versionId: v1.id,
        createdById: owner.id,
        kind: "COMMENT",
        anchorExact: "Polished edited",
        anchorPrefix: "",
        anchorSuffix: " content",
        anchorStart: 0,
        anchorEnd: 15,
        messages: {
          create: [
            {
              role: "USER",
              authorId: owner.id,
              content: "PRIVATE_INTERNAL_COMMENT_DO_NOT_LEAK",
            },
            {
              role: "ASSISTANT",
              content: "PRIVATE_AI_ANSWER_DO_NOT_LEAK",
            },
            {
              role: "USER",
              authorId: collaborator.id,
              content: "PRIVATE_COLLABORATOR_REPLY_DO_NOT_LEAK",
            },
          ],
        },
      },
    });

    // Response 2 (sibling response in the same workspace)
    const r2 = await db.response.create({
      data: {
        workspaceId,
        createdById: owner.id,
        prompt: "Second sibling prompt: confidential roadmap",
        kind: "TEXT",
        sortAt: new Date(),
      },
    });
    response2Id = r2.id;

    const v2 = await db.responseVersion.create({
      data: {
        responseId: r2.id,
        number: 1,
        status: "COMPLETE",
        modelKey: "text-pro",
        providerModelId: "gemini-pro",
        promptVersion: "v1.0",
        createdById: owner.id,
        content: "SIBLING_RESPONSE_SECRET_CONTENT_2",
      },
    });
    response2VerId = v2.id;

    await db.response.update({
      where: { id: r2.id },
      data: { activeVersionId: v2.id },
    });

    const att2 = await db.attachment.create({
      data: {
        ownerId: owner.id,
        workspaceId,
        responseId: r2.id,
        kind: "DOCUMENT",
        status: "READY",
        providerId: `klecx/test/att2-${suffix}`,
        resourceType: "raw",
        mime: "application/pdf",
        bytes: 5678,
        originalName: "secret-sibling-spec.pdf",
      },
    });
    attachment2Id = att2.id;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (workspaceId) {
      await db.workspace.deleteMany({ where: { id: workspaceId } });
    }
    const userIds = [owner?.id, collaborator?.id, outsider?.id].filter(Boolean);
    if (userIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  test("1. Creating a share link stores only SHA-256 hash + 6-char prefix and requires workspace.share", async () => {
    // Editor cannot create share link (403)
    await expect(
      createShareLink(collabActor(), {
        workspaceId,
        scope: "WORKSPACE",
        view: "EDITED_IF_AVAILABLE",
        showAuthor: false,
      })
    ).rejects.toMatchObject({ status: 403 });

    // Outsider gets 404 (no existence leak)
    await expect(
      createShareLink(outsiderActor(), {
        workspaceId,
        scope: "WORKSPACE",
        view: "EDITED_IF_AVAILABLE",
        showAuthor: false,
      })
    ).rejects.toMatchObject({ status: 404 });

    // Owner creates share link
    const created = await createShareLink(ownerActor(), {
      workspaceId,
      scope: "WORKSPACE",
      view: "EDITED_IF_AVAILABLE",
      showAuthor: true,
      expiresInDays: 7,
    });

    expect(created.url).toMatch(/\/s\/[A-Za-z0-9_-]{40,}$/);
    const rawToken = created.url.split("/s/")[1]!;
    expect(created.tokenPrefix).toBe(rawToken.slice(0, 6));

    // Verify DB stores SHA-256 hash and never stores rawToken
    const dbRow = await db.shareLink.findUnique({ where: { id: created.id } });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.tokenHash).toBe(hashShareToken(rawToken));
    expect(dbRow!.tokenHash).not.toBe(rawToken);
    expect(dbRow!.tokenPrefix).toBe(rawToken.slice(0, 6));

    // Listing workspace shares never returns raw token or full URL
    const list = await listWorkspaceShares(ownerActor(), workspaceId);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(created.id);
    expect(list[0]!.status).toBe("ACTIVE");
    expect(JSON.stringify(list)).not.toContain(rawToken);
  });

  test("2. Guessed, revoked, and expired tokens return identical 404; revoking takes effect immediately", async () => {
    // 1. Guessed token -> 404
    const guessedToken = crypto.randomBytes(32).toString("base64url");
    const guessedRes = await publicShareGet(
      new Request(`http://localhost:3000/api/v1/s/${guessedToken}`),
      { params: { token: guessedToken } }
    );
    expect(guessedRes.status).toBe(404);
    const guessedBody = await guessedRes.json();

    // 2. Active token works and increments viewCount
    const activeShare = await createShareLink(ownerActor(), {
      workspaceId,
      scope: "WORKSPACE",
      view: "EDITED_IF_AVAILABLE",
      showAuthor: false,
    });
    const activeToken = activeShare.url.split("/s/")[1]!;

    const okRes = await publicShareGet(
      new Request(`http://localhost:3000/api/v1/s/${activeToken}`),
      { params: { token: activeToken } }
    );
    expect(okRes.status).toBe(200);

    const afterView = await db.shareLink.findUnique({
      where: { id: activeShare.id },
    });
    expect(afterView?.viewCount).toBe(1);
    expect(afterView?.lastViewedAt).not.toBeNull();

    // 3. Revoke -> next request immediately returns identical 404
    await revokeShareLink(ownerActor(), activeShare.id);

    const revokedRes = await publicShareGet(
      new Request(`http://localhost:3000/api/v1/s/${activeToken}`),
      { params: { token: activeToken } }
    );
    expect(revokedRes.status).toBe(404);
    const revokedBody = await revokedRes.json();
    expect(revokedBody.error.code).toBe(guessedBody.error.code);
    expect(revokedBody.error.message).toBe(guessedBody.error.message);

    // 4. Expired token -> identical 404
    const expiredShare = await createShareLink(ownerActor(), {
      workspaceId,
      scope: "WORKSPACE",
      view: "EDITED_IF_AVAILABLE",
      showAuthor: false,
      expiresInDays: 7,
    });
    const expiredToken = expiredShare.url.split("/s/")[1]!;
    await db.shareLink.update({
      where: { id: expiredShare.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const expiredRes = await publicShareGet(
      new Request(`http://localhost:3000/api/v1/s/${expiredToken}`),
      { params: { token: expiredToken } }
    );
    expect(expiredRes.status).toBe(404);
    const expiredBody = await expiredRes.json();
    expect(expiredBody.error.code).toBe(guessedBody.error.code);
    expect(expiredBody.error.message).toBe(guessedBody.error.message);
  });

  test("3. Single-response share payload contains NO other response IDs/texts and only generates signed URLs for included attachments", async () => {
    const storage = getStorageProvider();
    const privateUrlSpy = jest.spyOn(storage, "privateUrl");

    const singleShare = await createShareLink(ownerActor(), {
      workspaceId,
      scope: "RESPONSE",
      responseId: response1Id,
      view: "EDITED_IF_AVAILABLE",
      showAuthor: false,
    });
    const token = singleShare.url.split("/s/")[1]!;

    const payload = await resolvePublicShareByToken(token);
    const serialized = JSON.stringify(payload);

    // Title for RESPONSE scope must be "Shared response" (not workspace title)
    expect(payload.scope).toBe("RESPONSE");
    expect(payload.title).toBe("Shared response");
    expect(serialized).not.toContain("Public Share Test Workspace");

    // Must contain only response 1
    expect(payload.responses).toHaveLength(1);
    expect(payload.responses[0]!.id).toBe(response1Id);
    expect(payload.responses[0]!.content).toBe(
      "Polished edited content for response 1."
    );

    // Must NOT contain sibling response ID, prompt, content, or attachment
    expect(serialized).not.toContain(response2Id);
    expect(serialized).not.toContain(response2VerId);
    expect(serialized).not.toContain("Second sibling prompt");
    expect(serialized).not.toContain("SIBLING_RESPONSE_SECRET_CONTENT_2");
    expect(serialized).not.toContain(attachment2Id);
    expect(serialized).not.toContain("secret-sibling-spec.pdf");

    // Signed URL generated ONLY for response 1's attachment, never for attachment 2, and raw providerId is not exposed
    expect(privateUrlSpy).toHaveBeenCalledTimes(1);
    expect(payload.responses[0]!.attachments).toHaveLength(1);
    expect(payload.responses[0]!.attachments[0]!.id).toBe(attachment1Id);
    expect(payload.responses[0]!.attachments[0]!.signedUrl).toBeTruthy();
    expect(serialized).not.toContain(`klecx/test/att2-`);
  });

  test("4. Annotations, members, credits, activity, edit history, and model internals are absent from serialized payload", async () => {
    // Test both EDITED_IF_AVAILABLE (showAuthor=false) and ORIGINAL (showAuthor=true)
    const shareEdited = await createShareLink(ownerActor(), {
      workspaceId,
      scope: "WORKSPACE",
      view: "EDITED_IF_AVAILABLE",
      showAuthor: false,
    });
    const tokenEdited = shareEdited.url.split("/s/")[1]!;
    const payloadEdited = await resolvePublicShareByToken(tokenEdited);
    const rawEditedJson = JSON.stringify(payloadEdited);

    // Author hidden when showAuthor=false
    expect(payloadEdited.authorName).toBeNull();
    expect(rawEditedJson).not.toContain("Alice Owner");
    expect(rawEditedJson).not.toContain(owner.email);

    // Annotations, comments, questions, and replies never leak
    expect(rawEditedJson).not.toContain("PRIVATE_INTERNAL_COMMENT_DO_NOT_LEAK");
    expect(rawEditedJson).not.toContain("PRIVATE_AI_ANSWER_DO_NOT_LEAK");
    expect(rawEditedJson).not.toContain("PRIVATE_COLLABORATOR_REPLY_DO_NOT_LEAK");

    // Collaborators, member caps, credits, emails never leak
    expect(rawEditedJson).not.toContain("Bob Editor");
    expect(rawEditedJson).not.toContain(collaborator.email);
    expect(rawEditedJson).not.toContain("monthlyCreditCap");

    // Edit history (intermediate revision 1 and original content when viewing edited) never leaks
    expect(rawEditedJson).not.toContain("Intermediate draft edit v1");
    expect(rawEditedJson).not.toContain("Original AI content for response 1.");

    // Model / prompt internals (modelKey, providerModelId, promptVersion, thoughtSummary) never leak
    expect(rawEditedJson).not.toContain("secret-internal-model-v99");
    expect(rawEditedJson).not.toContain("gemini-internal-v99");
    expect(rawEditedJson).not.toContain("v1.0-secret");
    expect(rawEditedJson).not.toContain(
      "Secret internal chain of thought summary."
    );
    expect(rawEditedJson).not.toContain(response1VerId);

    // Test ORIGINAL view with showAuthor=true
    const shareOriginal = await createShareLink(ownerActor(), {
      workspaceId,
      scope: "WORKSPACE",
      view: "ORIGINAL",
      showAuthor: true,
    });
    const tokenOrig = shareOriginal.url.split("/s/")[1]!;
    const payloadOrig = await resolvePublicShareByToken(tokenOrig);
    expect(payloadOrig.authorName).toBe("Alice Owner");
    expect(payloadOrig.responses[0]!.content).toBe(
      "Original AI content for response 1."
    );
    expect(JSON.stringify(payloadOrig)).not.toContain(
      "Polished edited content for response 1."
    );
  });

  test("5. Public share endpoint sets required Cache-Control, X-Robots-Tag, and Referrer-Policy headers", async () => {
    const share = await createShareLink(ownerActor(), {
      workspaceId,
      scope: "WORKSPACE",
      view: "EDITED_IF_AVAILABLE",
      showAuthor: false,
    });
    const token = share.url.split("/s/")[1]!;

    const res = await publicShareGet(
      new Request(`http://localhost:3000/api/v1/s/${token}`),
      { params: { token } }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive"
    );
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");

    const expectedHeaders = getPublicShareHeaders();
    expect(expectedHeaders).toEqual({
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
    });
  });

  test("6. HTTP API routes POST /api/v1/shares, GET /api/v1/workspaces/:id/shares, and DELETE /api/v1/shares/:id work end-to-end", async () => {
    (getActor as jest.Mock).mockResolvedValue(ownerActor());

    const postRes = await sharesPost(
      new NextRequest("http://localhost:3000/api/v1/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          scope: "RESPONSE",
          responseId: response1Id,
          view: "EDITED_IF_AVAILABLE",
          expiresInDays: 30,
          showAuthor: true,
        }),
      })
    );
    expect(postRes.status).toBe(200);
    const postJson = await postRes.json();
    const created = postJson.data;
    expect(created.scope).toBe("RESPONSE");
    expect(created.responseId).toBe(response1Id);
    expect(created.url).toContain("/s/");

    const listRes = await workspaceSharesGet(
      new NextRequest(
        `http://localhost:3000/api/v1/workspaces/${workspaceId}/shares`
      ),
      { params: { id: workspaceId } }
    );
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.data).toHaveLength(1);
    expect(listJson.data[0].id).toBe(created.id);

    const delRes = await shareDelete(
      new NextRequest(`http://localhost:3000/api/v1/shares/${created.id}`, {
        method: "DELETE",
      }),
      { params: { id: created.id } }
    );
    expect(delRes.status).toBe(200);
    const delJson = await delRes.json();
    expect(delJson.data.status).toBe("REVOKED");
  });
});
