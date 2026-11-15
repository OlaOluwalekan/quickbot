"use client";

import * as React from "react";
import { Mic, Square, Loader2, RefreshCw, X } from "lucide-react";
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
  // Set when the server says today's voice seconds are used up.
  const [dailyLimitReached, setDailyLimitReached] = React.useState(false);

  const recorderRef = React.useRef<VoiceRecorder | null>(null);
  const stateRef = React.useRef<VoiceState>(state);
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);
  // Updates the state and the ref together, so handlers called before the
  // next render (auto-stop, Send) see the new value.
  const setVoiceState = React.useCallback((next: VoiceState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const isSupported = React.useMemo(() => isVoiceSupported(), []);

  const announce = React.useCallback((msg: string) => {
    setAnnouncement(msg);
  }, []);

  const showUploadError = React.useCallback(
    (err: unknown) => {
      const code = (err as { code?: string })?.code;
      if (code === "no_speech") {
        toast.error(t("noSpeech"));
      } else if (code === "daily_voice_limit") {
        setDailyLimitReached(true);
        toast.error(t("dailyLimit"));
      } else if (code === "insufficient_credits") {
        toast.error(t("outOfCredits"));
      } else {
        toast.error(t("error"));
      }
    },
    [t]
  );

  const handleStopAndTranscribe = React.useCallback(
    async (mode: "insert" | "send") => {
      if (!recorderRef.current || stateRef.current !== "recording") return;

      setVoiceState("transcribing");
      onRecordingChange?.(false);
      announce(t("stopped"));

      let audio: RecordedAudio;
      try {
        audio = await recorderRef.current.stop();
        setLastAudio(audio);
      } catch {
        setVoiceState("idle");
        toast.error(t("error"));
        return;
      }

      try {
        const result = await uploadVoiceTranscription(audio.blob, audio.durationMs);
        setVoiceState("idle");
        setLastAudio(null);

        const text = result?.text ?? "";
        if (text) {
          if (mode === "send" && onSendTranscript) {
            onSendTranscript(text);
          } else {
            onInsertTranscript(text);
            announce(t("inserted"));
          }
        }
      } catch (err: unknown) {
        // Retrying can't help when there is no speech or no allowance left.
        const code = (err as { code?: string })?.code;
        if (code === "no_speech" || code === "daily_voice_limit" || code === "insufficient_credits") {
          setLastAudio(null);
          setVoiceState("idle");
        } else {
          setVoiceState("error");
        }
        showUploadError(err);
      }
    },
    [t, announce, onInsertTranscript, onSendTranscript, onRecordingChange, setVoiceState, showUploadError]
  );

  const handleCancel = React.useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.cancel();
    }
    setVoiceState("idle");
    setDurationMs(0);
    setLevel(0);
    setLastAudio(null);
    onRecordingChange?.(false);
    announce(t("cancelled"));
  }, [t, announce, onRecordingChange, setVoiceState]);

  const handleStartRecording = React.useCallback(async () => {
    if (disabled || gateReason || dailyLimitReached || !isSupported) return;

    setVoiceState("requesting-permission");
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

      setVoiceState("recording");
      onRecordingChange?.(true);
      announce(t("started"));
    } catch (err: unknown) {
      setVoiceState("idle");
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
    dailyLimitReached,
    isSupported,
    t,
    announce,
    onRecordingChange,
    handleStopAndTranscribe,
    setVoiceState,
  ]);

  const handleRetry = React.useCallback(async () => {
    if (!lastAudio) return;

    setVoiceState("transcribing");
    try {
      const result = await uploadVoiceTranscription(
        lastAudio.blob,
        lastAudio.durationMs
      );
      setVoiceState("idle");
      setLastAudio(null);
      const text = result?.text ?? "";
      if (text) {
        onInsertTranscript(text);
        announce(t("inserted"));
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "no_speech" || code === "daily_voice_limit" || code === "insufficient_credits") {
        setLastAudio(null);
        setVoiceState("idle");
      } else {
        setVoiceState("error");
      }
      showUploadError(err);
    }
  }, [lastAudio, t, announce, onInsertTranscript, setVoiceState, showUploadError]);

  const handleDiscard = React.useCallback(() => {
    setLastAudio(null);
    setVoiceState("idle");
  }, [setVoiceState]);

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
    : gateReason ?? (dailyLimitReached ? { code: "daily_voice_limit" } : null);

  return (
    <div
      className={cn("inline-flex items-center gap-1.5", className)}
      data-testid="voice-input-container"
    >
      {/* Screen reader announcements */}
      {/* aria-live only: the composer already has the page's status region. */}
      <div aria-live="polite" className="sr-only" data-testid="voice-live-region">
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
          <button
            type="button"
            onClick={handleDiscard}
            aria-label={t("discard")}
            title={t("discard")}
            className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-muted hover:text-fg cursor-pointer"
            data-testid="voice-discard-btn"
          >
            <X className="h-3 w-3" />
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
