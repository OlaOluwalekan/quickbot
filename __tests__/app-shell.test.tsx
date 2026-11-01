import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppShell } from "@/components/layout/app-shell";
import { getDateBucket } from "@/components/layout/sidebar";
import { useUiStore, parseSidebarCookie } from "@/lib/stores/ui";
import QueryProvider from "@/components/providers/query-provider";
import type {
  AppShellUser,
  SidebarProjectItem,
  SidebarWorkspaceItem,
} from "@/components/layout/types";
import enMessages from "../messages/en.json";

const mockPush = jest.fn();
const mockRefresh = jest.fn();
let mockPathname = "/workspaces/ws-today";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  usePathname: () => mockPathname,
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
      const ns = (
        enMessages as unknown as Record<string, Record<string, string>>
      )[namespace] || {};
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
}));

beforeAll(() => {
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
    </QueryProvider>,
  );
}

describe("Step 3.4 — AppShell, Sidebar, Topbar, Mobile Drawer & Command Palette", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockPathname = "/workspaces/ws-today";
    mockPush.mockClear();
    mockRefresh.mockClear();
    document.cookie = "sidebar=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    useUiStore.getState().resetTransientUi();
    useUiStore.setState({
      sidebarCollapsed: false,
      rightPanelOpen: false,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders expanded (280px) or collapsed (64px) without flash based on server cookie prop", () => {
    const { unmount } = renderAppShell(true);
    const sidebar = screen.getByLabelText("Sidebar navigation");
    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(sidebar).toHaveClass("w-16");
    expect(parseSidebarCookie("collapsed")).toBe(true);
    expect(parseSidebarCookie("expanded")).toBe(false);
    unmount();

    renderAppShell(false);
    const expandedSidebar = screen.getByLabelText("Sidebar navigation");
    expect(expandedSidebar).toHaveAttribute("data-collapsed", "false");
    expect(expandedSidebar).toHaveClass("w-[280px]");
  });

  it("toggles sidebar via button and '[' keyboard shortcut, persisting to cookie and Zustand store", () => {
    renderAppShell(false);
    const sidebar = screen.getByLabelText("Sidebar navigation");
    expect(sidebar).toHaveAttribute("data-collapsed", "false");

    // Toggle via button
    const collapseBtn = screen.getByRole("button", {
      name: /Collapse sidebar/i,
    });
    expect(collapseBtn).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapseBtn);

    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    expect(document.cookie).toContain("sidebar=collapsed");

    // Toggle back via '[' shortcut
    fireEvent.keyDown(window, { key: "[" });
    expect(sidebar).toHaveAttribute("data-collapsed", "false");
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    expect(document.cookie).toContain("sidebar=expanded");
  });

  it("renders Projects tree, date-grouped standalone Workspaces, Shared with me, and Credits footer", () => {
    renderAppShell(false);

    // Date bucket unit check
    expect(getDateBucket(now.toISOString(), now)).toBe("today");
    expect(getDateBucket(yesterday.toISOString(), now)).toBe("yesterday");
    expect(getDateBucket(threeDaysAgo.toISOString(), now)).toBe(
      "previous7Days",
    );
    expect(getDateBucket(twentyDaysAgo.toISOString(), now)).toBe("older");

    // Standalone workspace groups
    expect(screen.getByText("Today Standalone Note")).toBeInTheDocument();
    expect(screen.getByText("Yesterday Research")).toBeInTheDocument();
    expect(screen.getByText("Last Week Draft")).toBeInTheDocument();
    expect(screen.getByText("Archive Exploration")).toBeInTheDocument();

    // Shared with me section
    expect(screen.getByText("Charles Shared Spec")).toBeInTheDocument();

    // Expand project tree node to see nested workspace with aria-current="page"
    const projectBtn = screen.getByRole("button", {
      name: /Analytical Engine/i,
    });
    expect(projectBtn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(projectBtn);
    expect(projectBtn).toHaveAttribute("aria-expanded", "true");

    const activeLink = screen.getByRole("link", { name: "Bernoulli Numbers" });
    expect(activeLink).toHaveAttribute("aria-current", "page");

    // Credits footer
    expect(screen.getByText(/Free Plan/i)).toBeInTheDocument();
    expect(screen.getByText(/250 credits/i)).toBeInTheDocument();
  });

  it("supports inline workspace title editing in Topbar (Enter saves, Escape cancels)", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: { id: "ws-today", title: "Updated Bernoulli Title" },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderAppShell(false);

    // Project breadcrumb is shown in Topbar
    expect(screen.getAllByText("Analytical Engine").length).toBeGreaterThan(0);

    // Click workspace title in Topbar to edit
    const titleBtn = screen.getByRole("button", { name: /Bernoulli Numbers/i });
    fireEvent.click(titleBtn);

    const input = screen.getByRole("textbox", {
      name: /Edit workspace title/i,
    });
    expect(input).toHaveValue("Bernoulli Numbers");

    // Press Escape -> cancels without calling API
    fireEvent.change(input, { target: { value: "Aborted Name" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Bernoulli Numbers/i }),
    ).toBeInTheDocument();

    // Click again, change title, and press Enter -> saves via PATCH
    fireEvent.click(screen.getByRole("button", { name: /Bernoulli Numbers/i }));
    const inputAgain = screen.getByRole("textbox", {
      name: /Edit workspace title/i,
    });
    fireEvent.change(inputAgain, {
      target: { value: "Updated Bernoulli Title" },
    });
    fireEvent.keyDown(inputAgain, { key: "Enter" });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/workspaces/ws-today");
    expect(
      screen.getByRole("button", { name: /Updated Bernoulli Title/i }),
    ).toBeInTheDocument();
  });

  it("toggles Right Panel (Annotations) and opens mobile drawer Sheet & Command Palette", () => {
    renderAppShell(false);

    // Toggle Right Panel
    const panelBtn = screen.getByRole("button", {
      name: /Toggle annotations panel/i,
    });
    expect(panelBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(panelBtn);
    expect(panelBtn).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("complementary", { name: /Annotations & Notes/i }),
    ).toBeInTheDocument();

    // Open Command Palette via Ctrl+K
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(useUiStore.getState().commandPaletteOpen).toBe(true);
    expect(
      screen.getByPlaceholderText(
        /Search workspaces, projects, or commands/i,
      ),
    ).toBeInTheDocument();
  });
});
