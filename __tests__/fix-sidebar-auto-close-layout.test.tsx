/**
 * @jest-environment jsdom
 *
 * Auto-closing sidebar × column layout: the decision must not depend on the
 * sidebar's own width, or collapsing it flips the decision back (loop:
 * "Maximum update depth exceeded").
 */

import React from "react";
import { render, act } from "@testing-library/react";
import { ThreadStackLayout } from "@/components/threads/thread-stack-layout";
import { useThreadStackStore } from "@/lib/stores/thread-stack";
import { useUiStore } from "@/lib/stores/ui";
import { useSidebarAutoStore } from "@/lib/stores/sidebar-auto";
import { resolveSidebar } from "@/lib/layout/sidebar-auto";

jest.mock("next-intl", () => ({
  useFormatter: () => ({ relativeTime: () => "" }),
  useNow: () => new Date(),
  useTranslations: () => (key: string) => key,
}));
jest.mock("next/navigation", () => ({
  usePathname: () => "/workspaces/ws_1",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "ws_1" }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));
// Columns stay "loading": only the layout matters here.
jest.mock("../lib/api/client", () => ({ api: jest.fn(() => new Promise(() => {})) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("../components/markdown", () => ({
  Markdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

const VIEWPORT = 1440;

/** The content area as a browser lays it out: viewport minus the sidebar. */
function sidebarPx(): number {
  const { collapsed } = resolveSidebar({
    userCollapsed: useUiStore.getState().sidebarCollapsed,
    columnsNeedRoom: useSidebarAutoStore.getState().columnsNeedRoom,
    pinnedOpen: useSidebarAutoStore.getState().pinnedOpen,
  });
  return collapsed ? 64 : 280;
}

const observers = new Set<ResizeObserverCallback>();
let layoutPasses = 0;

beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    const left = sidebarPx();
    return { x: left, y: 0, left, top: 0, right: VIEWPORT, bottom: 900, width: VIEWPORT - left, height: 900, toJSON() {} } as DOMRect;
  };
  global.ResizeObserver = class {
    cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe() {
      observers.add(this.cb);
    }
    unobserve() {}
    disconnect() {
      observers.delete(this.cb);
    }
  } as unknown as typeof ResizeObserver;
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;

  // Whenever the sidebar changes width, the browser re-lays out the content
  // and the ResizeObserver fires with the new width.
  let last = sidebarPx();
  const relayout = () => {
    const now = sidebarPx();
    if (now === last) return;
    last = now;
    layoutPasses++;
    if (layoutPasses > 50) throw new Error("layout keeps flipping");
    const width = VIEWPORT - now;
    for (const cb of observers) {
      cb([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
    }
  };
  useSidebarAutoStore.subscribe(relayout);
  useUiStore.subscribe(relayout);
});

beforeEach(() => {
  layoutPasses = 0;
  useUiStore.setState({ sidebarCollapsed: false });
  useSidebarAutoStore.setState({ columnsNeedRoom: false, pinnedOpen: false });
  useThreadStackStore.setState({ stack: [], quotes: {} });
});

it("collapses once for two columns on a 1440 px screen, and stays collapsed", () => {
  render(
    <ThreadStackLayout workspaceId="ws_1">
      <div>main</div>
    </ThreadStackLayout>
  );
  act(() => {
    useThreadStackStore.setState({
      stack: [
        { kind: "annotation", id: "a1" },
        { kind: "annotation", id: "a2" },
      ],
    });
  });
  expect(useSidebarAutoStore.getState().columnsNeedRoom).toBe(true);
  expect(layoutPasses).toBe(1);
});

it("keeps the sidebar for one column, and gives it back when the columns close", () => {
  render(
    <ThreadStackLayout workspaceId="ws_1">
      <div>main</div>
    </ThreadStackLayout>
  );
  act(() => useThreadStackStore.setState({ stack: [{ kind: "annotation", id: "a1" }] }));
  expect(useSidebarAutoStore.getState().columnsNeedRoom).toBe(false);

  act(() =>
    useThreadStackStore.setState({
      stack: [
        { kind: "annotation", id: "a1" },
        { kind: "annotation", id: "a2" },
      ],
    })
  );
  expect(useSidebarAutoStore.getState().columnsNeedRoom).toBe(true);

  act(() => useThreadStackStore.setState({ stack: [] }));
  expect(useSidebarAutoStore.getState().columnsNeedRoom).toBe(false);
});
