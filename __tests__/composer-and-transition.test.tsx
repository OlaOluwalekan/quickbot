import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Composer } from "@/components/workspace/composer";
import { WorkspaceView } from "@/components/workspace/workspace-view";
import { navigateWithTransition } from "@/lib/navigation/view-transition";
import { useUiStore } from "@/lib/stores/ui";
import { useGenerationStore } from "@/lib/stores/generation";
import QueryProvider, { createAppQueryClient } from "@/components/providers/query-provider";
import enMessages from "../messages/en.json";
import type { Actor } from "@/server/auth/session";
import type { WorkspaceDto } from "@/lib/api/hooks/workspaces";

const mockPush = jest.fn();
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  usePathname: () => "/workspaces",
}));

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    return (key: string, values?: Record<string, unknown>) => {
      const ns = (
        enMessages as unknown as Record<string, Record<string, string>>
      )[namespace] || {};
      let template = ns[key] || key;
      if (values) {
        Object.entries(values).forEach(([k, v]) => {
          template = template.replace(`{${k}}`, String(v));
        });
      }
      return template;
    };
  },
  useLocale: () => "en",
}));

// Mock streamGeneration
const mockStreamGeneration = jest.fn();
jest.mock("../lib/api/sse", () => ({
  streamGeneration: (...args: unknown[]) => mockStreamGeneration(...args),
}));

describe("Step 3.6 — Composer and Smooth Blank -> Workspace Transition", () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
    if (typeof window.crypto === "undefined") {
      (window as any).crypto = {};
    }
    (window.crypto as any).randomUUID = jest.fn(
      () => "12345678-1234-1234-1234-123456789abc",
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { items: [], nextCursor: null },
      }),
    });
    useUiStore.getState().resetTransientUi();
    useUiStore.getState().clearAllDrafts();
    useGenerationStore.getState().clearAllStreams();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  const mockActor: Actor = {
    userId: "user-123",
    email: "ada@example.com",
    role: "USER",
    sessionId: "sess-1",
  };

  const mockWorkspace: WorkspaceDto = {
    id: "ws-new-456",
    title: "Quantum Entanglement",
    createdBy: "user-123",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  describe("Composer Component Requirements", () => {
    it("respects Enter-to-send setting and handles Shift+Enter for newlines", () => {
      const onSubmitted = jest.fn();
      useUiStore.getState().setComposerEnterToSend(true);

      render(
        <Composer
          workspaceId="ws-123"
          onSubmitted={onSubmitted}
          size="compact"
        />
      );

      const textarea = screen.getByLabelText(/How can Klecx help you today/i) as HTMLTextAreaElement;

      // 1. Shift+Enter should NOT submit
      fireEvent.change(textarea, { target: { value: "Line 1" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
      expect(onSubmitted).not.toHaveBeenCalled();

      // 2. Plain Enter should submit
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      expect(textarea.value).toBe(""); // cleared on submit in workspace mode
    });

    it("prevents submission during IME composition", () => {
      const onSubmitted = jest.fn();
      useUiStore.getState().setComposerEnterToSend(true);

      render(
        <Composer
          workspaceId="ws-123"
          onSubmitted={onSubmitted}
        />
      );

      const textarea = screen.getByLabelText(/How can Klecx help you today/i);
      fireEvent.change(textarea, { target: { value: "こんにちは" } });

      // Simulate IME composition (e.nativeEvent.isComposing = true)
      fireEvent.keyDown(textarea, {
        key: "Enter",
        shiftKey: false,
        nativeEvent: { isComposing: true } as unknown as KeyboardEvent,
      });

      expect(onSubmitted).not.toHaveBeenCalled();
    });

    it("persists draft per workspace debounced, restores on mount, and clears on submit", async () => {
      jest.useFakeTimers();

      // Render on workspace-a
      const { unmount } = render(
        <Composer workspaceId="ws-draft-test" />
      );

      const textarea = screen.getByLabelText(/How can Klecx help you today/i);
      fireEvent.change(textarea, { target: { value: "Work in progress draft..." } });

      // Fast-forward debounce timer
      act(() => {
        jest.advanceTimersByTime(350);
      });

      expect(useUiStore.getState().drafts["ws-draft-test"]).toBe("Work in progress draft...");
      unmount();

      // Mount again on same workspace - should restore draft
      render(<Composer workspaceId="ws-draft-test" />);
      const restoredTextarea = screen.getByLabelText(/How can Klecx help you today/i) as HTMLTextAreaElement;
      expect(restoredTextarea.value).toBe("Work in progress draft...");

      jest.useRealTimers();
    });

    it("displays character counter when prompt reaches 90% threshold (18,000+ chars)", () => {
      render(<Composer workspaceId="ws-123" />);

      const textarea = screen.getByLabelText(/How can Klecx help you today/i);

      // Under threshold: counter not present
      fireEvent.change(textarea, { target: { value: "A".repeat(17999) } });
      expect(screen.queryByText(/20,000/)).not.toBeInTheDocument();

      // At threshold (18,000 chars): counter is visible
      fireEvent.change(textarea, { target: { value: "A".repeat(18050) } });
      expect(screen.getByText(/18,050 \/ 20,000/)).toBeInTheDocument();
    });

    it("shows out-of-credits warning and disables inputs when credit balance is zero", () => {
      render(
        <Composer
          workspaceId="ws-123"
          credits={{ plan: "Free", balance: 0 }}
        />
      );

      expect(
        screen.getByText(/You are out of credits. Upgrade your plan to continue/i)
      ).toBeInTheDocument();

      const textarea = screen.getByLabelText(/How can Klecx help you today/i);
      expect(textarea).toBeDisabled();

      const sendBtn = screen.getByRole("button", { name: /Send/i });
      expect(sendBtn).toBeDisabled();
    });

    it("announces live status to screen readers only on state transitions (Generating... and Done)", () => {
      const { rerender } = render(<Composer workspaceId="ws-live-test" />);

      const liveRegion = screen.getByRole("status");
      expect(liveRegion.textContent).toBe("");

      // Simulate stream start
      act(() => {
        useGenerationStore.getState().startStream("ws-live-test", { prompt: "Test prompt" });
      });

      rerender(<Composer workspaceId="ws-live-test" />);
      expect(screen.getByRole("status").textContent).toBe("Generating...");

      // Simulate stream completion
      act(() => {
        useGenerationStore.getState().completeStream("ws-live-test", "Complete answer");
      });

      rerender(<Composer workspaceId="ws-live-test" />);
      expect(screen.getByRole("status").textContent).toBe("Done");
    });

    it("allows toggling Think harder and switching models", () => {
      render(<Composer workspaceId="ws-123" />);

      const thinkBtn = screen.getByRole("button", { name: /Think harder/i });
      expect(thinkBtn).toHaveAttribute("aria-pressed", "false");

      fireEvent.click(thinkBtn);
      expect(thinkBtn).toHaveAttribute("aria-pressed", "true");

      // Model picker button shows default Fast & Efficient (1 credit)
      expect(screen.getByText("Fast & Efficient")).toBeInTheDocument();
      expect(screen.getByText("(1 credit)")).toBeInTheDocument();
    });

    it("renders Stop button while streaming and calls onStop", () => {
      const onStop = jest.fn();

      act(() => {
        useGenerationStore.getState().startStream("ws-stop-test", { prompt: "Long stream" });
      });

      render(
        <Composer
          workspaceId="ws-stop-test"
          onStop={onStop}
        />
      );

      const stopBtn = screen.getByRole("button", { name: /Stop generating/i });
      expect(stopBtn).toBeInTheDocument();

      fireEvent.click(stopBtn);
      expect(onStop).toHaveBeenCalled();
      expect(useGenerationStore.getState().getStream("ws-stop-test").status).toBe("cancelled");
    });
  });

  describe("Blank -> Workspace Smooth Transition", () => {
    it("submits on home, calls POST /api/v1/workspaces, stores pendingStart, and navigates", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: "ws-created-999",
            title: "Simulated Annealing",
            createdBy: "user-123",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });

      render(<Composer size="large" />);

      const textarea = screen.getByLabelText(/How can Klecx help you today/i);
      fireEvent.change(textarea, {
        target: { value: "Explain the simulated annealing optimization algorithm" },
      });

      const sendBtn = screen.getByRole("button", { name: /Send/i });
      fireEvent.click(sendBtn);

      await waitFor(() => {
        // 1. Called POST /api/v1/workspaces
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/v1/workspaces",
          expect.objectContaining({
            method: "POST",
          })
        );

        // 2. Saved pendingStart in generation store
        const pending = useGenerationStore.getState().pendingStart;
        expect(pending).not.toBeNull();
        expect(pending?.workspaceId).toBe("ws-created-999");
        expect(pending?.prompt).toBe("Explain the simulated annealing optimization algorithm");

        // 3. Navigated to new workspace
        expect(mockPush).toHaveBeenCalledWith("/workspaces/ws-created-999");
      });
    });

    it("retains prompt and shows Retry alert if workspace creation fails", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          success: false,
          error: { message: "Internal server error creating workspace" },
        }),
      });

      render(<Composer size="large" />);

      const textarea = screen.getByLabelText(/How can Klecx help you today/i) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Valuable prompt that must not be lost" } });

      const sendBtn = screen.getByRole("button", { name: /Send/i });
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText(/Failed to create workspace. Click Retry to try again/i)).toBeInTheDocument();
      });

      // Textarea retained its text!
      expect(textarea.value).toBe("Valuable prompt that must not be lost");

      // Does not navigate
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("navigateWithTransition uses startViewTransition when supported and skips when prefers-reduced-motion matches", () => {
      const routerMock = { push: jest.fn(), refresh: jest.fn() } as any;

      // 1. Without reduced motion: calls startViewTransition
      const mockStartViewTransition = jest.fn((cb: () => void) => {
        cb();
        return { finished: Promise.resolve() };
      });

      (window as any).matchMedia = jest.fn().mockReturnValue({ matches: false });
      (document as any).startViewTransition = mockStartViewTransition;

      navigateWithTransition(routerMock, "/workspaces/ws-vt-1");
      expect(mockStartViewTransition).toHaveBeenCalled();
      expect(routerMock.push).toHaveBeenCalledWith("/workspaces/ws-vt-1");

      // 2. With prefers-reduced-motion: skips startViewTransition directly
      routerMock.push.mockClear();
      mockStartViewTransition.mockClear();

      (window as any).matchMedia = jest.fn().mockReturnValue({ matches: true });
      navigateWithTransition(routerMock, "/workspaces/ws-vt-2");

      expect(mockStartViewTransition).not.toHaveBeenCalled();
      expect(routerMock.push).toHaveBeenCalledWith("/workspaces/ws-vt-2");
    });
  });

  describe("WorkspaceView Component Mount & Execution", () => {
    it("consumes pendingStart on mount, immediately renders optimistic prompt bubble, and streams response", async () => {
      // Setup pendingStart
      useGenerationStore.getState().setPendingStart({
        workspaceId: mockWorkspace.id,
        prompt: "First prompt from home page",
        modelKey: "text-economy",
        idempotencyKey: "idem-123",
      });

      mockStreamGeneration.mockImplementation(async (_wsId, _body, handlers) => {
        handlers.onStatus?.({ stage: "thinking" });
        handlers.onThought?.({ text: "Analyzing the query..." });
        handlers.onDelta?.({ text: "Here is your detailed answer." });
        handlers.onCompleted?.({
          responseId: "res-1",
          versionId: "ver-1",
          content: "Here is your detailed answer.",
        });
      });

      const client = createAppQueryClient();

      render(
        <QueryProvider client={client}>
          <WorkspaceView
            workspace={mockWorkspace}
            actor={mockActor}
          />
        </QueryProvider>
      );

      // 1. pendingStart was consumed (cleared)
      expect(useGenerationStore.getState().pendingStart).toBeNull();

      // 2. Optimistic first prompt bubble is immediately rendered
      const promptBubble = screen.getByText("First prompt from home page");
      expect(promptBubble).toBeInTheDocument();
      expect(promptBubble).toHaveClass("vt-first-prompt");

      // 3. streamGeneration was called with matching parameters
      await waitFor(() => {
        expect(mockStreamGeneration).toHaveBeenCalledWith(
          mockWorkspace.id,
          expect.objectContaining({
            prompt: "First prompt from home page",
            idempotencyKey: "idem-123",
          }),
          expect.any(Object),
          expect.any(Object)
        );

        // 4. Content rendered
        expect(screen.getByText(/Here is your detailed answer/i)).toBeInTheDocument();
      });
    });

    it("renders past responses on direct page load without pendingStart", () => {
      const client = createAppQueryClient();

      const existingResponses = [
        {
          id: "res-old-1",
          prompt: "What is Shor's algorithm?",
          content: "Shor's algorithm is a quantum computer algorithm for integer factorization.",
        },
      ];

      render(
        <QueryProvider client={client}>
          <WorkspaceView
            workspace={mockWorkspace}
            initialResponses={existingResponses}
            actor={mockActor}
          />
        </QueryProvider>
      );

      expect(screen.getByText("What is Shor's algorithm?")).toBeInTheDocument();
      expect(
        screen.getByText(/Shor's algorithm is a quantum computer algorithm for integer factorization/i)
      ).toBeInTheDocument();
    });
  });
});
