import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { WorkspaceHome } from "@/components/home/workspace-home";
import { Composer } from "@/components/workspace/composer";
import QueryProvider, { createAppQueryClient } from "@/components/providers/query-provider";
import { useUiStore } from "@/lib/stores/ui";
import {
  STARTER_TEMPLATES,
  STARTER_CATEGORIES,
} from "@/lib/templates/starter-library";
import enMessages from "../messages/en.json";
import esMessages from "../messages/es.json";
import frMessages from "../messages/fr.json";
import type { HomeData } from "@/lib/api/hooks/home";

const mockPush = jest.fn();
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  usePathname: () => "/workspaces",
}));

function resolveKey(obj: any, key: string): string {
  const parts = key.split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur && typeof cur === "object" && part in cur) {
      cur = cur[part];
    } else {
      return key;
    }
  }
  return typeof cur === "string" ? cur : key;
}

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    return (key: string, values?: Record<string, unknown>) => {
      const ns = (
        enMessages as unknown as Record<string, any>
      )[namespace] || {};
      let template = resolveKey(ns, key);
      if (values) {
        Object.entries(values).forEach(([k, v]) => {
          template = template.replace(`{${k}}`, String(v));
        });
      }
      return template;
    };
  },
  useLocale: () => "en",
}));

describe("Step F4.3 — Starter templates switch composer mode", () => {
  const mockHomeData: HomeData = {
    user: {
      id: "user-1",
      name: "Test User",
      email: "test@example.com",
      image: null,
      username: "testuser",
    },
    credits: {
      plan: "LITE",
      balance: 100,
      monthlyAllowance: 500,
      dailySpend: 10,
      dailyCap: 200,
    },
    recent: [],
    projects: [],
    sharedWithMe: [],
    onboarding: {
      isNewAccount: false,
      hasEmailVerified: true,
      hasCreatedWorkspace: true,
      hasUsedTemplate: true,
      hasShared: true,
    },
  };

  beforeAll(() => {
    window.scrollTo = jest.fn();
  });

  beforeEach(() => {
    mockPush.mockClear();
    mockRefresh.mockClear();
    useUiStore.getState().resetTransientUi();
  });

  function renderHome(data: HomeData = mockHomeData) {
    const queryClient = createAppQueryClient();
    queryClient.setQueryData(["home", "user-1"], data);
    queryClient.setQueryData(["me", "entitlements"], {
      plan: data.credits.plan,
      models: ["text-economy", "text-standard", "image-standard"],
      limits: {
        attachmentsPerWorkspace: 5,
        maxFileMB: 10,
        members: 2,
        exportFormats: ["md", "pdf", "docx"],
        grounding: true,
        images: data.credits.plan !== "FREE",
        searchesPerDay: 50,
        voiceSecondsPerDay: 300,
      },
      features: {
        images: data.credits.plan !== "FREE",
        webSearch: true,
        documentReview: true,
        voiceInput: true,
        collaboration: true,
      },
    });

    return render(
      <QueryProvider client={queryClient}>
        <WorkspaceHome userId="user-1" userName="Test User" initialData={data} />
      </QueryProvider>
    );
  }

  describe("1. Starter Library Data & Localization (en, es, fr)", () => {
    it("all 21 starter templates have valid promptKey and non-empty translations in all 3 locales", () => {
      expect(STARTER_TEMPLATES).toHaveLength(21);

      for (const t of STARTER_TEMPLATES) {
        expect(t.promptKey).toMatch(/^prompts\./);
        const promptId = t.promptKey.replace("prompts.", "");

        // EN
        const enPrompt = (enMessages.Templates as any).prompts?.[promptId];
        expect(enPrompt).toBeDefined();
        expect(typeof enPrompt).toBe("string");
        expect(enPrompt.length).toBeGreaterThan(10);

        // ES
        const esPrompt = (esMessages.Templates as any).prompts?.[promptId];
        expect(esPrompt).toBeDefined();
        expect(typeof esPrompt).toBe("string");
        expect(esPrompt.length).toBeGreaterThan(10);

        // FR
        const frPrompt = (frMessages.Templates as any).prompts?.[promptId];
        expect(frPrompt).toBeDefined();
        expect(typeof frPrompt).toBe("string");
        expect(frPrompt.length).toBeGreaterThan(10);
      }
    });
  });

  describe("2. Template Selection & Mode Switching", () => {
    it("choosing an image template switches composer to 'Create image' mode and inserts prompt", async () => {
      renderHome(mockHomeData);

      const composer = screen.getByRole("region", { name: "Composer" });
      const starter = document.getElementById("starter-library-section")!;
      const textarea = within(composer).getByPlaceholderText(
        /What would you like to explore, draft, or build today/i
      ) as HTMLTextAreaElement;

      // Switch category to "Create image" in Starter Library
      const imageCatBtn = within(starter).getByRole("button", { name: /^Create image$/i });
      fireEvent.click(imageCatBtn);

      // Find "Use Template" buttons in the Image category
      const useBtns = within(starter).getAllByRole("button", { name: /Use Template/i });
      expect(useBtns.length).toBeGreaterThan(0);

      // Click the first image template ("Studio Portrait")
      fireEvent.click(useBtns[0]!);

      await waitFor(() => {
        expect(textarea.value).toContain("{{subject}}");
        expect(textarea.value).toContain("portrait");
      });

      // The Create image tab button in composer has active styling
      const createImgTab = within(composer).getByRole("button", { name: /Create Image/i });
      expect(createImgTab.className).toContain("text-accent");
    });

    it("choosing a text template switches back to chat mode", async () => {
      renderHome(mockHomeData);

      const composer = screen.getByRole("region", { name: "Composer" });
      const starter = document.getElementById("starter-library-section")!;
      const textarea = within(composer).getByPlaceholderText(
        /What would you like to explore, draft, or build today/i
      ) as HTMLTextAreaElement;

      // First select image template
      const imageCatBtn = within(starter).getByRole("button", { name: /^Create image$/i });
      fireEvent.click(imageCatBtn);
      const imgUseBtns = within(starter).getAllByRole("button", { name: /Use Template/i });
      fireEvent.click(imgUseBtns[0]!);

      await waitFor(() => {
        expect(textarea.value).toContain("{{subject}}");
      });

      // Now switch back to "Write" category
      const writeCatBtn = within(starter).getByRole("button", { name: /^Write$/i });
      fireEvent.click(writeCatBtn);

      const writeUseBtns = within(starter).getAllByRole("button", { name: /Use Template/i });
      fireEvent.click(writeUseBtns[0]!); // "Executive Summary"

      await waitFor(() => {
        expect(textarea.value).toContain("{{notes}}");
      });

      // Chat tab in composer is active
      const chatTab = within(composer).getByRole("button", { name: /^Chat$/i });
      expect(chatTab.className).toContain("text-accent");
    });

    it("clicking the same template twice re-inserts the prompt", async () => {
      renderHome(mockHomeData);

      const composer = screen.getByRole("region", { name: "Composer" });
      const starter = document.getElementById("starter-library-section")!;
      const textarea = within(composer).getByPlaceholderText(
        /What would you like to explore, draft, or build today/i
      ) as HTMLTextAreaElement;

      const writeCatBtn = within(starter).getByRole("button", { name: /^Write$/i });
      fireEvent.click(writeCatBtn);

      const writeUseBtns = within(starter).getAllByRole("button", { name: /Use Template/i });
      fireEvent.click(writeUseBtns[0]!);

      await waitFor(() => {
        expect(textarea.value).toContain("{{notes}}");
      });

      // User modifies or clears textarea
      fireEvent.change(textarea, { target: { value: "User typed something else" } });
      expect(textarea.value).toBe("User typed something else");

      // Click the same template again
      fireEvent.click(writeUseBtns[0]!);

      await waitFor(() => {
        expect(textarea.value).toContain("{{notes}}");
        expect(textarea.value).not.toBe("User typed something else");
      });
    });
  });

  describe("3. Plan-Gating when Image Mode is Locked (Free Plan)", () => {
    it("still inserts the prompt, keeps text mode, and displays an inline notice with Upgrade link", async () => {
      const freeHomeData: HomeData = {
        ...mockHomeData,
        credits: {
          ...mockHomeData.credits,
          plan: "FREE",
        },
      };

      renderHome(freeHomeData);

      const composer = screen.getByRole("region", { name: "Composer" });
      const starter = document.getElementById("starter-library-section")!;
      const textarea = within(composer).getByPlaceholderText(
        /What would you like to explore, draft, or build today/i
      ) as HTMLTextAreaElement;

      // Select image category and template
      const imageCatBtn = within(starter).getByRole("button", { name: /^Create image$/i });
      fireEvent.click(imageCatBtn);

      const useBtns = within(starter).getAllByRole("button", { name: /Use Template/i });
      fireEvent.click(useBtns[0]!); // Studio Portrait

      // 1. Prompt is still inserted
      await waitFor(() => {
        expect(textarea.value).toContain("{{subject}}");
      });

      // 2. Chat mode is kept (not switched to image mode)
      const chatTab = within(composer).getByRole("button", { name: /^Chat$/i });
      expect(chatTab.className).toContain("text-accent");

      // 3. Inline notice is displayed with Upgrade link
      const notice = await screen.findByRole("alert");
      expect(notice).toHaveTextContent(/Image generation is available on Lite and above/i);

      const upgradeLink = within(notice).getByRole("link", { name: /Upgrade/i });
      expect(upgradeLink).toBeInTheDocument();
      expect(upgradeLink).toHaveAttribute("href", "/settings");
    });
  });
});
