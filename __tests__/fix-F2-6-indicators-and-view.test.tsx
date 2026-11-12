/**
 * @jest-environment jsdom
 *
 * Step F2.6 — Indicators, hover "View", and default-closed workspace:
 * - Multi-root highlight registry merges ranges across Main / L1 / L2+ without extra names
 * - Updated light/dark styles for Comment, Ask, AI review, Klecx note, and hover/focus
 * - Preview card lists multiple annotations (max 5 + "View all in drawer")
 * - View opens column at L1, L2, and L3 using closest [data-thread-column-index]
 * - Keyboard focus on gutter dot (including inside Ask columns) opens preview
 * - 100 annotations render cleanly without DOM mutation / layout shift
 * - Default-closed workspace on initial load (no open column, no open drawer)
 */

import fs from "node:fs";
import path from "node:path";
import React from "react";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import { AnnotationLayer } from "@/components/annotations/annotation-layer";
import {
  getHighlightOwnerCount,
} from "@/lib/annotations/highlight-registry";
import { clearCustomHighlights } from "@/lib/annotations/highlight";
import { HIGHLIGHT_CSS } from "@/lib/annotations/highlight-styles";
import { ThreadStackLayout } from "@/components/threads/thread-stack-layout";
import { AllAnnotationsDrawer } from "@/components/annotations/all-annotations-drawer";
import { useThreadStackStore } from "@/lib/stores/thread-stack";
import { useUiStore } from "@/lib/stores/ui";
import type { AnnotationItem } from "@/components/annotations/types";

// The preview card is read in English; other components show their keys.
jest.mock("next-intl", () => {
  const actual = jest.requireActual("next-intl");
  const en = jest.requireActual("../messages/en.json");
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      namespace === "Annotations.preview"
        ? actual.createTranslator({ locale: "en", messages: en, namespace })
        : (key: string, values?: Record<string, string | number>) =>
            values ? `${key}:${Object.values(values).join(",")}` : key,
    useFormatter: () => actual.createFormatter({ locale: "en" }),
    useNow: () => new Date(),
  };
});

jest.mock("next/navigation", () => ({
  usePathname: () => "/workspaces/ws_1",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "ws_1" }),
}));

jest.mock("../lib/api/client", () => ({
  api: jest.fn().mockResolvedValue([]),
}));

// jsdom has no PointerEvent: without it pointer events carry no coordinates.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
}

class MockHighlight {
  public ranges: Range[];
  public priority?: number;
  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}

function makeAnnot(overrides: Partial<AnnotationItem> = {}): AnnotationItem {
  const id = overrides.id ?? "annot_1";
  return {
    id,
    workspaceId: "ws_1",
    responseId: "resp_1",
    versionId: "ver_1",
    kind: "COMMENT",
    visibility: "WORKSPACE",
    anchorExact: "consensus algorithms",
    anchorPrefix: "",
    anchorSuffix: "",
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: { id: "u_1", name: "Ada" },
    messages: [
      {
        id: `msg_${id}`,
        role: "USER",
        content: "First line of annotation\nSecond line details",
        createdAt: new Date().toISOString(),
        author: { id: "u_1", name: "Ada" },
      },
    ],
    ...overrides,
  };
}

describe("Step F2.6 — Indicators, hover View, and default-closed workspace", () => {
  let highlightsMap: Map<string, MockHighlight>;

  beforeEach(() => {
    highlightsMap = new Map<string, MockHighlight>();

    const mockCSS = {
      highlights: {
        set: (name: string, hl: MockHighlight) => highlightsMap.set(name, hl),
        delete: (name: string) => highlightsMap.delete(name),
        get: (name: string) => highlightsMap.get(name),
        has: (name: string) => highlightsMap.has(name),
        keys: () => highlightsMap.keys(),
      },
    };

    (globalThis as unknown as { CSS: typeof mockCSS }).CSS = mockCSS;
    (globalThis as unknown as { Highlight: typeof MockHighlight }).Highlight =
      MockHighlight;

    if (typeof Range.prototype.getBoundingClientRect !== "function") {
      Range.prototype.getBoundingClientRect = () =>
        ({
          top: 40,
          left: 40,
          bottom: 60,
          right: 160,
          width: 120,
          height: 20,
          x: 40,
          y: 40,
          toJSON: () => {},
        }) as DOMRect;
    }

    useThreadStackStore.setState({ stack: [], quotes: {} });
    useUiStore.setState({ rightPanelOpen: false, rightPanelFocus: null });
    clearCustomHighlights();
  });

  afterEach(() => {
    clearCustomHighlights();
    delete (globalThis as unknown as { CSS?: unknown }).CSS;
    delete (globalThis as unknown as { Highlight?: unknown }).Highlight;
  });

  it("merges ranges from multiple mounted AnnotationLayer roots into global highlights", () => {
    const tMain = "Main response describes consensus algorithms cleanly.";
    const tL1 = "Level 1 answer expands on Raft leader election.";
    const tL2 = "Level 2 answer flags an AI review point.";

    const { unmount: unmountL2 } = render(
      <>
        <AnnotationLayer
          responseId="resp_1"
          versionId="ver_1"
          content={tMain}
          annotations={[makeAnnot({ id: "c_main", anchorExact: "consensus algorithms" })]}
        >
          <p>{tMain}</p>
        </AnnotationLayer>

        <div data-thread-column-index="1">
          <AnnotationLayer
            messageId="amsg_1"
            content={tL1}
            annotations={[
              makeAnnot({
                id: "a_l1",
                kind: "ASK",
                anchorExact: "Raft leader election",
              }),
            ]}
          >
            <p>{tL1}</p>
          </AnnotationLayer>
        </div>

        <div data-thread-column-index="2">
          <AnnotationLayer
            messageId="amsg_2"
            content={tL2}
            annotations={[
              makeAnnot({
                id: "ai_l2",
                authorType: "AI",
                anchorExact: "AI review point",
              }),
            ]}
          >
            <p>{tL2}</p>
          </AnnotationLayer>
        </div>
      </>
    );

    expect(getHighlightOwnerCount()).toBe(3);
    expect(Array.from(highlightsMap.keys()).sort()).toEqual([
      "annot-ai-review",
      "annot-ask",
      "annot-comment",
    ]);
    expect(highlightsMap.get("annot-comment")?.ranges).toHaveLength(1);
    expect(highlightsMap.get("annot-ask")?.ranges).toHaveLength(1);
    expect(highlightsMap.get("annot-ai-review")?.ranges).toHaveLength(1);

    unmountL2();
    expect(getHighlightOwnerCount()).toBe(0);
    expect(highlightsMap.size).toBe(0);
  });

  it("keeps remaining owners' highlights intact when one layer unmounts", () => {
    const tMain = "Main response text with consensus algorithms.";
    const tCol = "Column answer with election timeouts.";

    render(
      <AnnotationLayer
        responseId="resp_1"
        versionId="ver_1"
        content={tMain}
        annotations={[makeAnnot({ id: "c_main", anchorExact: "consensus algorithms" })]}
      >
        <p>{tMain}</p>
      </AnnotationLayer>
    );

    const colRender = render(
      <AnnotationLayer
        messageId="amsg_1"
        content={tCol}
        annotations={[
          makeAnnot({
            id: "c_col",
            kind: "COMMENT",
            anchorExact: "election timeouts",
          }),
        ]}
      >
        <p>{tCol}</p>
      </AnnotationLayer>
    );

    expect(highlightsMap.get("annot-comment")?.ranges).toHaveLength(2);
    colRender.unmount();

    // Main comment highlight still present after closing the column
    expect(getHighlightOwnerCount()).toBe(1);
    expect(highlightsMap.get("annot-comment")?.ranges).toHaveLength(1);
  });

  it("defines CSS highlight styles for comment, ask, ai-review, and hover in both themes", () => {
    expect(HIGHLIGHT_CSS).toContain("underline dotted 1.5px var(--mark-comment)");
    expect(HIGHLIGHT_CSS).toContain("text-underline-offset:3px");
    expect(HIGHLIGHT_CSS).toContain("12%,transparent");
    expect(HIGHLIGHT_CSS).toContain("underline wavy 1px var(--warning)");
    expect(HIGHLIGHT_CSS).toContain("18%,transparent");

    const css = fs.readFileSync(
      path.join(process.cwd(), "app/globals.css"),
      "utf8"
    );
    const darkSection = css.split('[data-theme="dark"]')[1] ?? "";
    expect(css).toContain("--mark-comment:");
    expect(css).toContain("--mark-ask:");
    expect(css).toContain("--mark-hover:");
    expect(darkSection).toContain("--mark-comment:");
    expect(darkSection).toContain("--warning:");
    expect(darkSection).toContain("--mark-ask:");
    expect(darkSection).toContain("--mark-hover:");
  });

  it("renders Klecx Logo-mark superscript dot in gutter and badge in preview for Klecx notes", () => {
    const text = "Always enforce idempotency keys on retries.";
    const klecxAnnot = makeAnnot({
      id: "c_klecx",
      kind: "COMMENT",
      anchorExact: "idempotency keys",
      notes: [{ id: "note_1", status: "ACTIVE" }],
      messages: [
        {
          id: "m_klecx",
          role: "USER",
          content: "@klecx Remember idempotency keys for every retry.",
          createdAt: new Date().toISOString(),
          author: { id: "u_1", name: "Ada" },
        },
      ],
    });

    render(
      <AnnotationLayer
        responseId="resp_1"
        versionId="ver_1"
        content={text}
        annotations={[klecxAnnot]}
      >
        <p>{text}</p>
      </AnnotationLayer>
    );

    expect(highlightsMap.has("annot-comment")).toBe(true);
    expect(screen.getByTestId("gutter-klecx-mark")).toBeInTheDocument();

    act(() => {
      fireEvent.focus(screen.getByTestId("gutter-dot"));
    });

    expect(screen.getByTestId("preview-klecx-badge")).toBeInTheDocument();
    expect(highlightsMap.has("annot-hover")).toBe(true);
  });

  it("opens L1, L2, and L3 columns when clicking View inside nested columns and supports keyboard focus on gutter dots", () => {
    const tMain = "Main passage text.";
    const tL1 = "L1 answer passage.";
    const tL2 = "L2 answer passage.";

    // 1. Main level (no column wrapper -> fromIndex = 0 -> L1)
    const mainView = render(
      <AnnotationLayer
        responseId="resp_1"
        versionId="ver_1"
        content={tMain}
        annotations={[
          makeAnnot({ id: "l1_annot", kind: "ASK", anchorExact: "Main passage" }),
        ]}
      >
        <p>{tMain}</p>
      </AnnotationLayer>
    );

    act(() => {
      fireEvent.focus(screen.getByTestId("gutter-dot"));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "View" }));
    });
    expect(useThreadStackStore.getState().stack).toEqual([
      { kind: "annotation", id: "l1_annot" },
    ]);
    mainView.unmount();

    // 2. Inside L1 column (data-thread-column-index="1" -> opens L2)
    const l1View = render(
      <div data-thread-column-index="1">
        <AnnotationLayer
          messageId="amsg_l1"
          content={tL1}
          annotations={[
            makeAnnot({ id: "l2_annot", kind: "ASK", anchorExact: "L1 answer" }),
          ]}
        >
          <p>{tL1}</p>
        </AnnotationLayer>
      </div>
    );

    act(() => {
      fireEvent.focus(screen.getByTestId("gutter-dot"));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "View" }));
    });
    expect(useThreadStackStore.getState().stack).toEqual([
      { kind: "annotation", id: "l1_annot" },
      { kind: "annotation", id: "l2_annot" },
    ]);
    l1View.unmount();

    // 3. Inside L2 column (data-thread-column-index="2" -> opens L3)
    const l2View = render(
      <div data-thread-column-index="2">
        <AnnotationLayer
          messageId="amsg_l2"
          content={tL2}
          annotations={[
            makeAnnot({ id: "l3_annot", kind: "ASK", anchorExact: "L2 answer" }),
          ]}
        >
          <p>{tL2}</p>
        </AnnotationLayer>
      </div>
    );

    act(() => {
      fireEvent.focus(screen.getByTestId("gutter-dot"));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "View" }));
    });
    expect(useThreadStackStore.getState().stack).toEqual([
      { kind: "annotation", id: "l1_annot" },
      { kind: "annotation", id: "l2_annot" },
      { kind: "annotation", id: "l3_annot" },
    ]);
    l2View.unmount();
  });

  it("lists multiple annotations in preview (capped at 5) + View all in drawer when > 5", () => {
    const text = "Shared paragraph target for many annotations.";
    const many = Array.from({ length: 7 }, (_, i) =>
      makeAnnot({
        id: `a_${i}`,
        kind: i === 0 ? "ASK" : "COMMENT",
        anchorExact: "Shared paragraph",
        createdBy: { id: `u_${i}`, name: `User ${i}` },
        messages: [
          {
            id: `m_${i}`,
            role: "USER",
            content: `Note ${i} first line\nDetails ${i}`,
            createdAt: new Date().toISOString(),
            author: { id: `u_${i}`, name: `User ${i}` },
          },
        ],
      })
    );

    render(
      <AnnotationLayer
        responseId="resp_1"
        versionId="ver_1"
        content={text}
        annotations={many}
      >
        <p>{text}</p>
      </AnnotationLayer>
    );

    act(() => {
      fireEvent.click(screen.getByTestId("gutter-dot"));
    });

    const extraContainer = screen.getByTestId("preview-extra-annotations");
    // 1 primary + 4 extra = 5 total shown
    expect(extraContainer.querySelectorAll('[data-testid^="preview-item-"]')).toHaveLength(4);

    // Individual View buttons work for secondary items too
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "View annotation by User 2" }));
    });
    expect(useThreadStackStore.getState().stack).toEqual([
      { kind: "annotation", id: "a_2" },
    ]);

    // Re-open and test "View all in drawer"
    act(() => {
      fireEvent.click(screen.getByTestId("gutter-dot"));
    });
    const drawerBtn = screen.getByRole("button", { name: /view all in drawer \(7\)/i });
    act(() => {
      fireEvent.click(drawerBtn);
    });
    expect(useUiStore.getState().rightPanelOpen).toBe(true);
  });

  it("fetches nested annotations for an Ask answer messageId inside a column", async () => {
    const origFetch = global.fetch;
    const text = "Nested answer text anchored inside column.";
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [makeAnnot({ id: "nested_c1", anchorExact: "Nested answer" })],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    render(
      <div data-thread-column-index="1">
        <AnnotationLayer messageId="amsg_99" content={text}>
          <p>{text}</p>
        </AnnotationLayer>
      </div>
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/annotation-messages/amsg_99/annotations"
      );
    });
    await waitFor(() => {
      expect(highlightsMap.get("annot-comment")?.ranges).toHaveLength(1);
    });

    global.fetch = origFetch;
  });

  it("renders 100 annotations without layout shift or mutating text DOM nodes", () => {
    const tokens = Array.from({ length: 100 }, (_, i) => `token_${i}_phrase`);
    const fullText = tokens.join(" ");
    const hundredAnnotations: AnnotationItem[] = tokens.map((tok, i) =>
      makeAnnot({
        id: `bulk_${i}`,
        kind: i % 2 === 0 ? "COMMENT" : "ASK",
        anchorExact: tok,
      })
    );

    const { container } = render(
      <AnnotationLayer
        responseId="resp_bulk"
        versionId="ver_bulk"
        content={fullText}
        annotations={hundredAnnotations}
      >
        <p data-testid="response-paragraph">{fullText}</p>
      </AnnotationLayer>
    );

    const p = screen.getByTestId("response-paragraph");
    // Text DOM node stays single untouched Text node (zero layout shift / DOM wrapping)
    expect(p.childNodes).toHaveLength(1);
    expect(p.textContent).toBe(fullText);

    // Gutter overlay container is out of flow (absolute)
    const dotWrapper = container.querySelector('[data-testid="gutter-dot"]')?.parentElement;
    expect(dotWrapper?.className).toContain("absolute");

    expect(highlightsMap.get("annot-comment")?.ranges).toHaveLength(50);
    expect(highlightsMap.get("annot-ask")?.ranges).toHaveLength(50);
  });

  describe("preview card: when and where it opens", () => {
    const text = "Raft keeps a replicated log consistent across servers.";
    const LINE = { top: 100, left: 100, bottom: 120, right: 200, width: 100, height: 20 };
    let originalRects: typeof Range.prototype.getClientRects;

    function hoverSetup() {
      const annot = makeAnnot({ id: "c_hover", anchorExact: "replicated log" });
      const view = render(
        <AnnotationLayer responseId="resp_1" versionId="ver_1" content={text} annotations={[annot]}>
          <p>{text}</p>
        </AnnotationLayer>
      );
      const textNode = view.container.querySelector("p")!.firstChild as Text;
      // The browser answers with the *nearest* text position, wherever the pointer is.
      (document as unknown as { caretPositionFromPoint: unknown }).caretPositionFromPoint =
        () => ({ offsetNode: textNode, offset: text.indexOf("replicated") + 2 });
      return view.container.firstChild as HTMLElement;
    }

    function moveTo(root: HTMLElement, clientX: number, clientY: number) {
      act(() => {
        fireEvent.pointerMove(root, { clientX, clientY });
        jest.advanceTimersByTime(400);
      });
    }

    beforeEach(() => {
      jest.useFakeTimers();
      originalRects = Range.prototype.getClientRects;
      Range.prototype.getClientRects = () =>
        [{ ...LINE, x: LINE.left, y: LINE.top, toJSON: () => ({}) }] as unknown as DOMRectList;
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
      Range.prototype.getClientRects = originalRects;
      delete (document as unknown as { caretPositionFromPoint?: unknown }).caretPositionFromPoint;
    });

    it("opens when the pointer is on the highlighted text", () => {
      const root = hoverSetup();
      moveTo(root, 150, 110);
      expect(screen.getByRole("dialog", { name: "Annotation preview" })).toBeInTheDocument();
    });

    it("stays closed when the pointer is in empty space next to the highlight", () => {
      const root = hoverSetup();
      moveTo(root, 420, 110);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      moveTo(root, 150, 300);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("opens again when the pointer leaves the card and goes back onto the same passage", () => {
      const root = hoverSetup();
      moveTo(root, 150, 110);
      const card = screen.getByRole("dialog", { name: "Annotation preview" });

      act(() => {
        fireEvent.pointerEnter(card);
        fireEvent.pointerLeave(card);
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      moveTo(root, 152, 110);
      expect(screen.getByRole("dialog", { name: "Annotation preview" })).toBeInTheDocument();
    });

    it("stays closed after Escape while the pointer rests on the passage", () => {
      const root = hoverSetup();
      moveTo(root, 150, 110);
      act(() => {
        fireEvent.keyDown(window, { key: "Escape" });
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      moveTo(root, 152, 110);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("moves the focus into the card on Enter and back to the gutter dot on Escape", () => {
      hoverSetup();
      const dot = screen.getByTestId("gutter-dot");
      act(() => {
        dot.focus();
      });
      expect(screen.getByRole("dialog", { name: "Annotation preview" })).toBeInTheDocument();
      expect(document.activeElement).toBe(dot);

      act(() => {
        fireEvent.keyDown(dot, { key: "Enter" });
      });
      act(() => {
        jest.advanceTimersByTime(50);
      });
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "View" }));

      act(() => {
        fireEvent.keyDown(window, { key: "Escape" });
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.activeElement).toBe(dot);
    });
  });

  it("re-anchors highlights when the text nodes are replaced after the first paint", async () => {
    const code = "const retries = 3;";
    function LateHighlightedCode() {
      const [html, setHtml] = React.useState<string | null>(null);
      return (
        <pre>
          <button type="button" data-annot-ignore="true" onClick={() => setHtml(`<span>const</span> retries = 3;`)}>
            highlight
          </button>
          {html ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{code}</code>}
        </pre>
      );
    }

    render(
      <AnnotationLayer
        responseId="resp_1"
        versionId="ver_1"
        content={code}
        annotations={[makeAnnot({ id: "c_code", anchorExact: "retries = 3" })]}
      >
        <LateHighlightedCode />
      </AnnotationLayer>
    );
    const before = highlightsMap.get("annot-comment")!.ranges[0]!;
    expect(before.toString()).toBe("retries = 3");

    // What a syntax highlighter does: it swaps the text for coloured spans.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "highlight" }));
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    const after = highlightsMap.get("annot-comment")!.ranges[0]!;
    expect(after).not.toBe(before);
    expect(after.collapsed).toBe(false);
    expect(after.toString()).toBe("retries = 3");
  });

  it("shows no Klecx mark when the note of the annotation was archived", () => {
    const text = "Always enforce idempotency keys on retries.";
    render(
      <AnnotationLayer
        responseId="resp_1"
        versionId="ver_1"
        content={text}
        annotations={[
          makeAnnot({
            id: "c_archived",
            anchorExact: "idempotency keys",
            notes: [{ id: "note_1", status: "ARCHIVED" }],
            messages: [
              {
                id: "m_archived",
                role: "USER",
                content: "@klecx Remember idempotency keys.",
                createdAt: new Date().toISOString(),
                mentions: [{ isKlecx: true }],
              },
            ],
          }),
        ]}
      >
        <p>{text}</p>
      </AnnotationLayer>
    );

    expect(screen.getByTestId("gutter-dot")).toBeInTheDocument();
    expect(screen.queryByTestId("gutter-klecx-mark")).not.toBeInTheDocument();
  });

  it("keeps workspace default-closed on load (no column, no drawer, even with stale storage)", () => {
    window.localStorage.setItem(
      "klecx-ui-store",
      JSON.stringify({ state: { rightPanelOpen: true, sidebarCollapsed: false }, version: 0 })
    );
    // Reset transient state as happens on fresh page load
    useUiStore.getState().resetTransientUi();

    render(
      <>
        <ThreadStackLayout workspaceId="ws_1">
          <div>Main timeline</div>
        </ThreadStackLayout>
        <AllAnnotationsDrawer
          workspaceId="ws_1"
          open={useUiStore.getState().rightPanelOpen}
          onOpenChange={jest.fn()}
        />
      </>
    );

    expect(useUiStore.getState().rightPanelOpen).toBe(false);
    expect(useThreadStackStore.getState().stack).toEqual([]);
    expect(document.querySelector("[data-thread-column-index]")).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
