import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AppShell } from "@/components/layout/app-shell";
import { useUiStore } from "@/lib/stores/ui";
import { useSidebarAutoStore } from "@/lib/stores/sidebar-auto";
import {
  columnsNeedSidebarRoom,
  resolveSidebar,
  toggleSidebar,
} from "@/lib/layout/sidebar-auto";
import QueryProvider from "@/components/providers/query-provider";
import type {
  AppShellUser,
  SidebarProjectItem,
  SidebarWorkspaceItem,
} from "@/components/layout/types";
import enMessages from "../messages/en.json";

const mockPush = jest.fn();
const mockRefresh = jest.fn();
const mockPathname = "/workspaces/ws-today";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  usePathname: () => mockPathname,
  useParams: () => ({ id: "ws-today" }),
}));

jest.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    signOut: jest.fn(),
  }),
}));

jest.mock("better-auth/client/plugins", () => ({
  inferAdditionalFields: () => ({}),
}));

jest.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    resolvedTheme: "light",
    setTheme: jest.fn(),
  }),
}));

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    return (key: string, values?: Record<string, unknown>) => {
      const ns =
        (enMessages as unknown as Record<string, Record<string, string>>)[
          namespace
        ] || {};
      let template = ns[key] || key;
      if (values) {
        Object.entries(values).forEach(([k, v]) => {
          template = template.replace(`{${k}}`, String(v));
        });
      }
      return template;
    };
  },
  useLocale: () => "en",
  useFormatter: () => ({
    dateTime: (date: Date) => date.toISOString().slice(0, 10),
  }),
}));

beforeAll(() => {
  // jsdom has no PointerEvent: without it `pointerType` (mouse vs touch) is lost.
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
  if (typeof global.ResizeObserver === "undefined") {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof Element.prototype.scrollIntoView === "undefined") {
    Element.prototype.scrollIntoView = jest.fn();
  }
});

const mockUser: AppShellUser = {
  id: "user-1",
  name: "Ada Lovelace",
  email: "ada@klecx.com",
  image: null,
  planName: "Free",
  creditBalance: 250,
};

const now = new Date();
const yesterday = new Date(now);
yesterday.setDate(yesterday.getDate() - 1);
const threeDaysAgo = new Date(now);
threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
const twentyDaysAgo = new Date(now);
twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

const mockProjects: SidebarProjectItem[] = [
  {
    id: "proj-1",
    name: "Analytical Engine",
    description: "Babbage notes",
    updatedAt: now.toISOString(),
  },
];

const mockWorkspaces: SidebarWorkspaceItem[] = [
  {
    id: "ws-today",
    title: "Bernoulli Numbers",
    ownerId: "user-1",
    projectId: "proj-1",
    projectName: "Analytical Engine",
    updatedAt: now.toISOString(),
  },
  {
    id: "ws-standalone-today",
    title: "Today Standalone Note",
    ownerId: "user-1",
    projectId: null,
    updatedAt: now.toISOString(),
  },
  {
    id: "ws-yesterday",
    title: "Yesterday Research",
    ownerId: "user-1",
    projectId: null,
    updatedAt: yesterday.toISOString(),
  },
  {
    id: "ws-prev7",
    title: "Last Week Draft",
    ownerId: "user-1",
    projectId: null,
    updatedAt: threeDaysAgo.toISOString(),
  },
  {
    id: "ws-older",
    title: "Archive Exploration",
    ownerId: "user-1",
    projectId: null,
    updatedAt: twentyDaysAgo.toISOString(),
  },
  {
    id: "ws-shared",
    title: "Charles Shared Spec",
    ownerId: "user-2",
    projectId: null,
    updatedAt: now.toISOString(),
  },
];

function renderAppShell(initialCollapsed = false) {
  return render(
    <QueryProvider userId={mockUser.id}>
      <AppShell
        user={mockUser}
        initialSidebarCollapsed={initialCollapsed}
        initialProjects={mockProjects}
        initialWorkspaces={mockWorkspaces}
      >
        <div data-testid="workspace-canvas">Main Workspace Content</div>
      </AppShell>
    </QueryProvider>
  );
}


const mins = { mainMin: 480, colMin: 420 };

describe("Auto-closing sidebar — rules", () => {
  it("needs the room only when the open columns don't fit beside the expanded sidebar", () => {
    expect(columnsNeedSidebarRoom(1160, 0, mins)).toBe(false); // no columns
    expect(columnsNeedSidebarRoom(1160, 1, mins)).toBe(false); // 1440 px laptop, one column fits
    expect(columnsNeedSidebarRoom(1160, 2, mins)).toBe(true); // two don't (480 + 2 × 420)
    expect(columnsNeedSidebarRoom(2280, 2, mins)).toBe(false); // very wide screen keeps it
    // Deeper stacks collapse into spines: count at most two columns.
    expect(columnsNeedSidebarRoom(1400, 6, mins)).toBe(false);
  });

  it("collapses by itself only when the person hasn't chosen otherwise", () => {
    expect(resolveSidebar({ userCollapsed: false, columnsNeedRoom: true, pinnedOpen: false })).toEqual({
      collapsed: true,
      auto: true,
    });
    expect(resolveSidebar({ userCollapsed: false, columnsNeedRoom: true, pinnedOpen: true })).toEqual({
      collapsed: false,
      auto: false,
    });
    // The person's own collapse is not "auto": no hover overlay for it.
    expect(resolveSidebar({ userCollapsed: true, columnsNeedRoom: true, pinnedOpen: false })).toEqual({
      collapsed: true,
      auto: false,
    });
    // Columns closed: back to the person's choice.
    expect(resolveSidebar({ userCollapsed: false, columnsNeedRoom: false, pinnedOpen: false }).collapsed).toBe(false);
  });

  it("the toggle keeps it open (pinned while columns need the room), and collapsing unpins", () => {
    expect(toggleSidebar({ userCollapsed: false, columnsNeedRoom: true, pinnedOpen: false })).toEqual({
      userCollapsed: false,
      pinnedOpen: true,
    });
    // Collapsed by the person while columns are open: opening it pins it too,
    // or it would collapse again at once.
    expect(toggleSidebar({ userCollapsed: true, columnsNeedRoom: true, pinnedOpen: false })).toEqual({
      userCollapsed: false,
      pinnedOpen: true,
    });
    expect(toggleSidebar({ userCollapsed: false, columnsNeedRoom: true, pinnedOpen: true })).toEqual({
      userCollapsed: true,
      pinnedOpen: false,
    });
    // No columns: just the person's choice, no pin.
    expect(toggleSidebar({ userCollapsed: true, columnsNeedRoom: false, pinnedOpen: false })).toEqual({
      userCollapsed: false,
      pinnedOpen: false,
    });
  });
});

describe("Auto-closing sidebar — app shell", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.cookie = "sidebar=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    sessionStorage.setItem("klecx_username_prompted", "true");
    localStorage.removeItem("klecx-sidebar-pinned");
    useUiStore.getState().resetTransientUi();
    useUiStore.setState({ sidebarCollapsed: false, rightPanelOpen: false });
    useSidebarAutoStore.setState({ columnsNeedRoom: false, pinnedOpen: false });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const sidebar = () => screen.getAllByLabelText("Sidebar navigation")[0]!;
  const rail = () => sidebar().parentElement!;
  const hover = (el: Element, pointerType = "mouse") =>
    fireEvent.pointerOver(el, { pointerType });

  it("collapses to the rail while columns need the room, and comes back after", () => {
    renderAppShell(false);
    expect(sidebar()).toHaveAttribute("data-collapsed", "false");

    act(() => useSidebarAutoStore.getState().setColumnsNeedRoom(true));
    expect(sidebar()).toHaveAttribute("data-collapsed", "true");
    expect(rail()).toHaveAttribute("data-sidebar-auto", "true");

    act(() => useSidebarAutoStore.getState().setColumnsNeedRoom(false));
    expect(sidebar()).toHaveAttribute("data-collapsed", "false");
    // The person's cookie was not touched.
    expect(document.cookie).not.toContain("sidebar=collapsed");
  });

  it("opens as an overlay after a short hover, not on a quick pass, and closes when the pointer leaves", () => {
    renderAppShell(false);
    act(() => useSidebarAutoStore.getState().setColumnsNeedRoom(true));

    // A quick pass doesn't open it.
    hover(rail());
    act(() => jest.advanceTimersByTime(100));
    fireEvent.pointerOut(rail(), { pointerType: "mouse" });
    act(() => jest.advanceTimersByTime(500));
    expect(screen.queryByTestId("sidebar-overlay")).toBeNull();

    hover(rail());
    act(() => jest.advanceTimersByTime(300));
    const overlay = screen.getByTestId("sidebar-overlay");
    expect(overlay.querySelector('[data-collapsed="false"]')).not.toBeNull();
    // The page keeps the rail: the overlay doesn't push the columns.
    expect(rail()).toHaveAttribute("data-sidebar-auto", "true");

    fireEvent.pointerOut(overlay, { pointerType: "mouse" });
    act(() => jest.advanceTimersByTime(300));
    expect(screen.queryByTestId("sidebar-overlay")).toBeNull();
  });

  it("doesn't open on touch, and Escape closes it", () => {
    renderAppShell(false);
    act(() => useSidebarAutoStore.getState().setColumnsNeedRoom(true));

    hover(rail(), "touch");
    act(() => jest.advanceTimersByTime(500));
    expect(screen.queryByTestId("sidebar-overlay")).toBeNull();

    hover(rail());
    act(() => jest.advanceTimersByTime(300));
    expect(screen.getByTestId("sidebar-overlay")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("sidebar-overlay")).toBeNull();
  });

  it("the toggle in the overlay pins it open, remembered, until the person collapses it", () => {
    renderAppShell(false);
    act(() => useSidebarAutoStore.getState().setColumnsNeedRoom(true));
    hover(rail());
    act(() => jest.advanceTimersByTime(300));

    fireEvent.click(
      screen.getByTestId("sidebar-overlay").querySelector('button[aria-label="Keep sidebar open"]')!
    );
    expect(screen.queryByTestId("sidebar-overlay")).toBeNull();
    expect(sidebar()).toHaveAttribute("data-collapsed", "false");
    expect(localStorage.getItem("klecx-sidebar-pinned")).toBe("1");

    // Collapsing it by hand unpins it.
    fireEvent.click(screen.getAllByRole("button", { name: /Collapse sidebar/i })[0]!);
    expect(sidebar()).toHaveAttribute("data-collapsed", "true");
    expect(localStorage.getItem("klecx-sidebar-pinned")).toBeNull();
  });

  it("opens from the keyboard, moves focus into it, and Escape returns to the rail", () => {
    renderAppShell(false);
    act(() => useSidebarAutoStore.getState().setColumnsNeedRoom(true));

    const firstInRail = rail().querySelector<HTMLElement>("a, button")!;
    act(() => firstInRail.focus());
    act(() => jest.advanceTimersByTime(50));
    const overlay = screen.getByTestId("sidebar-overlay");
    expect(overlay.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("sidebar-overlay")).toBeNull();
    expect(rail().contains(document.activeElement)).toBe(true);
  });

  it("stays open while one of its menus is open", () => {
    renderAppShell(false);
    act(() => useSidebarAutoStore.getState().setColumnsNeedRoom(true));
    hover(rail());
    act(() => jest.advanceTimersByTime(300));
    const overlay = screen.getByTestId("sidebar-overlay");
    const menuTrigger = overlay.querySelector('[aria-haspopup="menu"]')!;
    menuTrigger.setAttribute("aria-expanded", "true");

    fireEvent.pointerOut(overlay, { pointerType: "mouse" });
    act(() => jest.advanceTimersByTime(300));
    expect(screen.getByTestId("sidebar-overlay")).toBeInTheDocument();
  });

  it("also opens as an overlay when the person collapsed it themselves", () => {
    renderAppShell(true);
    expect(sidebar()).toHaveAttribute("data-collapsed", "true");
    // Not an automatic collapse.
    expect(rail()).not.toHaveAttribute("data-sidebar-auto");

    hover(rail());
    act(() => jest.advanceTimersByTime(300));
    const overlay = screen.getByTestId("sidebar-overlay");

    // "Keep sidebar open" expands it for good; no columns, so no pin.
    fireEvent.click(overlay.querySelector('button[aria-label="Keep sidebar open"]')!);
    expect(screen.queryByTestId("sidebar-overlay")).toBeNull();
    expect(sidebar()).toHaveAttribute("data-collapsed", "false");
    expect(document.cookie).toContain("sidebar=expanded");
    expect(localStorage.getItem("klecx-sidebar-pinned")).toBeNull();
  });
});
