/**
 * @jest-environment jsdom
 */

import * as React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import enMessages from "../messages/en.json";
import { DocumentReview } from "@/components/response/document-review-popover";
import { DocumentCard } from "@/components/response/document-card";
import { QuickFixBlock } from "@/components/annotations/quick-fix";
import { ThreadColumn } from "@/components/threads/thread-column";
import { BatchColumn } from "@/components/threads/batch-column";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDocumentDraftsStore } from "@/lib/stores/document-drafts";
import { useDocumentReviewStore } from "@/lib/stores/document-review";
import { useQuestionBatchStore } from "@/lib/stores/question-batch";
import { useThreadStackStore } from "@/lib/stores/thread-stack";
import {
  parseThreadParam,
  serializeThreadParam,
} from "@/lib/annotations/thread-stack";
import type { AnnotationItem } from "@/components/annotations/types";
import type { DocumentReviewHandlers } from "@/lib/api/document-review";

const mockStreamDocumentReview = jest.fn();
jest.mock("../lib/api/document-review", () => ({
  streamDocumentReview: (...args: unknown[]) => mockStreamDocumentReview(...args),
}));

const mockApi = jest.fn();
jest.mock("../lib/api/client", () => {
  const actual = jest.requireActual("../lib/api/client");
  return {
    ...actual,
    api: (...args: unknown[]) => mockApi(...args),
  };
});

// The card's annotations come from the layer inside AnswerBody: the mock
// hands over whatever the test put in `mockAnnotations`.
let mockAnnotations: AnnotationItem[] = [];
jest.mock("../components/response/answer-body", () => ({
  AnswerBody: function MockAnswerBody({
    content,
    children,
    unsaved,
    onAnnotationsChange,
  }: {
    content: string;
    children?: React.ReactNode;
    unsaved?: boolean;
    onAnnotationsChange?: (items: AnnotationItem[]) => void;
  }) {
    const React = jest.requireActual("react") as typeof import("react");
    React.useEffect(() => {
      onAnnotationsChange?.(mockAnnotations);
    }, [onAnnotationsChange]);
    return (
      <div data-testid="mock-answer-body" data-unsaved={unsaved ? "true" : "false"}>
        <div>{content}</div>
        {children}
      </div>
    );
  },
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
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{ui}</TooltipProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}

const SAVED = "We use JavScript for apps. Teh end.";

const typoFix: AnnotationItem = {
  id: "annot-1",
  workspaceId: "ws-1",
  kind: "COMMENT",
  authorType: "AI",
  visibility: "WORKSPACE",
  anchorExact: "JavScript",
  createdById: "user-1",
  createdAt: new Date().toISOString(),
  suggestion: {
    exact: "JavScript",
    prefix: "We use ",
    suffix: " for apps.",
    replacement: "JavaScript",
    category: "spelling",
    severity: "low",
  },
  suggestionState: "PENDING",
  messages: [],
} as unknown as AnnotationItem;

const secondFix: AnnotationItem = {
  ...typoFix,
  id: "annot-2",
  anchorExact: "Teh",
  suggestion: {
    exact: "Teh",
    prefix: "apps. ",
    suffix: " end.",
    replacement: "The",
    category: "spelling",
    severity: "medium",
  },
} as unknown as AnnotationItem;

const ctx = {
  versionId: "ver-1",
  responseId: "resp-1",
  savedContent: SAVED,
  baseRevision: null,
  canEdit: true,
};

describe("Step F3.3 UI — review and quick fixes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.mockReset();
    mockApi.mockResolvedValue({});
    mockAnnotations = [];
    window.sessionStorage.clear();
    useDocumentDraftsStore.setState({ drafts: {} });
    useDocumentReviewStore.setState({ runs: {} });
    useQuestionBatchStore.setState({ batches: {} });
    useThreadStackStore.setState({ stack: [], quotes: {} });
  });

  describe("Ask Klecx to review", () => {
    it("shows the server's estimate, starts the review and reloads the highlights", async () => {
      mockApi.mockResolvedValue({ estimatedCredits: 3, sections: 1 });
      const changed = jest.fn();
      window.addEventListener("annotation-changed", changed);

      let handlers: DocumentReviewHandlers = {};
      let release: () => void = () => {};
      mockStreamDocumentReview.mockImplementation(
        (_versionId: string, _input: unknown, h: DocumentReviewHandlers) => {
          handlers = h;
          return new Promise<void>((resolve) => {
            release = resolve;
          });
        }
      );

      renderWithProviders(
        <DocumentReview versionId="ver-1" responseId="resp-1" hasMembers />
      );

      fireEvent.click(screen.getByTestId("ask-klecx-review-trigger"));
      expect(await screen.findByTestId("review-estimate")).toHaveTextContent(
        "Up to 3 credits"
      );
      expect(mockApi).toHaveBeenCalledWith("/api/v1/response-versions/ver-1/review");

      fireEvent.click(screen.getByTestId("preset-consistency"));
      fireEvent.click(screen.getByTestId("start-review-btn"));

      await waitFor(() => expect(mockStreamDocumentReview).toHaveBeenCalledTimes(1));
      const [versionId, input] = mockStreamDocumentReview.mock.calls[0] as [
        string,
        { preset: string; visibility: string; idempotencyKey: string },
      ];
      expect(versionId).toBe("ver-1");
      expect(input.preset).toBe("consistency");
      // Other people can open the workspace: comments are shared by default.
      expect(input.visibility).toBe("WORKSPACE");
      expect(input.idempotencyKey.length).toBeGreaterThan(8);

      // While it runs: the button is busy, the card can show the progress.
      expect(useDocumentReviewStore.getState().runs["ver-1"]).toBeDefined();
      act(() => handlers.onProgress?.({ section: 2, totalSections: 5 }));
      expect(useDocumentReviewStore.getState().runs["ver-1"]).toMatchObject({
        section: 2,
        totalSections: 5,
      });

      act(() => {
        handlers.onSummary?.({ total: 1, fixes: 1, byCategory: { spelling: 1 } });
        release();
      });
      // The highlights of this response reload: the marks appear in the text.
      expect(changed).toHaveBeenCalled();
      const event = changed.mock.calls.at(-1)?.[0] as CustomEvent;
      expect(event.detail).toEqual({ responseId: "resp-1" });
      expect(useDocumentReviewStore.getState().runs["ver-1"]).toBeUndefined();

      window.removeEventListener("annotation-changed", changed);
    });

    it("is private by default in a workspace of one, and needs an instruction for a custom review", async () => {
      renderWithProviders(<DocumentReview versionId="ver-1" responseId="resp-1" />);
      fireEvent.click(screen.getByTestId("ask-klecx-review-trigger"));

      expect(screen.getByTestId("visibility-private-btn")).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      fireEvent.click(screen.getByTestId("preset-custom"));
      expect(screen.getByTestId("start-review-btn")).toBeDisabled();
      fireEvent.change(screen.getByTestId("review-instruction-input"), {
        target: { value: "Check the dates" },
      });
      expect(screen.getByTestId("start-review-btn")).not.toBeDisabled();
    });

    it("can't be started without the Ask capability", () => {
      renderWithProviders(
        <DocumentReview versionId="ver-1" responseId="resp-1" canAsk={false} />
      );
      fireEvent.click(screen.getByTestId("ask-klecx-review-trigger"));
      const start = screen.getByTestId("start-review-btn");
      expect(start).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(start);
      expect(mockStreamDocumentReview).not.toHaveBeenCalled();
    });

    it("opens as a dialog from a response's menu", () => {
      renderWithProviders(
        <DocumentReview mode="dialog" open versionId="ver-1" responseId="resp-1" />
      );
      expect(screen.getByTestId("review-dialog-content")).toBeInTheDocument();
      expect(screen.getByTestId("start-review-btn")).toBeInTheDocument();
    });
  });

  describe("one change at a time (QuickFixBlock)", () => {
    it("shows what changes and puts an accepted fix into the draft", () => {
      const onDone = jest.fn();
      renderWithProviders(<QuickFixBlock annotation={typoFix} ctx={ctx} onDone={onDone} />);

      expect(screen.getByTestId("quick-fix-old")).toHaveTextContent("JavScript");
      expect(screen.getByTestId("quick-fix-new")).toHaveTextContent("JavaScript");

      fireEvent.click(screen.getByTestId("apply-fix-btn"));

      const draft = useDocumentDraftsStore.getState().drafts["ver-1"];
      expect(draft?.content).toBe("We use JavaScript for apps. Teh end.");
      expect(draft?.baseContent).toBe(SAVED);
      expect(draft?.appliedSuggestionIds).toEqual(["annot-1"]);
      expect(onDone).toHaveBeenCalled();
      // Nothing was sent: the change is saved with the document.
      expect(mockApi).not.toHaveBeenCalled();
      expect(screen.getByTestId("fix-applied-badge")).toBeInTheDocument();
    });

    it("dismisses a fix on the server and reloads the highlights", async () => {
      const changed = jest.fn();
      window.addEventListener("annotation-changed", changed);
      renderWithProviders(<QuickFixBlock annotation={typoFix} ctx={ctx} />);

      fireEvent.click(screen.getByTestId("dismiss-fix-btn"));

      await waitFor(() =>
        expect(mockApi).toHaveBeenCalledWith("/api/v1/annotations/annot-1", {
          method: "PATCH",
          json: { suggestionState: "REJECTED" },
        })
      );
      await waitFor(() => expect(changed).toHaveBeenCalled());
      expect(useDocumentDraftsStore.getState().drafts["ver-1"]).toBeUndefined();
      window.removeEventListener("annotation-changed", changed);
    });

    it("can't be accepted without the right to edit", () => {
      renderWithProviders(
        <QuickFixBlock annotation={typoFix} ctx={{ ...ctx, canEdit: false }} />
      );
      const accept = screen.getByTestId("apply-fix-btn");
      expect(accept).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(accept);
      expect(useDocumentDraftsStore.getState().drafts["ver-1"]).toBeUndefined();
    });

    it("says so when the passage has changed, and offers no Accept", () => {
      renderWithProviders(
        <QuickFixBlock
          annotation={typoFix}
          ctx={{ ...ctx, savedContent: "We use TypeScript for apps." }}
        />
      );
      expect(screen.getByTestId("fix-stale-badge")).toBeInTheDocument();
      expect(screen.queryByTestId("apply-fix-btn")).not.toBeInTheDocument();
      expect(screen.getByTestId("dismiss-fix-btn")).toBeInTheDocument();
    });

    it("a comment without a replacement can only be dismissed", async () => {
      const remark = {
        ...typoFix,
        suggestion: { category: "clarity", severity: "low" },
        suggestionState: null,
      } as unknown as AnnotationItem;
      renderWithProviders(<QuickFixBlock annotation={remark} ctx={ctx} />);
      expect(screen.queryByTestId("apply-fix-btn")).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId("dismiss-fix-btn"));
      await waitFor(() =>
        expect(mockApi).toHaveBeenCalledWith("/api/v1/annotations/annot-1", {
          method: "PATCH",
          json: { resolved: true },
        })
      );
    });
  });

  describe("document card", () => {
    const response = {
      id: "resp-1",
      kind: "DOCUMENT",
      prompt: "notes.docx",
      response: SAVED,
      createdAt: new Date().toISOString(),
      activeVersionId: "ver-1",
      activeVersion: { id: "ver-1", number: 1, content: SAVED },
      uploadedAttachment: {
        id: "att-1",
        originalName: "notes.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes: 2048,
      },
    };

    const renderCard = (props: Partial<React.ComponentProps<typeof DocumentCard>> = {}) =>
      renderWithProviders(
        <DocumentCard
          response={response as never}
          workspaceId="ws-1"
          userId="user-1"
          {...props}
        />
      );

    it("'Accept all' applies every open fix to the draft, and the Save bar appears", async () => {
      mockAnnotations = [typoFix, secondFix];
      renderCard();

      const bar = await screen.findByTestId("review-summary-bar");
      expect(bar).toHaveTextContent("2 suggested fixes are waiting");
      fireEvent.click(screen.getByTestId("accept-all-fixes-btn"));

      const draft = useDocumentDraftsStore.getState().drafts["ver-1"];
      expect(draft?.content).toBe("We use JavaScript for apps. The end.");
      expect(draft?.appliedSuggestionIds).toEqual(["annot-1", "annot-2"]);

      // Nothing left to accept; the changes wait in the Save bar.
      await waitFor(() =>
        expect(screen.queryByTestId("review-summary-bar")).not.toBeInTheDocument()
      );
      expect(screen.getByTestId("document-draft-bar")).toBeInTheDocument();
      // Unsaved text can't be commented on yet (the toolbar reads this flag).
      expect(screen.getByTestId("mock-answer-body")).toHaveAttribute("data-unsaved", "true");
    });

    it("doesn't count fixes that are decided or no longer apply", async () => {
      mockAnnotations = [
        { ...typoFix, suggestionState: "REJECTED", resolvedAt: new Date().toISOString() },
        {
          ...secondFix,
          suggestion: { ...(secondFix.suggestion as object), exact: "gone", replacement: "x" },
        },
      ] as AnnotationItem[];
      renderCard();
      await screen.findByTestId("mock-answer-body");
      expect(screen.queryByTestId("review-summary-bar")).not.toBeInTheDocument();
    });

    it("'Accept all' is gated for someone who can't edit", async () => {
      mockAnnotations = [typoFix];
      renderCard({ canEdit: false });
      const button = await screen.findByTestId("accept-all-fixes-btn");
      expect(button).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(button);
      expect(useDocumentDraftsStore.getState().drafts["ver-1"]).toBeUndefined();
    });

    it("offers the original file and the edited version to download", async () => {
      renderCard();
      fireEvent.keyDown(screen.getByTestId("document-download-btn"), { key: "Enter" });

      expect(await screen.findByTestId("download-original-btn")).toHaveAttribute(
        "href",
        "/api/v1/attachments/att-1/download"
      );
      for (const format of ["docx", "pdf", "md"]) {
        expect(screen.getByTestId(`download-edited-${format}`)).toHaveAttribute(
          "href",
          `/api/v1/responses/resp-1/export?format=${format}&view=edited`
        );
      }
    });

    it("shows the review's progress on the card", async () => {
      renderCard();
      act(() => {
        useDocumentReviewStore.getState().start("ver-1");
        useDocumentReviewStore
          .getState()
          .update("ver-1", { section: 2, totalSections: 5, found: 3 });
      });
      expect(await screen.findByTestId("review-progress-banner")).toHaveTextContent(
        "Reviewing section 2 of 5… · 3 comments so far"
      );
    });
  });

  describe("review comment in its column", () => {
    it("shows Klecx as the author, the chips, the change, and accepts it", async () => {
      const annotation = {
        ...typoFix,
        depth: 0,
        versionId: "ver-1",
        responseId: "resp-1",
        version: { id: "ver-1", content: SAVED, edits: [] },
        messages: [
          {
            id: "msg-ai-1",
            role: "ASSISTANT" as const,
            content: "Did you mean JavaScript?",
            createdAt: new Date().toISOString(),
          },
        ],
      };
      mockApi.mockImplementation((path: string) =>
        Promise.resolve(path.includes("/chain") ? [annotation] : {})
      );

      renderWithProviders(
        <ThreadColumn
          id="annot-1"
          index={1}
          width={400}
          workspaceId="ws-1"
          onBack={jest.fn()}
          onCloseAll={jest.fn()}
          onNavigate={jest.fn()}
        />
      );

      expect(await screen.findByText("Klecx")).toBeInTheDocument();
      expect(screen.getByText("Spelling")).toBeInTheDocument();
      expect(screen.getByText("Low")).toBeInTheDocument();
      expect(screen.getByTestId("quick-fix-new")).toHaveTextContent("JavaScript");

      fireEvent.click(screen.getByTestId("apply-fix-btn"));
      await waitFor(() =>
        expect(screen.getByTestId("fix-applied-badge")).toBeInTheDocument()
      );
      expect(useDocumentDraftsStore.getState().drafts["ver-1"]?.content).toBe(
        "We use JavaScript for apps. Teh end."
      );
    });
  });
});

describe("Question queue — answers in one column", () => {
  beforeEach(() => {
    mockApi.mockReset();
    useQuestionBatchStore.setState({ batches: {} });
    useThreadStackStore.setState({ stack: [], quotes: {} });
  });

  it("keeps a batch column in the URL (b:<id>)", () => {
    const stack = parseThreadParam("b:gen-1.a:annot-9");
    expect(stack).toEqual([
      { kind: "batch", id: "gen-1" },
      { kind: "annotation", id: "annot-9" },
    ]);
    expect(serializeThreadParam(stack)).toBe("b:gen-1.a:annot-9");
  });

  it("shows every question of the run with its answer as they arrive", async () => {
    useQuestionBatchStore.getState().begin("gen-1", [
      { id: "q1", depth: 0, quote: "pool_mode", question: "What does this do?" },
      { id: "q2", depth: 1, quote: "replicas", question: "When do I need them?" },
    ]);

    renderWithProviders(
      <BatchColumn
        id="gen-1"
        index={1}
        width={420}
        workspaceId="ws-1"
        onBack={jest.fn()}
        onCloseAll={jest.fn()}
      />
    );

    // Running: nothing is fetched, both questions wait.
    expect(mockApi).not.toHaveBeenCalled();
    expect(screen.getByText("Answers to 2 questions")).toBeInTheDocument();
    expect(screen.getByTestId("batch-status")).toHaveTextContent(
      "Klecx is answering 2 questions…"
    );
    expect(screen.getByText("What does this do?")).toBeInTheDocument();

    act(() => {
      const store = useQuestionBatchStore.getState();
      store.answer("gen-1", "q1", "It sets the pooling mode.", "msg-1");
      store.fail("gen-1", "q2");
      store.finish("gen-1", "done");
    });

    expect(screen.getByText("It sets the pooling mode.")).toBeInTheDocument();
    expect(screen.getByTestId("batch-status")).toHaveTextContent("1 of 2 answered");

    // Each answer still has its own thread, opened right after this column.
    fireEvent.click(screen.getByTestId("batch-open-q1"));
    expect(useThreadStackStore.getState().stack).toEqual([
      { kind: "annotation", id: "q1" },
    ]);
  });

  it("loads the saved answers when opened from a link", async () => {
    mockApi.mockResolvedValue({
      generationId: "gen-2",
      items: [
        {
          id: "q1",
          depth: 0,
          quote: "pool_mode",
          question: "What does this do?",
          answer: { messageId: "msg-1", content: "Saved answer.", createdAt: "2026-11-13" },
        },
      ],
    });

    renderWithProviders(
      <BatchColumn
        id="gen-2"
        index={1}
        width={420}
        workspaceId="ws-1"
        onBack={jest.fn()}
        onCloseAll={jest.fn()}
      />
    );

    expect(await screen.findByText("Saved answer.")).toBeInTheDocument();
    expect(mockApi).toHaveBeenCalledWith("/api/v1/workspaces/ws-1/questions/batches/gen-2");
  });

  it("says so when the run can't be opened", async () => {
    mockApi.mockRejectedValue(new Error("not found"));
    renderWithProviders(
      <BatchColumn
        id="gen-x"
        index={1}
        width={420}
        workspaceId="ws-1"
        onBack={jest.fn()}
        onCloseAll={jest.fn()}
      />
    );
    expect(
      await screen.findByText("These answers are no longer available.")
    ).toBeInTheDocument();
  });
});
