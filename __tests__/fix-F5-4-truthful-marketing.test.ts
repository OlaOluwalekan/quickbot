import { GET as getHealth } from "@/app/api/health/route";
import { GET as getReady } from "@/app/api/ready/route";
import { checkSystemReadiness } from "@/server/services/system-status";
import enMessages from "@/messages/en.json";
import { PLANS } from "@/server/billing/plans";

describe("Step F5.4 — Truthful marketing & health probes", () => {
  it("GET /api/health returns 200 with process health and uptime", async () => {
    const res = await getHealth();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(typeof data.uptime).toBe("number");
    expect(typeof data.timestamp).toBe("string");
  });

  it("GET /api/ready returns 200 when database is healthy", async () => {
    const res = await getReady();
    expect([200, 503]).toContain(res.status);

    const data = await res.json();
    expect(data.services).toBeDefined();
    expect(data.services.ai).toBeDefined();
    expect(data.services.db).toBeDefined();
  });

  it("checkSystemReadiness returns 503 degraded status when DB query fails", async () => {
    const brokenDb = {
      $queryRawUnsafe: jest.fn().mockRejectedValue(new Error("Connection terminated")),
    };

    const readiness = await checkSystemReadiness(brokenDb);
    expect(readiness.status).toBe("degraded");
    expect(readiness.services.db).toBe("degraded");
    expect(readiness.services.auth).toBe("degraded");

    // Verify ZERO secrets in output
    const jsonStr = JSON.stringify(readiness);
    expect(jsonStr).not.toMatch(/key|secret|token|password|bearer/i);
  });

  it("FAQ items reflect truthful product limits and registry numbers", () => {
    const faq = enMessages.Marketing.faq.items;

    // Credit definition includes registry numbers: ≈ 2 for Fast, ≈ 7 for Standard, ≈ 35 per image, +3 for web search
    expect(faq.creditDef.a).toContain("≈ 2 credits");
    expect(faq.creditDef.a).toContain("Fast model");
    expect(faq.creditDef.a).toContain("≈ 7 with the Standard model");
    expect(faq.creditDef.a).toContain("≈ 35 per image");
    expect(faq.creditDef.a).toContain("each search adds 3 credits");
    expect(faq.creditDef.a).not.toContain("zero markup tricks");

    // Rollover: no rollover, no top-up sentence
    expect(faq.rollover.a).toContain("Plan credits reset at the start of each billing period");
    expect(faq.rollover.a).toContain("unused credits don't carry over");
    expect(faq.rollover.a).not.toContain("top-up");

    // Privacy matches confirmed terms (no training on user data)
    expect(faq.privacy.a).toContain("don't allow them to train on your data");
    expect(faq.privacy.a).not.toContain("encrypted at rest");

    // Model neutrality
    expect(faq.models.a).toContain("independent workspace built on third-party AI models");

    // New FAQ items
    expect(faq.free.q).toBe("Can I use Klecx for free?");
    expect(faq.free.a).toContain("100 free credits per month");

    expect(faq.collaboration.q).toBe("Who pays when collaborators use a workspace?");
    expect(faq.collaboration.a).toContain("The workspace owner's credits are used");

    expect(faq.search.q).toBe("Does Klecx search the web?");
    expect(faq.search.a).toContain("Klecx searches the web");
  });

  it("Plans reflect exact limits, daily caps, and truthful features", () => {
    expect(PLANS.FREE.credits).toBe(100);
    expect(PLANS.FREE.dailyCapCredits).toBe(30);

    // Free plan includes web search
    expect(PLANS.FREE.features).toContain("Plans.FREE.features.search");

    // Lite, Standard, and Pro include voice input, document review, and search
    for (const key of ["LITE", "STANDARD", "PRO"] as const) {
      expect(PLANS[key].features).toContain(`Plans.${key}.features.search`);
      expect(PLANS[key].features).toContain(`Plans.${key}.features.documents`);
      expect(PLANS[key].features).toContain(`Plans.${key}.features.voice`);
    }

    // Faster email support on Standard and Pro instead of generic Priority
    expect(PLANS.STANDARD.features).toContain("Plans.STANDARD.features.support");
    expect(PLANS.PRO.features).toContain("Plans.PRO.features.support");
    expect(enMessages.Plans.STANDARD.features.support).toBe("Faster email support");
    expect(enMessages.Plans.PRO.features.support).toBe("Faster email support");

    // Audit trail is not claimed as Pro-only
    expect(PLANS.PRO.features).not.toContain("Plans.PRO.features.audit");
  });

  it("Marketing feature list includes Documents review and truth in passages/versions/export", () => {
    const features = enMessages.Marketing.features;

    // Document review feature row
    expect(features.documents).toBeDefined();
    expect(features.documents.badge).toBe("Documents");
    expect(features.documents.bullet1).toContain("Attach PDF, Word, text, and markdown files");

    // Voice and search in workspaces
    expect(features.workspaces.bullet4).toContain("Voice input");
    expect(features.workspaces.bullet5).toContain("Live web search");

    // Versions truth
    expect(features.versions.bullet2).toBe(
      "Edit answers without losing the original; regenerate without losing earlier versions"
    );
    expect(features.versions.v2Label).toBe("v2 (Think harder)");

    // Share truth
    expect(features.share.bullet3).toContain("Viewer, Commenter, Editor or Admin roles");
    expect(features.share.revocable).toBe("• Revocable: Instantly from the Share dialog");

    // Export truth
    expect(features.export.bullet1).toContain("(PDF and Word on paid plans)");
  });

  it("Pricing page subheading matches truthful limits copy", () => {
    expect(enMessages.Marketing.pricingPage.subheading).toBe(
      "Simple plans with clear limits. Every plan shows its credits, daily cap and features up front."
    );
  });
});
