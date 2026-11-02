import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceHome } from "@/components/home/workspace-home";
import { getHomeData } from "@/server/services/home";
import { db } from "@/server/db/client";
import { useUiStore } from "@/lib/stores/ui";
import QueryProvider, { createAppQueryClient } from "@/components/providers/query-provider";
import type { HomeData } from "@/lib/api/hooks/home";
import type { Actor } from "@/server/auth/session";
import enMessages from "../messages/en.json";

const mockPush = jest.fn();
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  usePathname: () => "/workspaces",
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

describe("Step 3.5 — Workspace Home (/workspaces)", () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    window.scrollTo = jest.fn();
  });

  beforeEach(() => {
    mockPush.mockClear();
    mockRefresh.mockClear();
    useUiStore.getState().resetTransientUi();
    useUiStore.getState().setOnboardingDismissed(false);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe("Server Service: getHomeData", () => {
    const mockActor: Actor = {
      userId: "user-123",
      role: "USER",
      sessionId: "sess-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
    };

    it("returns formatted recents with snippets, projects, credits, and onboarding", async () => {
      const now = new Date();

      jest.spyOn(db.user, "findUnique").mockResolvedValue({
        id: "user-123",
        name: "Ada Lovelace",
        email: "ada@example.com",
        emailVerified: true,
      } as any);

      jest.spyOn(db.workspace, "findMany")
        .mockResolvedValueOnce([
          {
            id: "ws-1",
            title: "Analytical Engine Design",
            projectId: "proj-1",
            project: { name: "Babbage Engines" },
            lastActivityAt: now,
            updatedAt: now,
            responses: [
              {
                prompt: "Explain the punch card mechanism",
                versions: [
                  {
                    content:
                      "The punch card mechanism weaves algebraical patterns just as the Jacquard loom weaves flowers and leaves.",
                  },
                ],
              },
            ],
          },
        ] as any)
        .mockResolvedValueOnce([
          {
            id: "ws-shared-1",
            title: "Difference Engine Collab",
            lastActivityAt: now,
            updatedAt: now,
            owner: { name: "Charles Babbage", email: "charles@example.com" },
          },
        ] as any);

      jest.spyOn(db.project, "findMany").mockResolvedValue([
        {
          id: "proj-1",
          name: "Babbage Engines",
          description: "Mechanical computing models",
          updatedAt: now,
          _count: { workspaces: 3, members: 2 },
        },
      ] as any);

      jest.spyOn(db.workspace, "count").mockResolvedValue(1);
      jest.spyOn(db.project, "count").mockResolvedValue(1);

      jest.spyOn(db.creditAccount, "findUnique").mockResolvedValue({
        id: "acc-1",
        userId: "user-123",
        planBalance: 100,
        topupBalance: 50,
      } as any);

      const data = await getHomeData(mockActor);

      expect(data.recent).toHaveLength(1);
      expect(data.recent[0]!.title).toBe("Analytical Engine Design");
      expect(data.recent[0]!.projectName).toBe("Babbage Engines");
      expect(data.recent[0]!.lastSnippet).toContain("The punch card mechanism weaves algebraical patterns");

      expect(data.projects).toHaveLength(1);
      expect(data.projects[0]!.name).toBe("Babbage Engines");
      expect(data.projects[0]!.workspacesCount).toBe(3);

      expect(data.sharedWithMe).toHaveLength(1);
      expect(data.sharedWithMe[0]!.ownerName).toBe("Charles Babbage");

      expect(data.credits.plan).toBe("Free");
      expect(data.credits.balance).toBe(150);

      expect(data.onboarding.emailVerified).toBe(true);
      expect(data.onboarding.usernameChosen).toBe(true);
      expect(data.onboarding.hasWorkspace).toBe(true);
      expect(data.onboarding.hasProject).toBe(true);
    });

    it("correctly identifies a brand new user with unverified email and default username", async () => {
      jest.spyOn(db.user, "findUnique").mockResolvedValue({
        id: "user-new",
        name: "newuser",
        email: "newuser@example.com",
        emailVerified: false,
      } as any);

      jest.spyOn(db.workspace, "findMany").mockResolvedValue([]);
      jest.spyOn(db.project, "findMany").mockResolvedValue([]);
      jest.spyOn(db.workspace, "count").mockResolvedValue(0);
      jest.spyOn(db.project, "count").mockResolvedValue(0);
      jest.spyOn(db.creditAccount, "findUnique").mockResolvedValue(null);

      const newActor: Actor = {
        userId: "user-new",
        role: "USER",
        sessionId: "sess-new",
        email: "newuser@example.com",
        name: "newuser",
      };

      const data = await getHomeData(newActor);
      expect(data.onboarding.emailVerified).toBe(false);
      expect(data.onboarding.usernameChosen).toBe(false);
      expect(data.onboarding.hasWorkspace).toBe(false);
      expect(data.onboarding.hasProject).toBe(false);
      expect(data.recent).toHaveLength(0);
      expect(data.projects).toHaveLength(0);
      expect(data.credits.balance).toBe(0);
    });
  });

  describe("Client Component: WorkspaceHome", () => {
    const populatedData: HomeData = {
      recent: [
        {
          id: "ws-rec-1",
          title: "Quantum Cryptography",
          projectId: "proj-1",
          projectName: "Security Research",
          lastActivityAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastSnippet: "Quantum key distribution guarantees information-theoretic security.",
        },
      ],
      projects: [
        {
          id: "proj-1",
          name: "Security Research",
          description: "Post-quantum algorithms",
          workspacesCount: 4,
          membersCount: 2,
          updatedAt: new Date().toISOString(),
        },
      ],
      sharedWithMe: [
        {
          id: "ws-shared-1",
          title: "Team Sync Notes",
          ownerName: "Sarah Connor",
          lastActivityAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      credits: {
        plan: "Free",
        balance: 300,
        resetsAt: new Date().toISOString(),
      },
      onboarding: {
        emailVerified: true,
        usernameChosen: true,
        hasWorkspace: true,
        hasProject: true,
      },
    };

    const brandNewData: HomeData = {
      recent: [],
      projects: [],
      sharedWithMe: [],
      credits: {
        plan: "Free",
        balance: 100,
        resetsAt: new Date().toISOString(),
      },
      onboarding: {
        emailVerified: false,
        usernameChosen: false,
        hasWorkspace: false,
        hasProject: false,
      },
    };

    function renderHome(initial: HomeData) {
      const queryClient = createAppQueryClient();
      return render(
        <QueryProvider userId="user-123" client={queryClient}>
          <WorkspaceHome
            userId="user-123"
            userName="Ada Lovelace"
            initialData={initial}
          />
        </QueryProvider>,
      );
    }

    it("renders active account home with recents, projects, shared with me, and credits", () => {
      renderHome(populatedData);

      // Greeting + Composer
      expect(screen.getByText(/Ada/i)).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/What would you like to explore, draft, or build today/i)
      ).toBeInTheDocument();

      // Recent Workspaces with Snippets
      expect(screen.getByText("Quantum Cryptography")).toBeInTheDocument();
      expect(screen.getAllByText("Security Research").length).toBeGreaterThanOrEqual(1);
      expect(
        screen.getByText(/Quantum key distribution guarantees information-theoretic security/i)
      ).toBeInTheDocument();

      // Starter Library tabs
      expect(screen.getByRole("button", { name: /Write/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Analyze/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Research/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Code/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Plan/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Learn/i })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /Create image/i }).length).toBeGreaterThanOrEqual(1);

      // Projects strip
      expect(screen.getByText("4 workspaces")).toBeInTheDocument();

      // Shared with me
      expect(screen.getByText("Team Sync Notes")).toBeInTheDocument();
      expect(screen.getByText(/Shared by Sarah Connor/i)).toBeInTheDocument();

      // Credits Card
      expect(screen.getByText("300")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Upgrade/i })).toBeInTheDocument();
    });

    it("renders brand-new account onboarding checklist and allows dismissing it", () => {
      renderHome(brandNewData);

      // Onboarding checklist is present
      expect(screen.getByText(/Welcome to Klecx — Quick Start/i)).toBeInTheDocument();
      expect(screen.getByText(/Verify your email address/i)).toBeInTheDocument();
      expect(screen.getByText(/Personalize your profile name/i)).toBeInTheDocument();
      expect(screen.getByText(/Run your first prompt or template/i)).toBeInTheDocument();
      expect(screen.getByText(/Create your first project/i)).toBeInTheDocument();

      // Dismiss onboarding
      const dismissBtn = screen.getByRole("button", { name: /Dismiss/i });
      fireEvent.click(dismissBtn);

      expect(useUiStore.getState().onboardingDismissed).toBe(true);
      expect(
        screen.queryByText(/Welcome to Klecx — Quick Start/i)
      ).not.toBeInTheDocument();
    });

    it("clicking a starter template prefills the composer with placeholders", async () => {
      renderHome(populatedData);

      const textarea = screen.getByPlaceholderText(
        /What would you like to explore, draft, or build today/i
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe("");

      // Find "Executive Summary" template and click "Use Template"
      const useBtns = screen.getAllByRole("button", { name: /Use Template/i });
      expect(useBtns.length).toBeGreaterThan(0);
      fireEvent.click(useBtns[0]!);

      await waitFor(() => {
        expect(textarea.value).toContain("{{notes}}");
        expect(textarea.value).toContain("executive summary");
      });
    });

    it("guarantees no AI model network call happens on page load", () => {
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      renderHome(populatedData);

      // Verify fetch was never invoked with an AI endpoint
      const aiCalls = fetchSpy.mock.calls.filter(([url]) =>
        typeof url === "string" && (url.includes("/api/chat") || url.includes("/ai"))
      );
      expect(aiCalls).toHaveLength(0);
    });
  });
});
