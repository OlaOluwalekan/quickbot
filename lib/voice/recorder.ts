/**
 * Voice Recording & Audio Analysis Utilities (Step F4.5)
 */

export interface RecordedAudio {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export interface VoiceRecorderCallbacks {
  onLevelChange?: (level: number) => void;
  onTimeUpdate?: (durationMs: number) => void;
  onAutoStop?: () => void;
}

export function isVoiceSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  return Boolean(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof window.MediaRecorder !== "undefined"
  );
}

export function getSupportedAudioMime(): string {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    return "audio/webm";
  }
  const candidateMimes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/wav",
  ];
  for (const m of candidateMimes) {
    if (
      typeof MediaRecorder.isTypeSupported === "function" &&
      MediaRecorder.isTypeSupported(m)
    ) {
      return m;
    }
  }
  return "audio/webm";
}

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private timerInterval: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private chunks: Blob[] = [];
  private mimeType: string = "audio/webm";
  private isRecording: boolean = false;

  async start(callbacks: VoiceRecorderCallbacks = {}): Promise<void> {
    if (!isVoiceSupported()) {
      throw new Error("Voice recording is not supported in this browser");
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mimeType = getSupportedAudioMime();

    try {
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this.mimeType,
      });
    } catch {
      // Fallback without explicit mimeType
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.mimeType = this.mediaRecorder.mimeType || "audio/webm";
    }

    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    // Setup AudioContext for live volume meter
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
        const source = this.audioContext.createMediaStreamSource(this.stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        source.connect(this.analyser);

        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        const checkLevel = () => {
          if (!this.isRecording || !this.analyser) return;
          this.analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i]!;
          }
          const avg = sum / dataArray.length;
          const normalized = Math.min(1, Math.max(0, avg / 128));
          callbacks.onLevelChange?.(normalized);
          this.animFrameId = requestAnimationFrame(checkLevel);
        };
        this.animFrameId = requestAnimationFrame(checkLevel);
      }
    } catch {
      // Ignore audioContext init failure (e.g. strict permissions)
    }

    this.isRecording = true;
    this.startTime = Date.now();
    this.mediaRecorder.start(250); // collect in 250ms chunks

    // Duration timer with 2 minute (120,000ms) cap
    this.timerInterval = setInterval(() => {
      if (!this.isRecording) return;
      const elapsed = Date.now() - this.startTime;
      callbacks.onTimeUpdate?.(elapsed);
      if (elapsed >= 120_000) {
        callbacks.onAutoStop?.();
      }
    }, 100);
  }

  stop(): Promise<RecordedAudio> {
    return new Promise((resolve) => {
      const durationMs = Math.min(120_000, Date.now() - this.startTime);
      this.cleanup();

      if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
        const finalBlob = new Blob(this.chunks, { type: this.mimeType });
        resolve({ blob: finalBlob, mimeType: this.mimeType, durationMs });
        return;
      }

      this.mediaRecorder.onstop = () => {
        const finalBlob = new Blob(this.chunks, { type: this.mimeType });
        resolve({ blob: finalBlob, mimeType: this.mimeType, durationMs });
      };

      try {
        this.mediaRecorder.stop();
      } catch {
        const finalBlob = new Blob(this.chunks, { type: this.mimeType });
        resolve({ blob: finalBlob, mimeType: this.mimeType, durationMs });
      }
    });
  }

  cancel(): void {
    this.cleanup();
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.chunks = [];
  }

  private cleanup(): void {
    this.isRecording = false;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      this.stream = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        this.audioContext.close().catch(() => {});
      } catch {
        // ignore
      }
      this.audioContext = null;
    }
  }
}

/**
 * Uploads recorded audio for server-side verbatim transcription.
 */
export async function uploadVoiceTranscription(
  blob: Blob,
  durationMs: number,
  options?: { idempotencyKey?: string; languageHint?: string }
): Promise<{ text: string; durationMs: number; credits: number }> {
  const formData = new FormData();
  formData.append("audio", blob, "recording.webm");
  formData.append("durationMs", String(Math.round(durationMs)));
  if (options?.idempotencyKey) {
    formData.append("idempotencyKey", options.idempotencyKey);
  }
  if (options?.languageHint) {
    formData.append("languageHint", options.languageHint);
  }

  const res = await fetch("/api/v1/transcriptions", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    const err = new Error(errorJson.message || "Failed to transcribe audio") as Error & {
      code?: string;
      status?: number;
    };
    err.code = errorJson.code || "transcription_failed";
    err.status = res.status;
    throw err;
  }

  const json = await res.json().catch(() => ({}));
  const data = json && typeof json === "object" && "data" in json ? json.data : json;
  return {
    text: (data?.text as string) || "",
    durationMs: typeof data?.durationMs === "number" ? data.durationMs : durationMs,
    credits: typeof data?.credits === "number" ? data.credits : 0,
  };
}
