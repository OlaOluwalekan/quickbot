import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import NotFoundPage from "@/app/not-found";
import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";
import AppErrorPage from "@/app/(app)/error";
import WorkspaceNotFound from "@/app/(app)/workspaces/[id]/not-found";
import MaintenancePage from "@/app/maintenance/page";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

import enMessages from "../messages/en.json";

function resolveKey(namespace: string, key: string): string {
  const fullPath = `${namespace}.${key}`.split(".");
  let current: any = enMessages;
  for (const part of fullPath) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return `${namespace}.${key}`;
    }
  }
  return typeof current === "string" ? current : `${namespace}.${key}`;
}

// Mock next-intl
jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    return (key: string) => resolveKey(namespace, key);
  },
}));

jest.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => {
    return (key: string) => resolveKey(namespace, key);
  },
}));

describe("Step 4.3 — Error, empty and edge pages", () => {
  describe("Root Not Found (app/not-found.tsx)", () => {
    test("renders friendly 404 message, search form, and destination links", async () => {
      const Page = await NotFoundPage();
      render(Page);

      expect(screen.getByText("Page not found")).toBeInTheDocument();
      expect(
        screen.getByText("The page you are looking for does not exist or has been moved.")
      ).toBeInTheDocument();

      // Search bar
      expect(
        screen.getByPlaceholderText("Search help articles or guides...")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();

      // Helpful links
      expect(screen.getByRole("link", { name: /Workspaces/i })).toHaveAttribute(
        "href",
        "/workspaces"
      );
      expect(screen.getByRole("link", { name: /Help Center/i })).toHaveAttribute(
        "href",
        "/help"
      );
      expect(screen.getByRole("link", { name: /Contact Support/i })).toHaveAttribute(
        "href",
        "/support"
      );
      expect(screen.getByRole("link", { name: /System Status/i })).toHaveAttribute(
        "href",
        "/status"
      );
    });
  });

  describe("Application Root Error Page (app/error.tsx)", () => {
    test("renders friendly error without leaking stack traces or sensitive messages", () => {
      const mockReset = jest.fn();
      const testError = new Error("CRITICAL_DB_CONNECTION_FAIL: root@postgres:5432/secrets");
      testError.stack = "Error: at /server/db/secret-query.ts:12:34";

      render(<ErrorPage error={testError} reset={mockReset} />);

      // Friendly title and description
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(
        screen.getByText(
          "An unexpected error occurred while processing your request. No need to worry — your data is safe."
        )
      ).toBeInTheDocument();

      // Absolutely NO stack traces or raw sensitive messages in the DOM
      expect(screen.queryByText(/CRITICAL_DB_CONNECTION_FAIL/)).not.toBeInTheDocument();
      expect(screen.queryByText(/secret-query\.ts/)).not.toBeInTheDocument();

      // Retry button triggers reset
      const retryBtn = screen.getByRole("button", { name: /Try again/i });
      fireEvent.click(retryBtn);
      expect(mockReset).toHaveBeenCalledTimes(1);

      // Report button links to support
      const reportLink = screen.getByRole("link", { name: /Report this issue/i });
      expect(reportLink).toHaveAttribute("href", "/support");
    });

    test("displays error digest reference ID when present", () => {
      const mockReset = jest.fn();
      const testError = Object.assign(new Error("Failure"), {
        digest: "err_digest_98765",
      });

      render(<ErrorPage error={testError} reset={mockReset} />);

      expect(screen.getByText("err_digest_98765")).toBeInTheDocument();
      const reportLink = screen.getByRole("link", { name: /Report this issue/i });
      expect(reportLink).toHaveAttribute(
        "href",
        "/support?digest=err_digest_98765"
      );
    });
  });

  describe("Global Error Boundary (app/global-error.tsx)", () => {
    test("renders critical error fallback with html and body structure and retry", () => {
      const mockReset = jest.fn();
      const testError = Object.assign(new Error("Fatal root layout failure"), {
        digest: "global_digest_1122",
      });

      render(<GlobalError error={testError} reset={mockReset} />);

      expect(screen.getByText("Critical System Error")).toBeInTheDocument();
      expect(screen.getByText("global_digest_1122")).toBeInTheDocument();
      expect(screen.queryByText(/Fatal root layout failure/)).not.toBeInTheDocument();

      const retryBtn = screen.getByRole("button", { name: /Try again/i });
      fireEvent.click(retryBtn);
      expect(mockReset).toHaveBeenCalledTimes(1);
    });
  });

  describe("Authenticated Workspace Error (app/(app)/error.tsx)", () => {
    test("renders workspace error view with reload and back-to-workspaces actions", () => {
      const mockReset = jest.fn();
      const testError = Object.assign(new Error("Workspace turn render timeout"), {
        digest: "ws_digest_4455",
      });

      render(<AppErrorPage error={testError} reset={mockReset} />);

      expect(screen.getByText("Workspace encountered an issue")).toBeInTheDocument();
      expect(screen.getByText("ws_digest_4455")).toBeInTheDocument();
      expect(screen.queryByText(/Workspace turn render timeout/)).not.toBeInTheDocument();

      const reloadBtn = screen.getByRole("button", { name: /Reload view/i });
      fireEvent.click(reloadBtn);
      expect(mockReset).toHaveBeenCalledTimes(1);

      expect(screen.getByRole("link", { name: /Back to Workspaces/i })).toHaveAttribute(
        "href",
        "/workspaces"
      );
    });
  });

  describe("Workspace Not Found (app/(app)/workspaces/[id]/not-found.tsx)", () => {
    test("displays exact message avoiding resource enumeration", async () => {
      const Page = await WorkspaceNotFound();
      render(Page);

      expect(screen.getByText("Workspace not found")).toBeInTheDocument();
      expect(
        screen.getByText("This workspace does not exist or you do not have access.")
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Back to Workspaces/i })).toHaveAttribute(
        "href",
        "/workspaces"
      );
    });
  });

  describe("Maintenance Mode (app/maintenance/page.tsx & proxy.ts)", () => {
    test("maintenance page renders scheduled notice and system status link", async () => {
      const Page = await MaintenancePage();
      render(Page);

      expect(screen.getByText("Scheduled Maintenance")).toBeInTheDocument();
      expect(screen.getByText("We will be right back")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /System Status/i })).toHaveAttribute(
        "href",
        "/status"
      );
    });

    test("proxy redirects all incoming traffic to /maintenance when MAINTENANCE_MODE=true", async () => {
      const origEnv = process.env.MAINTENANCE_MODE;
      try {
        process.env.MAINTENANCE_MODE = "true";

        const reqHome = new NextRequest("http://localhost:3000/workspaces");
        const resHome = await proxy(reqHome);
        expect(resHome.status).toBe(307);
        expect(resHome.headers.get("location")).toBe("http://localhost:3000/maintenance");

        // /maintenance and /status are allowed through
        const reqMaint = new NextRequest("http://localhost:3000/maintenance");
        const resMaint = await proxy(reqMaint);
        expect(resMaint.status).toBe(200);

        const reqStatus = new NextRequest("http://localhost:3000/status");
        const resStatus = await proxy(reqStatus);
        expect(resStatus.status).toBe(200);
      } finally {
        process.env.MAINTENANCE_MODE = origEnv;
      }
    });
  });

  describe("Offline Banner Component (components/offline/offline-banner.tsx)", () => {
    test("displays offline message and responds to online/offline events", () => {
      const { container } = render(<OfflineBanner />);

      // Initially online in jsdom
      expect(screen.queryByText(/You are currently offline/i)).not.toBeInTheDocument();

      // Trigger offline event
      fireEvent(window, new Event("offline"));
      expect(screen.getByText(/You are currently offline/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Retry connection/i })).toBeInTheDocument();

      // Dismiss
      const dismissBtn = screen.getByRole("button", { name: /Dismiss/i });
      fireEvent.click(dismissBtn);
      expect(screen.queryByText(/You are currently offline/i)).not.toBeInTheDocument();
    });
  });
});
