import { route } from "@/server/http/route";
import { Errors } from "@/server/http/errors";
import { transcribeAudio } from "@/server/services/transcription";

export const POST = route({
  auth: "required",
  rateLimit: {
    policy: "transcribe",
    key: (c) => c.actor.userId,
  },
  handler: async ({ req, actor }) => {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      throw Errors.badRequest("Invalid multipart form data", "invalid_form_data");
    }

    const file = formData.get("audio");
    if (!file || typeof file === "string" || !(file instanceof Blob)) {
      throw Errors.badRequest("Missing audio file", "missing_audio");
    }

    const rawDuration = formData.get("durationMs");
    const durationMs = rawDuration ? Number(rawDuration) : 0;
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw Errors.badRequest("Invalid durationMs", "invalid_duration");
    }

    const idempotencyKey = (formData.get("idempotencyKey") as string) || undefined;
    const languageHint = (formData.get("languageHint") as string) || undefined;

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    return transcribeAudio({
      audioBuffer,
      clientMimeType: file.type || "audio/webm",
      durationMs,
      idempotencyKey,
      languageHint,
      actorId: actor.userId,
    });
  },
});
