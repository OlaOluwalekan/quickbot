import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { WorkspaceHome } from "@/components/home/workspace-home";
import { Composer } from "@/components/workspace/composer";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import QueryProvider, { createAppQueryClient } from "@/components/providers/query-provider";
import { useUiStore } from "@/lib/stores/ui";
import { STARTER_TEMPLATES } from "@/lib/templates/starter-library";
import { entitlementsForPlan } from "@/lib/entitlements/shared";
import type { PlanKey } from "@/server/billing/plans";
import enMessages from "../messages/en.json";
import esMessages from "../messages/es.json";
import frMessages from "../messages/fr.json";
import type { HomeData } from "@/lib/api/hooks/home";
import {
  DEFAULT_PUBLIC_SITE_CONFIG,
  SiteConfigProvider,
} from "@/components/providers/site-config-provider";

const mockPush = jest.fn();
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  usePathname: () => "/workspaces",
}));

describe("Step F4.3 — Starter templates switch composer mode", () => {
  const mockHomeData: HomeData = {
    credits: { plan: "LITE", balance: 100, resetsAt: null },
    recent: [],
    projects: [],
    sharedWithMe: [],
    onboarding: {
      emailVerified: true,
      usernameChosen: true,
      hasWorkspace: true,
      hasProject: true,
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

  // Entitlements come from the server (GET /api/v1/me/entitlements), never
  // from the home credits card.
  function renderHome(plan: PlanKey = "LITE", data: HomeData = mockHomeData) {
    const queryClient = createAppQueryClient();
    queryClient.setQueryData(["home", "user-1"], data);
    queryClient.setQueryData(["me", "entitlements"], entitlementsForPlan(plan));

    return render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryProvider client={queryClient}>
          <WorkspaceHome userId="user-1" userName="Test User" initialData={data} />
        </QueryProvider>
      </NextIntlClientProvider>
    );
  }

  describe("1. Starter Library Data & Localization (en, es, fr)", () => {
    it("all 21 starter templates have valid promptKey and non-empty translations in all 3 locales", () => {
      expect(STARTER_TEMPLATES).toHaveLength(21);

      for (const t of STARTER_TEMPLATES) {
        expect(t.promptKey).toMatch(/^prompts\./);
        const promptId = t.promptKey.replace("prompts.", "");

        // EN
        const enPrompt = (enMessages.Templates.prompts as Record<string, string>)[promptId];
        expect(enPrompt).toBeDefined();
        expect(typeof enPrompt).toBe("string");
        expect(enPrompt!.length).toBeGreaterThan(10);

        // ES
        const esPrompt = (esMessages.Templates.prompts as Record<string, string>)[promptId];
        expect(esPrompt).toBeDefined();
        expect(typeof esPrompt).toBe("string");
        expect(esPrompt!.length).toBeGreaterThan(10);

        // FR
        const frPrompt = (frMessages.Templates.prompts as Record<string, string>)[promptId];
        expect(frPrompt).toBeDefined();
        expect(typeof frPrompt).toBe("string");
        expect(frPrompt!.length).toBeGreaterThan(10);
      }
    });
  });

  it("every prompt formats with its {{placeholders}} intact (ICU quoting) in en, es and fr", () => {
    for (const [locale, messages] of [
      ["en", enMessages],
      ["es", esMessages],
      ["fr", frMessages],
    ] as const) {
      const t = createTranslator({ locale, messages, namespace: "Templates" });
      for (const tpl of STARTER_TEMPLATES) {
        const text = t(tpl.promptKey as never) as string;
        expect(text).toMatch(/\{\{[a-z_]+\}\}/);
        expect(text).not.toMatch(/'\{\{|\}\}'/);
      }
    }
  });

  describe("2. Template Selection & Mode Switching", () => {
    it("choosing an image template switches composer to 'Create image' mode and inserts prompt", async () => {
      renderHome();

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
      expect(createImgTab).toHaveAttribute("aria-pressed", "true");
      expect(textarea.value).not.toContain("'{{");
    });

    it("choosing a text template switches back to chat mode", async () => {
      renderHome();

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
      expect(chatTab).toHaveAttribute("aria-pressed", "true");
    });

    it("clicking the same template twice re-inserts the prompt", async () => {
      renderHome();

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
    it("gates image template in starter library and Composer preserves prompt, keeps text mode on image prefill", async () => {
      renderHome("FREE");

      const composer = screen.getByRole("region", { name: "Composer" });
      const starter = document.getElementById("starter-library-section")!;

      // 1. In StarterLibrary, image template is directly gated (F4.4)
      const imageCatBtn = within(starter).getByRole("button", { name: /^Create image$/i });
      fireEvent.click(imageCatBtn);

      const useBtns = within(starter).getAllByRole("button", { name: /Use Template/i });
      const firstUseBtn = useBtns[0]!;
      expect(firstUseBtn.closest("[data-gated='requires_plan']")).toBeInTheDocument();
      expect(firstUseBtn).toHaveAttribute("aria-disabled", "true");

      // 2. When an image prefill is applied to Composer on Free plan,
      // it still inserts the prompt, keeps Chat mode, and displays the inline notice with Upgrade link
      const queryClient = createAppQueryClient();
      queryClient.setQueryData(["me", "entitlements"], entitlementsForPlan("FREE"));

      const composerResult = render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <QueryProvider client={queryClient}>
            <Composer
              prefill={{
                prompt: "Studio portrait of {{subject}}",
                mode: "image",
                nonce: 42,
              }}
            />
          </QueryProvider>
        </NextIntlClientProvider>
      );

      const textarea = composerResult.container.querySelector(
        "#composer-textarea"
      ) as HTMLTextAreaElement;

      // Prompt is inserted
      await waitFor(() => {
        expect(textarea.value).toContain("{{subject}}");
      });

      // Chat mode is kept (not switched to image mode)
      const chatTab = within(composerResult.container).getByRole("button", { name: /^Chat$/i });
      expect(chatTab).toHaveAttribute("aria-pressed", "true");

      // Inline notice is displayed with Upgrade link
      const message = await within(composerResult.container).findByText(/Image generation is available/);
      const notice = message.closest<HTMLElement>('[role="status"]')!;
      expect(notice).not.toBeNull();
      expect(notice).toHaveTextContent(
        "Image generation is available on the Lite plan and above."
      );

      // Billing is off by default: the reason stays, the Upgrade link doesn't (rule 9).
      expect(within(notice).queryByRole("link", { name: /Upgrade/i })).toBeNull();
    });

    it("shows the Upgrade link on the image notice only while billing is on", async () => {
      const queryClient = createAppQueryClient();
      queryClient.setQueryData(["me", "entitlements"], entitlementsForPlan("FREE"));

      const { container } = render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <SiteConfigProvider value={{ ...DEFAULT_PUBLIC_SITE_CONFIG, billingEnabled: true }}>
            <QueryProvider client={queryClient}>
              <Composer prefill={{ prompt: "Studio portrait", mode: "image", nonce: 43 }} />
            </QueryProvider>
          </SiteConfigProvider>
        </NextIntlClientProvider>
      );

      const message = await within(container).findByText(/Image generation is available/);
      const notice = message.closest<HTMLElement>('[role="status"]')!;
      const upgradeLink = within(notice).getByRole("link", { name: /Upgrade/i });
      expect(upgradeLink).toHaveAttribute("href", "/pricing");
    });
  });
});
