/**
 * F4.5 review: duplicate requests, the daily cap under concurrency, thinking
 * tokens in the charge, an empty balance, and the unauthenticated route.
 */
import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { transcribeAudio } from "@/server/services/transcription";
import { creditsFor } from "@/lib/ai/model-catalog";
import type { AiProvider, StreamEvent } from "@/server/ai/types";
import { getActor } from "../server/auth/session";
import { POST as transcribeRoute } from "@/app/api/v1/transcriptions/route";

jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(),
}));

const WEBM = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81,
  0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84,
  0x77, 0x65, 0x62, 0x6d, 0x42, 0x87, 0x81, 0x02, 0x42, 0x85, 0x81, 0x02,
]);

const ACTOR = "user_voice_review_01";

function provider(usage: { inputTokens: number; outputTokens: number; thoughtTokens?: number }): AiProvider {
  return {
    id: "gemini",
    stream: async function* (): AsyncIterable<StreamEvent> {
      yield { type: "text_delta", text: "hello there" };
      yield { type: "usage", ...usage, estimated: false };
      yield { type: "done", finishReason: "stop" };
    },
  };
}

async function resetActor(balance: number) {
  await db.generation.deleteMany({ where: { actorId: ACTOR } });
  await db.user.upsert({
    where: { id: ACTOR },
    update: {},
    create: { id: ACTOR, email: "voice_review@example.com", name: "Voice Review" },
  });
  return db.creditAccount.upsert({
    where: { userId: ACTOR },
    update: { planBalance: balance, topupBalance: 0 },
    create: { userId: ACTOR, planBalance: balance, topupBalance: 0 },
  });
}

describe("F4.5 review — transcription service", () => {
  beforeEach(async () => {
    await resetActor(100);
  });

  it("refuses a repeated idempotency key with 409 and charges once", async () => {
    const key = `dup_${Date.now()}`;
    const input = {
      audioBuffer: WEBM,
      clientMimeType: "audio/webm",
      durationMs: 3000,
      idempotencyKey: key,
      actorId: ACTOR,
      providerInstance: provider({ inputTokens: 100, outputTokens: 5 }),
    };
    await transcribeAudio(input);
    const before = await db.creditAccount.findUniqueOrThrow({ where: { userId: ACTOR } });

    await expect(transcribeAudio(input)).rejects.toMatchObject({
      status: 409,
      code: "duplicate_request",
    });

    const after = await db.creditAccount.findUniqueOrThrow({ where: { userId: ACTOR } });
    expect(after.planBalance).toBe(before.planBalance);
    expect(await db.generation.count({ where: { actorId: ACTOR } })).toBe(1);
  });

  it("concurrent recordings can't exceed the daily seconds together", async () => {
    // FREE: 120 s a day. Two 70 s recordings sent at once: only one fits.
    const results = await Promise.allSettled(
      [1, 2].map((n) =>
        transcribeAudio({
          audioBuffer: WEBM,
          clientMimeType: "audio/webm",
          durationMs: 70_000,
          idempotencyKey: `conc_${n}_${Date.now()}`,
          actorId: ACTOR,
          providerInstance: provider({ inputTokens: 2000, outputTokens: 50 }),
        })
      )
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter(
      (r) => r.status === "rejected" && (r.reason as { code?: string }).code === "daily_voice_limit"
    );
    expect(ok).toHaveLength(1);
    expect(refused).toHaveLength(1);
  });

  it("charges thinking tokens too", async () => {
    const usage = { inputTokens: 1000, outputTokens: 50, thoughtTokens: 20_000 };
    const res = await transcribeAudio({
      audioBuffer: WEBM,
      clientMimeType: "audio/webm",
      durationMs: 5000,
      actorId: ACTOR,
      providerInstance: provider(usage),
    });
    expect(res.credits).toBe(creditsFor("audio-transcribe", usage));
    expect(res.credits).toBeGreaterThan(
      creditsFor("audio-transcribe", { inputTokens: 1000, outputTokens: 50 })
    );
  });

  it("an empty balance is a 402 insufficient_credits and leaves no generation", async () => {
    await resetActor(0);
    await expect(
      transcribeAudio({
        audioBuffer: WEBM,
        clientMimeType: "audio/webm",
        durationMs: 3000,
        actorId: ACTOR,
        providerInstance: provider({ inputTokens: 100, outputTokens: 5 }),
      })
    ).rejects.toMatchObject({ status: 402, code: "insufficient_credits" });
    expect(await db.generation.count({ where: { actorId: ACTOR } })).toBe(0);
  });
});

describe("F4.5 review — POST /api/v1/transcriptions", () => {
  it("returns 401 without a session", async () => {
    (getActor as jest.Mock).mockResolvedValue(null as never);
    const form = new FormData();
    form.append("audio", new Blob([WEBM], { type: "audio/webm" }), "a.webm");
    form.append("durationMs", "1000");
    const res = await transcribeRoute(
      new NextRequest("http://localhost:3000/api/v1/transcriptions", {
        method: "POST",
        body: form,
      })
    );
    expect(res.status).toBe(401);
  });
});

describe("F4.5 review — magic bytes", () => {
  it("refuses bytes that aren't a known audio container", async () => {
    await expect(
      transcribeAudio({
        audioBuffer: Buffer.from("just some text pretending to be audio"),
        clientMimeType: "audio/webm",
        durationMs: 1000,
        actorId: ACTOR,
      })
    ).rejects.toMatchObject({ status: 400, code: "invalid_audio_format" });
  });
});
