/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { RightPanel } from "@/components/annotations/right-panel";
import { ResponseCard } from "@/components/response/response-card";
import { useUiStore } from "@/lib/stores/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "ws_test_123" }),
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("Step 6.7 — Promotion UI & Response Card Display", () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const mockAnnotation = {
    id: "annot_reply_1",
    workspaceId: "ws_test_123",
    responseId: "resp_1",
    versionId: "ver_1",
    kind: "REPLY" as const,
    visibility: "WORKSPACE" as const,
    anchorExact: "Distributed consensus requires quorum agreement across nodes.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: { id: "user_1", name: "Alice", email: "alice@example.com" },
    messages: [
      {
        id: "msg_u1",
        role: "USER" as const,
        content: "How does quorum size affect write availability?",
        createdAt: new Date().toISOString(),
      },
      {
        id: "msg_a1",
        role: "ASSISTANT" as const,
        content: "A strict majority quorum (N/2 + 1) tolerates up to (N-1)/2 node failures.",
        createdAt: new Date().toISOString(),
      },
    ],
  };

  beforeEach(() => {
    useUiStore.setState({
      rightPanelOpen: true,
      rightPanelWidth: 360,
      rightPanelFocus: null,
    });

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

    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/annotations") && !url.includes("/promote")) {
        return {
          ok: true,
          json: async () => ({
            data: [mockAnnotation],
          }),
        } as Response;
      }

      if (url.includes("/promote")) {
        const body = JSON.parse(String(init?.body));
        if (body.target === "TIMELINE") {
          return {
            ok: true,
            json: async () => ({
              data: {
                id: "promo_1",
                annotationId: "annot_reply_1",
                messageId: "msg_a1",
                target: "TIMELINE",
                destinationResponseId: "resp_promoted_123",
                destinationWorkspaceId: "ws_test_123",
                alreadyPromoted: false,
              },
            }),
          } as Response;
        } else {
          return {
            ok: true,
            json: async () => ({
              data: {
                id: "promo_2",
                annotationId: "annot_reply_1",
                messageId: "msg_a1",
                target: "NEW_WORKSPACE",
                destinationResponseId: "resp_promoted_456",
                destinationWorkspaceId: "ws_branched_789",
                alreadyPromoted: false,
              },
            }),
          } as Response;
        }
      }

      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("1. Displays Add to workspace history and transforms to 'Added · View in timeline' chip on success", async () => {
    render(<RightPanel workspaceId="ws_test_123" activeResponseId="resp_1" />);

    await act(async () => {
      useUiStore.setState({
        rightPanelFocus: { responseId: "resp_1", tab: "replies" },
      });
    });

    const timelineBtn = await screen.findByTestId("btn-promote-timeline");
    expect(timelineBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(timelineBtn);
    });

    // Transforms into View in timeline chip
    const chip = await screen.findByTestId("chip-view-timeline");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent(/Added · View in timeline/i);
    expect(chip.getAttribute("href")).toBe("#response-resp_promoted_123");
  });

  it("2. Displays New workspace from this and transforms to 'Open workspace' chip on success", async () => {
    render(<RightPanel workspaceId="ws_test_123" activeResponseId="resp_1" />);

    await act(async () => {
      useUiStore.setState({
        rightPanelFocus: { responseId: "resp_1", tab: "replies" },
      });
    });

    const workspaceBtn = await screen.findByTestId("btn-promote-workspace");
    expect(workspaceBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(workspaceBtn);
    });

    // Transforms into Open workspace chip
    const chip = await screen.findByTestId("chip-open-workspace");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent(/Open workspace/i);
    expect(chip.getAttribute("href")).toBe("/workspace/ws_branched_789");
  });

  it("3. ResponseCard displays quote block and Promoted badge for promoted response", () => {
    const promotedResponse = {
      id: "resp_promoted_123",
      workspaceId: "ws_test_123",
      prompt: "How does quorum size affect write availability?",
      origin: "PROMOTED",
      quote: "Distributed consensus requires quorum agreement across nodes.",
      sourceAnnotationId: "annot_reply_1",
      activeVersion: {
        id: "ver_promo_1",
        number: 1,
        content: "A strict majority quorum tolerates node failures.",
      },
    };

    render(
      <QueryClientProvider client={queryClient}>
        <ResponseCard
          response={promotedResponse}
          workspaceId="ws_test_123"
          userId="user_1"
        />
      </QueryClientProvider>
    );

    // Verify quote block
    const quoteBlock = screen.getByTestId("promoted-quote");
    expect(quoteBlock).toBeInTheDocument();
    expect(quoteBlock).toHaveTextContent("Distributed consensus requires quorum agreement across nodes.");
    expect(screen.getByText("View annotation")).toBeInTheDocument();

    // Verify Promoted badge
    const badge = screen.getByTestId("promoted-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Promoted");
  });
});
