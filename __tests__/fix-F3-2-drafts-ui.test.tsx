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

    expect(mockApi).not.toHaveBeenCalled();
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
          suggestionsById={{
            "sug-js": {
              exact: "JavScript",
              prefix: "",
              suffix: "",
              replacement: "JavaScript",
            },
          }}
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
});
