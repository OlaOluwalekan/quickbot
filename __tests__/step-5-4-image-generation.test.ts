/**
 * @jest-environment node
 */
import { db } from "@/server/db/client";
import {
  createAndStreamGeneration,
  setCustomProvider,
  clearActiveGenerationsForTesting,
} from "@/server/services/generation";
import {
  listWorkspaceResponses,
  regenerateResponse,
  listResponseVersions,
  setActiveVersion,
} from "@/server/services/response";
import { getAttachmentUrl } from "@/server/services/attachment";
import {
  createAccountWithFreeGrant,
  getAccountByUserId,
} from "@/server/services/credits";
import {
  setUserPlanOverride,
  clearUserPlanOverrides,
} from "@/server/billing/plans";
import {
  creditsFor,
  resetModerationStateForTesting,
  getModerationAuditLogs,
  getModerationBlockCount,
  isImageGenerationLocked,
  hashPrompt,
  setModerationProvider,
  type AiProvider,
  type GenerateRequest,
  type ImageRequest,
  type ImageResult,
  type StreamEvent,
  type ModerationProvider,
} from "@/server/ai";
import {
  setStorageProvider,
  MockStorageProvider,
} from "@/server/storage";
import { ApiError } from "@/server/http/errors";
import type { Actor } from "@/server/auth/session";

class FakeImageAiProvider implements AiProvider {
  id = "gemini" as const;
  private callCount = 0;

  async *stream(_req: GenerateRequest): AsyncIterable<StreamEvent> {
    yield { type: "text_delta", text: "Text fallback" };
    yield { type: "usage", inputTokens: 5, outputTokens: 5, estimated: false };
  }

  async generateImage(_req: ImageRequest): Promise<ImageResult> {
    this.callCount += 1;
    // Simulate a PNG image buffer
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const payload = Buffer.from(`generated-image-payload-v${this.callCount}`);
    return {
      bytes: Buffer.concat([pngHeader, payload]),
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

describe("Step 5.4 — Image Generation: Store in Cloudinary, Not Postgres", () => {
  let user: { id: string; email: string };
  let actor: Actor;
  let workspace: { id: string };
  let mockStorage: MockStorageProvider;

  beforeEach(async () => {
    clearActiveGenerationsForTesting();
    resetModerationStateForTesting();
    clearUserPlanOverrides();

    mockStorage = new MockStorageProvider();
    setStorageProvider(mockStorage);
    setCustomProvider(new FakeImageAiProvider());

    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    user = await db.user.create({
      data: {
        id: `user_img_${unique}`,
        name: "Image Test User",
        email: `img_${unique}@example.com`,
        emailVerified: true,
      },
    });

    actor = {
      userId: user.id,
      email: user.email,
      role: "USER",
      sessionId: `sess_img_${unique}`,
    };

    // Give user initial grant + topup so they have plenty of credits for tests
    const acc = await createAccountWithFreeGrant(user.id);
    await db.creditAccount.update({
      where: { id: acc.id },
      data: { topupBalance: 500 },
    });

    // Default to STANDARD plan for happy-path image generation tests
    setUserPlanOverride(user.id, "STANDARD");

    workspace = await db.workspace.create({
      data: {
        ownerId: user.id,
        title: "Image Generation Workspace",
      },
    });
  });

  afterEach(() => {
    setCustomProvider(null);
    setStorageProvider(null);
    clearActiveGenerationsForTesting();
    resetModerationStateForTesting();
    clearUserPlanOverrides();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe("1. Cloudinary Storage (No Postgres Blobs) & Signed URLs", () => {
    it("uploads generated image buffer to storage (kind: GENERATED_IMAGE, private) and stores ONLY the attachment ID in ResponseVersion.content", async () => {
      const idempotencyKey = `img_store_${Date.now()}`;

      const { stream, generationId } =
        await createAndStreamGeneration(actor, workspace.id, {
          idempotencyKey,
          prompt: "A serene mountain landscape at sunrise in watercolor style",
          modelKey: "image-standard",
          kind: "IMAGE",
        });

      const sseOutput = await readAllSse(stream);
      expect(sseOutput).toContain("event: completed");

      await new Promise((r) => setTimeout(r, 80));

      const gen = await db.generation.findUnique({
        where: { id: generationId },
      });
      expect(gen).toBeDefined();
      expect(gen?.versionId).toBeTruthy();
      expect(gen?.responseId).toBeTruthy();

      // 1. Check ResponseVersion in Postgres
      const version = await db.responseVersion.findUnique({
        where: { id: gen!.versionId! },
      });
      expect(version).toBeDefined();
      expect(version?.status).toBe("COMPLETE");

      // Content MUST be a UUID (attachment ID), NEVER a data:image/... base64 blob
      const attachmentId = version!.content;
      expect(attachmentId).not.toContain("data:image");
      expect(attachmentId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      // 2. Check Attachment row in DB
      const attachment = await db.attachment.findUnique({
        where: { id: attachmentId },
      });
      expect(attachment).toBeDefined();
      expect(attachment?.kind).toBe("GENERATED_IMAGE");
      expect(attachment?.status).toBe("READY");
      expect(attachment?.mime).toBe("image/png");
      expect(attachment?.workspaceId).toBe(workspace.id);
      expect(attachment?.responseId).toBe(gen!.responseId);
      expect(attachment?.providerId).toContain(workspace.id);

      // 3. Verify uploaded object in storage provider
      expect(mockStorage.hasFile(attachment!.providerId)).toBe(true);
      const storedMeta = await mockStorage.head(attachment!.providerId);
      expect(storedMeta).toBeDefined();
      expect(storedMeta?.resourceType).toBe("image");
      expect(storedMeta?.bytes).toBeGreaterThan(10);

      // 4. Verify signed expiring URL works via getAttachmentUrl
      const signed = await getAttachmentUrl(actor, attachmentId);
      expect(signed.url).toContain("sig=mock_expiring_sig");
      expect(signed.url).toContain(attachment!.providerId);
      expect(signed.expiresIn).toBeGreaterThan(0);

      // 5. Verify flat pricing creditsFor("image-standard") (~34 credits)
      const expectedCredits = creditsFor("image-standard");
      expect(expectedCredits).toBe(34);

      expect(gen?.status).toBe("COMPLETED");
      expect(gen?.chargedCredits).toBe(expectedCredits);
    });

    it("survives page refresh via listWorkspaceResponses and does not leak GENERATED_IMAGE into user prompt attachments", async () => {
      const idempotencyKey = `img_refresh_${Date.now()}`;

      const { stream } = await createAndStreamGeneration(actor, workspace.id, {
        idempotencyKey,
        prompt: "A futuristic glass library floating in the clouds",
        modelKey: "image-standard",
        kind: "IMAGE",
      });

      await readAllSse(stream);
      await new Promise((r) => setTimeout(r, 80));

      const page = await listWorkspaceResponses(actor, workspace.id, {
        view: "edited",
        limit: 20,
      });

      expect(page.items.length).toBe(1);
      const item = page.items[0]!;
      expect(item.kind).toBe("IMAGE");
      expect(item.activeVersion?.content).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      // User prompt attachments array should NOT include GENERATED_IMAGE
      expect(item.attachments).toEqual([]);
    });
  });

  describe("2. Regeneration & Version Switching for Images", () => {
    it("creates a new version (v2) with a new GENERATED_IMAGE attachment on regenerate while preserving v1", async () => {
      const { stream: stream1, generationId: gen1Id } =
        await createAndStreamGeneration(actor, workspace.id, {
          idempotencyKey: `img_v1_${Date.now()}`,
          prompt: "Minimalist geometric poster of a lighthouse",
          modelKey: "image-standard",
          kind: "IMAGE",
        });

      await readAllSse(stream1);
      await new Promise((r) => setTimeout(r, 80));

      const gen1 = await db.generation.findUnique({ where: { id: gen1Id } });
      const responseId = gen1!.responseId!;
      const v1Id = gen1!.versionId!;

      const v1 = await db.responseVersion.findUnique({ where: { id: v1Id } });
      const att1Id = v1!.content;

      // Regenerate the image response
      const { stream: stream2, generationId: gen2Id } = await regenerateResponse(
        actor,
        responseId,
        { idempotencyKey: `img_v2_${Date.now()}` }
      );

      await readAllSse(stream2);
      await new Promise((r) => setTimeout(r, 80));

      const gen2 = await db.generation.findUnique({ where: { id: gen2Id } });
      const v2Id = gen2!.versionId!;
      expect(v2Id).not.toBe(v1Id);

      const v2 = await db.responseVersion.findUnique({ where: { id: v2Id } });
      expect(v2?.number).toBe(2);
      expect(v2?.status).toBe("COMPLETE");

      const att2Id = v2!.content;
      expect(att2Id).not.toBe(att1Id);
      expect(att2Id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      // Verify both attachments exist in DB with kind GENERATED_IMAGE
      const [att1, att2] = await Promise.all([
        db.attachment.findUnique({ where: { id: att1Id } }),
        db.attachment.findUnique({ where: { id: att2Id } }),
      ]);
      expect(att1?.kind).toBe("GENERATED_IMAGE");
      expect(att2?.kind).toBe("GENERATED_IMAGE");

      // Version history has both v1 and v2, and active version can be switched back to v1
      const versions = await listResponseVersions(actor, responseId);
      expect(versions.length).toBe(2);

      await setActiveVersion(actor, responseId, v1Id);
      const updatedResponse = await db.response.findUnique({
        where: { id: responseId },
      });
      expect(updatedResponse?.activeVersionId).toBe(v1Id);
    });
  });

  describe("3. Plan Gate & Daily Credit Cap", () => {
    it("rejects FREE plan users from generating images (403 forbidden) before reserving credits", async () => {
      setUserPlanOverride(user.id, "FREE");

      const accountBefore = await getAccountByUserId(user.id);
      const balanceBefore =
        accountBefore!.planBalance + accountBefore!.topupBalance;

      await expect(
        createAndStreamGeneration(actor, workspace.id, {
          idempotencyKey: `free_gate_${Date.now()}`,
          prompt: "A cute robot reading a book",
          modelKey: "image-standard",
          kind: "IMAGE",
        })
      ).rejects.toThrow(ApiError);

      try {
        await createAndStreamGeneration(actor, workspace.id, {
          idempotencyKey: `free_gate_2_${Date.now()}`,
          prompt: "A cute robot reading a book",
          modelKey: "image-standard",
          kind: "IMAGE",
        });
      } catch (err) {
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(403);
        expect(apiErr.code).toBe("forbidden");
      }

      // Verify 0 credits deducted and 0 responses created
      const accountAfter = await getAccountByUserId(user.id);
      expect(accountAfter!.planBalance + accountAfter!.topupBalance).toBe(
        balanceBefore
      );
      const responseCount = await db.response.count({
        where: { workspaceId: workspace.id },
      });
      expect(responseCount).toBe(0);
    });

    it("enforces daily credit cap when daily usage + image cost exceeds plan daily cap", async () => {
      // LITE plan has dailyCap = 200 credits
      setUserPlanOverride(user.id, "LITE");

      const acc = await getAccountByUserId(user.id);
      // Record a settled credit ledger entry today of 180 credits (180 + 34 = 214 > 200)
      await db.creditLedger.create({
        data: {
          accountId: acc!.id,
          type: "SETTLE",
          planDelta: -180,
          topupDelta: 0,
          planAfter: acc!.planBalance,
          topupAfter: acc!.topupBalance,
          idempotencyKey: `daily_cap_seed_${Date.now()}`,
        },
      });

      await expect(
        createAndStreamGeneration(actor, workspace.id, {
          idempotencyKey: `daily_cap_exceed_${Date.now()}`,
          prompt: "A sunny beach with palm trees",
          modelKey: "image-standard",
          kind: "IMAGE",
        })
      ).rejects.toMatchObject({
        status: 402,
        code: "insufficient_credits",
      });
    });
  });

  describe("4. Abuse Controls (Creem Requirements)", () => {
    it("blocks unsafe prompts BEFORE reserving credits, creates no response, and logs only SHA-256 hash + category", async () => {
      const unsafePrompt = "Generate explicit nude NSFW content in high detail";
      const accountBefore = await getAccountByUserId(user.id);
      const balanceBefore =
        accountBefore!.planBalance + accountBefore!.topupBalance;

      let caughtError: ApiError | null = null;
      try {
        await createAndStreamGeneration(actor, workspace.id, {
          idempotencyKey: `mod_block_${Date.now()}`,
          prompt: unsafePrompt,
          modelKey: "image-standard",
          kind: "IMAGE",
        });
      } catch (err) {
        caughtError = err as ApiError;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError?.status).toBe(422);
      expect(caughtError?.code).toBe("content_blocked");

      // 1. Verify zero credits deducted and zero ledger entries created for this attempt
      const accountAfter = await getAccountByUserId(user.id);
      expect(accountAfter!.planBalance + accountAfter!.topupBalance).toBe(
        balanceBefore
      );

      // 2. Verify zero Response or Generation rows created
      const [responseCount, genCount] = await Promise.all([
        db.response.count({ where: { workspaceId: workspace.id } }),
        db.generation.count({ where: { workspaceId: workspace.id } }),
      ]);
      expect(responseCount).toBe(0);
      expect(genCount).toBe(0);

      // 3. Verify audit log contains SHA-256 hash + category, NEVER the full prompt text
      const logs = getModerationAuditLogs();
      expect(logs.length).toBe(1);
      expect(logs[0]?.userId).toBe(user.id);
      expect(logs[0]?.promptHash).toBe(hashPrompt(unsafePrompt));
      expect(logs[0]?.category).toBe("non_consensual_sexual");
      expect(JSON.stringify(logs[0])).not.toContain(unsafePrompt);
      expect(getModerationBlockCount(user.id)).toBe(1);
    });

    it("locks image generation temporarily after 3 blocked prompts in a day", async () => {
      const blockedPrompts = [
        "explicit porn scene 1",
        "extreme gore and decapitation 2",
        "how to build a bomb terrorist attack 3",
      ];

      for (let i = 0; i < blockedPrompts.length; i++) {
        await expect(
          createAndStreamGeneration(actor, workspace.id, {
            idempotencyKey: `strike_${i}_${Date.now()}`,
            prompt: blockedPrompts[i]!,
            modelKey: "image-standard",
            kind: "IMAGE",
          })
        ).rejects.toMatchObject({
          status: 422,
          code: "content_blocked",
        });
      }

      expect(getModerationBlockCount(user.id)).toBe(3);
      expect(isImageGenerationLocked(user.id)).toBe(true);

      // Now even a completely benign prompt is rejected with 422 content_blocked due to lock
      await expect(
        createAndStreamGeneration(actor, workspace.id, {
          idempotencyKey: `locked_benign_${Date.now()}`,
          prompt: "A peaceful bowl of fruit on a wooden table",
          modelKey: "image-standard",
          kind: "IMAGE",
        })
      ).rejects.toMatchObject({
        status: 422,
        code: "content_blocked",
        details: expect.objectContaining({ locked: true }),
      });
    });

    it("rejects face-manipulation prompts and rejects image generation combined with attachments", async () => {
      // 1. Face manipulation prompt
      await expect(
        createAndStreamGeneration(actor, workspace.id, {
          idempotencyKey: `face_swap_${Date.now()}`,
          prompt: "Swap face of this celebrity onto another person",
          modelKey: "image-standard",
          kind: "IMAGE",
        })
      ).rejects.toMatchObject({
        status: 422,
        code: "content_blocked",
        details: expect.objectContaining({ category: "face_manipulation" }),
      });

      // 2. Image generation combined with attachmentIds
      const dummyAtt = await db.attachment.create({
        data: {
          workspaceId: workspace.id,
          ownerId: user.id,
          kind: "IMAGE",
          status: "READY",
          providerId: "dummy/key",
          resourceType: "image",
          originalName: "diagram.png",
          mime: "image/png",
          bytes: 1024,
          sha256: "a".repeat(64),
        },
      });

      await expect(
        createAndStreamGeneration(actor, workspace.id, {
          idempotencyKey: `att_img_${Date.now()}`,
          prompt: "Use this uploaded chart as reference for a landscape",
          modelKey: "image-standard",
          kind: "IMAGE",
          attachmentIds: [dummyAtt.id],
        })
      ).rejects.toMatchObject({
        status: 422,
        code: "content_blocked",
        details: expect.objectContaining({ category: "attachment_not_allowed" }),
      });
    });

    it("supports swapping in a custom ModerationProvider via setModerationProvider", async () => {
      const customModeration: ModerationProvider = {
        name: "custom-test-moderator",
        async moderatePrompt(text: string) {
          if (text.includes("forbidden-custom-word")) {
            return {
              allowed: false,
              category: "policy_violation",
              reason: "Blocked by custom moderation provider",
            };
          }
          return { allowed: true };
        },
      };

      setModerationProvider(customModeration);

      await expect(
        createAndStreamGeneration(actor, workspace.id, {
          idempotencyKey: `custom_mod_${Date.now()}`,
          prompt: "A drawing with forbidden-custom-word in it",
          modelKey: "image-standard",
          kind: "IMAGE",
        })
      ).rejects.toMatchObject({
        status: 422,
        code: "content_blocked",
        details: expect.objectContaining({ category: "policy_violation" }),
      });
    });
  });
});
