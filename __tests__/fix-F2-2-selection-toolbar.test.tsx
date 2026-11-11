/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { SelectionToolbar } from "@/components/annotations/selection-toolbar";
import { MentionTextarea, renderMentions } from "@/components/annotations/mention-textarea";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import { MAX_ANNOTATION_DEPTH } from "@/lib/annotations/limits";

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

describe("Fix F2.2 — Selection Popover v2 & Mention Autocomplete", () => {
  let responseRoot: HTMLDivElement;
  let messageRoot: HTMLDivElement;

  beforeEach(() => {
    jest.clearAllMocks();

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

    // 1. Response Version target root
    responseRoot = document.createElement("div");
    responseRoot.setAttribute("data-annot-root", "true");
    responseRoot.setAttribute("data-annot-target-type", "RESPONSE_VERSION");
    responseRoot.setAttribute("data-annot-target-id", "ver_version_1");
    responseRoot.setAttribute("data-annot-depth", "0");
    responseRoot.setAttribute("data-workspace-id", "ws_123");
    responseRoot.innerHTML = "<p id='resp_text'>Distributed consensus is required for fault tolerance.</p>";
    document.body.appendChild(responseRoot);

    // 2. Annotation Message (nested Ask answer) target root
    messageRoot = document.createElement("div");
    messageRoot.setAttribute("data-annot-root", "true");
    messageRoot.setAttribute("data-annot-target-type", "ANNOTATION_MESSAGE");
    messageRoot.setAttribute("data-annot-target-id", "msg_assistant_1");
    messageRoot.setAttribute("data-annot-depth", "1");
    messageRoot.setAttribute("data-workspace-id", "ws_123");
    messageRoot.innerHTML = "<p id='msg_text'>Paxos guarantees safety while Raft simplifies leader election.</p>";
    document.body.appendChild(messageRoot);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function mockSelection(container: Node, startOffset: number, endOffset: number) {
    const range = document.createRange();
    range.setStart(container, startOffset);
    range.setEnd(container, endOffset);

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }

    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
  }

  describe("1. Polymorphic Root Detection (Main Response & Nested Ask Answer)", () => {
    it("opens toolbar and targets RESPONSE_VERSION when selection is on response", async () => {
      (api as jest.Mock).mockResolvedValueOnce({ id: "annot_1", kind: "COMMENT" });
      render(<SelectionToolbar />);

      const textNode = responseRoot.querySelector("#resp_text")!.firstChild!;
      mockSelection(textNode, 0, 21); // "Distributed consensus"

      await waitFor(() => {
        expect(screen.getByTestId("selection-toolbar")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("action-comment"));
      expect(screen.getByTestId("comment-textarea")).toBeInTheDocument();

      fireEvent.change(screen.getByTestId("comment-textarea"), {
        target: { value: "A comment on consensus" },
      });
      fireEvent.click(screen.getByTestId("comment-save"));

      await waitFor(() => {
        expect(api).toHaveBeenCalledWith(
          "/api/v1/response-versions/ver_version_1/annotations",
          expect.objectContaining({
            method: "POST",
            json: expect.objectContaining({
              kind: "COMMENT",
              text: "A comment on consensus",
              anchor: expect.objectContaining({ exact: "Distributed consensus" }),
            }),
          })
        );
      });
    });

    it("shows the real queue size after Add to queue", async () => {
      (api as jest.Mock)
        .mockResolvedValueOnce({ id: "annot_q", kind: "ASK" })
        // the workspace already has three other queued questions
        .mockResolvedValueOnce([{}, {}, {}, {}]);
      render(<SelectionToolbar />);

      const textNode = responseRoot.querySelector("#resp_text")!.firstChild!;
      mockSelection(textNode, 0, 21);

      await waitFor(() => {
        expect(screen.getByTestId("action-ask")).toBeInTheDocument();
      });
      // Non-Apple platforms get Ctrl-based shortcut hints
      expect(screen.getByTestId("action-ask")).toHaveTextContent("Ctrl+Alt+A");

      fireEvent.click(screen.getByTestId("action-ask"));
      fireEvent.change(screen.getByTestId("ask-input"), {
        target: { value: "Why?" },
      });
      fireEvent.click(screen.getByTestId("action-add-to-queue"));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Added to your queue (4)");
      });
      expect(api).toHaveBeenCalledWith(
        "/api/v1/workspaces/ws_123/questions?state=QUEUED"
      );
    });

    it("opens toolbar and targets ANNOTATION_MESSAGE when selection is inside Ask answer", async () => {
      (api as jest.Mock).mockResolvedValueOnce({ id: "annot_2", kind: "ASK" });
      const fetchMock = jest.fn().mockResolvedValue({ ok: false, body: null });
      global.fetch = fetchMock as unknown as typeof fetch;
      render(<SelectionToolbar />);

      const textNode = messageRoot.querySelector("#msg_text")!.firstChild!;
      mockSelection(textNode, 0, 23); // "Paxos guarantees safety"

      await waitFor(() => {
        expect(screen.getByTestId("selection-toolbar")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("action-ask"));
      expect(screen.getByTestId("ask-input")).toBeInTheDocument();

      fireEvent.change(screen.getByTestId("ask-input"), {
        target: { value: "How about Multi-Paxos?" },
      });
      fireEvent.click(screen.getByTestId("action-ask-now"));

      await waitFor(() => {
        expect(api).toHaveBeenCalledWith(
          "/api/v1/annotation-messages/msg_assistant_1/annotations",
          expect.objectContaining({
            method: "POST",
            json: expect.objectContaining({
              kind: "ASK",
              mode: "now",
              text: "How about Multi-Paxos?",
              anchor: expect.objectContaining({ exact: "Paxos guarantees safety" }),
            }),
          })
        );
      });

      // "Ask now" starts the answer for the Ask it just created
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/v1/annotations/annot_2/answer",
          expect.objectContaining({ method: "POST" })
        );
      });
    });
  });

  describe("2. Mention Autocomplete in Textarea", () => {
    it("detects '@', fetches mentionables, displays Klecx and members, and inserts on selection", async () => {
      (api as jest.Mock).mockResolvedValueOnce([
        { kind: "klecx" },
        { kind: "user", id: "u1", username: "alice", displayName: "Alice Smith" },
        { kind: "user", id: "u2", username: "bob", displayName: "Bob Jones" },
      ]);

      const handleChange = jest.fn();
      render(
        <MentionTextarea
          value="Check this out "
          onChange={handleChange}
          workspaceId="ws_123"
        />
      );

      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, { target: { value: "Check this out @" } });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 200));
      });

      await waitFor(() => {
        expect(screen.getByTestId("mention-autocomplete-menu")).toBeInTheDocument();
      });

      expect(screen.getByTestId("mention-item-klecx")).toBeInTheDocument();
      expect(screen.getByTestId("mention-item-alice")).toBeInTheDocument();
      expect(screen.getByTestId("mention-item-bob")).toBeInTheDocument();

      // Click Alice item
      fireEvent.mouseDown(screen.getByTestId("mention-item-alice"));

      expect(handleChange).toHaveBeenCalledWith("Check this out @alice ");
    });

    it("supports keyboard navigation (ArrowDown, Enter) in mention autocomplete", async () => {
      (api as jest.Mock).mockResolvedValueOnce([
        { kind: "klecx" },
        { kind: "user", id: "u1", username: "alice", displayName: "Alice Smith" },
      ]);

      const handleChange = jest.fn();
      render(
        <MentionTextarea
          value=""
          onChange={handleChange}
          workspaceId="ws_123"
        />
      );

      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, { target: { value: "@" } });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 200));
      });

      await waitFor(() => {
        expect(screen.getByTestId("mention-autocomplete-menu")).toBeInTheDocument();
      });

      // Press ArrowDown to select Alice (index 1)
      fireEvent.keyDown(textarea, { key: "ArrowDown" });
      // Press Enter to insert
      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(handleChange).toHaveBeenCalledWith("@alice ");
    });

    it("dismisses mention autocomplete on Escape", async () => {
      (api as jest.Mock).mockResolvedValueOnce([
        { kind: "klecx" },
      ]);

      render(
        <MentionTextarea
          value=""
          onChange={() => {}}
          workspaceId="ws_123"
        />
      );

      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, { target: { value: "@" } });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 200));
      });

      await waitFor(() => {
        expect(screen.getByTestId("mention-autocomplete-menu")).toBeInTheDocument();
      });

      fireEvent.keyDown(textarea, { key: "Escape" });
      expect(screen.queryByTestId("mention-autocomplete-menu")).not.toBeInTheDocument();
    });
  });

  describe("3. Mention Chip Rendering", () => {
    it("renders @klecx as accent chip and @username as mention chip", () => {
      const rendered = renderMentions(
        "Hello @klecx and @mira please check this (mail me@example.com)",
        "Klecx noted this"
      );
      const { container } = render(<div>{rendered}</div>);

      const klecxChip = container.querySelector("[data-mention='klecx']");
      expect(klecxChip).toBeInTheDocument();
      expect(klecxChip).toHaveTextContent("Klecx noted this");

      const userChip = container.querySelector("[data-mention='mira']");
      expect(userChip).toBeInTheDocument();
      expect(userChip).toHaveTextContent("@mira");

      // An e-mail address is not a mention
      expect(container.querySelectorAll("[data-mention]")).toHaveLength(2);
    });
  });

  describe("4. Gated Capabilities & Depth Ceiling", () => {
    it("disables Comment button when canComment is false", async () => {
      render(<SelectionToolbar canComment={false} />);

      const textNode = responseRoot.querySelector("#resp_text")!.firstChild!;
      mockSelection(textNode, 0, 21);

      await waitFor(() => {
        expect(screen.getByTestId("selection-toolbar")).toBeInTheDocument();
      });

      const commentBtn = screen.getByTestId("action-comment");
      expect(commentBtn).toBeDisabled();
    });

    it("disables Ask button when canAsk is false", async () => {
      render(<SelectionToolbar canAsk={false} />);

      const textNode = responseRoot.querySelector("#resp_text")!.firstChild!;
      mockSelection(textNode, 0, 21);

      await waitFor(() => {
        expect(screen.getByTestId("selection-toolbar")).toBeInTheDocument();
      });

      const askBtn = screen.getByTestId("action-ask");
      expect(askBtn).toBeDisabled();
    });

    it("disables Ask button when depth exceeds MAX_ANNOTATION_DEPTH", async () => {
      // Create root element at MAX_ANNOTATION_DEPTH
      const deepRoot = document.createElement("div");
      deepRoot.setAttribute("data-annot-root", "true");
      deepRoot.setAttribute("data-annot-target-type", "ANNOTATION_MESSAGE");
      deepRoot.setAttribute("data-annot-target-id", "msg_deep");
      deepRoot.setAttribute("data-annot-depth", String(MAX_ANNOTATION_DEPTH));
      deepRoot.innerHTML = "<p id='deep_text'>Deep nested reply answer.</p>";
      document.body.appendChild(deepRoot);

      render(<SelectionToolbar />);

      const textNode = deepRoot.querySelector("#deep_text")!.firstChild!;
      mockSelection(textNode, 0, 16);

      await waitFor(() => {
        expect(screen.getByTestId("selection-toolbar")).toBeInTheDocument();
      });

      const askBtn = screen.getByTestId("action-ask");
      expect(askBtn).toBeDisabled();
    });
  });
});
