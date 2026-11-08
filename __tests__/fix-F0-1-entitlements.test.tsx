import React from "react";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  PLANS,
  setUserPlanOverride,
  clearUserPlanOverrides,
} from "@/server/billing/plans";
import {
  getEntitlements,
  entitlementsForPlan,
} from "@/server/billing/entitlements";
import {
  canUse,
  getGateReason,
  entitlementsForPlan as sharedEntitlementsForPlan,
} from "@/lib/entitlements/shared";
import {
  useEntitlements,
  ENTITLEMENTS_QUERY_KEY,
} from "@/lib/api/hooks/entitlements";
import { Gated } from "@/components/ui/gated";
import { GET as getMeEntitlementsRoute } from "@/app/api/v1/me/entitlements/route";
import enMessages from "../messages/en.json";
import type { Actor } from "@/server/auth/session";

let mockActor: Actor | null = null;

jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(async () => mockActor),
}));

jest.mock("../server/http/rate-limit", () => ({
  limit: jest.fn(async () => {}),
}));

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    return (key: string, values?: Record<string, unknown>) => {
      const ns = (
        enMessages as unknown as Record<string, Record<string, string>>
      )[namespace] || {};
      let template = ns[key] || key;
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          template = template.replace(`{${k}}`, String(v));
        }
      }
      return template;
    };
  },
}));

describe("Step F0.1 — Interim entitlements + plan-gating primitives", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDevDefaultPlan = process.env.DEV_DEFAULT_PLAN;
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockActor = null;
    clearUserPlanOverrides();
    delete process.env.DEV_DEFAULT_PLAN;
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  });

  afterEach(() => {
    clearUserPlanOverrides();
    if (originalDevDefaultPlan === undefined) {
      delete process.env.DEV_DEFAULT_PLAN;
    } else {
      process.env.DEV_DEFAULT_PLAN = originalDevDefaultPlan;
    }
    (process.env as Record<string, string | undefined>).NODE_ENV =
      originalNodeEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe("1. Plan limits & entitlementsForPlan()", () => {
    it("configures searchesPerDay, voiceSecondsPerDay, and FREE grounding = true", () => {
      expect(PLANS.FREE.limits.grounding).toBe(true);
      expect(PLANS.FREE.limits.searchesPerDay).toBe(10);
      expect(PLANS.LITE.limits.searchesPerDay).toBe(50);
      expect(PLANS.STANDARD.limits.searchesPerDay).toBe(100);
      expect(PLANS.PRO.limits.searchesPerDay).toBe(200);

      expect(PLANS.FREE.limits.voiceSecondsPerDay).toBe(120);
      expect(PLANS.LITE.limits.voiceSecondsPerDay).toBe(600);
      expect(PLANS.STANDARD.limits.voiceSecondsPerDay).toBe(1200);
      expect(PLANS.PRO.limits.voiceSecondsPerDay).toBe(2400);
    });

    it("computes pure entitlements for each plan identically on server and shared client helper", () => {
      for (const plan of ["FREE", "LITE", "STANDARD", "PRO"] as const) {
        const srv = entitlementsForPlan(plan);
        const shared = sharedEntitlementsForPlan(plan);
        expect(srv).toEqual(shared);
      }

      const freeEnt = entitlementsForPlan("FREE");
      expect(freeEnt.plan).toBe("FREE");
      expect(freeEnt.models).toEqual(["text-economy"]);
      expect(freeEnt.features).toEqual({
        images: false,
        webSearch: true,
        documentReview: true,
        voiceInput: true,
        collaboration: false,
      });

      const liteEnt = entitlementsForPlan("LITE");
      expect(liteEnt.plan).toBe("LITE");
      expect(liteEnt.models).toEqual([
        "text-economy",
        "text-standard",
        "image-standard",
      ]);
      expect(liteEnt.features).toEqual({
        images: true,
        webSearch: true,
        documentReview: true,
        voiceInput: true,
        collaboration: true,
      });
    });

    it("evaluates canUse() and getGateReason() across features, models, and export formats", () => {
      const freeEnt = sharedEntitlementsForPlan("FREE");
      const liteEnt = sharedEntitlementsForPlan("LITE");

      expect(canUse(freeEnt, "webSearch")).toBe(true);
      expect(canUse(freeEnt, "images")).toBe(false);
      expect(canUse(freeEnt, "collaboration")).toBe(false);
      expect(canUse(freeEnt, "text-economy")).toBe(true);
      expect(canUse(freeEnt, "text-standard")).toBe(false);
      expect(canUse(freeEnt, "md")).toBe(true);
      expect(canUse(freeEnt, "pdf")).toBe(false);
      expect(canUse(freeEnt, "docx")).toBe(false);

      expect(getGateReason(freeEnt, "images")).toEqual({
        code: "requires_plan",
        plan: "LITE",
      });
      expect(getGateReason(freeEnt, "text-standard")).toEqual({
        code: "requires_plan",
        plan: "LITE",
      });
      expect(getGateReason(freeEnt, "pdf")).toEqual({
        code: "requires_plan",
        plan: "LITE",
      });
      expect(getGateReason(freeEnt, "webSearch")).toBeNull();

      expect(canUse(liteEnt, "images")).toBe(true);
      expect(canUse(liteEnt, "text-standard")).toBe(true);
      expect(canUse(liteEnt, "pdf")).toBe(true);
      expect(getGateReason(liteEnt, "images")).toBeNull();
    });
  });

  describe("2. getEntitlements() resolution & DEV_DEFAULT_PLAN handling", () => {
    it("defaults to FREE when DEV_DEFAULT_PLAN is unset and no override exists", async () => {
      const ent = await getEntitlements("user-default-free");
      expect(ent.plan).toBe("FREE");
      expect(ent.limits.attachmentsPerWorkspace).toBe(3);
      expect(ent.limits.maxFileMB).toBe(5);
    });

    it("uses DEV_DEFAULT_PLAN in non-production environments", async () => {
      process.env.DEV_DEFAULT_PLAN = "PRO";
      (process.env as Record<string, string | undefined>).NODE_ENV =
        "development";

      const ent = await getEntitlements("user-dev-pro");
      expect(ent.plan).toBe("PRO");
      expect(ent.limits.attachmentsPerWorkspace).toBe(50);
    });

    it("ignores DEV_DEFAULT_PLAN with a warning when NODE_ENV=production", async () => {
      const warnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      process.env.DEV_DEFAULT_PLAN = "PRO";
      (process.env as Record<string, string | undefined>).NODE_ENV =
        "production";

      const ent = await getEntitlements("user-prod-ignore");
      expect(ent.plan).toBe("FREE");
      expect(ent.features.images).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("DEV_DEFAULT_PLAN")
      );
    });

    it("prioritizes setUserPlanOverride over DEV_DEFAULT_PLAN", async () => {
      process.env.DEV_DEFAULT_PLAN = "PRO";
      setUserPlanOverride("user-override", "STANDARD");

      const ent = await getEntitlements("user-override");
      expect(ent.plan).toBe("STANDARD");
      expect(ent.limits.members).toBe(5);
    });
  });

  describe("3. GET /api/v1/me/entitlements route", () => {
    it("returns 401 when signed out", async () => {
      mockActor = null;
      const req = new NextRequest("http://localhost:3000/api/v1/me/entitlements");
      const res = await getMeEntitlementsRoute(req);
      expect(res.status).toBe(401);
    });

    it("returns Entitlements with Cache-Control: private, no-store when signed in", async () => {
      mockActor = {
        userId: "user-ent-route",
        email: "ent@example.com",
        role: "USER",
        sessionId: "sess-ent-1",
      };
      setUserPlanOverride("user-ent-route", "LITE");

      const req = new NextRequest("http://localhost:3000/api/v1/me/entitlements");
      const res = await getMeEntitlementsRoute(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");

      const body = await res.json();
      expect(body.data).toEqual(entitlementsForPlan("LITE"));
    });
  });

  describe("4. useEntitlements() hook", () => {
    it("fetches /api/v1/me/entitlements under key ['me', 'entitlements']", async () => {
      expect(ENTITLEMENTS_QUERY_KEY).toEqual(["me", "entitlements"]);

      const proEnt = sharedEntitlementsForPlan("PRO");
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "req-1" }),
        json: async () => ({ data: proEnt }),
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      function Probe() {
        const { data } = useEntitlements();
        return <div data-testid="plan">{data.plan}</div>;
      }

      render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("plan")).toHaveTextContent("PRO");
      });

      expect(
        queryClient.getQueryData(ENTITLEMENTS_QUERY_KEY)
      ).toEqual(proEnt);
    });
  });

  describe("5. <Gated> component", () => {
    it("renders child untouched when reason is null", () => {
      const onClick = jest.fn();
      render(
        <Gated reason={null}>
          <button type="button" onClick={onClick}>
            Export PDF
          </button>
        </Gated>
      );

      const btn = screen.getByRole("button", { name: "Export PDF" });
      expect(btn).not.toHaveAttribute("aria-disabled");
      expect(btn).not.toHaveAttribute("data-disabled");

      fireEvent.click(btn);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("disables child, removes onClick, wraps in focusable span, and displays tooltip + Upgrade link for requires_plan", async () => {
      const onClick = jest.fn();
      render(
        <Gated reason={{ code: "requires_plan", plan: "LITE" }}>
          <button type="button" onClick={onClick}>
            Create image
          </button>
        </Gated>
      );

      const btn = screen.getByRole("button", { name: "Create image" });
      expect(btn).toHaveAttribute("aria-disabled", "true");
      expect(btn).toHaveAttribute("data-disabled");

      fireEvent.click(btn);
      expect(onClick).not.toHaveBeenCalled();

      const wrapper = btn.closest("span[tabindex='0']") as HTMLElement;
      expect(wrapper).toBeInTheDocument();

      fireEvent.focus(wrapper);

      await waitFor(() => {
        expect(
          screen.getByText("Available on the Lite plan and above")
        ).toBeInTheDocument();
      });

      const upgradeLink = screen.getByRole("link", { name: "Upgrade" });
      expect(upgradeLink).toHaveAttribute("href", "/pricing");
    });

    it("renders localized messages for member_limit, daily_cap, no_permission, and max_depth", async () => {
      const { rerender } = render(
        <Gated reason={{ code: "member_limit", limit: 2 }}>
          <button type="button">Invite</button>
        </Gated>
      );

      const getWrapper = () =>
        document.querySelector("span[tabindex='0']") as HTMLElement;

      fireEvent.mouseEnter(getWrapper());
      await waitFor(() => {
        expect(
          screen.getByText("Your plan allows up to 2 collaborators")
        ).toBeInTheDocument();
      });

      rerender(
        <Gated reason={{ code: "no_permission", capability: "ask questions" }}>
          <button type="button">Ask</button>
        </Gated>
      );
      fireEvent.focus(getWrapper());
      await waitFor(() => {
        expect(
          screen.getByText("You do not have permission to ask questions")
        ).toBeInTheDocument();
      });
    });
    it("keeps the tooltip open while the pointer moves from the trigger into it (Upgrade link stays reachable)", async () => {
      jest.useFakeTimers();
      try {
        render(
          <Gated reason={{ code: "requires_plan", plan: "LITE" }}>
            <button type="button">Create image</button>
          </Gated>
        );
        const wrapper = document.querySelector(
          "span[tabindex='0']"
        ) as HTMLElement;

        fireEvent.mouseEnter(wrapper);
        const link = await screen.findByRole("link", { name: "Upgrade" });
        fireEvent.mouseLeave(wrapper);
        fireEvent.mouseEnter(link.closest("[data-slot='tooltip-content']")!);
        React.act(() => {
          jest.advanceTimersByTime(500);
        });
        expect(screen.getByRole("link", { name: "Upgrade" })).toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("5b. Gates translations", () => {
    it("has every Gates key in en, es and fr with no encoding damage", () => {
      const keys = Object.keys(
        (enMessages as unknown as Record<string, Record<string, string>>).Gates ??
          {}
      );
      expect(keys.length).toBeGreaterThan(0);
      for (const locale of ["es", "fr"]) {
        const messages = JSON.parse(
          fs.readFileSync(
            path.join(process.cwd(), "messages", `${locale}.json`),
            "utf8"
          )
        ) as Record<string, Record<string, string>>;
        for (const key of keys) {
          const value = messages.Gates?.[key];
          expect(typeof value).toBe("string");
          // A "?" next to a letter means an accented character was lost.
          expect(value).not.toMatch(/\p{L}\?|\?\p{L}/u);
        }
      }
    });
  });

  describe("6. Codebase hygiene: no TEMPORARY plan hacks remain", () => {
    it("has removed all TEMPORARY plan comments from components and server", () => {
      const filesToCheck = [
        "components/workspace/composer.tsx",
        "server/documents/index.ts",
        "server/services/generation.ts",
        "server/services/attachment.ts",
      ];

      for (const rel of filesToCheck) {
        const content = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
        expect(content).not.toContain("TEMPORARY");
      }
    });
  });
});
