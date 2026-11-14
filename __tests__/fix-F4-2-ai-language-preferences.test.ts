/**
 * @jest-environment node
 */
import { db } from "@/server/db/client";
import {
  createAndStreamGeneration,
  setCustomProvider,
  clearActiveGenerationsForTesting,
} from "@/server/services/generation";
import { createAccountWithFreeGrant } from "@/server/services/credits";
import { setUserPlanOverride, clearUserPlanOverrides } from "@/server/billing/plans";
import {
  buildSystemPrompt,
  PROMPT_VERSION,
} from "@/server/ai/prompts/system";
import {
  getUserPreferences,
  updateUserPreferences,
} from "@/server/services/user-preferences";
import type { AiProvider, GenerateRequest, ImageRequest, ImageResult, StreamEvent } from "@/server/ai";
import type { Actor } from "@/server/auth/session";
import { getActor } from "../server/auth/session";
import { PATCH as updateMe, GET as getMe } from "@/app/api/v1/me/route";
import { NextRequest } from "next/server";

jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(),
}));

class MockLanguageAiProvider implements AiProvider {
  id = "gemini" as const;
  public requests: GenerateRequest[] = [];

  async *stream(req: GenerateRequest): AsyncIterable<StreamEvent> {
    this.requests.push(req);

    yield {
      type: "text_delta",
      text: "Bonjour, ceci est une réponse en français.",
    };
    yield {
      type: "usage",
      inputTokens: 50,
      outputTokens: 20,
      estimated: false,
    };
    yield {
      type: "done",
      finishReason: "stop",
    };
  }

  async generateImage(_req: ImageRequest): Promise<ImageResult> {
    throw new Error("Not used in language tests");
  }
}

async function readAllSse(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

describe("Step F4.2 — AI language preference, system prompt, and settings", () => {
  let user: { id: string; email: string };
  let actor: Actor;
  let workspace: { id: string };
  let mockProvider: MockLanguageAiProvider;

  beforeEach(async () => {
    clearActiveGenerationsForTesting();
    clearUserPlanOverrides();
    mockProvider = new MockLanguageAiProvider();
    setCustomProvider(mockProvider);

    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    user = await db.user.create({
      data: {
        id: `user_f42_${unique}`,
        name: "Language Test User",
        email: `lang_${unique}@example.com`,
        emailVerified: true,
      },
    });

    actor = {
      userId: user.id,
      email: user.email,
      role: "USER",
      sessionId: `sess_f42_${unique}`,
    };

    (getActor as jest.Mock).mockResolvedValue(actor);

    const acc = await createAccountWithFreeGrant(user.id);
    await db.creditAccount.update({
      where: { id: acc.id },
      data: { topupBalance: 100 },
    });

    setUserPlanOverride(user.id, "LITE");

    workspace = await db.workspace.create({
      data: {
        ownerId: user.id,
        title: "Language Test Workspace",
      },
    });
  });

  afterEach(() => {
    setCustomProvider(null);
  });

  describe("1. System Prompt Construction (server/ai/prompts/system.ts)", () => {
    it("uses Auto language instruction when language is null or 'auto'", () => {
      const autoNull = buildSystemPrompt(null);
      expect(autoNull).toContain("Reply in the language of the user's latest message.");

      const autoStr = buildSystemPrompt("auto");
      expect(autoStr).toContain("Reply in the language of the user's latest message.");
    });

    it("uses specific language name and override clause when specific language is set", () => {
      const french = buildSystemPrompt("fr");
      expect(french).toContain("Response language: French.");
      expect(french).toContain("If the user explicitly asks for another language for this reply, use it.");

      const spanish = buildSystemPrompt("es");
      expect(spanish).toContain("Response language: Spanish.");

      const yoruba = buildSystemPrompt("yo");
      expect(yoruba).toContain("Response language: Yoruba.");
    });

    it("has bumped prompt version", () => {
      expect(PROMPT_VERSION).toBe("2026-11-14.1");
    });
  });

  describe("2. User Preference Persistence", () => {
    it("saves and retrieves aiLanguage via user preferences service", async () => {
      // Set to French
      const updatedFr = await updateUserPreferences(user.id, { aiLanguage: "fr" });
      expect(updatedFr.aiLanguage).toBe("fr");

      const fetchedFr = await getUserPreferences(user.id);
      expect(fetchedFr.aiLanguage).toBe("fr");

      // Reset to Auto (null)
      const updatedAuto = await updateUserPreferences(user.id, { aiLanguage: null });
      expect(updatedAuto.aiLanguage).toBeNull();

      const fetchedAuto = await getUserPreferences(user.id);
      expect(fetchedAuto.aiLanguage).toBeNull();
    });
  });

  describe("3. Generation System Prompt Integration", () => {
    it("passes French response language to system prompt when user preference is 'fr'", async () => {
      await updateUserPreferences(user.id, { aiLanguage: "fr" });

      const { stream } = await createAndStreamGeneration(
        actor,
        workspace.id,
        {
          idempotencyKey: `idem_lang_fr_${Date.now()}`,
          prompt: "Tell me about cars",
          modelKey: "text-economy",
          kind: "TEXT",
        },
        { providerInstance: mockProvider }
      );

      await readAllSse(stream);

      const mainReq = mockProvider.requests.find((r) => r.system);
      expect(mainReq).toBeDefined();
      expect(mainReq?.system).toContain("Response language: French.");
      expect(mainReq?.system).not.toContain("Reply in the language of the user's latest message.");
    });

    it("passes Auto instruction to system prompt when user preference is null", async () => {
      await updateUserPreferences(user.id, { aiLanguage: null });

      const { stream } = await createAndStreamGeneration(
        actor,
        workspace.id,
        {
          idempotencyKey: `idem_lang_auto_${Date.now()}`,
          prompt: "Tell me about cars",
          modelKey: "text-economy",
          kind: "TEXT",
        },
        { providerInstance: mockProvider }
      );

      await readAllSse(stream);

      const mainReq = mockProvider.requests.find((r) => r.system);
      expect(mainReq).toBeDefined();
      expect(mainReq?.system).toContain("Reply in the language of the user's latest message.");
      expect(mainReq?.system).not.toContain("Response language: French.");
    });
  });

  describe("4. PATCH /api/v1/me Profile Endpoint", () => {
    it("updates user full name via PATCH /api/v1/me and reflects in GET /api/v1/me", async () => {
      const patchReq = new NextRequest("http://localhost:3000/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Klecx User" }),
      });

      const patchRes = await updateMe(patchReq);
      expect(patchRes.status).toBe(200);
      const patchBody = await patchRes.json();
      expect(patchBody.data.name).toBe("Updated Klecx User");

      // Verify GET returns updated name
      const getReq = new NextRequest("http://localhost:3000/api/v1/me");
      const getRes = await getMe(getReq);
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.data.name).toBe("Updated Klecx User");
    });

    it("rejects an empty name with 422 and leaves the name unchanged", async () => {
      const res = await updateMe(
        new NextRequest("http://localhost:3000/api/v1/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "   " }),
        })
      );
      expect(res.status).toBe(422);
      const row = await db.user.findUnique({ where: { id: user.id }, select: { name: true } });
      expect(row?.name).toBe("Language Test User");
    });

    it("returns 401 for GET and PATCH without a session", async () => {
      (getActor as jest.Mock).mockResolvedValue(null);

      const getRes = await getMe(new NextRequest("http://localhost:3000/api/v1/me"));
      expect(getRes.status).toBe(401);

      const patchRes = await updateMe(
        new NextRequest("http://localhost:3000/api/v1/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Intruder" }),
        })
      );
      expect(patchRes.status).toBe(401);
      const row = await db.user.findUnique({ where: { id: user.id }, select: { name: true } });
      expect(row?.name).toBe("Language Test User");
    });
  });
});
