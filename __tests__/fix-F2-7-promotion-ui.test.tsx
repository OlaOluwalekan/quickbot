/**
 * @jest-environment jsdom
 *
 * F2.7 — Promotion & provenance UI across any depth (ThreadColumn L1/L2/L3,
 * project target picker, ResponseCard collapsible ancestor chain, Source removed,
 * and WorkspaceView header provenance banner).
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResponseCard } from "@/components/response/response-card";
import { WorkspaceView } from "@/components/workspace/workspace-view";
import { ThreadColumn } from "@/components/threads/thread-column";
import { api } from "@/lib/api/client";
import { useThreadStackStore } from "@/lib/stores/thread-stack";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "ws_1" }),
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/workspaces/ws_1",
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("next-intl", () => ({
  useFormatter: () => ({ relativeTime: () => "" }),
  useNow: () => new Date(),
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values?.title
        ? `${key}:${values.title}`
        : values?.level
          ? `${key}:${values.level}`
          : key;
    // Rich text: render the <link> chunk with the title inside.
    t.rich = (
      key: string,
      values: {
        title?: string;
        link?: (chunks: React.ReactNode) => React.ReactNode;
      }
    ) => (
      <>
        {key} {values.link ? values.link(values.title) : values.title}
      </>
    );
    return t;
  },
}));

jest.mock("../components/ui/gated", () => ({
  Gated: ({
    reason,
    children,
  }: {
    reason: { code: string } | null;
    children: React.ReactElement;
  }) => (reason ? <span data-testid={`gated-${reason.code}`}>{children}</span> : children),
}));

jest.mock("../lib/api/client", () => ({ api: jest.fn() }));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("../components/markdown", () => ({
  Markdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

jest.mock("../components/workspace/composer", () => ({
  Composer: () => <div data-testid="mock-composer" />,
}));

jest.mock("../components/annotations/selection-toolbar", () => ({
  SelectionToolbar: () => null,
}));

jest.mock("../components/threads/thread-stack-layout", () => ({
  ThreadStackLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const mockOpenAnnotationThread = jest.fn((_id: string) => Promise.resolve());
jest.mock("../lib/stores/thread-stack", () => {
  const actual = jest.requireActual("../lib/stores/thread-stack");
  return {
    ...actual,
    openAnnotationThread: (id: string) => mockOpenAnnotationThread(id),
  };
});

const apiMock = api as jest.Mock;

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("F2.7 — Promotion & provenance UI", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiMock.mockResolvedValue({ items: [], versions: [] });
    useThreadStackStore.setState({ stack: [], quotes: {} });
  });

  it("shows collapsible multi-level L3 chain and depth badge on promoted ResponseCard", () => {
    renderWithQuery(
      <ResponseCard
        workspaceId="ws_1"
        userId="user_1"
        response={{
          id: "resp_l3",
          workspaceId: "ws_1",
          prompt: "Does term increment on every node?",
          origin: "PROMOTED",
          quote: "a new term starts",
          sourceAnnotationId: "l3_id",
          sourceWorkspaceId: "ws_1",
          sourceAccessible: true,
          sourceRemoved: false,
          sourceChain: [
            { id: "l1_id", quote: "randomized election timeouts", depth: 0 },
            { id: "l2_id", quote: "split votes", depth: 1 },
            { id: "l3_id", quote: "a new term starts", depth: 2 },
          ],
          content: "Only voters advancing to candidate increment currentTerm.",
        }}
      />
    );

    expect(screen.getByTestId("promoted-badge")).toHaveTextContent("promoted.badge");
    expect(screen.getByTestId("promoted-depth-badge")).toHaveTextContent("promoted.level:3");
    expect(screen.getByTestId("promoted-quote")).toHaveTextContent(
      "a new term starts"
    );

    // Chain starts collapsed
    expect(screen.queryByTestId("promoted-chain")).toBeNull();

    // Expand collapsible "From a side question"
    fireEvent.click(screen.getByTestId("promoted-chain-toggle"));
    const chain = screen.getByTestId("promoted-chain");
    expect(chain).toHaveTextContent("randomized election timeouts");
    expect(chain).toHaveTextContent("split votes");
    expect(chain).toHaveTextContent("a new term starts");

    // Clicking "View annotation" opens the thread stack
    fireEvent.click(screen.getByRole("button", { name: "promoted.viewAnnotation" }));
    expect(mockOpenAnnotationThread).toHaveBeenCalledWith("l3_id");
  });

  it("shows Source removed instead of View annotation when source was deleted", () => {
    renderWithQuery(
      <ResponseCard
        workspaceId="ws_new"
        userId="user_1"
        response={{
          id: "resp_removed",
          workspaceId: "ws_new",
          prompt: "Why?",
          origin: "PROMOTED",
          quote: "deleted source passage",
          sourceAnnotationId: "l1_gone",
          sourceWorkspaceId: "ws_src",
          sourceAccessible: false,
          sourceRemoved: true,
          sourceChain: null,
          content: "Promoted answer still intact.",
        }}
      />
    );

    expect(screen.getByTestId("source-removed-badge")).toHaveTextContent(
      "promoted.sourceRemoved"
    );
    expect(screen.queryByText("promoted.viewAnnotation")).toBeNull();
    expect(screen.getByTestId("promoted-quote")).toHaveTextContent(
      "deleted source passage"
    );
  });

  it("renders accessible, inaccessible, and source-removed provenance banners in WorkspaceView", () => {
    const actor = {
      userId: "user_1",
      sessionId: "s1",
      email: "u@example.com",
      role: "USER" as const,
    };

    const { rerender } = renderWithQuery(
      <WorkspaceView
        actor={actor}
        workspace={{
          id: "ws_dest",
          title: "Destination",
          createdBy: "user_1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sourceProvenance: {
            canAccess: true,
            removed: false,
            sourceWorkspaceId: "ws_origin",
            sourceWorkspaceTitle: "Original Research",
            sourceAnnotationId: "l2_id",
            threadParam: "l1_id,l2_id",
            annotationRemoved: false,
          },
        }}
      />
    );

    const link = screen.getByTestId("workspace-provenance-link");
    expect(link).toHaveAttribute(
      "href",
      "/workspaces/ws_origin?thread=l1_id,l2_id"
    );
    expect(link).toHaveTextContent("Original Research");

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <WorkspaceView
          actor={actor}
          workspace={{
            id: "ws_dest",
            title: "Destination",
            createdBy: "user_1",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceProvenance: {
              canAccess: false,
              removed: false,
            },
          }}
        />
      </QueryClientProvider>
    );

    expect(screen.getByTestId("workspace-provenance-inaccessible")).toHaveTextContent(
      "provenance.sourceInaccessible"
    );
    expect(screen.queryByTestId("workspace-provenance-link")).toBeNull();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <WorkspaceView
          actor={actor}
          workspace={{
            id: "ws_dest",
            title: "Destination",
            createdBy: "user_1",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceProvenance: {
              canAccess: false,
              removed: true,
            },
          }}
        />
      </QueryClientProvider>
    );

    expect(screen.getByTestId("workspace-provenance-removed")).toHaveTextContent(
      "provenance.sourceRemoved"
    );
  });

  it("promotes L2 Ask answer from ThreadColumn to timeline and new workspace in chosen project", async () => {
    const l2Annotation = {
      id: "l2_id",
      workspaceId: "ws_1",
      kind: "ASK",
      depth: 1,
      anchorExact: "split votes",
      visibility: "WORKSPACE",
      questionState: "ANSWERED",
      createdById: "user_1",
      messages: [
        {
          id: "m_u1",
          role: "USER",
          content: "What happens during a split vote?",
          createdAt: new Date().toISOString(),
        },
        {
          id: "m_a1",
          role: "ASSISTANT",
          content: "A new election starts after timeout.",
          status: "COMPLETE",
          createdAt: new Date().toISOString(),
        },
      ],
      promotions: [],
    };

    apiMock.mockImplementation(async (url: string, opts?: { method?: string; json?: unknown }) => {
      if (url === "/api/v1/annotations/l2_id/chain") {
        return [
          { ...l2Annotation, id: "l1_id", depth: 0, anchorExact: "election" },
          l2Annotation,
        ];
      }
      if (url === "/api/v1/annotations/l2_id/promote" && opts?.method === "POST") {
        const payload = opts.json as { messageId: string; target: string; projectId?: string };
        if (payload.target === "TIMELINE") {
          return {
            id: "promo_tl",
            annotationId: "l2_id",
            messageId: payload.messageId,
            target: "TIMELINE",
            destinationResponseId: "resp_promoted_tl",
            destinationWorkspaceId: "ws_1",
          };
        }
        return {
          id: "promo_ws",
          annotationId: "l2_id",
          messageId: payload.messageId,
          target: "NEW_WORKSPACE",
          destinationResponseId: "resp_promoted_ws",
          destinationWorkspaceId: "ws_target_new",
          destinationWorkspaceTitle: "What happens during a split vote?",
          destinationAccessible: true,
          destinationRemoved: false,
        };
      }
      if (url.startsWith("/api/v1/projects")) {
        return {
          items: [
            { id: "proj_same", name: "Same Project" },
            { id: "proj_other", name: "Other Project" },
          ],
        };
      }
      return [];
    });

    render(
      <ThreadColumn
        id="l2_id"
        index={2}
        width={420}
        workspaceId="ws_1"
        currentUserId="user_1"
        onBack={jest.fn()}
        onCloseAll={jest.fn()}
        onNavigate={jest.fn()}
      />
    );

    const tlBtn = await screen.findByTestId("btn-promote-timeline-m_a1");
    fireEvent.click(tlBtn);

    await waitFor(() => {
      expect(screen.getByTestId("chip-view-timeline-m_a1")).toHaveAttribute(
        "href",
        "#response-resp_promoted_tl"
      );
    });

    const wsBtn = screen.getByTestId("btn-promote-workspace-m_a1");
    fireEvent.click(wsBtn);

    const otherProjBtn = await screen.findByTestId("promote-project-proj_other");
    fireEvent.click(otherProjBtn);

    await waitFor(() => {
      expect(screen.getByTestId("chip-open-workspace-m_a1")).toHaveAttribute(
        "href",
        "/workspaces/ws_target_new"
      );
    });
  });

  it("disables Add to timeline with a reason for members who can't generate", async () => {
    const annotation = {
      id: "l1_id",
      workspaceId: "ws_1",
      kind: "ASK",
      depth: 0,
      anchorExact: "election",
      visibility: "WORKSPACE",
      questionState: "ANSWERED",
      createdById: "user_2",
      messages: [
        { id: "m_u1", role: "USER", content: "Why?", createdAt: new Date().toISOString() },
        {
          id: "m_a1",
          role: "ASSISTANT",
          content: "Because of timeouts.",
          status: "COMPLETE",
          createdAt: new Date().toISOString(),
        },
      ],
      promotions: [],
    };
    apiMock.mockImplementation(async (url: string) =>
      url === "/api/v1/annotations/l1_id/chain" ? [annotation] : []
    );

    render(
      <ThreadColumn
        id="l1_id"
        index={1}
        width={420}
        workspaceId="ws_1"
        currentUserId="user_1"
        canPromoteToTimeline={false}
        onBack={jest.fn()}
        onCloseAll={jest.fn()}
        onNavigate={jest.fn()}
      />
    );

    const tlBtn = await screen.findByTestId("btn-promote-timeline-m_a1");
    expect(screen.getByTestId("gated-no_permission")).toContainElement(tlBtn);
    // Starting a new workspace only needs read access to the source.
    expect(screen.getByTestId("btn-promote-workspace-m_a1")).toBeInTheDocument();
  });
});
