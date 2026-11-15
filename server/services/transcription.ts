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
import type { Prisma } from "@/server/db/generated/client";

const TRANSCRIPTION_PROMPT_VERSION = "transcribe-1";

/** Keeps a client language hint to a short language tag or name. */
function normalizeLanguageHint(hint: string | undefined): string | undefined {
  if (!hint) return undefined;
  const trimmed = hint.trim();
  if (!trimmed || trimmed.length > MAX_LANGUAGE_HINT_LENGTH) return undefined;
  return /^[\p{L}\p{M} -]+$/u.test(trimmed) ? trimmed : undefined;
}

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

/** Rough audio token rate of the provider (tokens per second of audio). */
const AUDIO_TOKENS_PER_SECOND = 32;
/** Generous speech rate used to size the reservation (tokens per second). */
const TRANSCRIPT_TOKENS_PER_SECOND = 6;
/** Thinking the model may do before answering, also billed as output. */
const RESERVE_THOUGHT_TOKENS = 1024;
const MAX_LANGUAGE_HINT_LENGTH = 35;

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Counts the voice input seconds used today (UTC) by `actorId`, wherever they
 * recorded. Read from `Generation.usage.seconds` of TRANSCRIPTION rows that
 * didn't fail. The seconds are written when the row is created, so a
 * transcription still running counts too.
 */
export async function countVoiceSecondsToday(
  actorId: string,
  client: Pick<Prisma.TransactionClient, "generation"> = db
): Promise<number> {
  const generations = await client.generation.findMany({
    where: {
      actorId,
      kind: "TRANSCRIPTION",
      status: { not: "FAILED" },
      createdAt: { gte: startOfUtcDay() },
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

function dailyVoiceLimitError(): ApiError {
  return new ApiError(
    402,
    "daily_voice_limit",
    "Daily voice input limit reached for your plan"
  );
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === "P2002" || Boolean(e?.message?.includes("Unique constraint"));
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
  // The bytes must be a known audio container: a file whose type can't be
  // detected is refused too, whatever the client said it was.
  if (!detected || !ALLOWED_DETECTED_MIMES.has(detected.mime)) {
    throw Errors.badRequest(
      "File contents are not a supported audio format",
      "invalid_audio_format"
    );
  }

  const effectiveMime = detected.mime;

  // 4. Daily seconds check against the actor's own plan (fast pre-check; the
  // authoritative one runs below while the actor's credit account is locked).
  const entitlements = await getEntitlements(actorId);
  const voiceLimitSeconds = entitlements.limits.voiceSecondsPerDay;
  const audioSeconds = Math.ceil(durationMs / 1000);

  if ((await countVoiceSecondsToday(actorId)) + audioSeconds > voiceLimitSeconds) {
    throw dailyVoiceLimitError();
  }

  // 5. Billing: the person speaking pays, from their own CreditAccount (§2.6),
  // never the workspace owner.
  let account = await getAccountByUserId(actorId);
  if (!account) {
    account = await createAccountWithFreeGrant(actorId);
  }

  const modelKey = "audio-transcribe";
  const modelDef = getModel(modelKey);
  const generationId = crypto.randomUUID();
  // Sized from the recording so a long one can't be under-reserved.
  const reserveAmount = creditsFor(modelKey, {
    inputTokens: audioSeconds * AUDIO_TOKENS_PER_SECOND + 100,
    outputTokens: audioSeconds * TRANSCRIPT_TOKENS_PER_SECOND,
    thoughtTokens: RESERVE_THOUGHT_TOKENS,
  });
  // Keys follow the generation, which is new for every request: a repeated
  // idempotency key is refused below instead of reusing another request's hold.
  const reservationKey = `res_trans_${generationId}`;
  const settleKey = `stl_trans_${generationId}`;
  const releaseKey = `rel_trans_${generationId}`;

  try {
    await reserve(account.id, reserveAmount, reservationKey, {
      generationId,
      actorId,
      estimated: true,
      // Runs while the actor's account row is locked, so concurrent
      // recordings can't each pass the daily check. The row is written here
      // with its seconds, so the next request already counts it.
      guard: async (tx) => {
        const used = await countVoiceSecondsToday(actorId, tx);
        if (used + audioSeconds > voiceLimitSeconds) {
          throw dailyVoiceLimitError();
        }
        await tx.generation.create({
          data: {
            id: generationId,
            workspaceId: null,
            actorId,
            billedAccountId: account.id,
            kind: "TRANSCRIPTION",
            status: "RUNNING",
            modelKey,
            providerModelId: modelDef.providerModelId,
            promptVersion: TRANSCRIPTION_PROMPT_VERSION,
            idempotencyKey,
            reservedCredits: reserveAmount,
            usage: { seconds: audioSeconds, durationMs },
            startedAt: new Date(),
          },
        });
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw Errors.conflict(
        "This recording was already sent",
        "duplicate_request"
      );
    }
    throw err;
  }

  // 6. Build prompt & invoke model
  const hint = normalizeLanguageHint(languageHint);
  const promptInstruction = hint
    ? `Transcribe this audio verbatim in the language spoken (likely ${hint}). Return only the transcript text.`
    : "Transcribe this audio verbatim in the language spoken. Return only the transcript text.";

  const dataUrl = `data:${effectiveMime};base64,${audioBuffer.toString("base64")}`;

  let transcribedText = "";
  let usage = { inputTokens: 0, outputTokens: 0, thoughtTokens: 0 };

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
          thoughtTokens: ev.thoughtTokens ?? 0,
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
          // A code, never the provider's message (it can echo content).
          errorCode:
            err instanceof ApiError ? err.code.slice(0, 50) : "transcription_error",
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
  // Thinking tokens are billed by the provider as output, so they count too.
  const thoughtTokens = usage.thoughtTokens;
  const chargedCredits = creditsFor(modelKey, { inputTokens, outputTokens, thoughtTokens });

  await settle(account.id, generationId, chargedCredits, settleKey);

  await db.generation.update({
    where: { id: generationId },
    data: {
      status: "COMPLETED",
      chargedCredits,
      usage: {
        inputTokens,
        outputTokens,
        thoughtTokens,
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
