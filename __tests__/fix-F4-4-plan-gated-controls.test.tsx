import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import QueryProvider, { createAppQueryClient } from "@/components/providers/query-provider";
import { creditsGateReason, entitlementsForPlan } from "@/lib/entitlements/shared";
import type { PlanKey } from "@/server/billing/plans";
import {
  MODEL_CATALOG,
  formatModelCreditHint,
  getClientModels,
  creditsFor,
} from "@/lib/ai/model-catalog";
import { Composer } from "@/components/workspace/composer";
import { queryKeys } from "@/lib/api/hooks/query-keys";
import { StarterLibrary } from "@/components/home/starter-library";
import { ShareAndPeopleDialog } from "@/components/workspace/ShareAndPeopleDialog";
import { SelectionToolbar } from "@/components/annotations/selection-toolbar";
import { DocumentReview } from "@/components/response/document-review-popover";
import { ResponseCard } from "@/components/response/response-card";
import enMessages from "../messages/en.json";
import esMessages from "../messages/es.json";
import frMessages from "../messages/fr.json";

// Mocks
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => "/workspaces",
}));

describe("Step F4.4 — Plan-locked models and features are disabled with a reason", () => {
  let responseRoot: HTMLElement;

  beforeAll(() => {
    window.scrollTo = jest.fn();
    if (typeof Range.prototype.getBoundingClientRect !== "function") {
      Range.prototype.getBoundingClientRect = function () {
        return {
          top: 100,
          left: 100,
          bottom: 120,
          right: 200,
          width: 100,
          height: 20,
          x: 100,
          y: 100,
          toJSON: () => ({}),
        } as DOMRect;
      };
    }
  });

  // What `GET .../members` returns as `inviteCapacity` (the owner's plan, counted on the server).
  let inviteCapacity: { limit: number; used: number; inGrace: boolean } | undefined;

  beforeEach(() => {
    inviteCapacity = undefined;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            canManage: true,
            isOwner: true,
            members: [],
            invitations: [],
            shares: [],
            activity: [],
            inviteCapacity,
          }),
      } as Response)
    );

    responseRoot = document.createElement("div");
    responseRoot.setAttribute("data-annot-root", "true");
    responseRoot.setAttribute("data-annot-target-type", "RESPONSE_VERSION");
    responseRoot.setAttribute("data-annot-target-id", "ver_version_1");
    responseRoot.setAttribute("data-annot-depth", "0");
    responseRoot.setAttribute("data-workspace-id", "ws_123");
    responseRoot.innerHTML = "<p id='resp_text'>Distributed consensus is required for fault tolerance.</p>";
    document.body.appendChild(responseRoot);
  });

  afterEach(() => {
    if (responseRoot.parentElement) {
      responseRoot.remove();
    }
    jest.clearAllMocks();
  });

  function mockSelection(container: Node, startOffset: number, endOffset: number) {
    const range = document.createRange();
    range.setStart(container, startOffset);
    range.setEnd(container, endOffset);

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }

    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
  }

  function renderWithProviders(
    ui: React.ReactElement,
    plan: PlanKey = "FREE",
    locale: "en" | "es" | "fr" = "en",
    seed?: (client: ReturnType<typeof createAppQueryClient>) => void
  ) {
    const queryClient = createAppQueryClient();
    queryClient.setQueryData(["me", "entitlements"], entitlementsForPlan(plan));
    seed?.(queryClient);

    const messages =
      locale === "es" ? esMessages : locale === "fr" ? frMessages : enMessages;

    return render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <QueryProvider client={queryClient}>{ui}</QueryProvider>
      </NextIntlClientProvider>
    );
  }

  function modelsTranslator(msgs: typeof enMessages) {
    return (key: string, values?: Record<string, string | number>) => {
      let cur: unknown = msgs.Models;
      for (const p of key.split(".")) {
        cur = (cur as Record<string, unknown> | undefined)?.[p];
      }
      if (typeof cur !== "string") return key;
      return values ? cur.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? `{${k}}`)) : cur;
    };
  }

  describe("1. Isomorphic Model Catalog (lib/ai/model-catalog.ts)", () => {
    it("defines model entries with typical credits derived from registry numbers", () => {
      expect(MODEL_CATALOG["text-economy"].typicalCredits).toBe(2);
      expect(MODEL_CATALOG["text-standard"].typicalCredits).toBe(7);
      // Computed from the price (0.067 USD / 0.002 per credit), the same as a real charge.
      expect(MODEL_CATALOG["image-standard"].typicalCredits).toBe(
        creditsFor("image-standard", { images: 1 })
      );
      expect(MODEL_CATALOG["image-standard"].typicalCredits).toBe(34);

      expect(MODEL_CATALOG["text-economy"].minPlan).toBe("FREE");
      expect(MODEL_CATALOG["text-standard"].minPlan).toBe("LITE");
      expect(MODEL_CATALOG["image-standard"].minPlan).toBe("LITE");
    });

    it("computes credit hints dynamically without hardcoding", () => {
      const tEn = modelsTranslator(enMessages);
      expect(formatModelCreditHint(MODEL_CATALOG["text-economy"], tEn)).toBe(
        "≈ 2 credits per message"
      );
      expect(formatModelCreditHint(MODEL_CATALOG["text-standard"], tEn)).toBe(
        "≈ 7 credits per message"
      );
      expect(formatModelCreditHint(MODEL_CATALOG["image-standard"], tEn)).toBe(
        "≈ 34 per image"
      );
    });

    it("provides translated client models for all 3 locales", () => {
      for (const loc of ["en", "es", "fr"] as const) {
        const msgs = loc === "es" ? esMessages : loc === "fr" ? frMessages : enMessages;
        const tModels = modelsTranslator(msgs);

        const textModels = getClientModels(tModels, "TEXT");
        expect(textModels).toHaveLength(2);
        expect(textModels[0]!.name.length).toBeGreaterThan(0);
        expect(textModels[0]!.creditHint).toContain("2");
        expect(textModels[1]!.name.length).toBeGreaterThan(0);
        expect(textModels[1]!.creditHint).toContain("7");

        const imageModels = getClientModels(tModels, "IMAGE");
        expect(imageModels).toHaveLength(1);
        expect(imageModels[0]!.name.length).toBeGreaterThan(0);
        expect(imageModels[0]!.creditHint).toContain("34");
      }
    });

    it("calculates credits isomorphically with creditsFor", () => {
      expect(creditsFor("text-economy", { inputTokens: 2500, outputTokens: 1300 })).toBe(2);
      expect(creditsFor("text-standard", { inputTokens: 2500, outputTokens: 1300 })).toBe(7);
      expect(creditsFor("image-standard", { images: 1 })).toBe(34);
    });
  });

  describe("2. Composer Model Picker & Mode Switch Gating", () => {
    it("on FREE plan: Standard model is gated with requires_plan LITE, Image mode is gated", async () => {
      renderWithProviders(<Composer />, "FREE");

      // Model Picker
      const modelTrigger = screen.getByTestId("composer-model-trigger");
      expect(modelTrigger).toHaveTextContent("Fast & Efficient");
      fireEvent.click(modelTrigger);

      const standardOption = screen.getByTestId("model-option-text-standard");
      const gatedWrapper = standardOption.closest("[data-gated='requires_plan']");
      expect(gatedWrapper).toBeInTheDocument();
      expect(standardOption).toHaveAttribute("aria-disabled", "true");

      // Verify no free-text plan badge inside the option
      expect(screen.queryByText(/^LITE$/)).not.toBeInTheDocument();

      // Keyboard focus triggers the tooltip
      fireEvent.focus(gatedWrapper!);
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          /Available on the Lite plan and above/i
        );
      });

      // Clicking standard model should NOT select it
      fireEvent.click(standardOption);
      expect(screen.getByTestId("composer-model-trigger")).toHaveTextContent("Fast & Efficient");

      // Image Mode Tab
      const imageTab = screen.getByTestId("mode-tab-image");
      const imageGatedWrapper = imageTab.closest("[data-gated='requires_plan']");
      expect(imageGatedWrapper).toBeInTheDocument();
      expect(imageTab).toHaveAttribute("aria-disabled", "true");

      fireEvent.focus(imageGatedWrapper!);
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          /Available on the Lite plan and above/i
        );
      });

      // Clicking image mode does not change mode
      fireEvent.click(imageTab);
      expect(imageTab).toHaveAttribute("aria-pressed", "false");
    });

    it("on PRO plan: Standard model and Image mode are fully enabled", async () => {
      renderWithProviders(<Composer />, "PRO");

      // Standard model in picker
      const modelTrigger = screen.getByTestId("composer-model-trigger");
      expect(modelTrigger).toHaveTextContent("Fast & Efficient");
      fireEvent.click(modelTrigger);

      const standardOption = screen.getByTestId("model-option-text-standard");
      expect(standardOption.closest("[data-gated]")).toBeNull();
      expect(standardOption).not.toHaveAttribute("aria-disabled", "true");

      // Click selects standard model
      fireEvent.click(standardOption);
      await waitFor(() => {
        expect(screen.getByTestId("composer-model-trigger")).toHaveTextContent("Standard Reasoning");
      });

      // Image mode tab
      const imageTab = screen.getByTestId("mode-tab-image");
      expect(imageTab.closest("[data-gated]")).toBeNull();
      expect(imageTab).not.toHaveAttribute("aria-disabled", "true");

      fireEvent.click(imageTab);
      expect(imageTab).toHaveAttribute("aria-pressed", "true");
    });

    it("has no Think harder toggle (removed: it had no effect)", () => {
      renderWithProviders(<Composer />, "PRO");
      expect(screen.queryByTestId("composer-think-harder-btn")).not.toBeInTheDocument();
    });

    it("Send button is gated when actor lacks canGenerate permission", async () => {
      renderWithProviders(<Composer canGenerate={false} />, "PRO");

      const sendBtn = screen.getByRole("button", { name: /Send/i });
      const sendGated = sendBtn.closest("[data-gated='no_permission']");
      expect(sendGated).toBeInTheDocument();
      expect(sendBtn).toHaveAttribute("aria-disabled", "true");

      fireEvent.focus(sendGated!);
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          /You do not have permission to/i
        );
      });
    });
  });

  describe("2b. Composer limits and credits come from the workspace owner", () => {
    beforeEach(() => {
      // The question queue (inside the composer) lists its questions.
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response)
      );
    });

    function seedWorkspace(data: Record<string, unknown>) {
      return (client: ReturnType<typeof createAppQueryClient>) =>
        client.setQueryData(queryKeys.workspaces.detail("user-1", "ws-1"), {
          id: "ws-1",
          title: "W",
          createdBy: "owner-1",
          createdAt: "",
          updatedAt: "",
          ...data,
        });
    }

    it("attach button is gated (still visible) when the workspace's attachment limit is reached", async () => {
      renderWithProviders(
        <Composer workspaceId="ws-1" userId="user-1" />,
        "PRO",
        "en",
        seedWorkspace({ role: "EDITOR", attachmentLimits: { max: 3, used: 3, maxFileMB: 5 } })
      );

      const attachBtn = await screen.findByTestId("composer-attach-btn");
      const gated = attachBtn.closest("[data-gated='attachment_limit']");
      expect(gated).toBeInTheDocument();
      expect(attachBtn).toHaveAttribute("aria-disabled", "true");
      fireEvent.focus(gated!);
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent(/limit of 3 attachments/i);
      });
      fireEvent.click(attachBtn);
      expect(screen.queryByTestId("composer-attach-menu")).toBeNull();
    });

    it("a member sees the owner is out of credits: Send gated, no upgrade link", async () => {
      renderWithProviders(
        <Composer workspaceId="ws-1" userId="user-1" />,
        "PRO",
        "en",
        seedWorkspace({ role: "EDITOR", ownerOutOfCredits: true })
      );

      expect(await screen.findByText(/The workspace owner is out of credits/i)).toBeInTheDocument();
      const sendBtn = screen.getByRole("button", { name: /^Send$/i });
      expect(sendBtn.closest("[data-gated='owner_out_of_credits']")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Upgrade/i })).toBeNull();
    });

    it("a member at the monthly limit the owner set: Send gated with the limit, no upgrade link", async () => {
      renderWithProviders(
        <Composer workspaceId="ws-1" userId="user-1" />,
        "PRO",
        "en",
        // Checked before the owner's balance, as the server does.
        seedWorkspace({ role: "EDITOR", memberCreditCapReached: { cap: 300 }, ownerOutOfCredits: true })
      );

      expect(
        await screen.findByText(/used the monthly limit of 300 credits the workspace owner set/i)
      ).toBeInTheDocument();
      const sendBtn = screen.getByRole("button", { name: /^Send$/i });
      expect(sendBtn.closest("[data-gated='member_credit_cap']")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Upgrade/i })).toBeNull();
    });

    it("Enter does not submit when the actor lacks generate", () => {
      const onSubmitted = jest.fn();
      renderWithProviders(<Composer canGenerate={false} onCompleted={onSubmitted} />, "PRO");
      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, { target: { value: "hello" } });
      fireEvent.keyDown(textarea, { key: "Enter" });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("3. Starter Templates Image Mode Gating", () => {
    it("on FREE plan: image templates have gated 'Use template' button", async () => {
      const onUseTemplate = jest.fn();
      renderWithProviders(<StarterLibrary onUseTemplate={onUseTemplate} />, "FREE");

      // Click 'Create image' category to view image templates
      const imageCategoryTab = screen.getByRole("button", { name: /^Create image$/i });
      fireEvent.click(imageCategoryTab);

      const useTemplateButtons = screen.getAllByRole("button", { name: /Use template/i });
      const firstBtn = useTemplateButtons[0]!;
      const gatedWrapper = firstBtn.closest("[data-gated='requires_plan']");
      expect(gatedWrapper).toBeInTheDocument();
      expect(firstBtn).toHaveAttribute("aria-disabled", "true");

      fireEvent.focus(gatedWrapper!);
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          /Available on the Lite plan and above/i
        );
      });

      fireEvent.click(firstBtn);
      expect(onUseTemplate).not.toHaveBeenCalled();
    });

    it("on PRO plan: image templates are enabled", () => {
      const onUseTemplate = jest.fn();
      renderWithProviders(<StarterLibrary onUseTemplate={onUseTemplate} />, "PRO");

      const imageCategoryTab = screen.getByRole("button", { name: /^Create image$/i });
      fireEvent.click(imageCategoryTab);

      const useTemplateButtons = screen.getAllByRole("button", { name: /Use template/i });
      const firstBtn = useTemplateButtons[0]!;
      expect(firstBtn.closest("[data-gated]")).toBeNull();
      expect(firstBtn).not.toHaveAttribute("aria-disabled", "true");

      fireEvent.click(firstBtn);
      expect(onUseTemplate).toHaveBeenCalledTimes(1);
    });
  });

  describe("4. ShareAndPeopleDialog Member Limit Gating", () => {
    it("owner's plan has no collaborators: Invite button is gated with member_limit", async () => {
      inviteCapacity = { limit: 0, used: 0, inGrace: false };
      // The viewer's own plan doesn't matter: the owner's limit comes from the server.
      renderWithProviders(
        <ShareAndPeopleDialog
          open={true}
          onOpenChange={jest.fn()}
          workspaceId="ws-1"
          workspaceTitle="Test Workspace"
          currentUserId="user-1"
          initialTab="invite"
        />,
        "PRO"
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /^Invite$/i }).closest("[data-gated]")
        ).not.toBeNull();
      });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^Invite$/i })).toBeInTheDocument();
      });

      const inviteBtn = screen.getByRole("button", { name: /^Invite$/i });
      const gatedWrapper = inviteBtn.closest("[data-gated='member_limit']");
      expect(gatedWrapper).toBeInTheDocument();
      expect(inviteBtn).toHaveAttribute("aria-disabled", "true");

      fireEvent.focus(gatedWrapper!);
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          /This plan doesn't include collaborators/i
        );
      });
    });

    it("owner's limit reached by members + pending invites: Invite is gated with the limit", async () => {
      inviteCapacity = { limit: 5, used: 5, inGrace: false };
      renderWithProviders(
        <ShareAndPeopleDialog
          open={true}
          onOpenChange={jest.fn()}
          workspaceId="ws-1"
          workspaceTitle="Test Workspace"
          currentUserId="user-1"
          initialTab="invite"
        />,
        "FREE"
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /^Invite$/i }).closest("[data-gated='member_limit']")
        ).not.toBeNull();
      });
      fireEvent.focus(
        screen.getByRole("button", { name: /^Invite$/i }).closest("[data-gated]")!
      );
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          /This plan allows up to 5 collaborators/i
        );
      });
    });

    it("room left under the owner's limit: Invite button is enabled", async () => {
      inviteCapacity = { limit: 15, used: 2, inGrace: false };
      renderWithProviders(
        <ShareAndPeopleDialog
          open={true}
          onOpenChange={jest.fn()}
          workspaceId="ws-1"
          workspaceTitle="Test Workspace"
          currentUserId="user-1"
          initialTab="invite"
        />,
        "FREE"
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^Invite$/i })).toBeInTheDocument();
      });

      const inviteBtn = screen.getByRole("button", { name: /^Invite$/i });
      expect(inviteBtn.closest("[data-gated]")).toBeNull();
      expect(inviteBtn).not.toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("5. Selection Toolbar Permissions, Max Depth & Out of Credits Gating", () => {
    it("gates Comment button when effectiveCanComment is false", async () => {
      renderWithProviders(
        <SelectionToolbar
          canComment={false}
          canAsk={true}
        />
      );

      const textNode = responseRoot.querySelector("#resp_text")!.firstChild!;
      mockSelection(textNode, 0, 21);

      await waitFor(() => {
        expect(screen.getByTestId("selection-toolbar")).toBeInTheDocument();
      });

      const commentBtn = screen.getByTestId("action-comment");
      const gated = commentBtn.closest("[data-gated='no_permission']");
      expect(gated).toBeInTheDocument();
      expect(commentBtn).toHaveAttribute("aria-disabled", "true");

      fireEvent.focus(gated!);
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          /You do not have permission to comment/i
        );
      });
    });

    it("gates Ask button when max thread depth is exceeded", async () => {
      responseRoot.setAttribute("data-annot-depth", "100");

      renderWithProviders(
        <SelectionToolbar
          canComment={true}
          canAsk={true}
        />
      );

      const textNode = responseRoot.querySelector("#resp_text")!.firstChild!;
      mockSelection(textNode, 0, 21);

      await waitFor(() => {
        expect(screen.getByTestId("selection-toolbar")).toBeInTheDocument();
      });

      const askBtn = screen.getByTestId("action-ask");
      const gated = askBtn.closest("[data-gated='max_depth']");
      expect(gated).toBeInTheDocument();
      expect(askBtn).toHaveAttribute("aria-disabled", "true");

      fireEvent.focus(gated!);
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          /Maximum thread depth \(100\) reached/i
        );
      });
    });

    it("gates Ask button when the viewer (the owner) is out of credits", async () => {
      renderWithProviders(
        <SelectionToolbar
          canComment={true}
          canAsk={true}
          creditsGate={creditsGateReason({ ownerOutOfCredits: true, role: "OWNER" })}
        />
      );

      const textNode = responseRoot.querySelector("#resp_text")!.firstChild!;
      mockSelection(textNode, 0, 21);

      await waitFor(() => {
        expect(screen.getByTestId("selection-toolbar")).toBeInTheDocument();
      });

      const askBtn = screen.getByTestId("action-ask");
      const gated = askBtn.closest("[data-gated='out_of_credits']");
      expect(gated).toBeInTheDocument();
      expect(askBtn).toHaveAttribute("aria-disabled", "true");

      fireEvent.focus(gated!);
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          /You are out of credits/i
        );
      });
    });
  });

  describe("5b. Credits gate follows who pays", () => {
    it("the member's monthly limit set by the owner comes first", () => {
      expect(
        creditsGateReason({ memberCreditCapReached: { cap: 50 }, ownerOutOfCredits: true, role: "EDITOR" })
      ).toEqual({ code: "member_credit_cap", cap: 50 });
    });

    it("is null while the owner has credits", () => {
      expect(creditsGateReason({ ownerOutOfCredits: false, role: "OWNER" })).toBeNull();
      expect(creditsGateReason(undefined)).toBeNull();
    });

    it("a member sees that the owner is out of credits, without an Upgrade link", async () => {
      const reason = creditsGateReason({ ownerOutOfCredits: true, role: "EDITOR" });
      expect(reason).toEqual({ code: "owner_out_of_credits" });

      renderWithProviders(
        <SelectionToolbar canComment={true} canAsk={true} creditsGate={reason} />
      );
      const textNode = responseRoot.querySelector("#resp_text")!.firstChild!;
      mockSelection(textNode, 0, 21);
      await waitFor(() => {
        expect(screen.getByTestId("selection-toolbar")).toBeInTheDocument();
      });

      const gated = screen.getByTestId("action-ask").closest("[data-gated='owner_out_of_credits']");
      expect(gated).toBeInTheDocument();
      fireEvent.focus(gated!);
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          /The workspace owner is out of credits/i
        );
      });
      expect(screen.queryByRole("link", { name: /Upgrade/i })).toBeNull();
    });
  });

  describe("6. Ask Klecx to Review Gating (DocumentReview)", () => {
    it("gates review trigger button when canAsk is false", async () => {
      renderWithProviders(
        <DocumentReview
          versionId="v-1"
          responseId="r-1"
          canAsk={false}
        />
      );

      const triggerBtn = screen.getByTestId("ask-klecx-review-trigger");
      const gated = triggerBtn.closest("[data-gated='no_permission']");
      expect(gated).toBeInTheDocument();
      expect(triggerBtn).toHaveAttribute("aria-disabled", "true");

      fireEvent.focus(gated!);
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          /You do not have permission to ask Klecx to review/i
        );
      });
    });

    it("gates review trigger button when the owner is out of credits", async () => {
      renderWithProviders(
        <DocumentReview
          versionId="v-1"
          responseId="r-1"
          canAsk={true}
          creditsGate={{ code: "out_of_credits" }}
        />
      );

      const triggerBtn = screen.getByTestId("ask-klecx-review-trigger");
      const gated = triggerBtn.closest("[data-gated='out_of_credits']");
      expect(gated).toBeInTheDocument();
      expect(triggerBtn).toHaveAttribute("aria-disabled", "true");

      fireEvent.focus(gated!);
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          /You are out of credits/i
        );
      });
    });
  });

  describe("7. ResponseCard Regenerate Button Gating", () => {
    const mockResponse = {
      id: "res-1",
      workspaceId: "ws-1",
      prompt: "What is quantum computing?",
      content: "Quantum computing uses qubits...",
      activeVersionId: "ver-1",
      activeVersion: {
        id: "ver-1",
        number: 1,
        content: "Quantum computing uses qubits...",
      },
    };

    it("gates regenerate button when canGenerate is false", async () => {
      const onRegenerate = jest.fn();
      renderWithProviders(
        <ResponseCard
          response={mockResponse}
          workspaceId="ws-1"
          userId="user-1"
          canGenerate={false}
          onRegenerate={onRegenerate}
        />
      );

      const regenBtn = screen.getByRole("button", { name: /Regenerate/i });
      const gated = regenBtn.closest("[data-gated='no_permission']");
      expect(gated).toBeInTheDocument();
      expect(regenBtn).toHaveAttribute("aria-disabled", "true");

      fireEvent.focus(gated!);
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          /You do not have permission to generate responses/i
        );
      });

      fireEvent.click(regenBtn);
      expect(onRegenerate).not.toHaveBeenCalled();
    });

    it("enables regenerate button when canGenerate is true", () => {
      const onRegenerate = jest.fn();
      renderWithProviders(
        <ResponseCard
          response={mockResponse}
          workspaceId="ws-1"
          userId="user-1"
          canGenerate={true}
          onRegenerate={onRegenerate}
        />
      );

      const regenBtn = screen.getByRole("button", { name: /Regenerate/i });
      expect(regenBtn.closest("[data-gated]")).toBeNull();
      expect(regenBtn).not.toHaveAttribute("aria-disabled", "true");

      fireEvent.click(regenBtn);
      expect(onRegenerate).toHaveBeenCalledWith("res-1");
    });
  });
});
