import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import crypto from "crypto";
import {
  transcribeAudio,
  countVoiceSecondsToday,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_DURATION_MS,
} from "@/server/services/transcription";
import { db } from "@/server/db/client";
import { ApiError } from "@/server/http/errors";
import type { AiProvider, GenerateRequest, StreamEvent } from "@/server/ai/types";
import fs from "fs";
import path from "path";

// Sample valid WebM header (magic bytes: 1A 45 DF A3)
const VALID_WEBM_BUFFER = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81,
  0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84,
  0x77, 0x65, 0x62, 0x6d, 0x42, 0x87, 0x81, 0x02, 0x42, 0x85, 0x81, 0x02,
]);

// Sample valid PNG image bytes (spoofed as audio/webm)
const SPOOFED_IMAGE_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

describe("Step F4.5 — Voice Transcription Service & Permissions-Policy", () => {
  const actorId = "user_voice_test_01";
  let creditAccountId = "";

  beforeAll(() => {
    jest.setTimeout(25000);
  });

  beforeEach(async () => {
    // Clear any generations created today for the test actors to ensure isolation
    await db.generation.deleteMany({
      where: { actorId: { in: [actorId, "user_voice_daily_test"] } },
    });

    // Ensure test user and credit account exist
    await db.user.upsert({
      where: { id: actorId },
      update: {},
      create: {
        id: actorId,
        email: "voice_tester@example.com",
        name: "Voice Tester",
      },
    });

    const account = await db.creditAccount.upsert({
      where: { userId: actorId },
      update: { planBalance: 50, topupBalance: 50 },
      create: {
        userId: actorId,
        planBalance: 50,
        topupBalance: 50,
      },
    });
    creditAccountId = account.id;
  });

  describe("1. Permissions-Policy in next.config.mjs", () => {
    it("ensures microphone=(self) is present in headers to guarantee voice input access", () => {
      const configSource = fs.readFileSync(path.resolve(process.cwd(), "next.config.mjs"), "utf8");
      expect(configSource).toContain('key: "Permissions-Policy"');
      expect(configSource).toContain("microphone=(self)");
    });
  });

  describe("2. Validation guards (size, duration, MIME, spoofing)", () => {
    it("rejects empty audio buffer", async () => {
      await expect(
        transcribeAudio({
          audioBuffer: Buffer.alloc(0),
          clientMimeType: "audio/webm",
          durationMs: 5000,
          actorId,
        })
      ).rejects.toThrow("empty");
    });

    it("rejects audio files exceeding 5 MB", async () => {
      const largeBuffer = Buffer.alloc(MAX_AUDIO_BYTES + 10);
      await expect(
        transcribeAudio({
          audioBuffer: largeBuffer,
          clientMimeType: "audio/webm",
          durationMs: 5000,
          actorId,
        })
      ).rejects.toMatchObject({
        status: 400,
        code: "file_too_large",
      });
    });

    it("rejects audio duration exceeding 120 seconds (120,000 ms)", async () => {
      await expect(
        transcribeAudio({
          audioBuffer: VALID_WEBM_BUFFER,
          clientMimeType: "audio/webm",
          durationMs: MAX_AUDIO_DURATION_MS + 100,
          actorId,
        })
      ).rejects.toMatchObject({
        status: 400,
        code: "duration_too_long",
      });
    });

    it("rejects unsupported client MIME types", async () => {
      await expect(
        transcribeAudio({
          audioBuffer: VALID_WEBM_BUFFER,
          clientMimeType: "video/mp4",
          durationMs: 5000,
          actorId,
        })
      ).rejects.toMatchObject({
        status: 400,
        code: "unsupported_audio_type",
      });
    });

    it("detects and rejects MIME spoofing when file contents are not audio (e.g. PNG renamed as audio/webm)", async () => {
      await expect(
        transcribeAudio({
          audioBuffer: SPOOFED_IMAGE_BUFFER,
          clientMimeType: "audio/webm",
          durationMs: 5000,
          actorId,
        })
      ).rejects.toMatchObject({
        status: 400,
        code: "invalid_audio_format",
      });
    });
  });

  describe("3. Daily Voice Limit (voiceSecondsPerDay)", () => {
    it("enforces voiceSecondsPerDay daily limit", async () => {
      const dailyActorId = "user_voice_daily_test";
      await db.user.upsert({
        where: { id: dailyActorId },
        update: {},
        create: {
          id: dailyActorId,
          email: "voice_daily@example.com",
          name: "Voice Daily Tester",
        },
      });
      const acc = await db.creditAccount.upsert({
        where: { userId: dailyActorId },
        update: { planBalance: 50 },
        create: {
          userId: dailyActorId,
          planBalance: 50,
        },
      });

      // Create existing generations that consume 115 seconds today for FREE plan (limit = 120s)
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);

      await db.generation.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId: null,
          actorId: dailyActorId,
          billedAccountId: acc.id,
          kind: "TRANSCRIPTION",
          status: "COMPLETED",
          modelKey: "audio-transcribe",
          providerModelId: "gemini-3.1-flash-lite",
          promptVersion: "1.0",
          idempotencyKey: `daily_test_${Date.now()}`,
          reservedCredits: 2,
          chargedCredits: 2,
          usage: { seconds: 115, durationMs: 115000 },
          createdAt: new Date(),
        },
      });

      const used = await countVoiceSecondsToday(dailyActorId);
      expect(used).toBeGreaterThanOrEqual(115);

      // Attempting to record 10 seconds should exceed 120s cap on FREE plan
      await expect(
        transcribeAudio({
          audioBuffer: VALID_WEBM_BUFFER,
          clientMimeType: "audio/webm",
          durationMs: 10_000,
          actorId: dailyActorId,
        })
      ).rejects.toMatchObject({
        status: 402,
        code: "daily_voice_limit",
      });
    });
  });

  describe("4. End-to-end transcription, billing & credit handling", () => {
    it("charges actor personal CreditAccount (not workspace owner) with Generation.workspaceId null", async () => {
      const mockProvider: AiProvider = {
        id: "gemini",
        stream: async function* (req: GenerateRequest): AsyncIterable<StreamEvent> {
          yield { type: "text_delta", text: "Hello, this is a test voice prompt." };
          yield { type: "usage", inputTokens: 160, outputTokens: 10, estimated: false };
          yield { type: "done", finishReason: "stop" };
        },
      };

      const key = `idem_voice_${Date.now()}`;
      const result = await transcribeAudio({
        audioBuffer: VALID_WEBM_BUFFER,
        clientMimeType: "audio/webm",
        durationMs: 5000,
        idempotencyKey: key,
        actorId,
        providerInstance: mockProvider,
      });

      expect(result.text).toBe("Hello, this is a test voice prompt.");
      expect(result.durationMs).toBe(5000);
      expect(result.credits).toBeGreaterThanOrEqual(1);

      // Verify generation record in database
      const gen = await db.generation.findUnique({
        where: {
          actorId_idempotencyKey: {
            actorId,
            idempotencyKey: key,
          },
        },
      });

      expect(gen).toBeDefined();
      expect(gen?.workspaceId).toBeNull();
      expect(gen?.kind).toBe("TRANSCRIPTION");
      expect(gen?.billedAccountId).toBe(creditAccountId);
      expect(gen?.status).toBe("COMPLETED");

      const usage = gen?.usage as { seconds: number; durationMs: number };
      expect(usage.seconds).toBe(5);
      expect(usage.durationMs).toBe(5000);

      // Verify audio buffer is not stored in DB or anywhere on generation
      expect((gen as Record<string, unknown>).audioBuffer).toBeUndefined();
    });

    it("throws 422 no_speech and releases reservation if model returns empty transcription", async () => {
      const mockEmptyProvider: AiProvider = {
        id: "gemini",
        stream: async function* (): AsyncIterable<StreamEvent> {
          yield { type: "text_delta", text: "   \n\t  " };
          yield { type: "done", finishReason: "stop" };
        },
      };

      const key = `idem_empty_${Date.now()}`;
      await expect(
        transcribeAudio({
          audioBuffer: VALID_WEBM_BUFFER,
          clientMimeType: "audio/webm",
          durationMs: 3000,
          idempotencyKey: key,
          actorId,
          providerInstance: mockEmptyProvider,
        })
      ).rejects.toMatchObject({
        status: 422,
        code: "no_speech",
      });

      // Generation should be marked FAILED with errorCode no_speech
      const gen = await db.generation.findUnique({
        where: {
          actorId_idempotencyKey: {
            actorId,
            idempotencyKey: key,
          },
        },
      });
      expect(gen?.status).toBe("FAILED");
      expect(gen?.errorCode).toBe("no_speech");

      // Verify reservation was released in credit ledger
      const releaseEntry = await db.creditLedger.findFirst({
        where: {
          generationId: gen?.id,
          type: "RELEASE",
        },
      });
      expect(releaseEntry).toBeDefined();
    });
  });
});
