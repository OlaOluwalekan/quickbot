/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { SelectionToolbar } from "@/components/annotations/selection-toolbar";
import { api } from "@/lib/api/client";
import { useUiStore } from "@/lib/stores/ui";

jest.mock("../lib/api/client", () => ({
  api: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe("Step 6.3 — Selection popover (Comment · Reply · Add question)", () => {
  let annotRoot: HTMLDivElement;
  let outsideDiv: HTMLDivElement;
  let ignoredDiv: HTMLDivElement;

  beforeEach(() => {
    jest.clearAllMocks();
    useUiStore.setState({ rightPanelOpen: false, rightPanelFocus: null });

    window.matchMedia =
      window.matchMedia ||
      function () {
        return {
          matches: false,
          addListener: function () {},
          removeListener: function () {},
          addEventListener: function () {},
          removeEventListener: function () {},
          dispatchEvent: function () {
            return false;
          },
        };
      };

    if (typeof Range.prototype.getBoundingClientRect !== "function") {
      Range.prototype.getBoundingClientRect = function () {
        return {
          top: 100,
          left: 100,
          bottom: 120,
          right: 200,
          width: 100,
          height: 20,
          x: 100,
          y: 100,
          toJSON: () => ({}),
        } as DOMRect;
      };
    }

    // Response body marked with data-annot-root
    annotRoot = document.createElement("div");
    annotRoot.setAttribute("data-annot-root", "true");
    annotRoot.setAttribute("data-response-id", "resp_123");
    annotRoot.setAttribute("data-version-id", "ver_456");
    annotRoot.setAttribute("data-content-source", "ORIGINAL");
    annotRoot.innerHTML =
      "<p id='p1'>Two-phase commit is an atomic commitment protocol for distributed systems.</p>" +
      "<div data-annot-ignore='true' id='ignored'><button>Copy</button></div>" +
      "<p id='p2'>Raft is designed as an alternative consensus algorithm to Paxos.</p>";
    document.body.appendChild(annotRoot);

    outsideDiv = document.createElement("div");
    outsideDiv.id = "outside";
    outsideDiv.innerHTML = "<p>This is outside response card text.</p>";
    document.body.appendChild(outsideDiv);

    ignoredDiv = annotRoot.querySelector("#ignored") as HTMLDivElement;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  // Helper to simulate text selection on DOM Range
  function mockSelection(container: Node, startOffset: number, endOffset: number) {
    const range = document.createRange();
    range.setStart(container, startOffset);
    range.setEnd(container, endOffset);

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // Trigger selectionchange listener
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
  }

  describe("1. Selection Detection & Scope Filtering", () => {
    it("shows toolbar when valid text (>= 3 chars) is selected inside [data-annot-root]", async () => {
      render(<SelectionToolbar />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      // Select "Two-phase commit" (length 16)
      mockSelection(p1Text, 0, 16);

      await waitFor(() => {
        expect(screen.getByTestId("selection-toolbar")).toBeInTheDocument();
      });

      expect(screen.getByTestId("action-comment")).toBeInTheDocument();
      expect(screen.getByTestId("action-reply")).toBeInTheDocument();
      expect(screen.getByTestId("action-question")).toBeInTheDocument();
      expect(screen.getByRole("toolbar", { name: "Annotation actions" })).toBeInTheDocument();
    });

    it("does NOT show toolbar when selected text is outside [data-annot-root]", async () => {
      render(<SelectionToolbar />);

      const outsideText = outsideDiv.querySelector("p")!.firstChild!;
      mockSelection(outsideText, 0, 15);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });

      expect(screen.queryByTestId("selection-toolbar")).not.toBeInTheDocument();
    });

    it("does NOT show toolbar when selection is inside [data-annot-ignore]", async () => {
      render(<SelectionToolbar />);

      const buttonText = ignoredDiv.querySelector("button")!.firstChild!;
      mockSelection(buttonText, 0, 4);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });

      expect(screen.queryByTestId("selection-toolbar")).not.toBeInTheDocument();
    });

    it("does NOT show toolbar when selection is fewer than 3 characters", async () => {
      render(<SelectionToolbar />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      // Select "Tw" (length 2)
      mockSelection(p1Text, 0, 2);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });

      expect(screen.queryByTestId("selection-toolbar")).not.toBeInTheDocument();
    });

    it("does NOT show toolbar when canAnnotate is false", async () => {
      render(<SelectionToolbar canAnnotate={false} />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      mockSelection(p1Text, 0, 16);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });

      expect(screen.queryByTestId("selection-toolbar")).not.toBeInTheDocument();
    });
  });

  describe("2. Comment Flow (Click & Hotkey Ctrl/Cmd+Alt+M)", () => {
    it("opens inline comment form on clicking Comment and saves comment on submit", async () => {
      (api as jest.Mock).mockResolvedValueOnce({
        id: "annot_c1",
        kind: "COMMENT",
        text: "Important protocol detail",
      });

      const onCommentCreated = jest.fn();
      render(<SelectionToolbar onCommentCreated={onCommentCreated} />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      mockSelection(p1Text, 0, 16);

      await waitFor(() => {
        expect(screen.getByTestId("action-comment")).toBeInTheDocument();
      });

      // Click Comment
      fireEvent.click(screen.getByTestId("action-comment"));

      // Inline form opens
      expect(screen.getByTestId("comment-textarea")).toBeInTheDocument();
      expect(screen.getByTestId("comment-save")).toBeInTheDocument();

      // Enter comment text
      fireEvent.change(screen.getByTestId("comment-textarea"), {
        target: { value: "Important protocol detail" },
      });

      // Click Save
      fireEvent.click(screen.getByTestId("comment-save"));

      await waitFor(() => {
        expect(api).toHaveBeenCalledWith(
          "/api/v1/response-versions/ver_456/annotations",
          expect.objectContaining({
            method: "POST",
            json: expect.objectContaining({
              kind: "COMMENT",
              text: "Important protocol detail",
              contentSource: "ORIGINAL",
              anchor: expect.objectContaining({
                exact: "Two-phase commit",
              }),
            }),
          })
        );
      });

      expect(onCommentCreated).toHaveBeenCalled();
    });

    it("triggers comment mode with hotkey Ctrl+Alt+M and cancels with Escape", async () => {
      render(<SelectionToolbar />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      mockSelection(p1Text, 0, 16);

      await waitFor(() => {
        expect(screen.getByTestId("selection-toolbar")).toBeInTheDocument();
      });

      // Trigger Ctrl+Alt+M
      fireEvent.keyDown(window, { key: "m", ctrlKey: true, altKey: true });

      expect(screen.getByTestId("comment-textarea")).toBeInTheDocument();

      // Press Escape -> returns to idle toolbar mode
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByTestId("comment-textarea")).not.toBeInTheDocument();
      expect(screen.getByTestId("action-comment")).toBeInTheDocument();
    });
  });

  describe("3. Reply Flow (Click & Hotkey Ctrl/Cmd+Alt+R)", () => {
    it("disables Reply button when canGenerate is false", async () => {
      render(<SelectionToolbar canGenerate={false} />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      mockSelection(p1Text, 0, 16);

      await waitFor(() => {
        expect(screen.getByTestId("action-reply")).toBeInTheDocument();
      });

      expect(screen.getByTestId("action-reply")).toBeDisabled();
    });

    it("disables Reply button when isOutOfCredits is true", async () => {
      render(<SelectionToolbar isOutOfCredits={true} />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      mockSelection(p1Text, 0, 16);

      await waitFor(() => {
        expect(screen.getByTestId("action-reply")).toBeInTheDocument();
      });

      expect(screen.getByTestId("action-reply")).toBeDisabled();
    });

    it("opens inline reply form and opens right panel on send", async () => {
      const onReplyTriggered = jest.fn();
      render(<SelectionToolbar onReplyTriggered={onReplyTriggered} />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      mockSelection(p1Text, 0, 16);

      await waitFor(() => {
        expect(screen.getByTestId("action-reply")).toBeInTheDocument();
      });

      // Click Reply
      fireEvent.click(screen.getByTestId("action-reply"));

      expect(screen.getByTestId("reply-input")).toBeInTheDocument();
      expect(screen.getByTestId("reply-send")).toBeInTheDocument();

      // Enter reply prompt
      fireEvent.change(screen.getByTestId("reply-input"), {
        target: { value: "How does 2PC handle coordinator crash?" },
      });

      // Click Send
      fireEvent.click(screen.getByTestId("reply-send"));

      expect(onReplyTriggered).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "How does 2PC handle coordinator crash?",
          responseId: "resp_123",
          versionId: "ver_456",
          anchor: expect.objectContaining({
            exact: "Two-phase commit",
          }),
        })
      );

      // Verify right panel was opened and focused
      const uiState = useUiStore.getState();
      expect(uiState.rightPanelOpen).toBe(true);
      expect(uiState.rightPanelFocus).toEqual(
        expect.objectContaining({
          responseId: "resp_123",
          versionId: "ver_456",
          tab: "replies",
        })
      );
    });
  });

  describe("4. Question Flow (Click, Hotkey, & Add & another)", () => {
    it("submits question and closes toolbar when clicking Add", async () => {
      (api as jest.Mock).mockResolvedValueOnce({
        id: "annot_q1",
        kind: "ASK",
      });

      const onQuestionCreated = jest.fn();
      render(<SelectionToolbar onQuestionCreated={onQuestionCreated} />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      mockSelection(p1Text, 0, 16);

      await waitFor(() => {
        expect(screen.getByTestId("action-question")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("action-question"));
      expect(screen.getByTestId("question-input")).toBeInTheDocument();

      fireEvent.change(screen.getByTestId("question-input"), {
        target: { value: "Why is 2PC a blocking protocol?" },
      });

      fireEvent.click(screen.getByTestId("question-add"));

      await waitFor(() => {
        expect(api).toHaveBeenCalledWith(
          "/api/v1/response-versions/ver_456/annotations",
          expect.objectContaining({
            method: "POST",
            json: expect.objectContaining({
              kind: "ASK",
              text: "Why is 2PC a blocking protocol?",
            }),
          })
        );
      });

      expect(onQuestionCreated).toHaveBeenCalled();
    });

    it("submits question and keeps form open for another when clicking 'Add & another'", async () => {
      (api as jest.Mock).mockResolvedValue({
        id: "annot_q2",
        kind: "ASK",
      });

      render(<SelectionToolbar />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      mockSelection(p1Text, 0, 16);

      await waitFor(() => {
        expect(screen.getByTestId("action-question")).toBeInTheDocument();
      });

      // Open Question form
      fireEvent.click(screen.getByTestId("action-question"));

      // Enter first question
      fireEvent.change(screen.getByTestId("question-input"), {
        target: { value: "Question 1" },
      });

      // Click "Add & another"
      fireEvent.click(screen.getByTestId("question-add-another"));

      await waitFor(() => {
        expect(api).toHaveBeenCalledTimes(1);
      });

      // Popover remains open with cleared input for the next question
      expect(screen.getByTestId("question-input")).toBeInTheDocument();
      expect((screen.getByTestId("question-input") as HTMLInputElement).value).toBe("");
    });
  });

  describe("5. Accessibility & Screen Reader Live Region", () => {
    it("provides polite live region and correct toolbar accessibility attributes", async () => {
      render(<SelectionToolbar />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      mockSelection(p1Text, 0, 16);

      await waitFor(() => {
        expect(screen.getByRole("toolbar")).toBeInTheDocument();
      });

      const toolbar = screen.getByRole("toolbar");
      expect(toolbar).toHaveAttribute("aria-label", "Annotation actions");

      // Verify polite live region exists
      const liveRegion = toolbar.querySelector("[aria-live='polite']");
      expect(liveRegion).toBeInTheDocument();
    });
  });
});
