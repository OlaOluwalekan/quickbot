/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QuestionQueuePopover } from "@/components/workspace/question-queue-popover";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock api client
const mockApi = jest.fn();
jest.mock("../lib/api/client", () => ({
  api: (...args: any[]) => mockApi(...args),
}));

// Mock ui store
const mockSetRightPanelOpen = jest.fn();
const mockSetRightPanelFocus = jest.fn();
jest.mock("../lib/stores/ui", () => ({
  useUiStore: (selector: any) =>
    selector({
      rightPanelOpen: false,
      setRightPanelOpen: mockSetRightPanelOpen,
      setRightPanelFocus: mockSetRightPanelFocus,
    }),
}));

// Mock sonner toast
jest.mock("next-intl", () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join(",")}` : key,
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("Step 6.5 — QuestionQueuePopover UI", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("1. Hides badge when the question queue is empty", async () => {
    mockApi.mockResolvedValueOnce([]);

    renderWithClient(<QuestionQueuePopover workspaceId="ws-123" />);

    expect(screen.getByTestId("composer-queue-button")).toBeInTheDocument();
    // Empty queue hides the badge
    expect(screen.queryByTestId("composer-queue-badge")).toBeNull();
  });

  it("2. Shows badge with count when queue has items", async () => {
    const mockQuestions = [
      {
        id: "q-1",
        workspaceId: "ws-123",
        responseId: "r-1",
        versionId: "v-1",
        kind: "ASK",
        questionState: "QUEUED",
        anchorExact: "passage text one",
        createdAt: new Date().toISOString(),
        messages: [{ id: "m-1", role: "USER", content: "What is this?", createdAt: new Date().toISOString() }],
      },
      {
        id: "q-2",
        workspaceId: "ws-123",
        responseId: "r-1",
        versionId: "v-1",
        kind: "ASK",
        questionState: "QUEUED",
        anchorExact: "passage text two",
        createdAt: new Date().toISOString(),
        messages: [{ id: "m-2", role: "USER", content: "How does this work?", createdAt: new Date().toISOString() }],
      },
    ];

    mockApi.mockResolvedValueOnce(mockQuestions);

    renderWithClient(<QuestionQueuePopover workspaceId="ws-123" />);

    await waitFor(() => {
      const badge = screen.getByTestId("composer-queue-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("2");
    });
  });

  it("3. Opens popover and displays list of queued questions with Ask all button and credit estimate", async () => {
    const mockQuestions = [
      {
        id: "q-1",
        workspaceId: "ws-123",
        responseId: "r-1",
        versionId: "v-1",
        kind: "ASK",
        questionState: "QUEUED",
        anchorExact: "passage snippet for testing",
        createdAt: new Date().toISOString(),
        messages: [{ id: "m-1", role: "USER", content: "Is this tested?", createdAt: new Date().toISOString() }],
      },
      // F2.5: a question asked inside an Ask answer shows its level.
      {
        id: "q-2",
        workspaceId: "ws-123",
        responseId: null,
        versionId: null,
        targetType: "ANNOTATION_MESSAGE",
        depth: 1,
        kind: "ASK",
        questionState: "QUEUED",
        anchorExact: "nested passage",
        createdAt: new Date().toISOString(),
        messages: [{ id: "m-2", role: "USER", content: "A nested one?", createdAt: new Date().toISOString() }],
      },
    ];

    mockApi.mockResolvedValue(mockQuestions);

    renderWithClient(<QuestionQueuePopover workspaceId="ws-123" />);

    await waitFor(() => {
      expect(screen.getByTestId("composer-queue-badge")).toHaveTextContent("2");
    });

    // Click button to open popover
    fireEvent.click(screen.getByTestId("composer-queue-button"));

    await waitFor(() => {
      expect(screen.getByTestId("composer-queue-popover")).toBeInTheDocument();
      expect(screen.getByText("passage snippet for testing", { exact: false })).toBeInTheDocument();
      expect(screen.getByText("Is this tested?")).toBeInTheDocument();
      expect(screen.getByTestId("composer-queue-ask-all")).toBeInTheDocument();
      expect(screen.getByText("Ask all (2)")).toBeInTheDocument();
      // Only the nested question carries a level label.
      expect(screen.getAllByText(/^queueLevel/)).toHaveLength(1);
      expect(screen.getByText("queueLevel:2")).toBeInTheDocument();
      expect(screen.getByText(/credits/i)).toBeInTheDocument();
    });
  });

  it("4. Allows removing a question from the queue via Remove button", async () => {
    const mockQuestions = [
      {
        id: "q-to-remove",
        workspaceId: "ws-123",
        responseId: "r-1",
        versionId: "v-1",
        kind: "ASK",
        questionState: "QUEUED",
        anchorExact: "remove me",
        createdAt: new Date().toISOString(),
        messages: [{ id: "m-1", role: "USER", content: "Remove this question", createdAt: new Date().toISOString() }],
      },
    ];

    mockApi.mockResolvedValue(mockQuestions);

    renderWithClient(<QuestionQueuePopover workspaceId="ws-123" />);

    await waitFor(() => {
      expect(screen.getByTestId("composer-queue-badge")).toHaveTextContent("1");
    });

    fireEvent.click(screen.getByTestId("composer-queue-button"));

    await waitFor(() => {
      expect(screen.getByLabelText("Remove question")).toBeInTheDocument();
    });

    // Click remove
    mockApi.mockResolvedValueOnce({ id: "q-to-remove", questionState: "CANCELLED" });
    fireEvent.click(screen.getByLabelText("Remove question"));

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith("/api/v1/annotations/q-to-remove", {
        method: "PATCH",
        json: { questionState: "CANCELLED" },
      });
    });
  });
});
