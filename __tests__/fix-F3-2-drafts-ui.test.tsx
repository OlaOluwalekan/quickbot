/**
 * @jest-environment jsdom
 */

import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import enMessages from "../messages/en.json";
import { DocumentCard } from "@/components/response/document-card";
import { DocumentDraftBar } from "@/components/response/document-draft-bar";
import { useDocumentDraftsStore } from "@/lib/stores/document-drafts";
import { ApiClientError } from "@/lib/api/client";

const mockApi = jest.fn();
jest.mock("../lib/api/client", () => {
  const actual = jest.requireActual("../lib/api/client");
  return {
    ...actual,
    api: (...args: unknown[]) => mockApi(...args),
  };
});

jest.mock("../components/response/answer-body", () => ({
  AnswerBody: ({ content }: { content: string }) => (
    <div data-testid="mock-answer-body">{content}</div>
  ),
}));

jest.mock("../components/workspace/ShareAndPeopleDialog", () => ({
  ShareAndPeopleDialog: () => null,
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

describe("Step F3.2 UI — Document drafts, diff view, Save, Discard, and Conflict resolution", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.mockReset();
    window.sessionStorage.clear();
    useDocumentDraftsStore.setState({ drafts: {} });
  });

  it("accumulates fixes and manual edits in draft, persists in sessionStorage, shows diff, and saves once", async () => {
    const versionId = "ver-f32-1";
    const baseContent = "We use JavScript and recieve data.";

    // Apply two quick fixes via the draft store
    const store = useDocumentDraftsStore.getState();
    const fix1 = store.applyFixToDraft({
      versionId,
      baseRevision: null,
      baseContent,
      suggestionId: "sug-1",
      suggestion: {
        exact: "JavScript",
        prefix: "We use ",
        suffix: " and",
        replacement: "JavaScript",
      },
    });
    expect(fix1.ok).toBe(true);

    const fix2 = store.applyFixToDraft({
      versionId,
      baseRevision: null,
      baseContent,
      suggestionId: "sug-2",
      suggestion: {
        exact: "recieve",
        prefix: "and ",
        suffix: " data.",
        replacement: "receive",
      },
    });
    expect(fix2.ok).toBe(true);

    // Verify persisted in sessionStorage
    const storedRaw = window.sessionStorage.getItem("klecx-document-drafts-v1");
    expect(storedRaw).toContain("JavaScript");
    expect(storedRaw).toContain("receive");

    mockApi.mockResolvedValueOnce({
      id: "edit-1",
      versionId,
      revision: 1,
      content: "We use JavaScript and receive data cleanly.",
      editorId: "user-1",
      createdAt: new Date().toISOString(),
    });

    renderWithProviders(
      <DocumentCard
        workspaceId="ws-1"
        userId="user-1"
        response={{
          id: "resp-1",
          workspaceId: "ws-1",
          prompt: "Spec.md",
          kind: "DOCUMENT",
          origin: "UPLOAD",
          activeVersionId: versionId,
          activeVersion: {
            id: versionId,
            number: 1,
            content: baseContent,
          },
        }}
      />
    );

    // Unsaved changes (2) bar is visible
    expect(screen.getByTestId("draft-unsaved-count")).toHaveTextContent(
      "Unsaved changes (2)"
    );

    // Perform a manual edit via EditResponse -> updates draft instead of saving immediately
    fireEvent.click(screen.getByTestId("document-edit-btn"));
    const textarea = screen.getByPlaceholderText("Edit response content...");
    fireEvent.change(textarea, {
      target: { value: "We use JavaScript and receive data cleanly." },
    });
    fireEvent.click(screen.getByRole("button", { name: /save as edit/i }));

    // Nothing is saved yet (the card only asked for the plan's entitlements).
    expect(
      mockApi.mock.calls.filter(([url]) => String(url).includes("/edits"))
    ).toHaveLength(0);
    expect(screen.getByTestId("draft-unsaved-count")).toHaveTextContent(
      "Unsaved changes (3)"
    );

    // Toggle "View changes" to inspect inline word diff
    fireEvent.click(screen.getByTestId("draft-view-changes-btn"));
    expect(screen.getByTestId("document-diff-panel")).toBeInTheDocument();

    // Click Save in DocumentDraftBar -> sends one POST to /api/v1/response-versions/:id/edits
    fireEvent.click(screen.getByTestId("draft-save-btn"));

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        `/api/v1/response-versions/${versionId}/edits`,
        {
          method: "POST",
          body: {
            content: "We use JavaScript and receive data cleanly.",
            baseRevision: null,
            acceptedSuggestionIds: ["sug-1", "sug-2"],
          },
        }
      );
    });

    // Draft is cleared after save
    await waitFor(() => {
      expect(screen.queryByTestId("document-draft-bar")).not.toBeInTheDocument();
    });
  });

  it("handles 409 edit_conflict with reload-and-reapply and supports Discard", async () => {
    const versionId = "ver-f32-2";
    const savedContent = "Original JavScript text.";

    useDocumentDraftsStore.getState().applyFixToDraft({
      versionId,
      baseRevision: null,
      baseContent: savedContent,
      suggestionId: "sug-js",
      suggestion: {
        exact: "JavScript",
        prefix: "",
        suffix: "",
        replacement: "JavaScript",
      },
    });

    // First Save returns 409 edit_conflict
    mockApi.mockRejectedValueOnce(
      new ApiClientError({
        status: 409,
        code: "edit_conflict",
        message: "Document was modified",
        details: {
          latestRevision: 2,
          latestContent: "Updated header.\nOriginal JavScript text.",
        },
      })
    );

    const draft = useDocumentDraftsStore.getState().drafts[versionId]!;

    function Harness() {
      const currentDraft = useDocumentDraftsStore(
        (s) => s.drafts[versionId]
      );
      if (!currentDraft) return <div data-testid="no-draft">clean</div>;
      return (
        <DocumentDraftBar
          versionId={versionId}
          workspaceId="ws-1"
          userId="user-1"
          savedContent={savedContent}
          draft={currentDraft}
        />
      );
    }

    renderWithProviders(<Harness />);

    fireEvent.click(screen.getByTestId("draft-save-btn"));

    const conflictBanner = await screen.findByTestId(
      "document-conflict-banner"
    );
    expect(conflictBanner).toBeInTheDocument();

    // Click "Reload latest and re-apply my changes"
    fireEvent.click(screen.getByTestId("conflict-reload-btn"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("document-conflict-banner")
      ).not.toBeInTheDocument();
    });
    const updatedDraft = useDocumentDraftsStore.getState().drafts[versionId]!;
    expect(updatedDraft.baseRevision).toBe(2);
    expect(updatedDraft.content).toBe(
      "Updated header.\nOriginal JavaScript text."
    );

    // Discard restores clean state
    fireEvent.click(screen.getByTestId("draft-discard-btn"));
    expect(await screen.findByTestId("no-draft")).toBeInTheDocument();
    expect(draft).toBeDefined();
  });

  function DraftHarness({
    versionId,
    savedContent,
  }: {
    versionId: string;
    savedContent: string;
  }) {
    const currentDraft = useDocumentDraftsStore((s) => s.drafts[versionId]);
    if (!currentDraft) return <div data-testid="no-draft">clean</div>;
    return (
      <DocumentDraftBar
        versionId={versionId}
        workspaceId="ws-1"
        userId="user-1"
        savedContent={savedContent}
        draft={currentDraft}
      />
    );
  }

  function conflictError(latestContent: string) {
    return new ApiClientError({
      status: 409,
      code: "edit_conflict",
      message: "Document was modified",
      details: { latestRevision: 4, latestContent },
    });
  }

  it("re-applies a manual edit on top of the newer revision", async () => {
    const versionId = "ver-f32-3";
    const saved = "# Title\n\nFirst paragraph.\n\nSecond paragraph.";
    useDocumentDraftsStore.getState().updateDraftContent({
      versionId,
      baseRevision: 3,
      baseContent: saved,
      content: "# Title\n\nFirst paragraph.\n\nSecond paragraph, edited by me.",
    });

    // Someone else changed the first paragraph meanwhile.
    mockApi.mockRejectedValueOnce(
      conflictError("# Title\n\nFirst paragraph, edited by them.\n\nSecond paragraph.")
    );
    renderWithProviders(
      <DraftHarness versionId={versionId} savedContent={saved} />
    );

    fireEvent.click(screen.getByTestId("draft-save-btn"));
    await screen.findByTestId("document-conflict-banner");
    fireEvent.click(screen.getByTestId("conflict-reload-btn"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("document-conflict-banner")
      ).not.toBeInTheDocument();
    });
    const merged = useDocumentDraftsStore.getState().drafts[versionId]!;
    expect(merged.baseRevision).toBe(4);
    expect(merged.content).toBe(
      "# Title\n\nFirst paragraph, edited by them.\n\nSecond paragraph, edited by me."
    );
  });

  it("keeps the draft when the changes can't be re-applied", async () => {
    const versionId = "ver-f32-4";
    const saved = "One paragraph only.";
    const mine = "One paragraph only, edited by me.";
    useDocumentDraftsStore.getState().updateDraftContent({
      versionId,
      baseRevision: 3,
      baseContent: saved,
      content: mine,
    });

    mockApi.mockRejectedValueOnce(
      conflictError("One paragraph only, edited by them.")
    );
    renderWithProviders(
      <DraftHarness versionId={versionId} savedContent={saved} />
    );

    fireEvent.click(screen.getByTestId("draft-save-btn"));
    await screen.findByTestId("document-conflict-banner");
    fireEvent.click(screen.getByTestId("conflict-reload-btn"));

    // Still in conflict, and the draft is untouched.
    expect(screen.getByTestId("document-conflict-banner")).toBeInTheDocument();
    const kept = useDocumentDraftsStore.getState().drafts[versionId]!;
    expect(kept.content).toBe(mine);
    expect(kept.baseRevision).toBe(3);

    // Overwrite saves the draft on top of the newer revision.
    mockApi.mockResolvedValueOnce({
      id: "edit-5",
      versionId,
      revision: 5,
      content: mine,
      editorId: "user-1",
      createdAt: new Date().toISOString(),
    });
    fireEvent.click(screen.getByTestId("conflict-overwrite-btn"));
    await waitFor(() => {
      expect(mockApi).toHaveBeenLastCalledWith(
        `/api/v1/response-versions/${versionId}/edits`,
        {
          method: "POST",
          body: { content: mine, baseRevision: 4, acceptedSuggestionIds: undefined },
        }
      );
    });
    expect(await screen.findByTestId("no-draft")).toBeInTheDocument();
  });

  it("drops the draft when the text is edited back to the saved text", () => {
    const versionId = "ver-f32-5";
    const store = useDocumentDraftsStore.getState();
    store.updateDraftContent({
      versionId,
      baseRevision: null,
      baseContent: "Saved text.",
      content: "Changed text.",
    });
    expect(useDocumentDraftsStore.getState().drafts[versionId]).toBeDefined();
    store.updateDraftContent({
      versionId,
      baseRevision: null,
      baseContent: "Saved text.",
      content: "Saved text.",
    });
    expect(useDocumentDraftsStore.getState().drafts[versionId]).toBeUndefined();
  });

  it("gates Edit for a member who can't edit", () => {
    renderWithProviders(
      <DocumentCard
        workspaceId="ws-1"
        userId="user-2"
        canEdit={false}
        response={{
          id: "resp-9",
          workspaceId: "ws-1",
          prompt: "Spec.md",
          kind: "DOCUMENT",
          origin: "UPLOAD",
          activeVersionId: "ver-f32-9",
          activeVersion: { id: "ver-f32-9", number: 1, content: "Text." },
        }}
      />
    );
    const editBtn = screen.getByTestId("document-edit-btn");
    expect(editBtn).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(editBtn);
    expect(
      screen.queryByPlaceholderText("Edit response content...")
    ).not.toBeInTheDocument();
  });
});
