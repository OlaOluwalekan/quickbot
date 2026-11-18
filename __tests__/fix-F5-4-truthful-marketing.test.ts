/**
 * @jest-environment node
 */
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import { PLANS, getDailyCapForPlan, type PlanKey } from "@/server/billing/plans";
import { MODEL_CATALOG, GROUNDING_SURCHARGE_CREDITS } from "@/lib/ai/model-catalog";
import { setSiteConfigForTesting } from "@/server/config/site";

// The real client would open a pool (and need a running Postgres); the route test only needs `SELECT 1` to fail.
const queryRaw = jest.fn();
jest.mock("../server/db/client", () => ({ db: { $queryRaw: (...args: unknown[]) => queryRaw(...args) } }));

import { GET as getHealth } from "@/app/api/health/route";
import { GET as getReady } from "@/app/api/ready/route";
import { checkSystemReadiness } from "@/server/services/system-status";
import { PricingFaqJsonLd } from "@/components/seo/json-ld";

const LOCALES = { en, es, fr } as const;
const PLAN_KEYS: PlanKey[] = ["FREE", "LITE", "STANDARD", "PRO"];
const SECRET_PATTERN = /key|secret|token|password|bearer|postgres|https?:/i;

function resolve(messages: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (cur, part) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[part] : undefined),
    messages
  );
}

afterEach(() => {
  queryRaw.mockReset();
  setSiteConfigForTesting(null);
});

describe("F5.4 — health and readiness probes", () => {
  it("GET /api/health returns 200 without touching dependencies", async () => {
    const res = await getHealth();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("GET /api/ready returns 200 when the database answers", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const res = await getReady();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.status).toBe("operational");
    expect(body.services.db).toBe("operational");
  });

  it("GET /api/ready returns 503 when the database is down, with no secrets in the body", async () => {
    queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED postgres://user:password@db:5432"));
    const res = await getReady();
    expect(res.status).toBe(503);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.status).toBe("degraded");
    expect(body.services.db).toBe("degraded");
    expect(body.services.auth).toBe("degraded");
    expect(JSON.stringify(body.services)).not.toMatch(SECRET_PATTERN);
    expect(text).not.toContain("ECONNREFUSED");
  });

  it("marks the database row degraded when the Redis ping fails", async () => {
    const readiness = await checkSystemReadiness({
      database: () => Promise.resolve(),
      cache: () => Promise.reject(new Error("redis down")),
    });
    expect(readiness.services.db).toBe("degraded");
    expect(readiness.services.auth).toBe("operational");
    expect(readiness.status).toBe("degraded");
  });

  it("is operational when every probe answers", async () => {
    const readiness = await checkSystemReadiness({
      database: () => Promise.resolve(),
      cache: () => Promise.resolve("PONG"),
    });
    expect(readiness.status).toBe("operational");
    expect(Object.values(readiness.services).every((s) => s === "operational")).toBe(true);
  });
});

describe("F5.4 — FAQ claims", () => {
  it("credit numbers come from the model catalog", () => {
    const a = en.Marketing.faq.items.creditDef.a;
    expect(a).toContain(`≈ ${MODEL_CATALOG["text-economy"].typicalCredits} credits`);
    expect(a).toContain(`≈ ${MODEL_CATALOG["text-standard"].typicalCredits} with the Standard model`);
    expect(a).toContain(`≈ ${MODEL_CATALOG["image-standard"].typicalCredits} per image`);
    expect(a).toContain(`adds ${GROUNDING_SURCHARGE_CREDITS} credits`);
    expect(a).not.toMatch(/markup/i);
    expect(en.Marketing.pricing.imageGenDesc).toContain(
      `≈ ${MODEL_CATALOG["image-standard"].typicalCredits} credits`
    );
  });

  it.each(Object.entries(LOCALES))("%s: no top-up packs, no encryption-at-rest claim", (_locale, m) => {
    const faq = m.Marketing.faq.items;
    expect(faq.rollover.a).not.toMatch(/top-up|recarga|recharge|pack/i);
    expect(faq.privacy.a).not.toMatch(/at rest|en reposo|au repos/i);
    expect(m.Marketing.aboutPage.privateText).not.toMatch(/at rest|en reposo|au repos/i);
  });

  it("the FAQ's structured data hides billing answers while billing is off", () => {
    setSiteConfigForTesting({ billingEnabled: false });
    const off = JSON.stringify((PricingFaqJsonLd() as React.ReactElement<{ data: unknown }>).props.data);
    expect(off).toContain(en.Marketing.faq.items.cancel.aLaunchingSoon);
    expect(off).toContain(en.Marketing.faq.items.refund.aLaunchingSoon);
    expect(off).not.toContain(en.Marketing.faq.items.cancel.a);

    setSiteConfigForTesting({ billingEnabled: true });
    const on = JSON.stringify((PricingFaqJsonLd() as React.ReactElement<{ data: unknown }>).props.data);
    expect(on).toContain(en.Marketing.faq.items.cancel.a);
  });
});

describe("F5.4 — plan features", () => {
  it("lists no unbacked promises (priority support, Pro-only audit trail)", () => {
    for (const key of PLAN_KEYS) {
      expect(PLANS[key].features).not.toContain(`Plans.${key}.features.support`);
      expect(PLANS[key].features).not.toContain(`Plans.${key}.features.audit`);
    }
  });

  it("lists web search, documents and voice on every plan (none of them is paid-only)", () => {
    for (const key of PLAN_KEYS) {
      for (const feature of ["search", "documents", "voice"]) {
        expect(PLANS[key].features).toContain(`Plans.${key}.features.${feature}`);
      }
    }
  });

  it.each(Object.entries(LOCALES))("%s: every listed feature has a message", (_locale, m) => {
    for (const key of PLAN_KEYS) {
      for (const path of PLANS[key].features) {
        expect(typeof resolve(m, path)).toBe("string");
      }
    }
  });

  it("feature numbers match the plan limits", () => {
    for (const key of PLAN_KEYS) {
      const f = en.Plans[key].features as Record<string, string>;
      const cap = getDailyCapForPlan(key).toLocaleString("en-US");
      expect(f.dailyCap).toContain(`${cap} credits`);
      expect(f.dailyCap).not.toMatch(/balance/);
      expect(f.search).toContain(`${PLANS[key].limits.searchesPerDay} searches per day`);
      expect(f.voice).toContain(`${PLANS[key].limits.voiceSecondsPerDay / 60} min`);
    }
  });
});

describe("F5.4 — feature and status copy", () => {
  it.each(Object.entries(LOCALES))("%s: documents can't be PDFs", (_locale, m) => {
    expect(m.Marketing.features.documents.bullet1).not.toMatch(/pdf/i);
  });

  it("describes controls that exist", () => {
    const f = en.Marketing.features;
    expect(f.versions.v2Label).not.toMatch(/think harder/i);
    expect(f.workspaces.bullet3).not.toMatch(/full-text|responses/i);
    expect(f.share.bullet3).toContain("Viewer, Commenter, Editor or Admin");
    expect(f.export.bullet1).toContain("(PDF and Word on paid plans)");
  });

  it.each(Object.entries(LOCALES))("%s: status page makes no uptime or incident claims", (_locale, m) => {
    const status = JSON.stringify(m.Status);
    expect(status).not.toMatch(/99[.,]9|90/);
    expect(m.Status).not.toHaveProperty("noIncidents");
    expect(m.Status.lastChecked).toContain("{time}");
  });

  it.each(Object.entries(LOCALES))("%s: plan comparison has no advanced tier, stale image cost or % of balance", (_locale, m) => {
    const c = JSON.stringify(m.Marketing.pricing.comparison);
    expect(c).not.toMatch(/advanced|avanzad|avancé|35|balance|saldo|solde/i);
    expect(m.Marketing.pricing.footnoteDisclaimer).not.toMatch(/settings|ajustes|paramètres/i);
  });

  it("pricing subheading no longer denies the caps", () => {
    expect(en.Marketing.pricingPage.subheading).toBe(
      "Simple plans with clear limits. Every plan shows its credits, daily cap and features up front."
    );
  });
});
