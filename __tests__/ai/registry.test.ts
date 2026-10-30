/**
 * @jest-environment node
 */
import {
  MODELS,
  getModel,
  assertModelAccess,
  creditsFor,
  CREDIT_USD,
} from "@/server/ai/registry";
import { AiError } from "@/server/ai/types";

describe("Step 2.1 — AI Model Registry", () => {
  describe("Model Lookup & Validation", () => {
    it("successfully retrieves valid registry models", () => {
      const economy = getModel("text-economy");
      expect(economy).toBeDefined();
      expect(economy.provider).toBe("gemini");
      expect(economy.kind).toBe("TEXT");

      const standard = getModel("text-standard");
      expect(standard).toBeDefined();
      expect(standard.tier).toBe("STANDARD");

      const image = getModel("image-standard");
      expect(image).toBeDefined();
      expect(image.kind).toBe("IMAGE");
    });

    it("rejects unknown model keys with an invalid_request AiError", () => {
      expect(() => getModel("unknown-model" as any)).toThrow(AiError);
      try {
        getModel("unknown-model" as any);
      } catch (err: any) {
        expect(err.category).toBe("invalid_request");
        expect(err.retryable).toBe(false);
        expect(err.safeMessage).toContain("Unknown model key");
      }
    });
  });

  describe("Plan Tier Access Control", () => {
    it("allows FREE tier users to access text-economy", () => {
      const model = assertModelAccess("text-economy", "FREE");
      expect(model).toBeDefined();
      expect(model.minPlan).toBe("FREE");
    });

    it("rejects FREE tier users when requesting text-standard (requires LITE)", () => {
      expect(() => assertModelAccess("text-standard", "FREE")).toThrow(AiError);
      try {
        assertModelAccess("text-standard", "FREE");
      } catch (err: any) {
        expect(err.category).toBe("invalid_request");
        expect(err.safeMessage).toContain("requires at least a LITE plan");
      }
    });

    it("allows LITE, STANDARD, and PRO users to access text-standard and image-standard", () => {
      expect(assertModelAccess("text-standard", "LITE")).toBeDefined();
      expect(assertModelAccess("text-standard", "STANDARD")).toBeDefined();
      expect(assertModelAccess("text-standard", "PRO")).toBeDefined();
      expect(assertModelAccess("image-standard", "LITE")).toBeDefined();
      expect(assertModelAccess("image-standard", "STANDARD")).toBeDefined();
      expect(assertModelAccess("image-standard", "PRO")).toBeDefined();
    });

    it("defaults missing plan to FREE and enforces restrictions", () => {
      expect(() => assertModelAccess("image-standard")).toThrow(AiError);
    });
  });

  describe("Credit Calculation (creditsFor)", () => {
    it("calculates credits with ceil(cost / CREDIT_USD) and a minimum of 1", () => {
      // Small prompt with negligible cost
      const smallCredits = creditsFor("text-economy", {
        inputTokens: 10,
        outputTokens: 10,
      });
      expect(smallCredits).toBe(1); // Min 1

      // Economy model: $0.25/M in, $1.50/M out
      // 1,000,000 in ($0.25) + 1,000,000 out ($1.50) = $1.75
      // $1.75 / $0.002 = 875 credits
      const largeEconomy = creditsFor("text-economy", {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      });
      expect(largeEconomy).toBe(875);

      // Standard model: $1.50/M in, $7.50/M out
      // 100,000 in ($0.15) + 20,000 out ($0.15) = $0.30
      // $0.30 / 0.002 = 150 credits
      const standardCredits = creditsFor("text-standard", {
        inputTokens: 100_000,
        outputTokens: 20_000,
      });
      expect(standardCredits).toBe(150);
    });

    it("bills thinking tokens as output tokens", () => {
      // 0 input, 10,000 regular output, 10,000 thought tokens
      // Total billable output = 20,000 tokens
      // On text-standard: 20,000 * 7.50 / 1M = $0.15 -> 75 credits
      const withThinking = creditsFor("text-standard", {
        inputTokens: 0,
        outputTokens: 10_000,
        thoughtTokens: 10_000,
      });
      expect(withThinking).toBe(75);
    });

    it("calculates image model credits correctly based on price per image", () => {
      // image-standard: $0.067 per image
      // 1 image: $0.067 / 0.002 = 33.5 -> ceil = 34 credits
      const oneImage = creditsFor("image-standard", { images: 1 });
      expect(oneImage).toBe(34);

      // 2 images: 2 * 0.067 = $0.134 / 0.002 = 67 credits
      const twoImages = creditsFor("image-standard", { images: 2 });
      expect(twoImages).toBe(67);
    });
  });
});
