/**
 * @jest-environment jsdom
 */

import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import enMessages from "../messages/en.json";
import { DocumentCard } from "@/components/response/document-card";
import { Composer } from "@/components/workspace/composer";

const mockApi = jest.fn();
jest.mock("../lib/api/client", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

const mockUploadAttachment = jest.fn();
jest.mock("../lib/api/attachments", () => ({
  uploadAttachment: (...args: unknown[]) => mockUploadAttachment(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

jest.mock("../lib/api/hooks/entitlements", () => ({
  useEntitlements: () => ({
    entitlements: {
      plan: "PRO",
      limits: {
        attachmentsPerWorkspace: 20,
        maxFileMB: 25,
      },
    },
  }),
}));

jest.mock("../components/response/answer-body", () => ({
  AnswerBody: ({
    content,
    targetId,
  }: {
    content: string;
    targetId?: string;
  }) => (
    <div data-testid="mock-answer-body" data-target-id={targetId}>
      {content}
    </div>
  ),
}));

jest.mock("../components/workspace/ShareAndPeopleDialog", () => ({
  ShareAndPeopleDialog: () => <div data-testid="mock-share-dialog" />,
}));

jest.mock("../components/workspace/question-queue-popover", () => ({
  QuestionQueuePopover: () => <div data-testid="mock-question-queue" />,
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

describe("Step F3.1 UI — DocumentCard & Composer document upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders DocumentCard with Uploaded document badge, PDF layout note, Download original, and collapsible 60vh container keeping full DOM mounted", async () => {
    const longParagraphs = Array.from(
      { length: 40 },
      (_, i) => `Line ${i + 1}: Detailed specification paragraph with anchorable text.`
    ).join("\n");

    const openSpy = jest
      .spyOn(window, "open")
      .mockImplementation(() => null);
    mockApi.mockResolvedValueOnce({ url: "https://signed.example.com/spec.pdf" });

    renderWithProviders(
      <DocumentCard
        workspaceId="ws-1"
        userId="user-1"
        response={{
          id: "resp-doc-1",
          workspaceId: "ws-1",
          prompt: "Architecture.pdf",
          kind: "DOCUMENT",
          origin: "UPLOAD",
          activeVersionId: "ver-doc-1",
          pageCount: 4,
          author: { name: "Ada Lovelace" },
          uploadedAttachment: {
            id: "att-pdf-1",
            originalName: "Architecture.pdf",
            mime: "application/pdf",
            bytes: 1024 * 512,
          },
          activeVersion: {
            id: "ver-doc-1",
            number: 1,
            content: longParagraphs,
          },
        }}
      />
    );

    expect(screen.getByTestId("uploaded-document-badge")).toHaveTextContent(
      "Uploaded document"
    );
    expect(screen.getByText("Architecture.pdf")).toBeInTheDocument();
    expect(screen.getByTestId("document-size")).toHaveTextContent("512.0 KB");
    expect(screen.getByTestId("document-pages")).toHaveTextContent("4 pages");
    expect(screen.getByTestId("pdf-layout-note")).toHaveTextContent(
      "PDF layout (columns, tables) may not be preserved."
    );

    // Collapsed by default (>30 lines) with max-h-[60vh] overflow-hidden, YET full text is mounted in DOM
    const bodyContainer = screen.getByTestId("document-body-container");
    expect(bodyContainer.className).toContain("max-h-[60vh]");
    expect(bodyContainer.className).toContain("overflow-hidden");
    expect(screen.getByTestId("mock-answer-body")).toHaveTextContent(
      "Line 40: Detailed specification paragraph with anchorable text."
    );

    // Clicking "Show full document" expands the container
    const toggleBtn = screen.getByTestId("toggle-full-document-btn");
    expect(toggleBtn).toHaveTextContent("Show full document");
    fireEvent.click(toggleBtn);
    expect(bodyContainer.className).not.toContain("max-h-[60vh]");
    expect(toggleBtn).toHaveTextContent("Collapse document");

    // Clicking "Download original" fetches signed download URL and opens it
    const downloadBtn = screen.getByTestId("download-original-btn");
    fireEvent.click(downloadBtn);
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        "/api/v1/attachments/att-pdf-1/download"
      );
      expect(openSpy).toHaveBeenCalledWith(
        "https://signed.example.com/spec.pdf",
        "_blank",
        "noopener,noreferrer"
      );
    });

    openSpy.mockRestore();
  });

  it("opens paperclip menu and shows drag-and-drop choice overlay to add document to workspace", async () => {
    mockUploadAttachment.mockResolvedValueOnce("att-uploaded-123");
    mockApi.mockResolvedValueOnce({ id: "resp-doc-123", kind: "DOCUMENT" });

    renderWithProviders(<Composer workspaceId="ws-123" />);

    // Clicking paperclip opens menu with both options
    const attachBtn = screen.getByTestId("composer-attach-btn");
    fireEvent.click(attachBtn);

    expect(
      await screen.findByTestId("menu-attach-to-message")
    ).toHaveTextContent("Attach to message");
    expect(
      screen.getByTestId("menu-add-to-workspace")
    ).toHaveTextContent("Add to workspace as a document");

    // Dropping a .md file onto the composer opens the two-button drop choice overlay
    const composerRegion = screen.getByRole("region", { name: "Composer" });
    const mdFile = new File(["# Doc Title\n\nBody"], "Roadmap.md", {
      type: "text/markdown",
    });

    fireEvent.drop(composerRegion, {
      dataTransfer: {
        files: [mdFile],
      },
    });

    const addToWorkspaceBtn = await screen.findByTestId(
      "drop-add-to-workspace"
    );
    expect(addToWorkspaceBtn).toHaveTextContent(
      "Add to workspace as a document"
    );
    expect(screen.getByTestId("drop-attach-to-message")).toHaveTextContent(
      "Attach to message"
    );

    fireEvent.click(addToWorkspaceBtn);

    await waitFor(() => {
      expect(mockUploadAttachment).toHaveBeenCalledWith(mdFile, "ws-123");
      expect(mockApi).toHaveBeenCalledWith(
        "/api/v1/workspaces/ws-123/documents",
        {
          method: "POST",
          body: { attachmentId: "att-uploaded-123" },
        }
      );
    });
  });
});
