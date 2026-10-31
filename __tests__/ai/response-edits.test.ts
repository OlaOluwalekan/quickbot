/**
 * @jest-environment node
 */
import { db } from "@/server/db/client";
import {
  listWorkspaceResponses,
  listResponseVersions,
  createResponseEdit,
  listResponseEdits,
  revertLatestResponseEdit,
} from "@/server/services/response";
import { createAccountWithFreeGrant, getAccountByUserId } from "@/server/services/credits";
import { buildContext } from "@/server/ai/context-builder";
import type { Actor } from "@/server/auth/session";
import { ApiError } from "@/server/http/errors";
import { createResponseEditSchema } from "@/lib/schemas/response";

describe("Step 2.7 — User edits stored separately", () => {
  let ownerUser: { id: string; email: string };
  let collabAUser: { id: string; email: string };
  let collabBUser: { id: string; email: string };
  let viewerUser: { id: string; email: string };

  let actorOwner: Actor;
  let actorCollabA: Actor;
  let actorCollabB: Actor;
  let actorViewer: Actor;

  let workspace: { id: string };
  let testResponse: { id: string };
  let testVersion: { id: string; content: string };

  beforeEach(async () => {
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    ownerUser = await db.user.create({
      data: {
        id: `user_owner_${unique}`,
        name: "Owner User",
        email: `owner_${unique}@example.com`,
        emailVerified: true,
      },
    });

    collabAUser = await db.user.create({
      data: {
        id: `user_collab_a_${unique}`,
        name: "Collaborator A",
        email: `collab_a_${unique}@example.com`,
        emailVerified: true,
      },
    });

    collabBUser = await db.user.create({
      data: {
        id: `user_collab_b_${unique}`,
        name: "Collaborator B",
        email: `collab_b_${unique}@example.com`,
        emailVerified: true,
      },
    });

    viewerUser = await db.user.create({
      data: {
        id: `user_viewer_${unique}`,
        name: "Viewer User",
        email: `viewer_${unique}@example.com`,
        emailVerified: true,
      },
    });

    actorOwner = {
      userId: ownerUser.id,
      email: ownerUser.email,
      role: "USER",
      sessionId: `sess_owner_${unique}`,
    };

    actorCollabA = {
      userId: collabAUser.id,
      email: collabAUser.email,
      role: "USER",
      sessionId: `sess_collab_a_${unique}`,
    };

    actorCollabB = {
      userId: collabBUser.id,
      email: collabBUser.email,
      role: "USER",
      sessionId: `sess_collab_b_${unique}`,
    };

    actorViewer = {
      userId: viewerUser.id,
      email: viewerUser.email,
      role: "USER",
      sessionId: `sess_viewer_${unique}`,
    };

    await createAccountWithFreeGrant(ownerUser.id);

    workspace = await db.workspace.create({
      data: {
        ownerId: ownerUser.id,
        title: "Edits Test Workspace",
      },
    });

    await db.workspaceMember.createMany({
      data: [
        {
          workspaceId: workspace.id,
          userId: collabAUser.id,
          role: "EDITOR",
          invitedById: ownerUser.id,
        },
        {
          workspaceId: workspace.id,
          userId: collabBUser.id,
          role: "EDITOR",
          invitedById: ownerUser.id,
        },
        {
          workspaceId: workspace.id,
          userId: viewerUser.id,
          role: "VIEWER",
          invitedById: ownerUser.id,
        },
      ],
    });

    const originalText = "Original AI explanation of photosynthesis.";
    testResponse = await db.response.create({
      data: {
        workspaceId: workspace.id,
        createdById: ownerUser.id,
        prompt: "Explain photosynthesis",
      },
    });

    const v1 = await db.responseVersion.create({
      data: {
        responseId: testResponse.id,
        number: 1,
        status: "COMPLETE",
        content: originalText,
        modelKey: "text-economy",
        providerModelId: "gemini-flash",
        promptVersion: "2026-10-1",
        createdById: ownerUser.id,
      },
    });

    await db.response.update({
      where: { id: testResponse.id },
      data: { activeVersionId: v1.id },
    });

    testVersion = v1;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  test("1. Editing creates a row, revision = 1, and ResponseVersion.content is byte-identical", async () => {
    const originalAiContent = testVersion.content;
    const accountBefore = await getAccountByUserId(ownerUser.id);
    const balanceBefore = (accountBefore?.planBalance ?? 0) + (accountBefore?.topupBalance ?? 0);

    const editInput = { content: "User improved explanation of photosynthesis with more details." };
    const edit = await createResponseEdit(actorCollabA, testVersion.id, editInput);

    expect(edit.id).toBeDefined();
    expect(edit.versionId).toBe(testVersion.id);
    expect(edit.revision).toBe(1);
    expect(edit.content).toBe(editInput.content);
    expect(edit.editorId).toBe(collabAUser.id);

    // Verify ResponseVersion.content is untouched (byte-identical)
    const refreshedVersion = await db.responseVersion.findUnique({
      where: { id: testVersion.id },
    });
    expect(refreshedVersion?.content).toBe(originalAiContent);

    // Verify edits cost zero credits
    const accountAfter = await getAccountByUserId(ownerUser.id);
    const balanceAfter = (accountAfter?.planBalance ?? 0) + (accountAfter?.topupBalance ?? 0);
    expect(balanceAfter).toBe(balanceBefore);
  });

  test("2. Append-only revisions: consecutive edits increment revision numbers and listResponseEdits returns history", async () => {
    const edit1 = await createResponseEdit(actorCollabA, testVersion.id, {
      content: "Revision 1 text",
    });
    const edit2 = await createResponseEdit(actorOwner, testVersion.id, {
      content: "Revision 2 text",
    });
    const edit3 = await createResponseEdit(actorCollabB, testVersion.id, {
      content: "Revision 3 text",
    });

    expect(edit1.revision).toBe(1);
    expect(edit2.revision).toBe(2);
    expect(edit3.revision).toBe(3);

    // listResponseEdits returns all 3 in descending revision order
    const history = await listResponseEdits(actorCollabA, testVersion.id);
    expect(history.total).toBe(3);
    expect(history.originalContent).toBe(testVersion.content);
    expect(history.items.map((i) => i.revision)).toEqual([3, 2, 1]);
    expect(history.items[0]!.content).toBe("Revision 3 text");
  });

  test("3. Content views: ?view=original vs ?view=edited in listWorkspaceResponses and listResponseVersions", async () => {
    await createResponseEdit(actorCollabA, testVersion.id, {
      content: "User-edited version of the answer",
    });

    // listWorkspaceResponses default / view=edited
    const editedWorkspaceList = await listWorkspaceResponses(actorOwner, workspace.id, {
      view: "edited",
    });
    const activeVerEdited = editedWorkspaceList.items[0]!.activeVersion!;
    expect(activeVerEdited.edited).toBe(true);
    expect(activeVerEdited.hasEdits).toBe(true);
    expect(activeVerEdited.editCount).toBe(1);
    expect(activeVerEdited.content).toBe("User-edited version of the answer");
    expect(activeVerEdited.originalContent).toBe(testVersion.content);
    expect(activeVerEdited.latestEdit?.revision).toBe(1);

    // listWorkspaceResponses view=original
    const originalWorkspaceList = await listWorkspaceResponses(actorOwner, workspace.id, {
      view: "original",
    });
    const activeVerOriginal = originalWorkspaceList.items[0]!.activeVersion!;
    expect(activeVerOriginal.content).toBe(testVersion.content);
    expect(activeVerOriginal.originalContent).toBe(testVersion.content);
    expect(activeVerOriginal.edited).toBe(true);

    // listResponseVersions
    const versionsEdited = await listResponseVersions(actorOwner, testResponse.id, {
      view: "edited",
    });
    expect(versionsEdited[0]!.content).toBe("User-edited version of the answer");
    expect(versionsEdited[0]!.originalContent).toBe(testVersion.content);
    expect(versionsEdited[0]!.edited).toBe(true);

    const versionsOriginal = await listResponseVersions(actorOwner, testResponse.id, {
      view: "original",
    });
    expect(versionsOriginal[0]!.content).toBe(testVersion.content);
  });

  test("4. Context builder uses the latest edit in prompt history", async () => {
    const editContent = "Chlorophyll absorbs blue and red light while reflecting green.";
    await createResponseEdit(actorOwner, testVersion.id, { content: editContent });

    const context = await buildContext({
      workspaceId: workspace.id,
      newPrompt: "What color does it reflect?",
      modelKey: "text-economy",
      language: "en",
    });

    // The assistant message in context history should contain the edited content
    const assistantMsg = context.messages.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.parts[0]).toEqual({
      type: "text",
      text: editContent,
    });
  });

  test("5. Revert latest edit (DELETE .../edits/latest)", async () => {
    // Add two edits: revision 1 by CollabA, revision 2 by CollabA
    await createResponseEdit(actorCollabA, testVersion.id, { content: "Rev 1" });
    const rev2 = await createResponseEdit(actorCollabA, testVersion.id, { content: "Rev 2" });

    // CollabA reverts their own latest edit (Rev 2)
    const result1 = await revertLatestResponseEdit(actorCollabA, testVersion.id);
    expect(result1.revertedEdit.id).toBe(rev2.id);
    expect(result1.remainingEdits).toBe(1);

    // Latest edit is now Rev 1
    const historyAfterFirstRevert = await listResponseEdits(actorCollabA, testVersion.id);
    expect(historyAfterFirstRevert.total).toBe(1);
    expect(historyAfterFirstRevert.items[0]!.content).toBe("Rev 1");

    // Owner can revert Rev 1 even though CollabA wrote it
    const result2 = await revertLatestResponseEdit(actorOwner, testVersion.id);
    expect(result2.remainingEdits).toBe(0);

    // Now no edits remain; reverts to original
    const historyAfterAllReverts = await listResponseEdits(actorCollabA, testVersion.id);
    expect(historyAfterAllReverts.total).toBe(0);

    const responses = await listWorkspaceResponses(actorOwner, workspace.id, {
      view: "edited",
    });
    expect(responses.items[0]!.activeVersion!.edited).toBe(false);
    expect(responses.items[0]!.activeVersion!.content).toBe(testVersion.content);

    // Reverting when no edits exist throws 404
    await expect(revertLatestResponseEdit(actorOwner, testVersion.id)).rejects.toThrow(
      ApiError
    );
  });

  test("6. Authorization checks: VIEWER cannot edit, non-author collaborator cannot revert", async () => {
    // Viewer cannot edit (403)
    await expect(
      createResponseEdit(actorViewer, testVersion.id, { content: "Viewer attempt" })
    ).rejects.toThrow(ApiError);

    // CollabA creates an edit
    await createResponseEdit(actorCollabA, testVersion.id, { content: "Collab A edit" });

    // CollabB (different collaborator, neither owner nor admin nor author) tries to revert -> 403
    await expect(
      revertLatestResponseEdit(actorCollabB, testVersion.id)
    ).rejects.toThrow("Only workspace owner, admin, or the editor can revert this edit");
  });

  test("7. Character limits validation on createResponseEditSchema", () => {
    // Empty content rejected
    const emptyResult = createResponseEditSchema.safeParse({ content: "" });
    expect(emptyResult.success).toBe(false);

    // 100k characters accepted
    const valid100k = createResponseEditSchema.safeParse({ content: "a".repeat(100_000) });
    expect(valid100k.success).toBe(true);

    // 100,001 characters rejected
    const invalidOver100k = createResponseEditSchema.safeParse({
      content: "a".repeat(100_001),
    });
    expect(invalidOver100k.success).toBe(false);
  });
});
