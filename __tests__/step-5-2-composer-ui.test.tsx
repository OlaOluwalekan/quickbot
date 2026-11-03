import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Composer } from "@/components/workspace/composer";
import { ResponseCard, type ResponseItemData } from "@/components/response/response-card";

// Mock next-intl
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, any>) => {
    const messages: Record<string, string> = {
      attachFile: "Attach files",
      attachRemove: "Remove attachment",
      attachRetry: "Retry",
      attachLimitReached: "Maximum 3 attachments allowed for your plan",
      attachSizeExceeded: "File size exceeds 5 MB limit",
      dropFilesHere: "Drop files to attach",
      send: "Send",
      welcomeTitle: "How can Klecx help you today?",
      modeText: "Chat",
      modeImage: "Create Image",
      stop: "Stop generating",
      generatingLive: "Generating...",
      generatingDone: "Done",
      retry: "Retry",
    };
    return messages[key] || key;
  },
}));

// Mock navigation
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

// Mock client api
jest.mock("../lib/api/client", () => ({
  api: jest.fn(),
}));

// Mock uploadAttachment
jest.mock("../lib/api/attachments", () => ({
  uploadAttachment: jest.fn().mockResolvedValue("att-mock-id-123"),
}));

describe("Step 5.2 — Composer & ResponseCard Attachments UI", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.URL.createObjectURL = jest.fn(() => "mock-blob-url");
    global.URL.revokeObjectURL = jest.fn();
  });

  describe("Composer Attachments", () => {
    it("renders the active attach button (not disabled)", () => {
      render(<Composer workspaceId="ws-test" />);
      const attachBtn = screen.getByRole("button", { name: "Attach files" });
      expect(attachBtn).toBeInTheDocument();
      expect(attachBtn).not.toBeDisabled();
    });

    it("rejects files exceeding 5 MB limit with an error", async () => {
      render(<Composer workspaceId="ws-test" />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input).toBeInTheDocument();

      const largeFile = new File(["a".repeat(100)], "huge.pdf", {
        type: "application/pdf",
      });
      Object.defineProperty(largeFile, "size", { value: 6 * 1024 * 1024 });

      fireEvent.change(input, { target: { files: [largeFile] } });

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("File size exceeds 5 MB limit");
      });
    });

    it("rejects more than 3 attachments with an error", async () => {
      render(<Composer workspaceId="ws-test" />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      const f1 = new File(["1"], "f1.txt", { type: "text/plain" });
      const f2 = new File(["2"], "f2.txt", { type: "text/plain" });
      const f3 = new File(["3"], "f3.txt", { type: "text/plain" });
      const f4 = new File(["4"], "f4.txt", { type: "text/plain" });

      fireEvent.change(input, { target: { files: [f1, f2, f3, f4] } });

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("Maximum 3 attachments allowed for your plan");
      });
    });

    it("renders attachment chips when valid files are added and allows removal", async () => {
      render(<Composer workspaceId="ws-test" />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      const validDoc = new File(["content"], "report.pdf", {
        type: "application/pdf",
      });
      Object.defineProperty(validDoc, "size", { value: 2048 });

      fireEvent.change(input, { target: { files: [validDoc] } });

      await waitFor(() => {
        expect(screen.getByText("report.pdf")).toBeInTheDocument();
      });

      // Remove attachment
      const removeBtn = screen.getByRole("button", { name: "Remove attachment" });
      fireEvent.click(removeBtn);

      await waitFor(() => {
        expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
      });
    });
  });

  describe("ResponseCard Prompt Attachments", () => {
    it("renders attachment chips in the prompt bubble", () => {
      const response: ResponseItemData = {
        id: "res-123",
        workspaceId: "ws-test",
        prompt: "Analyze this document",
        kind: "TEXT",
        attachments: [
          {
            id: "att-456",
            kind: "DOCUMENT",
            originalName: "financials.pdf",
            mime: "application/pdf",
            bytes: 10240,
          },
        ],
        activeVersion: {
          id: "ver-1",
          number: 1,
          content: "Analysis completed.",
        },
      };

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <ResponseCard
            response={response}
            workspaceId="ws-test"
            userId="user-1"
          />
        </QueryClientProvider>
      );

      expect(screen.getByText("financials.pdf")).toBeInTheDocument();
      expect(screen.getByText("(10 KB)")).toBeInTheDocument();
    });
  });
});
