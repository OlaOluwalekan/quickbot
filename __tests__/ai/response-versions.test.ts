/**
 * @jest-environment node
 */
import { db } from "@/server/db/client";
import {
  listWorkspaceResponses,
  listResponseVersions,
  setActiveVersion,
  regenerateResponse,
} from "@/server/services/response";
import {
  createAndStreamGeneration,
  setCustomProvider,
  clearActiveGenerationsForTesting,
} from "@/server/services/generation";
import { createAccountWithFreeGrant } from "@/server/services/credits";
import type { Actor } from "@/server/auth/session";
import type { AiProvider, GenerateRequest, ImageRequest, ImageResult, StreamEvent } from "@/server/ai";
import { ApiError } from "@/server/http/errors";

class FakeAiProvider implements AiProvider {
  id = "gemini" as const;

  constructor(
    private events: StreamEvent[] = [],
    private delayMs: number = 0
  ) {}

  async *stream(_req: GenerateRequest): AsyncIterable<StreamEvent> {
    for (const ev of this.events) {
      if (this.delayMs > 0) {
        await new Promise((r) => setTimeout(r, this.delayMs));
      }
      yield ev;
    }
  }

  async generateImage(_req: ImageRequest): Promise<ImageResult> {
    return {
      bytes: Buffer.from("fake-image"),
      mime: "image/png",
    };
  }
}

async function readAllSse(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

describe("Step 2.6 — Response versions (regenerate)", () => {
  let userA: { id: string; email: string };
  let viewerUser: { id: string; email: string };
  let actorOwner: Actor;
  let actorViewer: Actor;
  let workspace: { id: string };

  beforeEach(async () => {
    clearActiveGenerationsForTesting();
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    userA = await db.user.create({
      data: {
        id: `user_owner_${unique}`,
        name: "Workspace Owner",
        email: `owner_${unique}@example.com`,
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
      userId: userA.id,
      email: userA.email,
      role: "USER",
      sessionId: `sess_owner_${unique}`,
    };

    actorViewer = {
      userId: viewerUser.id,
      email: viewerUser.email,
      role: "USER",
      sessionId: `sess_viewer_${unique}`,
    };

    // Ensure owner has credits
    await createAccountWithFreeGrant(userA.id);

    // Create workspace owned by userA
    workspace = await db.workspace.create({
      data: {
        ownerId: userA.id,
        title: "Versions Test Workspace",
      },
    });

    // Add viewerUser as VIEWER
    await db.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: viewerUser.id,
        role: "VIEWER",
        invitedById: userA.id,
      },
    });
  });

  afterEach(() => {
    setCustomProvider(null);
    clearActiveGenerationsForTesting();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("1. Viewer cannot regenerate (403 Forbidden)", async () => {
    // Create an initial response
    const response = await db.response.create({
      data: {
        workspaceId: workspace.id,
        createdById: userA.id,
        prompt: "First prompt",
      },
    });

    await expect(
      regenerateResponse(actorViewer, response.id, {
        idempotencyKey: `regen_viewer_${Date.now()}`,
        modelKey: "text-economy",
      })
    ).rejects.toThrow(ApiError);
  });

  it("2. 3 concurrent regenerations assign unique numbers 2, 3, 4 while original is unchanged byte-for-byte", async () => {
    const originalContent = "Original answer version 1 byte-for-byte.";
    const response = await db.response.create({
      data: {
        workspaceId: workspace.id,
        createdById: userA.id,
        prompt: "Calculate physics",
      },
    });

    const v1 = await db.responseVersion.create({
      data: {
        responseId: response.id,
        number: 1,
        status: "COMPLETE",
        content: originalContent,
        modelKey: "text-economy",
        providerModelId: "gemini-flash",
        promptVersion: "2026-10-1",
        createdById: userA.id,
      },
    });

    await db.response.update({
      where: { id: response.id },
      data: { activeVersionId: v1.id },
    });

    // Setup fake provider for regeneration
    const fakeEvents: StreamEvent[] = [
      { type: "text_delta", text: "Regenerated answer " },
      { type: "usage", inputTokens: 10, outputTokens: 5, estimated: false },
    ];
    setCustomProvider(new FakeAiProvider(fakeEvents, 10));

    // Launch 3 concurrent regenerations at the same moment
    const regenKeys = [
      `regen_conc_1_${Date.now()}`,
      `regen_conc_2_${Date.now()}`,
      `regen_conc_3_${Date.now()}`,
    ];

    const streams = await Promise.all(
      regenKeys.map((key) =>
        regenerateResponse(actorOwner, response.id, {
          idempotencyKey: key,
          modelKey: "text-economy",
        })
      )
    );

    // Consume all 3 SSE streams to completion
    await Promise.all(streams.map((s) => readAllSse(s.stream)));

    // Allow detached saves to finish
    await new Promise((r) => setTimeout(r, 200));

    // Verify all versions in DB
    const allVersions = await db.responseVersion.findMany({
      where: { responseId: response.id },
      orderBy: { number: "asc" },
    });

    expect(allVersions.length).toBe(4);
    const versionNumbers = allVersions.map((v) => v.number);
    expect(versionNumbers).toEqual([1, 2, 3, 4]);

    // Verify original version is completely unchanged byte-for-byte
    const reloadedV1 = allVersions.find((v) => v.number === 1);
    expect(reloadedV1?.content).toBe(originalContent);
    expect(reloadedV1?.id).toBe(v1.id);
  });

  it("3. Switching active version works via setActiveVersion", async () => {
    const response = await db.response.create({
      data: {
        workspaceId: workspace.id,
        createdById: userA.id,
        prompt: "Choose version",
      },
    });

    const v1 = await db.responseVersion.create({
      data: {
        responseId: response.id,
        number: 1,
        status: "COMPLETE",
        content: "Version 1 content",
        modelKey: "text-economy",
        providerModelId: "fake",
        promptVersion: "2026-10-1",
        createdById: userA.id,
      },
    });

    const v2 = await db.responseVersion.create({
      data: {
        responseId: response.id,
        number: 2,
        status: "COMPLETE",
        content: "Version 2 content",
        modelKey: "text-economy",
        providerModelId: "fake",
        promptVersion: "2026-10-1",
        createdById: userA.id,
      },
    });

    // Initially set to v2
    await db.response.update({
      where: { id: response.id },
      data: { activeVersionId: v2.id },
    });

    // Switch to v1 using setActiveVersion
    const switchRes = await setActiveVersion(actorOwner, response.id, v1.id);
    expect(switchRes.activeVersionId).toBe(v1.id);

    const reloaded = await db.response.findUnique({
      where: { id: response.id },
    });
    expect(reloaded?.activeVersionId).toBe(v1.id);

    // Viewer cannot switch active version
    await expect(
      setActiveVersion(actorViewer, response.id, v2.id)
    ).rejects.toThrow(ApiError);
  });

  it("4. listWorkspaceResponses returns responses with activeVersion summary and versionCount", async () => {
    const resp1 = await db.response.create({
      data: {
        workspaceId: workspace.id,
        createdById: userA.id,
        prompt: "Prompt 1",
        sortAt: new Date(Date.now() - 5000),
      },
    });

    const v1_1 = await db.responseVersion.create({
      data: {
        responseId: resp1.id,
        number: 1,
        status: "COMPLETE",
        content: "Answer 1 v1",
        modelKey: "text-economy",
        providerModelId: "fake",
        promptVersion: "2026-10-1",
        createdById: userA.id,
      },
    });

    const v1_2 = await db.responseVersion.create({
      data: {
        responseId: resp1.id,
        number: 2,
        status: "COMPLETE",
        content: "Answer 1 v2",
        modelKey: "text-economy",
        providerModelId: "fake",
        promptVersion: "2026-10-1",
        createdById: userA.id,
      },
    });

    await db.response.update({
      where: { id: resp1.id },
      data: { activeVersionId: v1_2.id },
    });

    // List responses
    const res = await listWorkspaceResponses(actorOwner, workspace.id);
    expect(res.items.length).toBe(1);

    const first = res.items[0];
    expect(first!.id).toBe(resp1.id);
    expect(first!.versionCount).toBe(2);
    expect(first!.activeVersion).toBeDefined();
    expect(first!.activeVersion?.id).toBe(v1_2.id);
    expect(first!.activeVersion?.number).toBe(2);
    expect(first!.activeVersion?.content).toBe("Answer 1 v2");
  });

  it("5. listResponseVersions returns all versions ordered by number", async () => {
    const resp = await db.response.create({
      data: {
        workspaceId: workspace.id,
        createdById: userA.id,
        prompt: "Versions query",
      },
    });

    await db.responseVersion.createMany({
      data: [
        {
          responseId: resp.id,
          number: 1,
          status: "COMPLETE",
          content: "First version",
          modelKey: "text-economy",
          providerModelId: "fake",
          promptVersion: "2026-10-1",
          createdById: userA.id,
        },
        {
          responseId: resp.id,
          number: 2,
          status: "COMPLETE",
          content: "Second version",
          modelKey: "text-economy",
          providerModelId: "fake",
          promptVersion: "2026-10-1",
          createdById: userA.id,
        },
      ],
    });

    const versions = await listResponseVersions(actorOwner, resp.id);
    expect(versions.length).toBe(2);
    expect(versions[0]!.number).toBe(1);
    expect(versions[0]!.content).toBe("First version");
    expect(versions[1]!.number).toBe(2);
    expect(versions[1]!.content).toBe("Second version");
  });
});
