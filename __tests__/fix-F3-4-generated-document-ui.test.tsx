/**
 * @jest-environment jsdom
 */

import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GeneratedDocumentCard } from "@/components/documents/generated-document-card";
import { DocumentColumn } from "@/components/documents/document-column";
import { useThreadStackStore } from "@/lib/stores/thread-stack";
import { useDocumentDraftsStore } from "@/lib/stores/document-drafts";

jest.mock("next-intl", () => ({
  useFormatter: () => ({ relativeTime: () => "" }),
  useNow: () => new Date(),
  useTranslations: (namespace?: string) => (key: string, values?: any) => {
    if (key === "revision" && values?.revision !== undefined) {
      return `Revision ${values.revision}`;
    }
    if (key === "level" && values?.level !== undefined) {
      return `Level ${values.level}`;
    }
    return key;
  },
}));

const mockApi = jest.fn();
jest.mock("../lib/api/client", () => ({
  api: (...args: any[]) => mockApi(...args),
}));

describe("Step F3.4 — Generated Document UI (Card & Column)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useThreadStackStore.setState({ stack: [], quotes: {} });
    useDocumentDraftsStore.setState({ drafts: {} });
  });

  describe("GeneratedDocumentCard", () => {
    it("renders document title, format badge, revision, and open button", () => {
      render(
        <GeneratedDocumentCard
          document={{
            id: "doc-123",
            title: "Roadmap 2027",
            format: "docx",
            currentRevision: 1,
          }}
          workspaceId="ws-1"
        />
      );

      expect(screen.getByText("Roadmap 2027")).toBeInTheDocument();
      expect(screen.getByText("DOCX")).toBeInTheDocument();
      expect(screen.getByText("Revision 1")).toBeInTheDocument();
      expect(screen.getByTestId("doc-open-btn")).toBeInTheDocument();
      expect(screen.getByTestId("doc-download-btn")).toBeInTheDocument();
    });

    it("displays Edited badge when currentRevision > 1", () => {
      render(
        <GeneratedDocumentCard
          document={{
            id: "doc-123",
            title: "Roadmap 2027",
            format: "pdf",
            currentRevision: 3,
          }}
          workspaceId="ws-1"
        />
      );

      expect(screen.getByTestId("doc-edited-badge")).toBeInTheDocument();
      expect(screen.getByText("Revision 3")).toBeInTheDocument();
    });

    it("clicking card or Open button pushes document entry to thread stack", () => {
      render(
        <GeneratedDocumentCard
          document={{
            id: "doc-999",
            title: "Tech Spec",
            format: "md",
            currentRevision: 1,
          }}
          workspaceId="ws-1"
        />
      );

      fireEvent.click(screen.getByTestId("doc-open-btn"));
      const stack = useThreadStackStore.getState().stack;
      expect(stack).toEqual([{ kind: "document", id: "doc-999" }]);
    });
  });

  describe("DocumentColumn", () => {
    const mockDocData = {
      data: {
        document: {
          id: "doc-abc",
          workspaceId: "ws-1",
          versionId: "ver-1",
          responseId: "resp-1",
          title: "Architecture Spec",
          format: "md",
          currentRevision: 2,
          createdById: "user-1",
          createdAt: new Date().toISOString(),
        },
        latestRevision: {
          id: "rev-2",
          documentId: "doc-abc",
          revision: 2,
          content: "# Architecture\n\nMicroservices with event sourcing.",
          editorId: "user-1",
          createdAt: new Date().toISOString(),
        },
        revisions: [
          {
            id: "rev-2",
            documentId: "doc-abc",
            revision: 2,
            content: "# Architecture\n\nMicroservices with event sourcing.",
            editorId: "user-1",
            createdAt: new Date().toISOString(),
          },
          {
            id: "rev-1",
            documentId: "doc-abc",
            revision: 1,
            content: "# Architecture\n\nInitial draft.",
            editorId: null,
            createdAt: new Date().toISOString(),
          },
        ],
        capabilities: {
          canEdit: true,
          canComment: true,
          canAsk: true,
          canExport: true,
        },
      },
    };

    it("loads and displays document header, title, and tabs", async () => {
      mockApi.mockResolvedValueOnce(mockDocData);

      render(
        <DocumentColumn
          id="doc-abc"
          index={1}
          width={500}
          workspaceId="ws-1"
          onBack={jest.fn()}
          onCloseAll={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Architecture Spec")).toBeInTheDocument();
      });

      expect(screen.getByTestId("tab-preview")).toBeInTheDocument();
      expect(screen.getByTestId("tab-edit")).toBeInTheDocument();
      expect(screen.getByText("Rev 2")).toBeInTheDocument();
    });

    it("switching to Edit tab and typing updates draft and reveals Save bar", async () => {
      mockApi.mockResolvedValueOnce(mockDocData);

      render(
        <DocumentColumn
          id="doc-abc"
          index={1}
          width={500}
          workspaceId="ws-1"
          onBack={jest.fn()}
          onCloseAll={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Architecture Spec")).toBeInTheDocument();
      });

      // Click Edit tab
      fireEvent.click(screen.getByTestId("tab-edit"));
      const textarea = screen.getByTestId("document-editor-textarea");
      expect(textarea).toHaveValue("# Architecture\n\nMicroservices with event sourcing.");

      // Change content
      fireEvent.change(textarea, {
        target: { value: "# Architecture\n\nMicroservices with Kafka and Go." },
      });

      // Save bar should appear
      expect(screen.getByTestId("doc-save-bar")).toBeInTheDocument();
      expect(screen.getByTestId("doc-save-btn")).toBeInTheDocument();

      // Click Save
      mockApi.mockResolvedValueOnce({ data: { revision: 3 } });
      mockApi.mockResolvedValueOnce(mockDocData);

      fireEvent.click(screen.getByTestId("doc-save-btn"));

      await waitFor(() => {
        expect(mockApi).toHaveBeenCalledWith(
          "/api/v1/documents/doc-abc/revisions",
          expect.objectContaining({
            method: "POST",
            json: expect.objectContaining({
              content: "# Architecture\n\nMicroservices with Kafka and Go.",
              baseRevision: 2,
            }),
          })
        );
      });
    });
  });
});
