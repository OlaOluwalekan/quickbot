import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import QueryProvider, { createAppQueryClient } from "@/components/providers/query-provider";
import { Composer } from "@/components/workspace/composer";
import { VoiceInput } from "@/components/workspace/voice-input";
import { toast } from "sonner";
import * as recorderModule from "../lib/voice/recorder";
import enMessages from "../messages/en.json";

jest.mock("../lib/voice/recorder", () => ({
  __esModule: true,
  isVoiceSupported: jest.fn(() => true),
  VoiceRecorder: jest.fn(),
  uploadVoiceTranscription: jest.fn(),
}));

jest.mock("../lib/api/client", () => ({
  api: jest.fn().mockResolvedValue({ id: "mock-ws-id" }),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    warning: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => "/workspaces",
}));

describe("Step F4.5 — Voice Prompts Client & UI", () => {
  let queryClient: ReturnType<typeof createAppQueryClient>;

  beforeAll(() => {
    jest.setTimeout(15000);
  });

  beforeEach(() => {
    queryClient = createAppQueryClient();
    jest.clearAllMocks();
  });

  describe("1. Browser Support & Gated State", () => {
    it("renders mic button as gated when browser does not support MediaRecorder or getUserMedia", () => {
      jest.spyOn(recorderModule, "isVoiceSupported").mockReturnValue(false);

      render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <VoiceInput onInsertTranscript={jest.fn()} />
        </NextIntlClientProvider>
      );

      const micBtn = screen.getByTestId("voice-record-btn");
      expect(micBtn).toHaveAttribute("aria-disabled", "true");
      expect(micBtn.closest("[data-gated='unsupported_browser']")).toBeInTheDocument();
    });
  });

  describe("2. Permission Denial", () => {
    it("shows toast when microphone permission is denied", async () => {
      jest.spyOn(recorderModule, "isVoiceSupported").mockReturnValue(true);

      class MockDenyingRecorder {
        start() {
          const err = new Error("Permission denied");
          err.name = "NotAllowedError";
          return Promise.reject(err);
        }
        stop() { return Promise.resolve({ blob: new Blob([]), mimeType: "audio/webm", durationMs: 0 }); }
        cancel() {}
      }
      jest.spyOn(recorderModule, "VoiceRecorder").mockImplementation(() => new MockDenyingRecorder() as any);

      render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <VoiceInput onInsertTranscript={jest.fn()} />
        </NextIntlClientProvider>
      );

      const micBtn = screen.getByTestId("voice-record-btn");
      await act(async () => {
        fireEvent.click(micBtn);
      });

      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/Microphone access was denied/i)
      );
    });
  });

  describe("3. Recording State & Live Indicators", () => {
    it("shows pulsing dot, duration, level meter, and stop button when recording starts", async () => {
      jest.spyOn(recorderModule, "isVoiceSupported").mockReturnValue(true);

      let callbacksRef: any = null;
      class MockActiveRecorder {
        start(callbacks: any) {
          callbacksRef = callbacks;
          callbacks.onLevelChange?.(0.5);
          callbacks.onTimeUpdate?.(2500);
          return Promise.resolve();
        }
        stop() {
          return Promise.resolve({
            blob: new Blob(["dummy audio"], { type: "audio/webm" }),
            mimeType: "audio/webm",
            durationMs: 2500,
          });
        }
        cancel() {}
      }
      jest.spyOn(recorderModule, "VoiceRecorder").mockImplementation(() => new MockActiveRecorder() as any);

      render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <VoiceInput onInsertTranscript={jest.fn()} />
        </NextIntlClientProvider>
      );

      const micBtn = screen.getByTestId("voice-record-btn");
      await act(async () => {
        fireEvent.click(micBtn);
      });

      // Indicator appears
      expect(screen.getByTestId("voice-recording-indicator")).toBeInTheDocument();
      expect(screen.getByTestId("voice-duration")).toHaveTextContent("0:02");
      expect(screen.getByTestId("voice-level-meter")).toBeInTheDocument();
      expect(screen.getByTestId("voice-stop-btn")).toBeInTheDocument();
    });
  });

  describe("4. Stop Button -> Transcribes & Inserts into Textarea", () => {
    it("stops recording, transcribes, and inserts transcript at cursor position", async () => {
      jest.spyOn(recorderModule, "isVoiceSupported").mockReturnValue(true);
      jest.spyOn(recorderModule, "uploadVoiceTranscription").mockResolvedValue({
        text: "Transcribed speech text",
        durationMs: 3000,
        credits: 1,
      });

      class MockSuccessRecorder {
        start(callbacks: any) {
          callbacks.onTimeUpdate?.(3000);
          return Promise.resolve();
        }
        stop() {
          return Promise.resolve({
            blob: new Blob(["sample"], { type: "audio/webm" }),
            mimeType: "audio/webm",
            durationMs: 3000,
          });
        }
        cancel() {}
      }
      jest.spyOn(recorderModule, "VoiceRecorder").mockImplementation(() => new MockSuccessRecorder() as any);

      render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <QueryProvider client={queryClient}>
            <Composer />
          </QueryProvider>
        </NextIntlClientProvider>
      );

      // Start recording
      const micBtn = screen.getByTestId("voice-record-btn");
      await act(async () => {
        fireEvent.click(micBtn);
      });

      // Stop recording
      const stopBtn = screen.getByTestId("voice-stop-btn");
      await act(async () => {
        fireEvent.click(stopBtn);
      });

      await waitFor(() => {
        const textarea = screen.getByPlaceholderText(
          /What would you like to explore, draft, or build today/i
        ) as HTMLTextAreaElement;
        expect(textarea.value).toContain("Transcribed speech text");
      });
    });
  });

  describe("5. Send while recording -> Stops, Transcribes & Submits Prompt", () => {
    it("enables Send button while recording and submits the transcript as the prompt", async () => {
      jest.spyOn(recorderModule, "isVoiceSupported").mockReturnValue(true);
      jest.spyOn(recorderModule, "uploadVoiceTranscription").mockResolvedValue({
        text: "Spoken command sent immediately",
        durationMs: 4000,
        credits: 1,
      });

      class MockSendRecorder {
        start(callbacks: any) {
          callbacks.onTimeUpdate?.(4000);
          return Promise.resolve();
        }
        stop() {
          return Promise.resolve({
            blob: new Blob(["sample"], { type: "audio/webm" }),
            mimeType: "audio/webm",
            durationMs: 4000,
          });
        }
        cancel() {}
      }
      jest.spyOn(recorderModule, "VoiceRecorder").mockImplementation(() => new MockSendRecorder() as any);

      render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <QueryProvider client={queryClient}>
            <Composer />
          </QueryProvider>
        </NextIntlClientProvider>
      );

      // Start recording with empty textarea
      const micBtn = screen.getByTestId("voice-record-btn");
      await act(async () => {
        fireEvent.click(micBtn);
      });

      // Send button must be ENABLED while recording even if textarea is empty!
      const sendBtn = screen.getByRole("button", { name: "Send" });
      expect(sendBtn).not.toBeDisabled();

      // Click Send while recording
      await act(async () => {
        fireEvent.click(sendBtn);
      });

      // Upload should have been called
      await waitFor(() => {
        expect(recorderModule.uploadVoiceTranscription).toHaveBeenCalled();
      });
    });
  });

  describe("6. Error Recovery & Retry", () => {
    it("keeps recording in memory on transcription failure and offers Retry button", async () => {
      jest.spyOn(recorderModule, "isVoiceSupported").mockReturnValue(true);
      const uploadMock = jest
        .spyOn(recorderModule, "uploadVoiceTranscription")
        .mockRejectedValueOnce(new Error("Network failed"))
        .mockResolvedValueOnce({
          text: "Recovered transcription text",
          durationMs: 2000,
          credits: 1,
        });

      class MockRetryRecorder {
        start(callbacks: any) { return Promise.resolve(); }
        stop() {
          return Promise.resolve({
            blob: new Blob(["audio-retry"], { type: "audio/webm" }),
            mimeType: "audio/webm",
            durationMs: 2000,
          });
        }
        cancel() {}
      }
      jest.spyOn(recorderModule, "VoiceRecorder").mockImplementation(() => new MockRetryRecorder() as any);

      const onInsert = jest.fn();
      render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <VoiceInput onInsertTranscript={onInsert} />
        </NextIntlClientProvider>
      );

      // Start and Stop
      await act(async () => {
        fireEvent.click(screen.getByTestId("voice-record-btn"));
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId("voice-stop-btn"));
      });

      // Retry button is shown
      const retryBtn = await screen.findByTestId("voice-retry-btn");
      expect(retryBtn).toBeInTheDocument();

      // Click Retry
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      await waitFor(() => {
        expect(onInsert).toHaveBeenCalledWith("Recovered transcription text");
      });
    });
  });

  describe("7. Escape key cancels recording", () => {
    it("cancels recording and cleans up when Escape key is pressed", async () => {
      jest.spyOn(recorderModule, "isVoiceSupported").mockReturnValue(true);

      const cancelMock = jest.fn();
      class MockCancelRecorder {
        start() { return Promise.resolve(); }
        stop() { return Promise.resolve({ blob: new Blob([]), mimeType: "audio/webm", durationMs: 0 }); }
        cancel() { cancelMock(); }
      }
      jest.spyOn(recorderModule, "VoiceRecorder").mockImplementation(() => new MockCancelRecorder() as any);

      render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <VoiceInput onInsertTranscript={jest.fn()} />
        </NextIntlClientProvider>
      );

      // Start recording
      await act(async () => {
        fireEvent.click(screen.getByTestId("voice-record-btn"));
      });
      expect(screen.getByTestId("voice-recording-indicator")).toBeInTheDocument();

      // Press Escape
      act(() => {
        fireEvent.keyDown(window, { key: "Escape" });
      });

      expect(cancelMock).toHaveBeenCalled();
      expect(screen.queryByTestId("voice-recording-indicator")).not.toBeInTheDocument();
      expect(screen.getByTestId("voice-record-btn")).toBeInTheDocument();
    });
  });

  describe("8. Review fixes — server errors", () => {
    class MockQuickRecorder {
      start() { return Promise.resolve(); }
      stop() {
        return Promise.resolve({
          blob: new Blob(["a"], { type: "audio/webm" }),
          mimeType: "audio/webm",
          durationMs: 1000,
        });
      }
      cancel() {}
    }

    async function recordAndStop() {
      await act(async () => {
        fireEvent.click(screen.getByTestId("voice-record-btn"));
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId("voice-stop-btn"));
      });
    }

    it("an out-of-credits 402 says so (not the daily limit) and leaves no Retry", async () => {
      jest.spyOn(recorderModule, "isVoiceSupported").mockReturnValue(true);
      jest.spyOn(recorderModule, "VoiceRecorder").mockImplementation(() => new MockQuickRecorder() as any);
      jest
        .spyOn(recorderModule, "uploadVoiceTranscription")
        .mockRejectedValueOnce(Object.assign(new Error("x"), { status: 402, code: "insufficient_credits" }));

      render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <VoiceInput onInsertTranscript={jest.fn()} />
        </NextIntlClientProvider>
      );
      await recordAndStop();

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(enMessages.Voice.outOfCredits);
      });
      expect(toast.error).not.toHaveBeenCalledWith(enMessages.Voice.dailyLimit);
      expect(screen.queryByTestId("voice-retry-btn")).not.toBeInTheDocument();
      expect(screen.getByTestId("voice-record-btn")).not.toHaveAttribute("aria-disabled", "true");
    });

    it("after the daily limit is reached the mic is gated", async () => {
      jest.spyOn(recorderModule, "isVoiceSupported").mockReturnValue(true);
      jest.spyOn(recorderModule, "VoiceRecorder").mockImplementation(() => new MockQuickRecorder() as any);
      jest
        .spyOn(recorderModule, "uploadVoiceTranscription")
        .mockRejectedValueOnce(Object.assign(new Error("x"), { status: 402, code: "daily_voice_limit" }));

      render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <VoiceInput onInsertTranscript={jest.fn()} />
        </NextIntlClientProvider>
      );
      await recordAndStop();

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(enMessages.Voice.dailyLimit);
      });
      expect(screen.getByTestId("voice-record-btn")).toHaveAttribute("aria-disabled", "true");
    });

    it("a failed upload can be discarded, bringing the mic back", async () => {
      jest.spyOn(recorderModule, "isVoiceSupported").mockReturnValue(true);
      jest.spyOn(recorderModule, "VoiceRecorder").mockImplementation(() => new MockQuickRecorder() as any);
      jest
        .spyOn(recorderModule, "uploadVoiceTranscription")
        .mockRejectedValueOnce(new Error("Network failed"));

      render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <VoiceInput onInsertTranscript={jest.fn()} />
        </NextIntlClientProvider>
      );
      await recordAndStop();

      fireEvent.click(await screen.findByTestId("voice-discard-btn"));
      expect(screen.queryByTestId("voice-retry-btn")).not.toBeInTheDocument();
      expect(screen.getByTestId("voice-record-btn")).toBeInTheDocument();
    });
  });
});
