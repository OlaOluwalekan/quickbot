import React from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectView } from "@/components/project/project-view";
import type {
  PaginatedProjectWorkspaces,
  ProjectDto,
} from "@/lib/api/hooks/projects";
import enMessages from "../messages/en.json";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/projects/p1",
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// The Share & people dialog is not under test and pulls in the auth client.
jest.mock("@/components/workspace/ShareAndPeopleDialog", () => ({
  ShareAndPeopleDialog: () => null,
}));

const baseProject: ProjectDto = {
  id: "p1",
  name: "Analytical Engine",
  description: "Notes on the engine",
  ownerId: "owner",
  archivedAt: null,
  role: "VIEWER",
  capabilities: ["workspace.read"],
  owner: { id: "owner", name: "Ada" },
  members: [],
  _count: { workspaces: 0, members: 1 },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const empty: PaginatedProjectWorkspaces = { items: [], nextCursor: null };

function renderView(
  project: ProjectDto,
  workspaces: PaginatedProjectWorkspaces = empty
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale="en"
        messages={enMessages}
        timeZone="UTC"
        now={new Date("2026-01-03T00:00:00Z")}
      >
        <ProjectView
          project={project}
          initialWorkspaces={workspaces}
          currentUserId="me"
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe("Step F1.4 — ProjectView UI", () => {
  beforeAll(() => {
    // Any background refetch resolves to an empty page.
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify(empty)))
    ) as unknown as typeof fetch;
  });

  it("VIEWER sees the empty state with create shown disabled (gated), not hidden", () => {
    renderView(baseProject);

    expect(
      screen.getByText("No workspaces in this project yet")
    ).toBeInTheDocument();

    const createButtons = screen.getAllByRole("button", {
      name: "New workspace in this project",
    });
    expect(createButtons.length).toBeGreaterThan(0);
    for (const btn of createButtons) {
      expect(btn).toHaveAttribute("aria-disabled", "true");
      expect(btn.closest("[data-gated]")).toHaveAttribute(
        "data-gated",
        "no_permission"
      );
    }
    // No inline rename for a viewer.
    expect(
      screen.queryByRole("button", { name: "Rename project" })
    ).not.toBeInTheDocument();
  });

  it("EDITOR can create; populated state lists workspaces with translated counts", () => {
    renderView(
      {
        ...baseProject,
        role: "EDITOR",
        capabilities: ["workspace.read", "workspace.generate"],
      },
      {
        nextCursor: null,
        items: [
          {
            id: "w1",
            title: "Bernoulli Numbers",
            ownerId: "owner",
            projectId: "p1",
            archivedAt: null,
            lastActivityAt: "2026-01-02T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
            owner: { id: "owner", name: "Ada" },
            _count: { responses: 1 },
            capabilities: ["workspace.read", "workspace.generate"],
          },
        ],
      }
    );

    const create = screen.getByRole("button", {
      name: "New workspace in this project",
    });
    expect(create).not.toHaveAttribute("aria-disabled");

    expect(
      screen.getByRole("link", { name: "Bernoulli Numbers" })
    ).toHaveAttribute("href", "/workspaces/w1");
    expect(screen.getByText("1 response")).toBeInTheDocument();
    expect(screen.getByText(/1 day ago|yesterday/)).toBeInTheDocument();
  });
});
