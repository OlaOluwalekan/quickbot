"use client";

import * as React from "react";
import { Mic, Square, Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Gated } from "@/components/ui/gated";
import type { GateReason } from "@/lib/entitlements/shared";
import {
  VoiceRecorder,
  isVoiceSupported,
  uploadVoiceTranscription,
  type RecordedAudio,
} from "@/lib/voice/recorder";

export interface VoiceInputProps {
  onInsertTranscript: (text: string) => void;
  onSendTranscript?: (text: string) => void;
  disabled?: boolean;
  gateReason?: GateReason | null;
  className?: string;
  onRecordingChange?: (isRecording: boolean) => void;
  registerSendHandler?: (handler: (() => Promise<void>) | null) => void;
}

export type VoiceState =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "transcribing"
  | "error";

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function VoiceInput({
  onInsertTranscript,
  onSendTranscript,
  disabled = false,
  gateReason,
  className,
  onRecordingChange,
  registerSendHandler,
}: VoiceInputProps) {
  const t = useTranslations("Voice");

  const [state, setState] = React.useState<VoiceState>("idle");
  const [durationMs, setDurationMs] = React.useState<number>(0);
  const [level, setLevel] = React.useState<number>(0);
  const [lastAudio, setLastAudio] = React.useState<RecordedAudio | null>(null);
  const [announcement, setAnnouncement] = React.useState<string>("");

  const recorderRef = React.useRef<VoiceRecorder | null>(null);
  const stateRef = React.useRef<VoiceState>(state);
  stateRef.current = state;

  const isSupported = React.useMemo(() => isVoiceSupported(), []);

  const announce = React.useCallback((msg: string) => {
    setAnnouncement(msg);
  }, []);

  const handleStopAndTranscribe = React.useCallback(
    async (mode: "insert" | "send") => {
      if (!recorderRef.current || stateRef.current !== "recording") return;

      setState("transcribing");
      onRecordingChange?.(false);
      announce(t("stop"));

      let audio: RecordedAudio;
      try {
        audio = await recorderRef.current.stop();
        setLastAudio(audio);
      } catch {
        setState("idle");
        toast.error(t("error"));
        return;
      }

      try {
        const result = await uploadVoiceTranscription(audio.blob, audio.durationMs);
        setState("idle");
        setLastAudio(null);
        announce(t("inserted"));

        const text = result?.text ?? "";
        if (text) {
          if (mode === "send" && onSendTranscript) {
            onSendTranscript(text);
          } else {
            onInsertTranscript(text);
          }
        }
      } catch (err: unknown) {
        setState("error");
        const status = (err as { status?: number })?.status;
        const code = (err as { code?: string })?.code;

        if (status === 422 || code === "no_speech") {
          toast.error(t("noSpeech"));
        } else if (status === 402 || code === "daily_voice_limit") {
          toast.error(t("dailyLimit"));
        } else {
          toast.error(t("error"));
        }
      }
    },
    [t, announce, onInsertTranscript, onSendTranscript, onRecordingChange]
  );

  const handleCancel = React.useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.cancel();
    }
    setState("idle");
    setDurationMs(0);
    setLevel(0);
    setLastAudio(null);
    onRecordingChange?.(false);
    announce(t("cancel"));
  }, [t, announce, onRecordingChange]);

  const handleStartRecording = React.useCallback(async () => {
    if (disabled || gateReason || !isSupported) return;

    setState("requesting-permission");
    setLastAudio(null);
    const rec = new VoiceRecorder();
    recorderRef.current = rec;

    try {
      await rec.start({
        onLevelChange: (lvl) => setLevel(lvl),
        onTimeUpdate: (ms) => setDurationMs(ms),
        onAutoStop: () => {
          toast.warning(t("tooLong"));
          void handleStopAndTranscribe("insert");
        },
      });

      setState("recording");
      onRecordingChange?.(true);
      announce(t("recording"));
    } catch (err: unknown) {
      setState("idle");
      onRecordingChange?.(false);
      const isPermissionDenied =
        (err as Error)?.name === "NotAllowedError" ||
        (err as Error)?.name === "PermissionDeniedError" ||
        (err as Error)?.message?.toLowerCase().includes("permission");

      if (isPermissionDenied) {
        toast.error(t("permissionDenied"));
      } else {
        toast.error(t("error"));
      }
    }
  }, [
    disabled,
    gateReason,
    isSupported,
    t,
    announce,
    onRecordingChange,
    handleStopAndTranscribe,
  ]);

  const handleRetry = React.useCallback(async () => {
    if (!lastAudio) return;

    setState("transcribing");
    try {
      const result = await uploadVoiceTranscription(
        lastAudio.blob,
        lastAudio.durationMs
      );
      setState("idle");
      setLastAudio(null);
      announce(t("inserted"));
      const text = result?.text ?? "";
      if (text) {
        onInsertTranscript(text);
      }
    } catch (err: unknown) {
      setState("error");
      const status = (err as { status?: number })?.status;
      const code = (err as { code?: string })?.code;

      if (status === 422 || code === "no_speech") {
        toast.error(t("noSpeech"));
      } else if (status === 402 || code === "daily_voice_limit") {
        toast.error(t("dailyLimit"));
      } else {
        toast.error(t("error"));
      }
    }
  }, [lastAudio, t, announce, onInsertTranscript]);

  // Register send handler with composer so Send while recording submits transcript
  React.useEffect(() => {
    if (!registerSendHandler) return;

    if (state === "recording") {
      registerSendHandler(async () => {
        await handleStopAndTranscribe("send");
      });
    } else {
      registerSendHandler(null);
    }

    return () => {
      registerSendHandler(null);
    };
  }, [state, registerSendHandler, handleStopAndTranscribe]);

  // Keyboard navigation: Esc cancels and discards recording
  React.useEffect(() => {
    if (state !== "recording") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [state, handleCancel]);

  // Clean up recorder on unmount
  React.useEffect(() => {
    return () => {
      if (recorderRef.current) {
        recorderRef.current.cancel();
      }
    };
  }, []);

  // Determine effective gate reason
  const effectiveGateReason: GateReason | null = !isSupported
    ? { code: "unsupported_browser" }
    : gateReason ?? null;

  return (
    <div
      className={cn("inline-flex items-center gap-1.5", className)}
      data-testid="voice-input-container"
    >
      {/* Screen reader announcements */}
      <div aria-live="polite" className="sr-only" role="status">
        {announcement}
      </div>

      {state === "recording" ? (
        <div
          className="flex items-center gap-2 rounded-xl bg-surface-2 border border-border px-2 py-1 text-xs shadow-xs animate-in fade-in"
          data-testid="voice-recording-indicator"
        >
          {/* Pulsing red dot */}
          <span className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
          </span>

          {/* mm:ss Elapsed Timer */}
          <span
            className="font-mono text-xs font-semibold text-fg"
            data-testid="voice-duration"
          >
            {formatDuration(durationMs)}
          </span>

          {/* Level visualizer bars */}
          <div
            className="flex items-center gap-0.5 h-3 px-1"
            aria-hidden="true"
            data-testid="voice-level-meter"
          >
            <span
              className="w-0.5 rounded-full bg-accent transition-all duration-75"
              style={{ height: `${Math.max(20, Math.min(100, level * 100))}%` }}
            />
            <span
              className="w-0.5 rounded-full bg-accent transition-all duration-75"
              style={{
                height: `${Math.max(20, Math.min(100, level * 140))}%`,
              }}
            />
            <span
              className="w-0.5 rounded-full bg-accent transition-all duration-75"
              style={{ height: `${Math.max(20, Math.min(100, level * 80))}%` }}
            />
          </div>

          {/* Stop Button */}
          <button
            type="button"
            onClick={() => void handleStopAndTranscribe("insert")}
            aria-label={t("stop")}
            data-testid="voice-stop-btn"
            className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface text-fg hover:bg-surface-3 transition-colors cursor-pointer"
          >
            <Square className="h-3 w-3 fill-current" />
          </button>
        </div>
      ) : state === "transcribing" ? (
        <div
          className="flex items-center gap-1.5 rounded-xl bg-surface-2 border border-border px-2 py-1 text-xs text-muted shadow-xs"
          data-testid="voice-transcribing-indicator"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
          <span>{t("transcribing")}</span>
        </div>
      ) : state === "error" && lastAudio ? (
        <div
          className="flex items-center gap-1 rounded-xl bg-surface-2 border border-border px-2 py-1 text-xs text-danger shadow-xs"
          data-testid="voice-retry-indicator"
        >
          <button
            type="button"
            onClick={() => void handleRetry()}
            className="inline-flex items-center gap-1 font-medium hover:underline cursor-pointer"
            data-testid="voice-retry-btn"
          >
            <RefreshCw className="h-3 w-3" />
            <span>{t("retry")}</span>
          </button>
        </div>
      ) : (
        <Gated reason={effectiveGateReason}>
          <button
            type="button"
            onClick={() => {
              if (!effectiveGateReason && !disabled) {
                void handleStartRecording();
              }
            }}
            disabled={disabled || state === "requesting-permission"}
            aria-label={t("start")}
            aria-pressed={false}
            data-testid="voice-record-btn"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50",
              state === "requesting-permission" && "animate-pulse"
            )}
          >
            {state === "requesting-permission" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mic className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
        </Gated>
      )}
    </div>
  );
}
