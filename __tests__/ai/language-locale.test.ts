/**
 * @jest-environment node
 */
import { db } from "@/server/db/client";
import {
  detectUiLocale,
  resolveAiLanguage,
  resolveEffectiveAiLanguage,
  getCountryLanguageSuggestion,
  LOCALE_COOKIE,
} from "@/lib/locale";
import { updatePreferencesSchema } from "@/lib/schemas/user-preferences";
import {
  getUserPreferences,
  updateUserPreferences,
} from "@/server/services/user-preferences";
import { createAccountWithFreeGrant } from "@/server/services/credits";
import {
  createAndStreamGeneration,
  setCustomProvider,
  clearActiveGenerationsForTesting,
} from "@/server/services/generation";
import type { Actor } from "@/server/auth/session";
import type { AiProvider, GenerateRequest, ImageRequest, ImageResult, StreamEvent } from "@/server/ai";

class CapturingAiProvider implements AiProvider {
  id = "gemini" as const;
  requests: GenerateRequest[] = [];

  async *stream(req: GenerateRequest): AsyncIterable<StreamEvent> {
    this.requests.push(req);
    yield { type: "text_delta", text: "Bonjour le monde" };
    yield {
      type: "usage",
      inputTokens: 50,
      outputTokens: 20,
      estimated: false,
    };
    yield { type: "done", finishReason: "stop" };
  }

  async generateImage(_req: ImageRequest): Promise<ImageResult> {
    return {
      bytes: Buffer.from("image"),
      mime: "image/png",
    };
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

describe("Step 2.8 — Language: UI locale vs AI response language", () => {
  let user: { id: string; email: string };
  let actor: Actor;

  beforeEach(async () => {
    clearActiveGenerationsForTesting();
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    user = await db.user.create({
      data: {
        id: `user_lang_${unique}`,
        name: "Language User",
        email: `lang_${unique}@example.com`,
        emailVerified: true,
      },
    });

    actor = {
      userId: user.id,
      email: user.email,
      role: "USER",
      sessionId: `sess_lang_${unique}`,
    };

    await createAccountWithFreeGrant(user.id);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe("1. Precedence matrix (4 inputs)", () => {
    it("resolves prompt override as highest priority over saved settings", () => {
      const resolved = resolveEffectiveAiLanguage({
        promptOverride: "yo",
        savedAiLanguage: "fr",
        uiLocale: "es",
      });
      expect(resolved).toBe("yo");
    });

    it("resolves saved AI language when prompt override is not provided", () => {
      const resolved = resolveEffectiveAiLanguage({
        promptOverride: null,
        savedAiLanguage: "fr",
        uiLocale: "es",
      });
      expect(resolved).toBe("fr");
    });

    it("falls back to UI locale when both prompt override and saved AI language are omitted", () => {
      const resolved = resolveEffectiveAiLanguage({
        promptOverride: null,
        savedAiLanguage: null,
        uiLocale: "es",
      });
      expect(resolved).toBe("es");
    });

    it("falls back to default 'en' when all inputs are omitted or null", () => {
      const resolved = resolveEffectiveAiLanguage({
        promptOverride: null,
        savedAiLanguage: null,
        uiLocale: null,
      });
      expect(resolved).toBe("en");
    });

    it("resolveAiLanguage baseline correctly defaults to uiLocale then 'en'", () => {
      expect(resolveAiLanguage({ aiLanguage: "pt", uiLocale: "fr" })).toBe("pt");
      expect(resolveAiLanguage({ aiLanguage: null, uiLocale: "fr" })).toBe("fr");
      expect(resolveAiLanguage({ aiLanguage: null, uiLocale: null })).toBe("en");
    });
  });

  describe("2. Unsupported language rejected by validation schema", () => {
    it("accepts valid UI locales and AI languages", () => {
      const valid = updatePreferencesSchema.safeParse({
        uiLocale: "fr",
        aiLanguage: "yo",
      });
      expect(valid.success).toBe(true);
    });

    it("accepts null values to reset preferences", () => {
      const reset = updatePreferencesSchema.safeParse({
        uiLocale: null,
        aiLanguage: null,
      });
      expect(reset.success).toBe(true);
    });

    it("rejects unsupported UI locale", () => {
      const invalidLocale = updatePreferencesSchema.safeParse({
        uiLocale: "de", // valid language, but not supported UI locale
      });
      expect(invalidLocale.success).toBe(false);
    });

    it("rejects unsupported AI language", () => {
      const invalidAiLang = updatePreferencesSchema.safeParse({
        aiLanguage: "klingon",
      });
      expect(invalidAiLang.success).toBe(false);
    });
  });

  describe("3. Suggestion banner logic", () => {
    it("suggests French when country is FR and user is on English", () => {
      const suggestion = getCountryLanguageSuggestion("FR", "en");
      expect(suggestion).toBe("fr");
    });

    it("suggests Spanish when country is ES/MX/CO and user is on English", () => {
      expect(getCountryLanguageSuggestion("ES", "en")).toBe("es");
      expect(getCountryLanguageSuggestion("MX", "en")).toBe("es");
      expect(getCountryLanguageSuggestion("CO", "en")).toBe("es");
    });

    it("returns null when user is already using the country's primary language", () => {
      expect(getCountryLanguageSuggestion("FR", "fr")).toBeNull();
      expect(getCountryLanguageSuggestion("ES", "es")).toBeNull();
    });

    it("returns null for non-Francophone, non-Hispanophone countries", () => {
      expect(getCountryLanguageSuggestion("US", "en")).toBeNull();
      expect(getCountryLanguageSuggestion("GB", "en")).toBeNull();
      expect(getCountryLanguageSuggestion("NG", "en")).toBeNull();
      expect(getCountryLanguageSuggestion(null, "en")).toBeNull();
    });
  });

  describe("4. Detect UI locale from headers and cookies", () => {
    it("prioritizes NEXT_LOCALE cookie if present and valid", () => {
      const headers = new Headers();
      headers.set("cookie", `session=123; ${LOCALE_COOKIE}=es; theme=dark`);
      headers.set("accept-language", "fr-FR,fr;q=0.9,en;q=0.8");

      const detected = detectUiLocale(headers);
      expect(detected).toBe("es");
    });

    it("uses Accept-Language weighted q-values when cookie is missing", () => {
      const headers = new Headers();
      // 'de' is not a supported UI locale, so 'fr' (q=0.8) should beat 'en' (q=0.5)
      headers.set("accept-language", "de-DE,de;q=0.9,fr-FR;q=0.8,en;q=0.5");

      const detected = detectUiLocale(headers);
      expect(detected).toBe("fr");
    });

    it("falls back to 'en' when headers are empty or non-matching", () => {
      const headers = new Headers();
      expect(detectUiLocale(headers)).toBe("en");

      headers.set("accept-language", "zh-CN,zh;q=0.9,ja;q=0.8");
      expect(detectUiLocale(headers)).toBe("en");
    });
  });

  describe("5. DB persistence and service sync", () => {
    it("saves and retrieves user preferences properly", async () => {
      const initial = await getUserPreferences(user.id);
      expect(initial.uiLocale).toBeNull();
      expect(initial.aiLanguage).toBeNull();

      const updated = await updateUserPreferences(user.id, {
        uiLocale: "fr",
        aiLanguage: "es",
      });
      expect(updated.uiLocale).toBe("fr");
      expect(updated.aiLanguage).toBe("es");

      const fetched = await getUserPreferences(user.id);
      expect(fetched.uiLocale).toBe("fr");
      expect(fetched.aiLanguage).toBe("es");

      // Reset to null
      const reset = await updateUserPreferences(user.id, {
        uiLocale: null,
        aiLanguage: null,
      });
      expect(reset.uiLocale).toBeNull();
      expect(reset.aiLanguage).toBeNull();

      const fetchedAfterReset = await getUserPreferences(user.id);
      expect(fetchedAfterReset.uiLocale).toBeNull();
      expect(fetchedAfterReset.aiLanguage).toBeNull();
    });
  });

  describe("6. AI Generation integration with language preferences", () => {
    let workspace: { id: string };

    beforeEach(async () => {
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

    it("uses saved AI language preference when generating a turn without override", async () => {
      await updateUserPreferences(user.id, {
        uiLocale: "en",
        aiLanguage: "fr",
      });

      const capturingProvider = new CapturingAiProvider();
      setCustomProvider(capturingProvider);

      const { stream } = await createAndStreamGeneration(
        actor,
        workspace.id,
        {
          idempotencyKey: `lang_gen_${Date.now()}`,
          prompt: "Tell me a joke",
          modelKey: "text-economy",
        },
        { providerInstance: capturingProvider }
      );
      await readAllSse(stream);

      const mainRequest = capturingProvider.requests.find((r) => r.system);
      expect(mainRequest).toBeDefined();
      expect(mainRequest?.system).toContain("Response language: fr");
    });

    it("honors one-off composer language override over saved AI language preference", async () => {
      await updateUserPreferences(user.id, {
        uiLocale: "en",
        aiLanguage: "fr",
      });

      const capturingProvider = new CapturingAiProvider();
      setCustomProvider(capturingProvider);

      const { stream } = await createAndStreamGeneration(
        actor,
        workspace.id,
        {
          idempotencyKey: `lang_gen_override_${Date.now()}`,
          prompt: "Tell me a joke",
          modelKey: "text-economy",
          language: "yo", // One-off override from composer
        },
        { providerInstance: capturingProvider }
      );
      await readAllSse(stream);

      const mainRequest = capturingProvider.requests.find((r) => r.system);
      expect(mainRequest).toBeDefined();
      expect(mainRequest?.system).toContain("Response language: yo");

      // Saved preference in DB remains unchanged
      const savedPref = await getUserPreferences(user.id);
      expect(savedPref.aiLanguage).toBe("fr");
    });
  });
});
