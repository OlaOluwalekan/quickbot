/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AnnotationLayer } from "@/components/annotations/annotation-layer";
import {
  applyCustomHighlights,
  clearCustomHighlights,
  setHoverHighlight,
  clearHoverHighlight,
  isCustomHighlightSupported,
  getPointCaret,
  isPointInRange,
} from "@/lib/annotations/highlight";
import { useUiStore } from "@/lib/stores/ui";
import { useThreadStackStore } from "@/lib/stores/thread-stack";
import type { AnnotationItem } from "@/components/annotations/right-panel";

// Mock Highlight constructor and CSS.highlights
class MockHighlight {
  public ranges: Range[];
  public priority?: number;
  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}

describe("Step 6.6 — Indicators and Hover/Tap Previews in Workspace", () => {
  let highlightsMap: Map<string, MockHighlight>;

  const mockAnnotations: AnnotationItem[] = [
    {
      id: "annot_comment_1",
      workspaceId: "ws_123",
      responseId: "resp_1",
      versionId: "ver_1",
      kind: "COMMENT",
      visibility: "WORKSPACE",
      anchorExact: "Distributed consensus algorithms ensure data consistency across replicas.",
      anchorPrefix: "In modern architecture, ",
      anchorSuffix: " Raft is one such example.",
      createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5m ago
      updatedAt: new Date().toISOString(),
      createdBy: { id: "user_alice", name: "Alice", email: "alice@example.com" },
      messages: [
        {
          id: "msg_c1",
          role: "USER",
          content: "We should evaluate Paxos vs Raft trade-offs in our benchmark report.",
          createdAt: new Date().toISOString(),
          author: { id: "user_alice", name: "Alice", email: "alice@example.com" },
        },
      ],
    },
    {
      id: "annot_reply_1",
      workspaceId: "ws_123",
      responseId: "resp_1",
      versionId: "ver_1",
      kind: "ASK",
      visibility: "WORKSPACE",
      anchorExact: "Distributed consensus algorithms ensure data consistency across replicas.",
      anchorPrefix: "In modern architecture, ",
      anchorSuffix: " Raft is one such example.",
      createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2m ago
      updatedAt: new Date().toISOString(),
      createdBy: { id: "user_bob", name: "Bob", email: "bob@example.com" },
      messages: [
        {
          id: "msg_r1",
          role: "USER",
          content: "Can you elaborate on leader election latency?",
          createdAt: new Date().toISOString(),
          author: { id: "user_bob", name: "Bob", email: "bob@example.com" },
        },
        {
          id: "msg_r2",
          role: "ASSISTANT",
          content: "In Raft, randomized election timeouts (150-300ms) prevent split votes.",
          createdAt: new Date().toISOString(),
        },
      ],
    },
    {
      id: "annot_question_1",
      workspaceId: "ws_123",
      responseId: "resp_1",
      versionId: "ver_1",
      kind: "ASK",
      questionState: "QUEUED",
      visibility: "PRIVATE",
      anchorExact: "Raft is one such example.",
      anchorPrefix: "consistency across replicas. ",
      anchorSuffix: " It is widely used in etcd.",
      createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: { id: "user_bob", name: "Bob", email: "bob@example.com" },
      messages: [
        {
          id: "msg_q1",
          role: "USER",
          content: "What happens when network partitions occur during log replication?",
          createdAt: new Date().toISOString(),
        },
      ],
    },
  ];

  beforeEach(() => {
    highlightsMap = new Map<string, MockHighlight>();

    const mockCSS = {
      highlights: {
        set: (name: string, hl: MockHighlight) => highlightsMap.set(name, hl),
        delete: (name: string) => highlightsMap.delete(name),
        get: (name: string) => highlightsMap.get(name),
        has: (name: string) => highlightsMap.has(name),
      },
    };

    (globalThis as unknown as { CSS: typeof mockCSS }).CSS = mockCSS;
    (globalThis as unknown as { Highlight: typeof MockHighlight }).Highlight =
      MockHighlight;

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
          toJSON: () => {},
        } as DOMRect;
      };
    }

    if (typeof Range.prototype.getClientRects !== "function") {
      Range.prototype.getClientRects = function () {
        return [
          {
            top: 100,
            left: 100,
            bottom: 120,
            right: 200,
            width: 100,
            height: 20,
            x: 100,
            y: 100,
            toJSON: () => {},
          } as DOMRect,
        ] as unknown as DOMRectList;
      };
    }

    useUiStore.setState({
      rightPanelOpen: false,
      rightPanelFocus: null,
    });
  });

  afterEach(() => {
    delete (globalThis as unknown as { CSS?: unknown }).CSS;
    delete (globalThis as unknown as { Highlight?: unknown }).Highlight;
  });

  describe("1. CSS Custom Highlights & Priority Stacking", () => {
    it("assigns priority: ask (2) > comment (1)", () => {
      const dummyRange = document.createRange();
      const success = applyCustomHighlights([
        { kind: "COMMENT", ranges: [dummyRange] },
        { kind: "ASK", ranges: [dummyRange] },
      ]);

      expect(success).toBe(true);
      expect(highlightsMap.has("annot-ask")).toBe(true);
      expect(highlightsMap.has("annot-comment")).toBe(true);

      expect(highlightsMap.get("annot-ask")?.priority).toBe(2);
      expect(highlightsMap.get("annot-comment")?.priority).toBe(1);
    });

    it("registers annot-hover with high priority (10) and clears it", () => {
      const dummyRange = document.createRange();
      setHoverHighlight(dummyRange);

      expect(highlightsMap.has("annot-hover")).toBe(true);
      expect(highlightsMap.get("annot-hover")?.priority).toBe(10);

      clearHoverHighlight();
      expect(highlightsMap.has("annot-hover")).toBe(false);
    });

    it("clearCustomHighlights clears all marks and hover", () => {
      const dummyRange = document.createRange();
      applyCustomHighlights([{ kind: "COMMENT", ranges: [dummyRange] }]);
      setHoverHighlight(dummyRange);

      expect(highlightsMap.size).toBe(2);
      clearCustomHighlights();
      expect(highlightsMap.size).toBe(0);
    });
  });

  describe("2. Point Caret and Range Testing Utilities", () => {
    it("getPointCaret extracts caret position from document", () => {
      const div = document.createElement("div");
      div.textContent = "Test text";
      document.body.appendChild(div);

      (document as unknown as {
        caretPositionFromPoint: (x: number, y: number) => { offsetNode: Node; offset: number };
      }).caretPositionFromPoint = () => ({
        offsetNode: div.firstChild!,
        offset: 3,
      });

      const caret = getPointCaret(document, 10, 20);
      expect(caret).toEqual({ node: div.firstChild, offset: 3 });
      document.body.removeChild(div);
    });

    it("isPointInRange returns true when node and offset are within Range", () => {
      const div = document.createElement("div");
      div.textContent = "Checking point in range bounds";
      document.body.appendChild(div);

      const textNode = div.firstChild as Text;
      const range = document.createRange();
      range.setStart(textNode, 5);
      range.setEnd(textNode, 15);

      expect(isPointInRange(range, textNode, 8)).toBe(true);
      expect(isPointInRange(range, textNode, 2)).toBe(false);
      expect(isPointInRange(range, textNode, 20)).toBe(false);

      document.body.removeChild(div);
    });
  });

  describe("3. AnnotationLayer Component Rendering & Gutter Dots", () => {
    const fullText =
      "In modern architecture, Distributed consensus algorithms ensure data consistency across replicas. Raft is one such example. It is widely used in etcd.";

    it("renders children, registers custom highlights, and renders accessible gutter dots", () => {
      render(
        <AnnotationLayer
          responseId="resp_1"
          versionId="ver_1"
          content={fullText}
          annotations={mockAnnotations}
        >
          <p>{fullText}</p>
        </AnnotationLayer>
      );

      expect(screen.getByText(/Distributed consensus algorithms/)).toBeInTheDocument();

      // Gutter dots rendered with role="button" and data-annot-ignore="true"
      const gutterDots = screen.getAllByTestId("gutter-dot");
      expect(gutterDots.length).toBeGreaterThan(0);

      const dot = gutterDots[0]!;
      expect(dot).toHaveAttribute("role", "button");
      expect(dot).toHaveAttribute("data-annot-ignore", "true");
      expect(dot.getAttribute("aria-label")).toMatch(/annotation/i);

      // Custom highlights registered
      expect(highlightsMap.has("annot-ask")).toBe(true);
      expect(highlightsMap.has("annot-comment")).toBe(true);
    });

    it("opens preview popover when clicking a gutter dot", () => {
      render(
        <AnnotationLayer
          responseId="resp_1"
          versionId="ver_1"
          content={fullText}
          annotations={mockAnnotations}
        >
          <p>{fullText}</p>
        </AnnotationLayer>
      );

      const gutterDot = screen.getAllByTestId("gutter-dot")[0]!;
      act(() => {
        fireEvent.click(gutterDot);
      });

      // Preview dialog opens
      const dialog = screen.getByRole("dialog", { name: /annotation preview/i });
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText("View more")).toBeInTheDocument();
    });

    it("opens preview popover on Enter key down on a gutter dot", () => {
      render(
        <AnnotationLayer
          responseId="resp_1"
          versionId="ver_1"
          content={fullText}
          annotations={mockAnnotations}
        >
          <p>{fullText}</p>
        </AnnotationLayer>
      );

      const gutterDot = screen.getAllByTestId("gutter-dot")[0]!;
      act(() => {
        fireEvent.keyDown(gutterDot, { key: "Enter" });
      });

      const dialog = screen.getByRole("dialog", { name: /annotation preview/i });
      expect(dialog).toBeInTheDocument();
    });
  });

  describe("4. Hover Detection and 250ms Debounce", () => {
    const fullText =
      "In modern architecture, Distributed consensus algorithms ensure data consistency across replicas. Raft is one such example. It is widely used in etcd.";

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it("opens preview dialog only after 250ms hover debounce and applies annot-hover", () => {
      const { container } = render(
        <AnnotationLayer
          responseId="resp_1"
          versionId="ver_1"
          content={fullText}
          annotations={mockAnnotations}
        >
          <p>{fullText}</p>
        </AnnotationLayer>
      );

      const p = container.querySelector("p")!;
      const textNode = p.firstChild as Text;

      (document as unknown as {
        caretPositionFromPoint: (x: number, y: number) => { offsetNode: Node; offset: number };
      }).caretPositionFromPoint = () => ({
        offsetNode: textNode,
        offset: 40,
      });

      // Pointer moves over text
      act(() => {
        fireEvent.pointerMove(container.firstChild as HTMLElement, {
          clientX: 50,
          clientY: 50,
        });
      });

      // Advance by 100ms: not open yet
      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(screen.queryByRole("dialog", { name: /annotation preview/i })).not.toBeInTheDocument();
      expect(highlightsMap.has("annot-hover")).toBe(false);

      // Advance past 250ms: preview dialog opens and annot-hover is registered
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const dialog = screen.getByRole("dialog", { name: /annotation preview/i });
      expect(dialog).toBeInTheDocument();
      expect(highlightsMap.has("annot-hover")).toBe(true);
    });

    it("cancels preview open if pointer leaves before 250ms", () => {
      const { container } = render(
        <AnnotationLayer
          responseId="resp_1"
          versionId="ver_1"
          content={fullText}
          annotations={mockAnnotations}
        >
          <p>{fullText}</p>
        </AnnotationLayer>
      );

      const p = container.querySelector("p")!;
      const textNode = p.firstChild as Text;

      (document as unknown as {
        caretPositionFromPoint: (x: number, y: number) => { offsetNode: Node; offset: number };
      }).caretPositionFromPoint = () => ({
        offsetNode: textNode,
        offset: 40,
      });

      // Pointer move
      act(() => {
        fireEvent.pointerMove(container.firstChild as HTMLElement, { clientX: 50, clientY: 50 });
        jest.advanceTimersByTime(100);
      });

      // Pointer leave before 250ms
      act(() => {
        fireEvent.pointerLeave(container.firstChild as HTMLElement);
        jest.advanceTimersByTime(250);
      });

      expect(screen.queryByRole("dialog", { name: /annotation preview/i })).not.toBeInTheDocument();
      expect(highlightsMap.has("annot-hover")).toBe(false);
    });

    it("closes preview and clears hover highlight on Escape key", () => {
      const { container } = render(
        <AnnotationLayer
          responseId="resp_1"
          versionId="ver_1"
          content={fullText}
          annotations={mockAnnotations}
        >
          <p>{fullText}</p>
        </AnnotationLayer>
      );

      // Open via gutter dot
      const gutterDot = screen.getAllByTestId("gutter-dot")[0]!;
      act(() => {
        fireEvent.click(gutterDot);
      });

      expect(screen.getByRole("dialog", { name: /annotation preview/i })).toBeInTheDocument();
      expect(highlightsMap.has("annot-hover")).toBe(true);

      // Press Escape
      act(() => {
        fireEvent.keyDown(window, { key: "Escape" });
      });

      expect(screen.queryByRole("dialog", { name: /annotation preview/i })).not.toBeInTheDocument();
      expect(highlightsMap.has("annot-hover")).toBe(false);
    });
  });

  describe("5. Preview Card Content and 'View more' Right Panel Action", () => {
    const fullText =
      "In modern architecture, Distributed consensus algorithms ensure data consistency across replicas. Raft is one such example. It is widely used in etcd.";

    it("displays author, AI replied status, truncated text, and opens the column on 'View more'", () => {
      render(
        <AnnotationLayer
          responseId="resp_1"
          versionId="ver_1"
          content={fullText}
          annotations={mockAnnotations}
        >
          <p>{fullText}</p>
        </AnnotationLayer>
      );

      // Click gutter dot (the first annotation is REPLY by Bob with AI replied)
      const gutterDot = screen.getAllByTestId("gutter-dot")[0]!;
      act(() => {
        fireEvent.click(gutterDot);
      });

      const dialog = screen.getByRole("dialog", { name: /annotation preview/i });
      expect(dialog).toBeInTheDocument();

      // Checks reply content: author name and AI replied indicator
      // F2.6: preview card lists multiple matching annotations (Bob authored two in this paragraph).
      expect(screen.getAllByText("Bob").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/AI replied/i)).toBeInTheDocument();
      expect(screen.getByText(/Can you elaborate on leader election latency/i)).toBeInTheDocument();

      // Click "View more"
      const viewMoreBtn = screen.getByRole("button", { name: /view more/i });
      act(() => {
        fireEvent.click(viewMoreBtn);
      });

      // F2.4: "View more" opens the annotation's column, not the drawer.
      expect(useThreadStackStore.getState().stack).toEqual([
        { kind: "annotation", id: "annot_reply_1" },
      ]);
      expect(useUiStore.getState().rightPanelOpen).toBe(false);

      // Dialog closed
      expect(screen.queryByRole("dialog", { name: /annotation preview/i })).not.toBeInTheDocument();
    });

    it("displays question queue status badge for questions", () => {
      render(
        <AnnotationLayer
          responseId="resp_1"
          versionId="ver_1"
          content={fullText}
          annotations={[mockAnnotations[2]!]}
        >
          <p>{fullText}</p>
        </AnnotationLayer>
      );

      const gutterDot = screen.getByTestId("gutter-dot");
      act(() => {
        fireEvent.click(gutterDot);
      });

      const dialog = screen.getByRole("dialog", { name: /annotation preview/i });
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText("QUEUED")).toBeInTheDocument();
      expect(screen.getByText(/What happens when network partitions occur/i)).toBeInTheDocument();
    });
  });

  describe("6. Fallback Highlight Rectangles without CSS Custom Highlight API", () => {
    it("renders fallback overlay elements when CSS Custom Highlight API is unsupported", () => {
      delete (globalThis as unknown as { CSS?: unknown }).CSS;
      delete (globalThis as unknown as { Highlight?: unknown }).Highlight;

      expect(isCustomHighlightSupported()).toBe(false);

      const fullText = "Distributed consensus algorithms ensure data consistency across replicas.";
      const { container } = render(
        <AnnotationLayer
          responseId="resp_1"
          versionId="ver_1"
          content={fullText}
          annotations={[mockAnnotations[0]!]}
        >
          <p>{fullText}</p>
        </AnnotationLayer>
      );

      // Verify overlay container with data-annot-ignore="true"
      const overlay = container.querySelector('[aria-hidden="true"]');
      expect(overlay).toBeInTheDocument();
      expect(overlay).toHaveAttribute("data-annot-ignore", "true");
    });
  });
});
