/**
 * @jest-environment jsdom
 *
 * F2.5 — Ask answers in the UI: the shared AnswerBody (thinking, sources,
 * copy, annotatable text), how the Ask column shows answers that failed or
 * are still being written, where follow-ups are sent, and highlights that
 * belong to more than one annotated text.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AnswerBody } from "@/components/response/answer-body";
import { ThreadColumn } from "@/components/threads/thread-column";
import { api } from "@/lib/api/client";
import { useAskStreamStore, streamAskAnswer } from "@/lib/stores/ask-stream";
import { useThreadStackStore } from "@/lib/stores/thread-stack";
import {
  applyCustomHighlights,
  clearCustomHighlights,
} from "@/lib/annotations/highlight";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("../lib/api/client", () => ({ api: jest.fn() }));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("../components/markdown", () => ({
  Markdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

const apiMock = api as jest.Mock;
const originalFetch = global.fetch;

function ask(messages: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}) {
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
    messages,
    ...overrides,
  };
}

const question = {
  id: "m_q",
  role: "USER",
  content: "What happens then?",
  createdAt: "2026-11-10T10:00:00.000Z",
  author: { id: "u_1", name: "Ada" },
};

function renderColumn() {
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
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useThreadStackStore.setState({ stack: [], quotes: {} });
  useAskStreamStore.setState({ streams: {} });
  // Annotation layers load their annotations with fetch (nothing to mark here).
  global.fetch = jest.fn().mockResolvedValue({ ok: false }) as never;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("F2.5 — AnswerBody", () => {
  it("shows thinking, sources and a copy button, and marks the text as annotatable", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <AnswerBody
        content="Raft elects a leader."
        thoughtSummary="Comparing protocols"
        citations={[{ index: 1, url: "https://example.com/raft", title: "Raft paper" }]}
        targetType="ANNOTATION_MESSAGE"
        targetId="msg_1"
        depth={2}
        workspaceId="ws_1"
        showCopyButton
      />
    );

    // Thinking drawer (collapsed) and sources
    expect(screen.getByText("thoughtProcess")).toBeInTheDocument();
    expect(screen.getByText(/^sources/)).toBeInTheDocument();

    const root = screen.getByText("Raft elects a leader.").closest("[data-annot-root]")!;
    expect(root).toHaveAttribute("data-annot-target-type", "ANNOTATION_MESSAGE");
    expect(root).toHaveAttribute("data-annot-target-id", "msg_1");
    expect(root).toHaveAttribute("data-annot-depth", "2");
    expect(root).not.toHaveAttribute("data-version-id");

    // Existing annotations on this answer are loaded for highlighting.
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/annotation-messages/msg_1/annotations"
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Raft elects a leader."));
  });

  it("is not annotatable and has no copy button while the text is being written", () => {
    render(
      <AnswerBody
        content="Raft ele"
        isStreaming
        targetType="ANNOTATION_MESSAGE"
        workspaceId="ws_1"
        showCopyButton
      />
    );
    expect(screen.getByText("Raft ele").closest("[data-annot-root]")).toBeNull();
    expect(screen.queryByRole("button", { name: "copy" })).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("keeps the main response attributes for a response version", () => {
    render(
      <AnswerBody
        content="Main answer"
        targetType="RESPONSE_VERSION"
        targetId="ver_1"
        responseId="resp_1"
        workspaceId="ws_1"
        contentSource="EDIT"
        editRevision={3}
      />
    );
    const root = screen.getByText("Main answer").closest("[data-annot-root]")!;
    expect(root).toHaveAttribute("data-annot-depth", "0");
    expect(root).toHaveAttribute("data-response-id", "resp_1");
    expect(root).toHaveAttribute("data-version-id", "ver_1");
    expect(root).toHaveAttribute("data-content-source", "EDIT");
    expect(root).toHaveAttribute("data-edit-revision", "3");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/responses/resp_1/annotations?versionId=ver_1"
    );
  });
});

describe("F2.5 — Ask column", () => {
  it("shows a failed answer as a notice with Retry, not as an empty message", async () => {
    apiMock.mockResolvedValue([
      ask([
        question,
        {
          id: "m_failed",
          role: "ASSISTANT",
          content: "",
          status: "FAILED",
          createdAt: "2026-11-10T10:00:01.000Z",
        },
      ]),
    ]);
    const { container } = renderColumn();

    expect(await screen.findByText("answerFailed")).toBeInTheDocument();
    expect(container.querySelector("[data-annot-root]")).toBeNull();
    // No follow-up box: there is no answer yet.
    expect(screen.queryByPlaceholderText("followUpPlaceholder")).not.toBeInTheDocument();

    // Retry asks for the answer again.
    global.fetch = jest.fn().mockResolvedValue({ ok: false, body: null }) as never;
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/annotations/ask_1/answer",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("shows 'answering' for an answer that is being written elsewhere", async () => {
    apiMock.mockResolvedValue([
      ask([
        question,
        {
          id: "m_writing",
          role: "ASSISTANT",
          content: "",
          status: "STREAMING",
          createdAt: new Date().toISOString(),
        },
      ]),
    ]);
    renderColumn();

    expect(await screen.findByText("answering")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "retry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "answerNow" })).not.toBeInTheDocument();
  });

  it("treats an answer that has been 'streaming' for too long as failed", async () => {
    apiMock.mockResolvedValue([
      ask([
        question,
        {
          id: "m_stuck",
          role: "ASSISTANT",
          content: "",
          status: "STREAMING",
          createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        },
      ]),
    ]);
    renderColumn();
    expect(await screen.findByText("answerFailed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "retry" })).toBeInTheDocument();
  });

  it("renders a saved answer with its thinking summary, sources and copy button", async () => {
    apiMock.mockResolvedValue([
      ask([
        question,
        {
          id: "m_a",
          role: "ASSISTANT",
          content: "The participants block.",
          status: "COMPLETE",
          thoughtSummary: "Recalling 2PC",
          citations: [{ index: 1, url: "https://example.com/2pc", title: "2PC" }],
          createdAt: "2026-11-10T10:00:05.000Z",
        },
      ]),
    ]);
    renderColumn();

    expect(await screen.findByText("The participants block.")).toBeInTheDocument();
    expect(screen.getByText("thoughtProcess")).toBeInTheDocument();
    expect(screen.getByText(/^sources/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "copy" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("followUpPlaceholder")).toBeInTheDocument();
  });
});

describe("F2.5 — streamAskAnswer endpoints", () => {
  it("sends a follow-up to /messages and a first answer or retry to /answer", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, body: null }) as never;

    await streamAskAnswer("ask_1", { prompt: "And then?", idempotencyKey: "k1" });
    expect(global.fetch).toHaveBeenLastCalledWith(
      "/api/v1/annotations/ask_1/messages",
      expect.objectContaining({
        body: JSON.stringify({ prompt: "And then?", stream: true }),
      })
    );

    useAskStreamStore.setState({ streams: {} });
    await streamAskAnswer("ask_1", { idempotencyKey: "k2" });
    expect(global.fetch).toHaveBeenLastCalledWith(
      "/api/v1/annotations/ask_1/answer",
      expect.objectContaining({ body: "{}" })
    );
  });
});

describe("F2.5 — highlights of several annotated texts", () => {
  const registry = new Map<string, { ranges: Range[] }>();

  beforeEach(() => {
    registry.clear();
    (globalThis as unknown as { Highlight: unknown }).Highlight = class {
      ranges: Range[];
      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    };
    (globalThis as unknown as { CSS: unknown }).CSS = {
      highlights: {
        set: (name: string, hl: { ranges: Range[] }) => registry.set(name, hl),
        delete: (name: string) => registry.delete(name),
      },
    };
  });

  afterEach(() => {
    clearCustomHighlights();
    delete (globalThis as unknown as { Highlight?: unknown }).Highlight;
    delete (globalThis as unknown as { CSS?: unknown }).CSS;
  });

  it("one text does not wipe the highlights of another", () => {
    const mainRange = document.createRange();
    const answerRange = document.createRange();

    applyCustomHighlights([{ kind: "ASK", ranges: [mainRange] }], "main-response");
    // An Ask answer without annotations registers nothing…
    applyCustomHighlights([{ kind: "ASK", ranges: [] }], "answer-1");
    // …and the main response keeps its mark.
    expect(registry.get("annot-ask")?.ranges).toEqual([mainRange]);

    applyCustomHighlights([{ kind: "ASK", ranges: [answerRange] }], "answer-1");
    expect(registry.get("annot-ask")?.ranges).toEqual([mainRange, answerRange]);

    // Closing the column removes only its own marks.
    clearCustomHighlights("answer-1");
    expect(registry.get("annot-ask")?.ranges).toEqual([mainRange]);

    clearCustomHighlights("main-response");
    expect(registry.has("annot-ask")).toBe(false);
  });
});
