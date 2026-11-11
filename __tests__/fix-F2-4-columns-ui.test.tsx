/**
 * @jest-environment jsdom
 *
 * F2.4 — Ask columns in the UI: "Ask now" opens the column and the answer
 * streams into it; nested asks open the next column; the drawer lists
 * answered threads under Asks; nothing is open when a workspace loads.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ThreadColumn } from "@/components/threads/thread-column";
import { ThreadStackLayout } from "@/components/threads/thread-stack-layout";
import { AllAnnotationsDrawer } from "@/components/annotations/all-annotations-drawer";
import { api } from "@/lib/api/client";
import { useThreadStackStore, openAnnotationThread } from "@/lib/stores/thread-stack";
import { useAskStreamStore, streamAskAnswer } from "@/lib/stores/ask-stream";
import { useUiStore } from "@/lib/stores/ui";

jest.mock("next-intl", () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values
        ? `${key}:${Object.values(values).join(",")}`
        : key,
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/workspaces/ws_1",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "ws_1" }),
}));

jest.mock("../lib/api/client", () => ({ api: jest.fn() }));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("../components/markdown", () => ({
  Markdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

const apiMock = api as jest.Mock;

function ask(overrides: Record<string, unknown> = {}) {
  return {
    id: "ask_1",
    workspaceId: "ws_1",
    kind: "ASK",
    depth: 0,
    anchorExact: "coordinator crashes",
    visibility: "PRIVATE",
    questionState: "NONE",
    createdById: "u_1",
    createdBy: { id: "u_1", name: "Ada" },
    messages: [
      {
        id: "m_q",
        role: "USER",
        content: "What happens then?",
        createdAt: "2026-11-10T10:00:00.000Z",
        author: { id: "u_1", name: "Ada" },
      },
    ],
    ...overrides,
  };
}

/** A fetch Response whose body yields the given SSE blocks one by one. */
function sseResponse(blocks: string[], gate?: Promise<void>) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          if (i === 1 && gate) await gate;
          if (i >= blocks.length) return { done: true, value: undefined };
          return { done: false, value: encoder.encode(blocks[i++]!) };
        },
      }),
    },
  };
}
const delta = (text: string) => `event: delta\ndata: ${JSON.stringify({ text })}\n\n`;
const done = `event: done\ndata: {}\n\n`;

function renderColumn(props: Partial<React.ComponentProps<typeof ThreadColumn>> = {}) {
  return render(
    <ThreadColumn
      id="ask_1"
      index={1}
      width={480}
      workspaceId="ws_1"
      currentUserId="u_1"
      onBack={jest.fn()}
      onCloseAll={jest.fn()}
      onNavigate={jest.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useThreadStackStore.setState({ stack: [], quotes: {} });
  useAskStreamStore.setState({ streams: {} });
  useUiStore.setState({ rightPanelOpen: false, rightPanelFocus: null });
  window.history.replaceState(null, "", "/workspaces/ws_1");
});

describe("F2.4 — column stack store", () => {
  it("opens an Ask from the main conversation as column 1 and replaces what was open", () => {
    const { open } = useThreadStackStore.getState();
    open({ kind: "annotation", id: "a" }, { fromIndex: 0 });
    open({ kind: "annotation", id: "b" }, { fromIndex: 0 });
    expect(useThreadStackStore.getState().stack).toEqual([{ kind: "annotation", id: "b" }]);
  });

  it("opens an Ask made inside column n as column n + 1 and closes deeper columns", () => {
    const { open } = useThreadStackStore.getState();
    open({ kind: "annotation", id: "l1" }, { fromIndex: 0 });
    open({ kind: "annotation", id: "l2" }, { fromIndex: 1 });
    open({ kind: "annotation", id: "l3" }, { fromIndex: 2 });
    expect(useThreadStackStore.getState().stack.map((s) => s.id)).toEqual(["l1", "l2", "l3"]);

    // A second Ask inside the level-1 answer replaces levels 2 and 3.
    open({ kind: "annotation", id: "l2b" }, { fromIndex: 1 });
    expect(useThreadStackStore.getState().stack.map((s) => s.id)).toEqual(["l1", "l2b"]);
  });

  it("back, goTo and closeAll move through the levels", () => {
    useThreadStackStore.setState({
      stack: ["l1", "l2", "l3"].map((id) => ({ kind: "annotation" as const, id })),
    });
    useThreadStackStore.getState().back();
    expect(useThreadStackStore.getState().stack).toHaveLength(2);
    useThreadStackStore.getState().goTo(1);
    expect(useThreadStackStore.getState().stack.map((s) => s.id)).toEqual(["l1"]);
    useThreadStackStore.getState().closeAll();
    expect(useThreadStackStore.getState().stack).toEqual([]);
  });

  it("openAnnotationThread opens a nested annotation with its ancestor chain", async () => {
    apiMock.mockResolvedValueOnce([
      { id: "root", anchorExact: "root quote" },
      { id: "child", anchorExact: "child quote" },
    ]);
    await openAnnotationThread("child");
    expect(apiMock).toHaveBeenCalledWith("/api/v1/annotations/child/chain");
    expect(useThreadStackStore.getState().stack.map((s) => s.id)).toEqual(["root", "child"]);
    expect(useThreadStackStore.getState().quotes.root).toBe("root quote");
  });
});

describe("F2.4 — Ask answer streaming", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("publishes the answer chunk by chunk and announces the saved thread", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    global.fetch = jest
      .fn()
      .mockResolvedValue(sseResponse([delta("Hello "), delta("world"), done], gate)) as never;
    const changed = jest.fn();
    window.addEventListener("annotation-changed", changed);

    const finished = streamAskAnswer("ask_1");
    await waitFor(() =>
      expect(useAskStreamStore.getState().streams.ask_1).toEqual(
        expect.objectContaining({ status: "streaming", text: "Hello " })
      )
    );

    release();
    await expect(finished).resolves.toBe(true);
    expect(useAskStreamStore.getState().streams.ask_1).toEqual(
      expect.objectContaining({ status: "done", text: "Hello world" })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/annotations/ask_1/answer",
      expect.objectContaining({ method: "POST" })
    );
    expect(changed).toHaveBeenCalled();
    window.removeEventListener("annotation-changed", changed);
  });

  it("marks the stream as failed when the server refuses or reports an error", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, body: null }) as never;
    await expect(streamAskAnswer("ask_1")).resolves.toBe(false);
    expect(useAskStreamStore.getState().streams.ask_1?.status).toBe("failed");

    useAskStreamStore.setState({ streams: {} });
    global.fetch = jest
      .fn()
      .mockResolvedValue(sseResponse([delta("Par"), `event: error\ndata: {}\n\n`])) as never;
    await expect(streamAskAnswer("ask_1")).resolves.toBe(false);
    expect(useAskStreamStore.getState().streams.ask_1?.status).toBe("failed");
  });
});

describe("F2.4 — thread column", () => {
  it("shows the question at once and the answer while it streams", async () => {
    apiMock.mockResolvedValue([ask()]);
    renderColumn();

    expect(await screen.findByText("What happens then?")).toBeInTheDocument();

    act(() => {
      useAskStreamStore.getState().set("ask_1", { status: "streaming", text: "" });
    });
    expect(screen.getByText("answering")).toBeInTheDocument();

    act(() => useAskStreamStore.getState().append("ask_1", "The participants "));
    expect(screen.getByText("The participants")).toBeInTheDocument();
    act(() => useAskStreamStore.getState().append("ask_1", "block."));
    expect(screen.getByText("The participants block.")).toBeInTheDocument();

    // Stream finished: the saved thread replaces the live text.
    apiMock.mockResolvedValue([
      ask({
        messages: [
          ...ask().messages,
          {
            id: "m_a",
            role: "ASSISTANT",
            content: "The participants block.",
            createdAt: "2026-11-10T10:00:05.000Z",
          },
        ],
      }),
    ]);
    act(() => {
      useAskStreamStore
        .getState()
        .set("ask_1", { status: "done", text: "The participants block." });
    });
    await waitFor(() => expect(useAskStreamStore.getState().streams.ask_1).toBeUndefined());

    // The saved answer is an annotatable surface one level deeper, in this column.
    const root = screen.getByText("The participants block.").closest("[data-annot-root]")!;
    expect(root).toHaveAttribute("data-annot-target-type", "ANNOTATION_MESSAGE");
    expect(root).toHaveAttribute("data-annot-target-id", "m_a");
    expect(root).toHaveAttribute("data-annot-depth", "1");
    expect(root.closest("[data-thread-column-index]")).toHaveAttribute(
      "data-thread-column-index",
      "1"
    );
    // Follow-up box appears once there is an answer.
    expect(screen.getByPlaceholderText("followUpPlaceholder")).toBeInTheDocument();
  });

  it("offers a retry when an asked-now question has no answer", async () => {
    apiMock.mockResolvedValue([ask()]);
    renderColumn();
    expect(await screen.findByText("noAnswerYet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "answerNow" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("followUpPlaceholder")).not.toBeInTheDocument();
  });

  it("renders mentions in comment threads as chips and hides the reply box without the capability", async () => {
    apiMock.mockResolvedValue([
      ask({
        id: "c_1",
        kind: "COMMENT",
        messages: [
          {
            id: "m_c",
            role: "USER",
            content: "@klecx use PostgreSQL, cc @grace_h",
            createdAt: "2026-11-10T10:00:00.000Z",
            author: { id: "u_1", name: "Ada" },
          },
        ],
      }),
    ]);
    const { container } = renderColumn({ id: "c_1", canComment: false });
    await screen.findByText("commentedOn");
    expect(container.querySelector('[data-mention="klecx"]')).toBeInTheDocument();
    expect(container.querySelector('[data-mention="grace_h"]')).toHaveTextContent("@grace_h");
    expect(screen.queryByPlaceholderText("replyPlaceholder")).not.toBeInTheDocument();
  });

  it("Esc inside the column goes back", async () => {
    apiMock.mockResolvedValue([ask()]);
    const onBack = jest.fn();
    renderColumn({ onBack });
    const question = await screen.findByText("What happens then?");
    fireEvent.keyDown(question, { key: "Escape" });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("F2.4 — layout and drawer", () => {
  it("shows no column and no drawer when a workspace first loads", () => {
    render(
      <>
        <ThreadStackLayout workspaceId="ws_1">
          <div>main conversation</div>
        </ThreadStackLayout>
        <AllAnnotationsDrawer
          workspaceId="ws_1"
          open={useUiStore.getState().rightPanelOpen}
          onOpenChange={jest.fn()}
        />
      </>
    );
    expect(screen.getByText("main conversation")).toBeVisible();
    expect(document.querySelector("[data-thread-column-index]")).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("keeps the main conversation mounted next to an open column and writes ?thread=", async () => {
    apiMock.mockResolvedValue([ask()]);
    render(
      <ThreadStackLayout workspaceId="ws_1">
        <div>main conversation</div>
      </ThreadStackLayout>
    );
    act(() => {
      useThreadStackStore
        .getState()
        .open({ kind: "annotation", id: "ask_1" }, { fromIndex: 0 });
    });
    expect(await screen.findByTestId("thread-column-ask_1")).toBeInTheDocument();
    expect(screen.getByText("main conversation")).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("thread")).toBe("a:ask_1");
  });

  it("lists answered threads (asked now, answered from the queue, migrated replies) under Asks, and only waiting questions under Queue", async () => {
    const answer = { id: "m_a", role: "ASSISTANT", content: "An answer" };
    const question = (content: string) => ({ id: `q_${content}`, role: "USER", content });
    apiMock.mockResolvedValue([
      ask({ id: "now", messages: [question("asked now"), answer] }),
      // Old REPLY rows were migrated to ASK + ANSWERED (F2.1).
      ask({ id: "migrated", questionState: "ANSWERED", messages: [question("migrated reply"), answer] }),
      ask({ id: "waiting", questionState: "QUEUED", messages: [question("still queued")] }),
      ask({ id: "comment", kind: "COMMENT", messages: [question("a comment")] }),
    ]);
    render(<AllAnnotationsDrawer workspaceId="ws_1" open onOpenChange={jest.fn()} />);

    fireEvent.mouseDown(await screen.findByRole("tab", { name: /tabAsks/ }));
    expect(await screen.findByText("asked now")).toBeInTheDocument();
    expect(screen.getByText("migrated reply")).toBeInTheDocument();
    expect(screen.queryByText("still queued")).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /tabQueue/ }));
    expect(await screen.findByText("still queued")).toBeInTheDocument();
    expect(screen.queryByText("migrated reply")).not.toBeInTheDocument();
  });

  it("opens the item's column from the drawer and closes the drawer", async () => {
    apiMock.mockImplementation(async (url: string) =>
      url.endsWith("/chain")
        ? [{ id: "comment", anchorExact: "coordinator crashes" }]
        : [ask({ id: "comment", kind: "COMMENT" })]
    );
    const onOpenChange = jest.fn();
    render(<AllAnnotationsDrawer workspaceId="ws_1" open onOpenChange={onOpenChange} />);

    fireEvent.click(await screen.findByTestId("drawer-item-comment"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() =>
      expect(useThreadStackStore.getState().stack).toEqual([
        { kind: "annotation", id: "comment" },
      ])
    );
  });
});
