import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ResponseCard, type ResponseItemData } from "@/components/response/response-card";
import { ResponseList } from "@/components/response/response-list";
import { ThinkingPanel } from "@/components/response/thinking-panel";
import { EditResponse } from "@/components/response/edit-response";
import { useGenerationStore } from "@/lib/stores/generation";
import QueryProvider, { createAppQueryClient } from "@/components/providers/query-provider";
import enMessages from "../messages/en.json";
import type { Actor } from "@/server/auth/session";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => "/workspaces/ws-123",
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

describe("Step 3.7 — Conversation UI (Response cards, versions, thinking, edit)", () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
    window.HTMLElement.prototype.scrollTo = jest.fn();
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
    useGenerationStore.getState().clearAllStreams();

    global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/versions") && init?.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: { id: "res-1", activeVersionId: "ver-1", response: "Version 1 raw output" },
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            activeVersionId: "ver-2",
            versions: [
              {
                id: "ver-1",
                responseId: "res-1",
                number: 1,
                content: "Version 1 raw output",
                originalContent: "Version 1 raw output",
                status: "COMPLETED",
                createdAt: new Date().toISOString(),
              },
              {
                id: "ver-2",
                responseId: "res-1",
                number: 2,
                content: "Version 2 refined output",
                originalContent: "Version 2 original AI output",
                status: "COMPLETED",
                createdAt: new Date().toISOString(),
                latestEditContent: "Version 2 human edited text",
                hasEdits: true,
                edited: true,
              },
            ],
          },
        }),
      });
    });
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

  const sampleResponse: ResponseItemData = {
    id: "res-1",
    workspaceId: "ws-123",
    prompt: "Explain how photosynthesis works in plants",
    kind: "TEXT",
    content: "Version 2 human edited text",
    response: "Version 2 human edited text",
    versionCount: 2,
    activeVersionId: "ver-2",
    createdAt: new Date().toISOString(),
    activeVersion: {
      id: "ver-2",
      number: 2,
      content: "Version 2 human edited text",
      originalContent: "Version 2 original AI output",
      thoughtSummary: "Identified chlorophyll absorption spectrum and Calvin cycle.",
      modelKey: "text-economy",
      hasEdits: true,
      edited: true,
      latestEditContent: "Version 2 human edited text",
    },
  };

  describe("ThinkingPanel Component", () => {
    it("renders live stage badge and pulsing indicator while streaming", () => {
      render(
        <ThinkingPanel
          stage="thinking"
          thoughtSummary="Connecting reasoning nodes..."
          isStreaming={true}
        />
      );

      expect(screen.getByText("Connecting reasoning nodes...")).toBeInTheDocument();
      expect(screen.getByText("thinking", { selector: "span.font-medium" })).toBeInTheDocument();
    });

    it("collapses to Thought for Xs when duration is passed, and toggles on click", () => {
      render(
        <ThinkingPanel
          thoughtSummary="Step-by-step reasoning summary"
          isStreaming={false}
          durationSeconds={12}
        />
      );

      // Collapsed pill label
      expect(screen.getByText(/Thought for 12s/i)).toBeInTheDocument();

      // Click to open
      const toggleBtn = screen.getByRole("button", { name: /Thought for 12s/i });
      fireEvent.click(toggleBtn);

      expect(screen.getByText("Step-by-step reasoning summary")).toBeInTheDocument();
    });
  });

  describe("EditResponse Component", () => {
    it("displays editor, preview tab, helper text, and triggers onSave", async () => {
      const onSave = jest.fn();
      const onCancel = jest.fn();

      render(
        <EditResponse
          initialContent="Initial unedited text"
          onSave={onSave}
          onCancel={onCancel}
        />
      );

      // Helper text
      expect(
        screen.getAllByText(/Your edit is saved separately; the AI original is kept/i).length
      ).toBeGreaterThan(0);

      // Textarea
      let textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(textarea.value).toBe("Initial unedited text");

      // Switch to preview tab
      const previewBtn = screen.getByRole("button", { name: /Preview/i });
      fireEvent.click(previewBtn);
      expect(screen.getByText("Initial unedited text")).toBeInTheDocument();

      // Switch back and edit
      const editBtn = screen.getByRole("button", { name: /Editor/i });
      fireEvent.click(editBtn);

      textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Updated custom edited text" } });

      const saveBtn = screen.getByRole("button", { name: /Save as edit/i });
      expect(saveBtn).not.toBeDisabled();
      fireEvent.click(saveBtn);

      expect(onSave).toHaveBeenCalledWith("Updated custom edited text");
    });
  });

  describe("ResponseCard Component", () => {
    it("renders version switcher when versionCount > 1 and navigates via keyboard", async () => {
      const client = createAppQueryClient();

      render(
        <QueryProvider client={client}>
          <ResponseCard
            response={sampleResponse}
            workspaceId="ws-123"
            userId={mockActor.userId}
          />
        </QueryProvider>
      );

      const versionGroup = screen.getByRole("group", { name: /Version 2 of 2/i });
      expect(versionGroup).toBeInTheDocument();

      // Retry ArrowLeft until query resolves and mutation is sent
      await waitFor(() => {
        fireEvent.keyDown(versionGroup, { key: "ArrowLeft" });
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/v1/responses/res-1/versions"),
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ versionId: "ver-1" }),
          })
        );
      });
    });

    it("toggles between Viewing edited and View original", () => {
      const client = createAppQueryClient();

      render(
        <QueryProvider client={client}>
          <ResponseCard
            response={sampleResponse}
            workspaceId="ws-123"
            userId={mockActor.userId}
          />
        </QueryProvider>
      );

      // Initially viewing edited
      expect(screen.getByText("Version 2 human edited text")).toBeInTheDocument();
      expect(screen.getByText(/View original/i)).toBeInTheDocument();

      // Click "View original"
      fireEvent.click(screen.getByText(/View original/i));

      // Now showing original AI output and toggle changed to "Viewing edited"
      expect(screen.getByText("Version 2 original AI output")).toBeInTheDocument();
      expect(screen.getByText(/Viewing edited/i)).toBeInTheDocument();
    });

    it("copies text to clipboard and shows visual feedback", async () => {
      const client = createAppQueryClient();
      Object.assign(navigator, {
        clipboard: {
          writeText: jest.fn().mockResolvedValue(undefined),
        },
      });

      render(
        <QueryProvider client={client}>
          <ResponseCard
            response={sampleResponse}
            workspaceId="ws-123"
            userId={mockActor.userId}
          />
        </QueryProvider>
      );

      const copyBtns = screen.getAllByRole("button", { name: /Copy/i });
      fireEvent.click(copyBtns[0]!);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Version 2 human edited text");
      await waitFor(() => {
        expect(screen.getAllByText(/Copied/i).length).toBeGreaterThan(0);
      });
    });
  });

  describe("ResponseList Component & Lifecycle States", () => {
    it("renders streaming state with soft caret and live thinking", () => {
      act(() => {
        useGenerationStore.getState().startStream("ws-123", {
          prompt: "Stream live token answer",
        });
        useGenerationStore.getState().setProgress("ws-123", "thinking");
        useGenerationStore.getState().appendDelta("ws-123", "Streaming first token...");
      });

      render(
        <ResponseList
          workspaceId="ws-123"
          actor={mockActor}
          responses={[]}
        />
      );

      expect(screen.getByText("Stream live token answer")).toBeInTheDocument();
      expect(screen.getByText(/Streaming first token/i)).toBeInTheDocument();
    });

    it("renders failed state and calls onRetryFailed with a new idempotency key", () => {
      const onRetryFailed = jest.fn();

      act(() => {
        useGenerationStore.getState().startStream("ws-123", {
          prompt: "Failing query",
        });
        useGenerationStore.getState().failStream("ws-123", "Internal Gemini rate limit");
      });

      render(
        <ResponseList
          workspaceId="ws-123"
          actor={mockActor}
          responses={[]}
          onRetryFailed={onRetryFailed}
        />
      );

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Internal Gemini rate limit")).toBeInTheDocument();

      const retryBtn = screen.getByRole("button", { name: /Try again/i });
      fireEvent.click(retryBtn);

      expect(onRetryFailed).toHaveBeenCalledWith(
        "Failing query",
        expect.stringMatching(/^[a-zA-Z0-9_-]+$/)
      );
    });

    it("renders insufficient credits 402 upgrade banner", () => {
      act(() => {
        useGenerationStore.getState().startStream("ws-123", {
          prompt: "Costly deep prompt",
        });
        useGenerationStore.getState().failStream("ws-123", "insufficient_credits");
      });

      render(
        <ResponseList
          workspaceId="ws-123"
          actor={mockActor}
          responses={[]}
        />
      );

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/Insufficient credits to generate this response/i)).toBeInTheDocument();
      expect(screen.getByText(/Upgrade plan/i)).toBeInTheDocument();
    });

    it("shows Jump to latest button when user scrolls up > 120px", () => {
      const client = createAppQueryClient();

      const { container } = render(
        <QueryProvider client={client}>
          <ResponseList
            workspaceId="ws-123"
            actor={mockActor}
            responses={[sampleResponse]}
          />
        </QueryProvider>
      );

      const scrollContainer = container.querySelector(".overflow-y-auto") as HTMLDivElement;

      // Mock scroll height / distance
      Object.defineProperty(scrollContainer, "scrollHeight", { value: 1000, configurable: true });
      Object.defineProperty(scrollContainer, "clientHeight", { value: 400, configurable: true });
      Object.defineProperty(scrollContainer, "scrollTop", { value: 200, configurable: true }); // distance = 400 > 120

      fireEvent.scroll(scrollContainer);

      expect(screen.getByText(/Jump to latest/i)).toBeInTheDocument();
    });
  });
});
