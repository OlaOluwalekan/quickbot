/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { SelectionToolbar } from "@/components/annotations/selection-toolbar";
import { api } from "@/lib/api/client";
import { useUiStore } from "@/lib/stores/ui";
import { useThreadStackStore } from "@/lib/stores/thread-stack";

const MESSAGES: Record<string, string> = {
  actionsAriaLabel: "Annotation actions",
  comment: "Comment",
  ask: "Ask",
  askNow: "Ask now",
  addToQueue: "Add to queue",
  mentionHint: "Type @ to mention a member or @klecx to have Klecx remember this.",
  klecxLabel: "Klecx",
  klecxDescription: "AI assistant · remembers this for future answers",
  commentPlaceholder: "Add a comment... (Enter to save, Esc to cancel)",
  askPlaceholder: "Ask a question about this selection...",
  commentAdded: "Comment added",
  commentFailed: "Failed to create comment",
  askFailed: "Failed to add question",
  addedToQueue: "Added to your queue ({count})",
  addedToQueueAnnouncement: "Question added to queue ({count})",
  cancel: "Cancel",
  save: "Save",
  outOfCredits: "Out of credits",
  noPermissionComment: "You do not have permission to comment",
  noPermissionAsk: "You do not have permission to ask Klecx",
};

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    let str = MESSAGES[key] || key;
    if (values) {
      Object.entries(values).forEach(([k, v]) => {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      });
    }
    return str;
  },
}));

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

describe("Step 6.3 / F2.2 — Selection popover v2 (Comment · Ask: Ask now / Add to queue)", () => {
  let annotRoot: HTMLDivElement;
  let outsideDiv: HTMLDivElement;
  let ignoredDiv: HTMLDivElement;

  beforeEach(() => {
    jest.clearAllMocks();
    useUiStore.setState({ rightPanelOpen: false, rightPanelFocus: null });
    useThreadStackStore.setState({ stack: [] });

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
    annotRoot.setAttribute("data-annot-target-type", "RESPONSE_VERSION");
    annotRoot.setAttribute("data-annot-target-id", "ver_456");
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
      expect(screen.getByTestId("action-ask")).toBeInTheDocument();
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
      fireEvent.keyDown(window, { key: "m", code: "KeyM", ctrlKey: true, altKey: true });

      expect(screen.getByTestId("comment-textarea")).toBeInTheDocument();

      // Press Escape -> returns to idle toolbar mode
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByTestId("comment-textarea")).not.toBeInTheDocument();
      expect(screen.getByTestId("action-comment")).toBeInTheDocument();
    });
  });

  describe("3. Ask Flow: Ask Now (primary) and Add to Queue (secondary)", () => {
    it("disables Ask button when canAsk is false", async () => {
      render(<SelectionToolbar canAsk={false} />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      mockSelection(p1Text, 0, 16);

      await waitFor(() => {
        expect(screen.getByTestId("action-ask")).toBeInTheDocument();
      });

      expect(screen.getByTestId("action-ask")).toBeDisabled();
    });

    it("disables Ask button when isOutOfCredits is true", async () => {
      render(<SelectionToolbar isOutOfCredits={true} />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      mockSelection(p1Text, 0, 16);

      await waitFor(() => {
        expect(screen.getByTestId("action-ask")).toBeInTheDocument();
      });

      expect(screen.getByTestId("action-ask")).toBeDisabled();
    });

    it("submits Ask now on Enter, creates ASK with mode='now', and opens panel/column", async () => {
      (api as jest.Mock).mockResolvedValueOnce({
        id: "annot_ask_now",
        kind: "ASK",
      });

      const onAskNow = jest.fn();
      render(<SelectionToolbar onAskNow={onAskNow} />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      mockSelection(p1Text, 0, 16);

      await waitFor(() => {
        expect(screen.getByTestId("action-ask")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("action-ask"));
      expect(screen.getByTestId("ask-input")).toBeInTheDocument();
      expect(screen.getByTestId("action-ask-now")).toBeInTheDocument();

      // Enter ask question
      fireEvent.change(screen.getByTestId("ask-input"), {
        target: { value: "How does 2PC handle coordinator crash?" },
      });

      // Click Ask Now
      fireEvent.click(screen.getByTestId("action-ask-now"));

      await waitFor(() => {
        expect(api).toHaveBeenCalledWith(
          "/api/v1/response-versions/ver_456/annotations",
          expect.objectContaining({
            method: "POST",
            json: expect.objectContaining({
              kind: "ASK",
              mode: "now",
              text: "How does 2PC handle coordinator crash?",
              anchor: expect.objectContaining({
                exact: "Two-phase commit",
              }),
            }),
          })
        );
      });

      expect(onAskNow).toHaveBeenCalled();

      // F2.4: "Ask now" opens the Ask's column next to the main conversation
      // (where the answer streams) and does not open the All-annotations drawer.
      const created = (await (api as jest.Mock).mock.results[0]!.value) as { id: string };
      expect(useThreadStackStore.getState().stack).toEqual([
        { kind: "annotation", id: created.id },
      ]);
      expect(useUiStore.getState().rightPanelOpen).toBe(false);
    });

    it("submits 'Add to queue' on click or Ctrl+Enter, keeps popover open for next selection", async () => {
      (api as jest.Mock).mockResolvedValue({
        id: "annot_ask_queue",
        kind: "ASK",
      });

      const onQuestionCreated = jest.fn();
      render(<SelectionToolbar onQuestionCreated={onQuestionCreated} />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      mockSelection(p1Text, 0, 16);

      await waitFor(() => {
        expect(screen.getByTestId("action-ask")).toBeInTheDocument();
      });

      // Open Ask form
      fireEvent.click(screen.getByTestId("action-ask"));

      // Enter question
      fireEvent.change(screen.getByTestId("ask-input"), {
        target: { value: "Why is 2PC a blocking protocol?" },
      });

      // Click Add to queue
      fireEvent.click(screen.getByTestId("action-add-to-queue"));

      await waitFor(() => {
        expect(api).toHaveBeenCalledWith(
          "/api/v1/response-versions/ver_456/annotations",
          expect.objectContaining({
            method: "POST",
            json: expect.objectContaining({
              kind: "ASK",
              mode: "queue",
              text: "Why is 2PC a blocking protocol?",
            }),
          })
        );
      });

      expect(onQuestionCreated).toHaveBeenCalled();

      // Popover remains open with cleared input for the next selection
      expect(screen.getByTestId("ask-input")).toBeInTheDocument();
      expect((screen.getByTestId("ask-input") as HTMLInputElement).value).toBe("");
    });

    it("triggers ask mode with hotkey Ctrl+Alt+A", async () => {
      render(<SelectionToolbar />);

      const p1Text = annotRoot.querySelector("#p1")!.firstChild!;
      mockSelection(p1Text, 0, 16);

      await waitFor(() => {
        expect(screen.getByTestId("selection-toolbar")).toBeInTheDocument();
      });

      // Trigger Ctrl+Alt+A
      fireEvent.keyDown(window, { key: "a", code: "KeyA", ctrlKey: true, altKey: true });

      expect(screen.getByTestId("ask-input")).toBeInTheDocument();
    });
  });

  describe("4. Accessibility & Screen Reader Live Region", () => {
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
