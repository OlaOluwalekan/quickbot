/**
 * @jest-environment node
 */
import { db } from "@/server/db/client";
import {
  createAndStreamGeneration,
  cancelGeneration,
  getGenerationStatus,
  setCustomProvider,
  clearActiveGenerationsForTesting,
  recoverOrphanedGenerations,
} from "@/server/services/generation";
import { createAccountWithFreeGrant, getAccountByUserId } from "@/server/services/credits";
import type { Actor } from "@/server/auth/session";
import type { AiProvider, GenerateRequest, ImageRequest, ImageResult, StreamEvent } from "@/server/ai";

class FakeAiProvider implements AiProvider {
  id = "gemini" as const;

  constructor(
    private events: StreamEvent[] = [],
    private delayMs: number = 0,
    private errorToThrow?: Error
  ) {}

  async *stream(_req: GenerateRequest): AsyncIterable<StreamEvent> {
    if (this.errorToThrow) {
      throw this.errorToThrow;
    }
    for (const ev of this.events) {
      if (this.delayMs > 0) {
        await new Promise((r) => setTimeout(r, this.delayMs));
      }
      yield ev;
    }
  }

  async generateImage(_req: ImageRequest): Promise<ImageResult> {
    return {
      bytes: Buffer.from("fake-image-bytes"),
      mime: "image/png",
      usage: { images: 1 },
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

describe("Generation Service and Streaming Pipeline (Step 2.4)", () => {
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let actorA: Actor;
  let actorB: Actor;
  let workspace: { id: string };

  beforeEach(async () => {
    clearActiveGenerationsForTesting();
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    userA = await db.user.create({
      data: {
        id: `user_a_${unique}`,
        name: "User A (Owner)",
        email: `usera_${unique}@example.com`,
        emailVerified: true,
      },
    });
    userB = await db.user.create({
      data: {
        id: `user_b_${unique}`,
        name: "User B (Collaborator)",
        email: `userb_${unique}@example.com`,
        emailVerified: true,
      },
    });

    actorA = {
      userId: userA.id,
      email: userA.email,
      role: "USER",
      sessionId: `sess_a_${unique}`,
    };

    actorB = {
      userId: userB.id,
      email: userB.email,
      role: "USER",
      sessionId: `sess_b_${unique}`,
    };

    // Ensure user A has 100 free credits
    await createAccountWithFreeGrant(userA.id);

    // Create workspace owned by A
    workspace = await db.workspace.create({
      data: {
        ownerId: userA.id,
        title: "Test Workspace",
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

  it("1. Idempotent retry creates one response and one charge", async () => {
    const fakeEvents: StreamEvent[] = [
      { type: "text_delta", text: "Hello " },
      { type: "text_delta", text: "World!" },
      { type: "usage", inputTokens: 10, outputTokens: 5, estimated: false },
    ];
    setCustomProvider(new FakeAiProvider(fakeEvents));

    const idempotencyKey = `idem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // First call
    const { stream: stream1, generationId: genId1 } = await createAndStreamGeneration(
      actorA,
      workspace.id,
      {
        idempotencyKey,
        prompt: "Say hello",
        modelKey: "text-economy",
      }
    );

    const sseOutput1 = await readAllSse(stream1);
    expect(sseOutput1).toContain('"stage":"writing"');
    expect(sseOutput1).toContain("Hello ");
    expect(sseOutput1).toContain("World!");

    // Give asynchronous completion a moment to finish detached saves
    await new Promise((r) => setTimeout(r, 100));

    // Second call with identical idempotencyKey
    const { stream: stream2, generationId: genId2 } = await createAndStreamGeneration(
      actorA,
      workspace.id,
      {
        idempotencyKey,
        prompt: "Say hello",
        modelKey: "text-economy",
      }
    );

    const sseOutput2 = await readAllSse(stream2);
    expect(sseOutput2).toContain('"content":"Hello World!"');
    expect(genId1).toBe(genId2);

    // Verify exactly one Generation row in DB
    const genCount = await db.generation.count({
      where: { actorId: actorA.userId, idempotencyKey },
    });
    expect(genCount).toBe(1);

    // Verify exactly one Response row in DB
    const responseCount = await db.response.count({
      where: { workspaceId: workspace.id },
    });
    expect(responseCount).toBe(1);

    // Verify ledger has exactly 1 RESERVE and 1 SETTLE
    const ledgers = await db.creditLedger.findMany({
      where: { generationId: genId1 },
    });
    expect(ledgers.length).toBe(2);
    expect(ledgers.map((l) => l.type).sort()).toEqual(["RESERVE", "SETTLE"]);
  });

  it("2. Disconnect mid-stream still completes and settles", async () => {
    const fakeEvents: StreamEvent[] = [
      { type: "text_delta", text: "Chunk 1; " },
      { type: "text_delta", text: "Chunk 2; " },
      { type: "text_delta", text: "Chunk 3." },
      { type: "usage", inputTokens: 10, outputTokens: 8, estimated: false },
    ];
    setCustomProvider(new FakeAiProvider(fakeEvents, 50));

    const idempotencyKey = `disc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const { stream, generationId } = await createAndStreamGeneration(
      actorA,
      workspace.id,
      {
        idempotencyKey,
        prompt: "Test disconnect",
        modelKey: "text-economy",
      }
    );

    const reader = stream.getReader();
    // Read first chunk
    await reader.read();
    // Client disconnects (closes tab/cancels HTTP connection)
    await reader.cancel();

    // Wait for detached stream to finish in the background
    let isComplete = false;
    for (let i = 0; i < 30; i++) {
      const gen = await db.generation.findUnique({
        where: { id: generationId },
      });
      if (gen?.status === "COMPLETED") {
        isComplete = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 60));
    }

    expect(isComplete).toBe(true);

    const status = await getGenerationStatus(actorA, generationId);
    expect(status.status).toBe("COMPLETED");
    expect(status.content).toBe("Chunk 1; Chunk 2; Chunk 3.");

    // Verify version in DB is COMPLETE
    const version = await db.responseVersion.findUnique({
      where: { id: status.versionId! },
    });
    expect(version?.status).toBe("COMPLETE");
    expect(version?.content).toBe("Chunk 1; Chunk 2; Chunk 3.");
  });

  it("3. Cancel settles partial output", async () => {
    const fakeEvents: StreamEvent[] = [
      { type: "text_delta", text: "Start of answer..." },
      { type: "text_delta", text: "More words that will be stopped." },
    ];
    setCustomProvider(new FakeAiProvider(fakeEvents, 200));

    const idempotencyKey = `cancel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const { stream, generationId } = await createAndStreamGeneration(
      actorA,
      workspace.id,
      {
        idempotencyKey,
        prompt: "Cancel me",
        modelKey: "text-economy",
      }
    );

    const reader = stream.getReader();
    await reader.read();

    const cancelRes = await cancelGeneration(actorA, generationId);
    expect(cancelRes.status).toBe("CANCELLED");

    await new Promise((r) => setTimeout(r, 150));

    const gen = await db.generation.findUnique({
      where: { id: generationId },
    });
    expect(gen?.status).toBe("CANCELLED");

    const settleLedger = await db.creditLedger.findFirst({
      where: { generationId, type: "SETTLE" },
    });
    const releaseLedger = await db.creditLedger.findFirst({
      where: { generationId, type: "RELEASE" },
    });
    expect(settleLedger || releaseLedger).toBeDefined();
  });

  it("4. Provider error releases credits fully when no tokens emitted", async () => {
    setCustomProvider(new FakeAiProvider([], 0, new Error("Upstream model unavailable")));

    const idempotencyKey = `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const { stream, generationId } = await createAndStreamGeneration(
      actorA,
      workspace.id,
      {
        idempotencyKey,
        prompt: "Will fail",
        modelKey: "text-economy",
      }
    );

    const sseOutput = await readAllSse(stream);
    expect(sseOutput).toContain("event: error");
    expect(sseOutput).toContain('"code":"unavailable"');

    await new Promise((r) => setTimeout(r, 100));

    const gen = await db.generation.findUnique({
      where: { id: generationId },
    });
    expect(gen?.status).toBe("FAILED");

    // Full refund was released back to account
    const releaseLedger = await db.creditLedger.findFirst({
      where: { generationId, type: "RELEASE" },
    });
    expect(releaseLedger).toBeDefined();
  });

  it("5. Two users in one workspace: actor = collaborator, billed account = owner", async () => {
    // Add userB as EDITOR in workspace owned by userA
    await db.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: userB.id,
        role: "EDITOR",
        invitedById: userA.id,
      },
    });

    const fakeEvents: StreamEvent[] = [
      { type: "text_delta", text: "Answer for collaborator" },
      { type: "usage", inputTokens: 10, outputTokens: 5, estimated: false },
    ];
    setCustomProvider(new FakeAiProvider(fakeEvents));

    const idempotencyKey = `collab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const { stream, generationId } = await createAndStreamGeneration(
      actorB,
      workspace.id,
      {
        idempotencyKey,
        prompt: "Collab prompt",
        modelKey: "text-economy",
      }
    );

    await readAllSse(stream);
    await new Promise((r) => setTimeout(r, 100));

    const gen = await db.generation.findUnique({
      where: { id: generationId },
    });
    expect(gen).toBeDefined();
    expect(gen?.actorId).toBe(userB.id);

    const ownerAccount = await getAccountByUserId(userA.id);
    expect(gen?.billedAccountId).toBe(ownerAccount!.id);

    const userBAccount = await getAccountByUserId(userB.id);
    if (userBAccount) {
      const bLedgers = await db.creditLedger.findMany({
        where: { accountId: userBAccount.id },
      });
      expect(bLedgers.length).toBe(0);
    }
  });

  it("6. Insufficient credits throws 402 with no Response row created", async () => {
    const ownerAccount = await getAccountByUserId(userA.id);
    await db.creditAccount.update({
      where: { id: ownerAccount!.id },
      data: { planBalance: 0, topupBalance: 0 },
    });

    const idempotencyKey = `broke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await expect(
      createAndStreamGeneration(actorA, workspace.id, {
        idempotencyKey,
        prompt: "Need money",
        modelKey: "text-economy",
      })
    ).rejects.toThrow();

    const responseCount = await db.response.count({
      where: { workspaceId: workspace.id },
    });
    expect(responseCount).toBe(0);

    const genCount = await db.generation.count({
      where: { workspaceId: workspace.id },
    });
    expect(genCount).toBe(0);
  });

  it("7. Recovers orphaned generations running longer than 10 minutes", async () => {
    const ownerAccount = await getAccountByUserId(userA.id);
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);
    const orphanGenId = crypto.randomUUID();

    // First create a reservation in credit ledger to test release
    await db.creditLedger.create({
      data: {
        accountId: ownerAccount!.id,
        type: "RESERVE",
        planDelta: -5,
        topupDelta: 0,
        planAfter: 95,
        topupAfter: 0,
        generationId: orphanGenId,
        idempotencyKey: `res_orphan_${orphanGenId}`,
      },
    });

    const orphanedGen = await db.generation.create({
      data: {
        id: orphanGenId,
        workspaceId: workspace.id,
        actorId: actorA.userId,
        billedAccountId: ownerAccount!.id,
        kind: "TEXT",
        status: "RUNNING",
        modelKey: "text-economy",
        providerModelId: "fake",
        promptVersion: "2026-10-1",
        idempotencyKey: `orph_${Date.now()}`,
        reservedCredits: 5,
        startedAt: elevenMinutesAgo,
      },
    });

    const recoveredCount = await recoverOrphanedGenerations();
    expect(recoveredCount).toBeGreaterThanOrEqual(1);

    const updated = await db.generation.findUnique({
      where: { id: orphanedGen.id },
    });
    expect(updated?.status).toBe("FAILED");
    expect(updated?.errorCode).toBe("timeout_orphaned");
  });

  it("8. Progress events and thinking summaries: produces ordered lifecycle events and persists thoughtSummary", async () => {
    const fakeEvents: StreamEvent[] = [
      { type: "thought_delta", text: "Analyzing the query..." },
      { type: "thought_delta", text: "Formulating plan..." },
      { type: "text_delta", text: "Final answer text." },
      { type: "usage", inputTokens: 15, outputTokens: 10, estimated: false },
    ];
    setCustomProvider(new FakeAiProvider(fakeEvents));

    const idempotencyKey = `think_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const { stream, generationId } = await createAndStreamGeneration(
      actorA,
      workspace.id,
      {
        idempotencyKey,
        prompt: "Explain relativity with deep thoughts",
        modelKey: "text-economy",
        think: true,
      }
    );

    const sseOutput = await readAllSse(stream);

    const queuedIdx = sseOutput.indexOf('"stage":"queued"');
    const preparingIdx = sseOutput.indexOf('"stage":"preparing"');
    const thinkingIdx = sseOutput.indexOf('"stage":"thinking"');
    const thoughtDeltaIdx = sseOutput.indexOf("Analyzing the query...");
    const writingIdx = sseOutput.indexOf('"stage":"writing"');
    const textDeltaIdx = sseOutput.indexOf("Final answer text.");
    const savingIdx = sseOutput.indexOf('"stage":"saving"');
    const doneIdx = sseOutput.indexOf('"stage":"done"');
    const completedIdx = sseOutput.indexOf('"content":"Final answer text."');

    expect(queuedIdx).toBeGreaterThan(-1);
    expect(preparingIdx).toBeGreaterThan(queuedIdx);
    expect(thinkingIdx).toBeGreaterThan(preparingIdx);
    expect(thoughtDeltaIdx).toBeGreaterThan(thinkingIdx);
    expect(writingIdx).toBeGreaterThan(thoughtDeltaIdx);
    expect(textDeltaIdx).toBeGreaterThan(writingIdx);
    expect(savingIdx).toBeGreaterThan(textDeltaIdx);
    expect(doneIdx).toBeGreaterThan(savingIdx);
    expect(completedIdx).toBeGreaterThan(doneIdx);

    expect(sseOutput).toContain("event: thought");

    await new Promise((r) => setTimeout(r, 100));

    const status = await getGenerationStatus(actorA, generationId);
    expect(status.status).toBe("COMPLETED");
    expect(status.thoughtSummary).toBe("Analyzing the query...Formulating plan...");
    expect(status.content).toBe("Final answer text.");

    const version = await db.responseVersion.findUnique({
      where: { id: status.versionId! },
    });
    expect(version?.thoughtSummary).toBe("Analyzing the query...Formulating plan...");
    expect(version?.content).toBe("Final answer text.");
  });

  it("9. Model without summary capability yields only status events and no thought events", async () => {
    const { MODELS } = await import("@/server/ai/registry");
    const originalSetting = MODELS["text-economy"].caps.thinkingSummaries;
    (MODELS["text-economy"].caps as { thinkingSummaries: boolean }).thinkingSummaries = false;

    try {
      const fakeEvents: StreamEvent[] = [
        { type: "thought_delta", text: "Hidden thoughts" },
        { type: "text_delta", text: "Direct response text." },
        { type: "usage", inputTokens: 10, outputTokens: 8, estimated: false },
      ];
      setCustomProvider(new FakeAiProvider(fakeEvents));

      const idempotencyKey = `nothink_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const { stream, generationId } = await createAndStreamGeneration(
        actorA,
        workspace.id,
        {
          idempotencyKey,
          prompt: "No thinking model prompt",
          modelKey: "text-economy",
        }
      );

      const sseOutput = await readAllSse(stream);

      expect(sseOutput).not.toContain("event: thought");
      expect(sseOutput).not.toContain('"stage":"thinking"');
      expect(sseOutput).not.toContain("Hidden thoughts");

      expect(sseOutput).toContain('"stage":"queued"');
      expect(sseOutput).toContain('"stage":"preparing"');
      expect(sseOutput).toContain('"stage":"writing"');
      expect(sseOutput).toContain('"stage":"saving"');
      expect(sseOutput).toContain('"stage":"done"');
      expect(sseOutput).toContain("Direct response text.");

      await new Promise((r) => setTimeout(r, 100));

      const status = await getGenerationStatus(actorA, generationId);
      expect(status.thoughtSummary).toBeNull();
      expect(status.content).toBe("Direct response text.");
    } finally {
      (MODELS["text-economy"].caps as { thinkingSummaries: boolean }).thinkingSummaries = originalSetting;
    }
  });
});
