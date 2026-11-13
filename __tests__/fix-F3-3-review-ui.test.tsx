/**
 * @jest-environment jsdom
 */

import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import enMessages from "../messages/en.json";
import { DocumentReviewPopover } from "@/components/response/document-review-popover";
import { ThreadColumn } from "@/components/threads/thread-column";
import { useDocumentDraftsStore } from "@/lib/stores/document-drafts";

const mockStreamDocumentReview = jest.fn();
jest.mock("../lib/api/document-review", () => {
  const actual = jest.requireActual("../lib/api/document-review");
  return {
    ...actual,
    streamDocumentReview: (...args: unknown[]) => mockStreamDocumentReview(...args),
  };
});

const mockApi = jest.fn();
jest.mock("../lib/api/client", () => {
  const actual = jest.requireActual("../lib/api/client");
  return {
    ...actual,
    api: (...args: unknown[]) => mockApi(...args),
  };
});

jest.mock("../components/response/answer-body", () => ({
  AnswerBody: ({ content, children }: { content: string; children?: React.ReactNode }) => (
    <div data-testid="mock-answer-body">
      <div>{content}</div>
      {children}
    </div>
  ),
}));

jest.mock("../components/workspace/ShareAndPeopleDialog", () => ({
  ShareAndPeopleDialog: () => null,
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

describe("Step F3.3 UI — Document Review & Quick Fixes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.mockReset();
    window.sessionStorage.clear();
    useDocumentDraftsStore.setState({ drafts: {} });
  });

  describe("DocumentReviewPopover", () => {
    it("renders popover trigger, lets user choose presets and start review", async () => {
      const versionId = "ver-f33-ui";
      const workspaceId = "ws-f33";
      const content = "We use JavScript for apps.";

      mockStreamDocumentReview.mockImplementation(async (_verId, _input, handlers) => {
          handlers.onProgress?.({
            stage: "reviewing",
            section: 1,
            totalSections: 2,
            message: "Reviewing section 1 of 2…",
          });
          handlers.onFinding?.({
            annotationId: "annot-1",
            messageId: "msg-1",
            anchor: { exact: "JavScript", prefix: "We use ", suffix: " for apps." },
            category: "spelling",
            severity: "low",
            comment: "Typo in JavScript",
            suggestion: {
              exact: "JavScript",
              prefix: "We use ",
              suffix: " for apps.",
              replacement: "JavaScript",
              category: "spelling",
              severity: "low",
            },
            suggestionState: "PENDING",
            authorType: "AI",
            visibility: "WORKSPACE",
          });
          handlers.onSummary?.({
            total: 1,
            byCategory: { spelling: 1 },
          });
          handlers.onDone?.({ total: 1 });
        });

      renderWithProviders(
        <DocumentReviewPopover
          versionId={versionId}
          workspaceId={workspaceId}
          activeContent={content}
        />
      );

      // Open popover
      const trigger = screen.getByTestId("ask-klecx-review-trigger");
      fireEvent.click(trigger);

      expect(screen.getByTestId("review-popover-content")).toBeInTheDocument();
      expect(screen.getByTestId("preset-errors")).toBeInTheDocument();
      expect(screen.getByTestId("preset-consistency")).toBeInTheDocument();

      // Click consistency preset
      fireEvent.click(screen.getByTestId("preset-consistency"));

      // Click start review
      const startBtn = screen.getByTestId("start-review-btn");
      fireEvent.click(startBtn);

      await waitFor(() => {
        expect(mockStreamDocumentReview).toHaveBeenCalled();
      });

      // Accept all fixes button should appear in the summary bar
      await waitFor(() => {
        expect(screen.getByTestId("accept-all-fixes-btn")).toBeInTheDocument();
      });

      // Click "Accept all fixes"
      fireEvent.click(screen.getByTestId("accept-all-fixes-btn"));

      // Verify draft store was updated with the fix!
      const draft = useDocumentDraftsStore.getState().drafts[versionId];
      expect(draft).toBeDefined();
      expect(draft?.content).toBe("We use JavaScript for apps.");
      expect(draft?.appliedSuggestionIds).toContain("annot-1");
    });
  });

  describe("ThreadColumn AI review finding with quick fix", () => {
    it("renders AI Klecx avatar, category/severity chips, and handles Replace with and Dismiss", async () => {
      const versionId = "ver-f33-col";
      const annotId = "annot-f33-1";
      const workspaceId = "ws-f33-col";

      const mockAnnotation = {
        id: annotId,
        workspaceId,
        versionId,
        kind: "COMMENT" as const,
        depth: 0,
        authorType: "AI" as const,
        anchorExact: "JavScript",
        visibility: "WORKSPACE" as const,
        createdById: "ai-user",
        version: {
          id: versionId,
          content: "We use JavScript for apps.",
        },
        suggestion: {
          exact: "JavScript",
          prefix: "We use ",
          suffix: " for apps.",
          replacement: "JavaScript",
          category: "spelling",
          severity: "low",
        },
        suggestionState: "PENDING" as const,
        messages: [
          {
            id: "msg-ai-1",
            role: "ASSISTANT" as const,
            content: "Did you mean JavaScript?",
            createdAt: new Date().toISOString(),
          },
        ],
      };

      // Mock chain endpoint
      mockApi.mockImplementation((path: string) => {
        if (path.includes("/chain")) {
          return Promise.resolve([mockAnnotation]);
        }
        if (path.includes(`/annotations/${annotId}`)) {
          return Promise.resolve({ ...mockAnnotation, suggestionState: "REJECTED" });
        }
        return Promise.resolve({});
      });

      // Seed draft
      useDocumentDraftsStore.getState().updateDraftContent({
        versionId,
        baseRevision: null,
        baseContent: "We use JavScript for apps.",
        content: "We use JavScript for apps.",
      });

      renderWithProviders(
        <ThreadColumn
          id={annotId}
          index={1}
          width={400}
          workspaceId={workspaceId}
          onBack={jest.fn()}
          onCloseAll={jest.fn()}
          onNavigate={jest.fn()}
        />
      );

      // Wait for annotation to load
      await waitFor(() => {
        expect(screen.getByText("Klecx")).toBeInTheDocument();
      });

      // Check category and severity chips
      expect(screen.getByText("Spelling")).toBeInTheDocument();
      expect(screen.getByText("Low")).toBeInTheDocument();

      // Check quick fix action button
      const applyBtn = screen.getByTestId("apply-fix-btn");
      expect(applyBtn).toBeInTheDocument();
      expect(applyBtn.textContent).toContain("JavaScript");

      const dismissBtn = screen.getByTestId("dismiss-fix-btn");
      expect(dismissBtn).toBeInTheDocument();

      // Click apply fix
      fireEvent.click(applyBtn);

      await waitFor(() => {
        expect(screen.getByTestId("fix-applied-badge")).toBeInTheDocument();
      });

      // Verify draft store updated
      const updatedDraft = useDocumentDraftsStore.getState().drafts[versionId];
      expect(updatedDraft.content).toBe("We use JavaScript for apps.");
    });

    it("displays stale badge when draft content changed so fix cannot apply", async () => {
      const versionId = "ver-f33-col2";
      const annotId = "annot-f33-2";
      const workspaceId = "ws-f33-col";

      const mockAnnotation = {
        id: annotId,
        workspaceId,
        versionId,
        kind: "COMMENT" as const,
        depth: 0,
        authorType: "AI" as const,
        anchorExact: "JavScript",
        visibility: "WORKSPACE" as const,
        createdById: "ai-user",
        version: {
          id: versionId,
          content: "We use JavScript for apps.",
        },
        suggestion: {
          exact: "JavScript",
          prefix: "We use ",
          suffix: " for apps.",
          replacement: "JavaScript",
          category: "spelling",
          severity: "low",
        },
        suggestionState: "PENDING" as const,
        messages: [
          {
            id: "msg-ai-2",
            role: "ASSISTANT" as const,
            content: "Typo in JavScript",
            createdAt: new Date().toISOString(),
          },
        ],
      };

      mockApi.mockImplementation((path: string) => {
        if (path.includes("/chain")) {
          return Promise.resolve([mockAnnotation]);
        }
        return Promise.resolve({});
      });

      // Draft has completely changed text, so JavScript is gone
      useDocumentDraftsStore.getState().updateDraftContent({
        versionId,
        baseRevision: null,
        baseContent: "We use JavScript for apps.",
        content: "We use Python now.",
      });

      renderWithProviders(
        <ThreadColumn
          id={annotId}
          index={1}
          width={400}
          workspaceId={workspaceId}
          onBack={jest.fn()}
          onCloseAll={jest.fn()}
          onNavigate={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("fix-stale-badge")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("apply-fix-btn")).not.toBeInTheDocument();
    });
  });
});
