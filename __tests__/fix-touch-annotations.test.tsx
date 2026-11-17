/**
 * @jest-environment jsdom
 *
 * Annotations on touch screens:
 * - Tapping a marked passage opens its card (touch has no hover).
 * - The Comment / Ask buttons float below the selection instead of sitting in
 *   a bottom sheet, where Android Chrome's own selection bars covered them.
 *   The forms still use the bottom sheet.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { AnnotationLayer } from "@/components/annotations/annotation-layer";
import { SelectionToolbar } from "@/components/annotations/selection-toolbar";
import { clearCustomHighlights } from "@/lib/annotations/highlight";
import type { AnnotationItem } from "@/components/annotations/types";

jest.mock("next-intl", () => {
  const actual = jest.requireActual("next-intl");
  const en = jest.requireActual("../messages/en.json");
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({ locale: "en", messages: en, namespace }),
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

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// jsdom has no PointerEvent: without it pointer events carry no pointerType.
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
  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}

const LINE = { top: 100, left: 100, bottom: 120, right: 200, width: 100, height: 20 };

function setMatchMedia(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("coarse") ? coarse : false,
    media: query,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
}

function makeAnnot(overrides: Partial<AnnotationItem> = {}): AnnotationItem {
  const id = overrides.id ?? "annot_tap";
  return {
    id,
    workspaceId: "ws_1",
    responseId: "resp_1",
    versionId: "ver_1",
    kind: "COMMENT",
    visibility: "WORKSPACE",
    anchorExact: "replicated log",
    anchorPrefix: "",
    anchorSuffix: "",
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: { id: "u_1", name: "Ada" },
    messages: [
      {
        id: `msg_${id}`,
        role: "USER",
        content: "Check the log compaction too",
        createdAt: new Date().toISOString(),
        author: { id: "u_1", name: "Ada" },
      },
    ],
    ...overrides,
  };
}

describe("Touch: tapping a marked passage opens its card", () => {
  const text = "Raft keeps a replicated log consistent across servers.";
  let originalRects: typeof Range.prototype.getClientRects;
  let originalRect: typeof Range.prototype.getBoundingClientRect;

  beforeEach(() => {
    const map = new Map<string, MockHighlight>();
    (globalThis as unknown as { CSS: unknown }).CSS = {
      highlights: {
        set: (n: string, h: MockHighlight) => map.set(n, h),
        delete: (n: string) => map.delete(n),
        get: (n: string) => map.get(n),
        has: (n: string) => map.has(n),
        keys: () => map.keys(),
      },
    };
    (globalThis as unknown as { Highlight: unknown }).Highlight = MockHighlight;
    originalRects = Range.prototype.getClientRects;
    originalRect = Range.prototype.getBoundingClientRect;
    const rect = { ...LINE, x: LINE.left, y: LINE.top, toJSON: () => ({}) };
    Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => rect as DOMRect;
    clearCustomHighlights();
  });

  afterEach(() => {
    Range.prototype.getClientRects = originalRects;
    Range.prototype.getBoundingClientRect = originalRect;
    delete (document as unknown as { caretPositionFromPoint?: unknown }).caretPositionFromPoint;
    clearCustomHighlights();
    window.getSelection()?.removeAllRanges();
  });

  function setup(caretOffset = text.indexOf("replicated") + 2) {
    const view = render(
      <AnnotationLayer
        responseId="resp_1"
        versionId="ver_1"
        content={text}
        annotations={[makeAnnot()]}
      >
        <p>
          {text} <a href="#x">link</a>
        </p>
      </AnnotationLayer>
    );
    const textNode = view.container.querySelector("p")!.firstChild as Text;
    (document as unknown as { caretPositionFromPoint: unknown }).caretPositionFromPoint =
      () => ({ offsetNode: textNode, offset: caretOffset });
    return view.container.firstChild as HTMLElement;
  }

  function tap(el: Element, root: HTMLElement, x = 150, y = 110) {
    act(() => {
      fireEvent.pointerDown(root, { pointerType: "touch", clientX: x, clientY: y });
      fireEvent.click(el, { clientX: x, clientY: y });
    });
  }

  it("opens the card with the comment on a tap", () => {
    const root = setup();
    tap(root.querySelector("p")!, root);
    expect(screen.getByRole("dialog", { name: "Annotation preview" })).toBeInTheDocument();
    expect(screen.getByText(/Check the log compaction too/)).toBeInTheDocument();
  });

  it("does nothing on a tap outside the marked passage", () => {
    const root = setup(text.indexOf("servers"));
    tap(root.querySelector("p")!, root, 150, 110);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not open on a tap that ends a text selection", () => {
    const root = setup();
    const range = document.createRange();
    const textNode = root.querySelector("p")!.firstChild as Text;
    range.setStart(textNode, 0);
    range.setEnd(textNode, 10);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    tap(root.querySelector("p")!, root);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("leaves links inside the text alone", () => {
    const root = setup();
    tap(root.querySelector("a")!, root);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a mouse click doesn't open it (a mouse uses hover)", () => {
    const root = setup();
    act(() => {
      fireEvent.pointerDown(root, { pointerType: "mouse", clientX: 150, clientY: 110 });
      fireEvent.click(root.querySelector("p")!, { clientX: 150, clientY: 110 });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Touch: selection toolbar placement", () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement("div");
    root.setAttribute("data-annot-root", "true");
    root.setAttribute("data-annot-target-type", "RESPONSE_VERSION");
    root.setAttribute("data-annot-target-id", "ver_1");
    root.setAttribute("data-workspace-id", "ws_1");
    root.innerHTML = "<p id='t'>Distributed consensus is required for fault tolerance.</p>";
    document.body.appendChild(root);
    Range.prototype.getBoundingClientRect = () =>
      ({ ...LINE, x: LINE.left, y: LINE.top, toJSON: () => ({}) }) as DOMRect;
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    document.body.innerHTML = "";
  });

  async function select() {
    const textNode = document.getElementById("t")!.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 11);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    return waitFor(() => screen.getByTestId("selection-toolbar"));
  }

  it("on touch, floats the buttons next to the selection instead of a bottom sheet", async () => {
    setMatchMedia(true);
    render(<SelectionToolbar workspaceId="ws_1" />);
    const toolbar = await select();
    expect(toolbar.className).not.toContain("bottom-0");
    expect(toolbar.className).toContain("rounded-xl");
    // Positioned by Floating UI (below the selection).
    await waitFor(() => expect(toolbar.style.top).not.toBe(""));
    // Comfortable touch targets stay.
    expect(screen.getByTestId("action-comment").className).toContain("min-h-[44px]");
  });

  it("on touch, opens the Comment form as a bottom sheet with no leftover coordinates", async () => {
    setMatchMedia(true);
    render(<SelectionToolbar workspaceId="ws_1" />);
    const toolbar = await select();
    await waitFor(() => expect(toolbar.style.top).not.toBe(""));
    act(() => {
      fireEvent.click(screen.getByTestId("action-comment"));
    });
    await waitFor(() => expect(toolbar.className).toContain("bottom-0"));
    expect(toolbar.style.top).toBe("");
    expect(toolbar.style.left).toBe("");
  });

  it("with a mouse, keeps the floating toolbar for the form as before", async () => {
    setMatchMedia(false);
    render(<SelectionToolbar workspaceId="ws_1" />);
    const toolbar = await select();
    act(() => {
      fireEvent.click(screen.getByTestId("action-comment"));
    });
    expect(toolbar.className).not.toContain("bottom-0");
  });
});
