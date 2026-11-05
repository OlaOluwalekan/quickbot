/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RightPanel } from "@/components/annotations/right-panel";
import { useUiStore } from "@/lib/stores/ui";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "ws_test_123" }),
}));

describe("Step 6.4 — RightPanel UI Component", () => {
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

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/annotations")) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "annot_1",
                workspaceId: "ws_test_123",
                responseId: "resp_1",
                versionId: "ver_1",
                kind: "COMMENT",
                visibility: "WORKSPACE",
                anchorExact: "Distributed systems need consensus protocols.",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: { id: "user_1", name: "Alice", email: "alice@example.com" },
                messages: [
                  {
                    id: "msg_1",
                    role: "USER",
                    content: "Consider adding Byzantine fault tolerance context here.",
                    createdAt: new Date().toISOString(),
                    author: { id: "user_1", name: "Alice" },
                  },
                ],
              },
              {
                id: "annot_2",
                workspaceId: "ws_test_123",
                responseId: "resp_1",
                versionId: "ver_1",
                kind: "REPLY",
                visibility: "WORKSPACE",
                anchorExact: "Leader election in Raft.",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: { id: "user_2", name: "Bob", email: "bob@example.com" },
                messages: [
                  {
                    id: "msg_2",
                    role: "USER",
                    content: "How does randomized timeout prevent split votes?",
                    createdAt: new Date().toISOString(),
                    author: { id: "user_2", name: "Bob" },
                  },
                  {
                    id: "msg_3",
                    role: "ASSISTANT",
                    content: "Random election timeouts spread candidate declarations apart in time.",
                    createdAt: new Date().toISOString(),
                  },
                ],
              },
            ],
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("1. Renders nothing when rightPanelOpen is false", () => {
    useUiStore.setState({ rightPanelOpen: false });
    const { container } = render(<RightPanel workspaceId="ws_test_123" />);
    expect(container.firstChild).toBeNull();
  });

  it("2. Renders header, scope filter, and 3 tabs when open", async () => {
    render(<RightPanel workspaceId="ws_test_123" activeResponseId="resp_1" />);

    expect(screen.getByText("Annotations & Notes")).toBeInTheDocument();
    expect(screen.getByText("This response")).toBeInTheDocument();
    expect(screen.getByText("Entire workspace")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Comments/)).toBeInTheDocument();
      expect(screen.getByText(/Replies/)).toBeInTheDocument();
      expect(screen.getByText(/Questions/)).toBeInTheDocument();
    });
  });

  it("3. Displays comments under Comments tab and switches to Replies tab", async () => {
    render(<RightPanel workspaceId="ws_test_123" activeResponseId="resp_1" />);

    // Comments tab active by default
    await waitFor(() => {
      expect(
        screen.getByText("Consider adding Byzantine fault tolerance context here.")
      ).toBeInTheDocument();
    });

    // Switch to Replies tab via rightPanelFocus
    React.act(() => {
      useUiStore.setState({
        rightPanelFocus: { responseId: "resp_1", tab: "replies" },
      });
    });

    await waitFor(() => {
      expect(
        screen.getByText("How does randomized timeout prevent split votes?")
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Random election timeouts spread candidate declarations/)
      ).toBeInTheDocument();
    });
  });

  it("4. Shows Step 6.7 promotion action buttons on AI-answered reply card", async () => {
    render(<RightPanel workspaceId="ws_test_123" activeResponseId="resp_1" />);

    React.act(() => {
      useUiStore.setState({
        rightPanelFocus: { responseId: "resp_1", tab: "replies" },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Add to workspace history")).toBeInTheDocument();
      expect(screen.getByText("New workspace from this")).toBeInTheDocument();
    });
  });

  it("5. Allows resizing right panel and stores width in uiStore", () => {
    render(<RightPanel workspaceId="ws_test_123" />);

    const resizeHandle = screen.getByLabelText("Resize annotations panel");
    expect(resizeHandle).toBeInTheDocument();

    fireEvent.mouseDown(resizeHandle, { clientX: 700 });
    // Simulate mousemove: window.innerWidth (1024) - clientX (600) = 424
    fireEvent.mouseMove(window, { clientX: 600 });
    fireEvent.mouseUp(window);

    expect(useUiStore.getState().rightPanelWidth).toBe(424);
  });

  it("6. Closes panel when Close button is clicked", () => {
    render(<RightPanel workspaceId="ws_test_123" />);

    const closeBtn = screen.getByLabelText("Close");
    fireEvent.click(closeBtn);

    expect(useUiStore.getState().rightPanelOpen).toBe(false);
  });
});
