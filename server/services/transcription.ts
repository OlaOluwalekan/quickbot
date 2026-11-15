import "server-only";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";
import { db } from "@/server/db/client";
import { ApiError, Errors } from "@/server/http/errors";
import { getModel } from "@/server/ai/registry";
import { streamAi, type AiProvider } from "@/server/ai";
import { creditsFor } from "@/lib/ai/model-catalog";
import {
  getAccountByUserId,
  createAccountWithFreeGrant,
  reserve,
  settle,
  release,
} from "@/server/services/credits";
import { getEntitlements } from "@/server/billing/entitlements";
import type { PlanKey } from "@/server/billing/plans";

export const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_AUDIO_DURATION_MS = 120_000; // 2 minutes

export const ALLOWED_AUDIO_MIMES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/x-m4a",
  "audio/aac",
  "audio/m4a",
]);

/**
 * Valid container MIME types detected from file headers (magic bytes).
 * WebM and MP4 audio recordings from browsers frequently identify as video/webm or video/mp4 containers.
 */
export const ALLOWED_DETECTED_MIMES = new Set([
  "audio/webm",
  "video/webm",
  "audio/ogg",
  "application/ogg",
  "video/ogg",
  "audio/mp4",
  "video/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/vnd.wave",
  "audio/wave",
  "audio/x-wav",
  "audio/aac",
  "audio/x-m4a",
]);

/**
 * Counts the voice input seconds used today by `actorId` across all workspaces/sessions.
 * Read from `Generation.usage.seconds` where `kind = "TRANSCRIPTION"`.
 */
export async function countVoiceSecondsToday(actorId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const generations = await db.generation.findMany({
    where: {
      actorId,
      kind: "TRANSCRIPTION",
      createdAt: { gte: startOfDay },
    },
    select: { usage: true },
  });

  let total = 0;
  for (const g of generations) {
    const s =
      g.usage && typeof g.usage === "object" && !Array.isArray(g.usage)
        ? (g.usage as { seconds?: unknown }).seconds
        : undefined;
    if (typeof s === "number" && Number.isFinite(s) && s > 0) total += s;
  }
  return total;
}

export interface TranscribeAudioInput {
  audioBuffer: Buffer;
  clientMimeType?: string;
  durationMs: number;
  idempotencyKey?: string;
  languageHint?: string;
  actorId: string;
  userPlan?: PlanKey;
  providerInstance?: AiProvider;
}

export interface TranscribeAudioResult {
  text: string;
  durationMs: number;
  credits: number;
}

/**
 * Transcribes user speech verbatim using the configured audio model.
 * Audio buffer is processed in memory and dropped immediately (never persisted).
 */
export async function transcribeAudio(
  input: TranscribeAudioInput
): Promise<TranscribeAudioResult> {
  const {
    audioBuffer,
    clientMimeType = "audio/webm",
    durationMs,
    idempotencyKey = crypto.randomUUID(),
    languageHint,
    actorId,
    providerInstance,
  } = input;

  // 1. Size check (<= 5 MB)
  if (!audioBuffer || audioBuffer.length === 0) {
    throw Errors.badRequest("Audio file is empty", "empty_file");
  }
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    throw Errors.badRequest("Audio file must be 5MB or less", "file_too_large");
  }

  // 2. Duration check (<= 120s)
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw Errors.badRequest("Invalid audio duration", "invalid_duration");
  }
  if (durationMs > MAX_AUDIO_DURATION_MS) {
    throw Errors.badRequest(
      "Audio duration cannot exceed 2 minutes",
      "duration_too_long"
    );
  }

  // 3. MIME allow-list & Magic-byte check
  const normalizedClientMime = (clientMimeType.split(";")[0] ?? "").trim().toLowerCase();
  if (!ALLOWED_AUDIO_MIMES.has(normalizedClientMime)) {
    throw Errors.badRequest(
      `Unsupported audio type: ${normalizedClientMime}`,
      "unsupported_audio_type"
    );
  }

  const uint8 = new Uint8Array(
    audioBuffer.buffer,
    audioBuffer.byteOffset,
    audioBuffer.byteLength
  );
  const detected = await fileTypeFromBuffer(uint8);
  // If file-type detects a known format, ensure it is an allowed audio/video container
  if (detected && !ALLOWED_DETECTED_MIMES.has(detected.mime)) {
    throw Errors.badRequest(
      `File contents do not match audio format (detected ${detected.mime})`,
      "invalid_audio_format"
    );
  }

  const effectiveMime = detected?.mime || normalizedClientMime;

  // 4. Daily seconds check against entitlements
  const entitlements = await getEntitlements(actorId);
  const voiceLimitSeconds = entitlements.limits.voiceSecondsPerDay;
  const audioSeconds = Math.ceil(durationMs / 1000);

  const usedSecondsToday = await countVoiceSecondsToday(actorId);
  if (usedSecondsToday + audioSeconds > voiceLimitSeconds) {
    throw new ApiError(
      402,
      "daily_voice_limit",
      "Daily voice input limit reached for your plan"
    );
  }

  // 5. Billing setup: Billed to actor's personal CreditAccount
  let account = await getAccountByUserId(actorId);
  if (!account) {
    account = await createAccountWithFreeGrant(actorId);
  }

  const modelKey = "audio-transcribe";
  const modelDef = getModel(modelKey);
  const generationId = crypto.randomUUID();
  const reserveAmount = 2; // initial estimated credits for audio transcription
  const reservationKey = `res_trans_${idempotencyKey}`;
  const settleKey = `stl_trans_${idempotencyKey}`;
  const releaseKey = `rel_trans_${idempotencyKey}`;

  // Reserve credits on actor's account
  await reserve(account.id, reserveAmount, reservationKey, {
    generationId,
    actorId,
    estimated: true,
  });

  // Create Generation record with nullable workspaceId
  await db.generation.create({
    data: {
      id: generationId,
      workspaceId: null,
      actorId,
      billedAccountId: account.id,
      kind: "TRANSCRIPTION",
      status: "RUNNING",
      modelKey,
      providerModelId: modelDef.providerModelId,
      promptVersion: "1.0",
      idempotencyKey,
      reservedCredits: reserveAmount,
      startedAt: new Date(),
    },
  });

  // 6. Build prompt & invoke model
  const promptInstruction = languageHint
    ? `Transcribe this audio verbatim in the language spoken (likely ${languageHint}). Return only the transcript text.`
    : "Transcribe this audio verbatim in the language spoken. Return only the transcript text.";

  const dataUrl = `data:${effectiveMime};base64,${audioBuffer.toString("base64")}`;

  let transcribedText = "";
  let usage = { inputTokens: 0, outputTokens: 0 };

  try {
    const stream = streamAi(
      {
        modelKey,
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "file",
                url: dataUrl,
                mime: effectiveMime,
              },
              {
                type: "text",
                text: promptInstruction,
              },
            ],
          },
        ],
        thinking: { summaries: false },
        temperature: 0.1,
      },
      {
        userPlan: entitlements.plan,
        providerInstance,
      }
    );

    for await (const ev of stream) {
      if (ev.type === "text_delta" && ev.text) {
        transcribedText += ev.text;
      } else if (ev.type === "usage") {
        usage = {
          inputTokens: ev.inputTokens,
          outputTokens: ev.outputTokens,
        };
      }
    }
  } catch (err: unknown) {
    await release(account.id, generationId, releaseKey).catch(() => {});
    await db.generation
      .update({
        where: { id: generationId },
        data: {
          status: "FAILED",
          errorCode: (err as Error)?.message?.slice(0, 50) || "transcription_error",
          finishedAt: new Date(),
        },
      })
      .catch(() => {});
    throw err;
  }

  const cleanText = transcribedText.trim();

  // 7. Empty speech check -> 422 no_speech
  if (!cleanText) {
    await release(account.id, generationId, releaseKey).catch(() => {});
    await db.generation
      .update({
        where: { id: generationId },
        data: {
          status: "FAILED",
          errorCode: "no_speech",
          finishedAt: new Date(),
        },
      })
      .catch(() => {});
    throw Errors.unprocessable("No speech detected in audio", "no_speech");
  }

  // 8. Settle credits
  // Fall back to estimated token counts if model didn't return usage
  const inputTokens = usage.inputTokens || Math.ceil(audioSeconds * 32);
  const outputTokens = usage.outputTokens || Math.ceil(cleanText.split(/\s+/).length * 1.3);
  const chargedCredits = creditsFor(modelKey, { inputTokens, outputTokens });

  await settle(account.id, generationId, chargedCredits, settleKey);

  await db.generation.update({
    where: { id: generationId },
    data: {
      status: "COMPLETED",
      chargedCredits,
      usage: {
        inputTokens,
        outputTokens,
        seconds: audioSeconds,
        durationMs,
      },
      finishedAt: new Date(),
    },
  });

  return {
    text: cleanText,
    durationMs,
    credits: chargedCredits,
  };
}
