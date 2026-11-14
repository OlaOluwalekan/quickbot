/**
 * @jest-environment node
 */
import { db } from "@/server/db/client";
import {
  createAndStreamGeneration,
  setCustomProvider,
  clearActiveGenerationsForTesting,
} from "@/server/services/generation";
import { countSearchesToday } from "@/server/services/web-search";
import { createAccountWithFreeGrant, getAccountByUserId } from "@/server/services/credits";
import { setUserPlanOverride, clearUserPlanOverrides } from "@/server/billing/plans";
import {
  creditsFor,
  GROUNDING_SURCHARGE_CREDITS,
  type AiProvider,
  type GenerateRequest,
  type ImageRequest,
  type ImageResult,
  type StreamEvent,
} from "@/server/ai";
import { updateUserPreferences } from "@/server/services/user-preferences";
import type { Actor } from "@/server/auth/session";

class MockSearchAiProvider implements AiProvider {
  id = "gemini" as const;
  public offeredTools: string[] = [];
  public callCount = 0;

  async *stream(req: GenerateRequest): AsyncIterable<StreamEvent> {
    this.callCount += 1;
    if (req.tools) {
      this.offeredTools = req.tools.map((t) => t.name);
    }

    if (req.grounding) {
      // Internal search request by runWebSearch
      yield { type: "text_delta", text: "Latest factual information found online." };
      yield {
        type: "citation",
        url: "https://example.com/verified-source",
        title: "Verified Source",
        snippet: "A factual snippet",
        source: "GROUNDING",
      };
      return;
    }

    const hasSearchResponse = req.messages.some((m) =>
      m.parts.some((p) => p.type === "tool_response" && p.name === "web_search")
    );

    // If web_search is offered and prompt asks for current info and no search done yet, call web_search
    const lastMsg = req.messages[req.messages.length - 1];
    const textPrompt = lastMsg?.parts.find((p) => p.type === "text")?.text ?? "";

    if (
      req.tools?.some((t) => t.name === "web_search") &&
      textPrompt.includes("current price") &&
      !hasSearchResponse
    ) {
      yield {
        type: "tool_call",
        name: "web_search",
        args: { query: "current price of widget" },
      };
      return;
    }

    // Finished answer
    yield {
      type: "text_delta",
      text: hasSearchResponse
        ? "The current price of widget is $50 according to verified sources."
        : "Here is general knowledge without web search.",
    };
    yield {
      type: "usage",
      inputTokens: 100,
      outputTokens: 50,
      estimated: false,
    };
  }

  async generateImage(_req: ImageRequest): Promise<ImageResult> {
    throw new Error("Not used in search tests");
  }
}

async function readAllSse(stream: ReadableStream<Uint8Array>): Promise<{
  raw: string;
  events: Array<{ event: string; data: any }>;
}> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }

  const events: Array<{ event: string; data: any }> = [];
  const blocks = raw.split("\n\n");
  for (const block of blocks) {
    const lines = block.split("\n");
    let eventName = "message";
    let dataStr = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventName = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        dataStr = line.slice(6).trim();
      }
    }
    if (dataStr) {
      try {
        events.push({ event: eventName, data: JSON.parse(dataStr) });
      } catch {
        events.push({ event: eventName, data: dataStr });
      }
    }
  }

  return { raw, events };
}

describe("Step F4.1 — Web search tool, switchable in Settings, and plan caps", () => {
  let user: { id: string; email: string };
  let actor: Actor;
  let workspace: { id: string };
  let mockProvider: MockSearchAiProvider;

  beforeEach(async () => {
    clearActiveGenerationsForTesting();
    clearUserPlanOverrides();
    mockProvider = new MockSearchAiProvider();
    setCustomProvider(mockProvider);

    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    user = await db.user.create({
      data: {
        id: `user_f41_${unique}`,
        name: "Web Search Test User",
        email: `search_${unique}@example.com`,
        emailVerified: true,
      },
    });

    actor = {
      userId: user.id,
      email: user.email,
      role: "USER",
      sessionId: `sess_f41_${unique}`,
    };

    const acc = await createAccountWithFreeGrant(user.id);
    await db.creditAccount.update({
      where: { id: acc.id },
      data: { topupBalance: 100 },
    });

    workspace = await db.workspace.create({
      data: {
        ownerId: user.id,
        title: "Web Search Test Workspace",
      },
    });
  });

  afterEach(() => {
    setCustomProvider(null);
  });

  it("1. Mocked provider calling web_search produces citations and +3 surcharge stored in Generation.usage", async () => {
    setUserPlanOverride(user.id, "LITE");

    const beforeAcc = await getAccountByUserId(user.id);
    const beforeTotal = (beforeAcc?.planBalance ?? 0) + (beforeAcc?.topupBalance ?? 0);

    const { stream } = await createAndStreamGeneration(actor, workspace.id, {
      idempotencyKey: `idem_search_${Date.now()}`,
      prompt: "What is the current price of widget?",
      modelKey: "text-economy",
      kind: "TEXT",
    });

    const { events } = await readAllSse(stream);

    // Citations were emitted and saved
    const citationEvents = events.filter((e) => e.event === "citation");
    expect(citationEvents.length).toBeGreaterThan(0);
    expect(citationEvents[0]!.data.url).toBe("https://example.com/verified-source");

    // Status event with searching was emitted
    const searchingStatus = events.find(
      (e) => e.event === "status" && e.data?.stage === "searching"
    );
    expect(searchingStatus).toBeDefined();

    // Surcharge of +3 credits was applied
    const afterAcc = await getAccountByUserId(user.id);
    const afterTotal = (afterAcc?.planBalance ?? 0) + (afterAcc?.topupBalance ?? 0);
    const baseCredits = creditsFor("text-economy", { inputTokens: 100, outputTokens: 50 });
    expect(beforeTotal - afterTotal).toBe(baseCredits + GROUNDING_SURCHARGE_CREDITS);

    // Generation stored usage.searches = 1
    const gen = await db.generation.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    expect((gen?.usage as any)?.searches).toBe(1);
  });

  it("2. Generation without search has 0 search surcharge", async () => {
    setUserPlanOverride(user.id, "LITE");

    const beforeAcc = await getAccountByUserId(user.id);
    const beforeTotal = (beforeAcc?.planBalance ?? 0) + (beforeAcc?.topupBalance ?? 0);

    const { stream } = await createAndStreamGeneration(actor, workspace.id, {
      idempotencyKey: `idem_no_search_${Date.now()}`,
      prompt: "Write a poem about trees",
      modelKey: "text-economy",
      kind: "TEXT",
    });

    await readAllSse(stream);

    const afterAcc = await getAccountByUserId(user.id);
    const afterTotal = (afterAcc?.planBalance ?? 0) + (afterAcc?.topupBalance ?? 0);
    const baseCredits = creditsFor("text-economy", { inputTokens: 100, outputTokens: 50 });
    expect(beforeTotal - afterTotal).toBe(baseCredits);

    const gen = await db.generation.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    expect((gen?.usage as any)?.searches).toBe(0);
  });

  it("3. When user preference webSearchEnabled is false, web_search tool is not offered", async () => {
    setUserPlanOverride(user.id, "LITE");
    await updateUserPreferences(user.id, { webSearchEnabled: false });

    const { stream } = await createAndStreamGeneration(actor, workspace.id, {
      idempotencyKey: `idem_pref_off_${Date.now()}`,
      prompt: "What is the current price of widget?",
      modelKey: "text-economy",
      kind: "TEXT",
    });

    await readAllSse(stream);

    expect(mockProvider.offeredTools).not.toContain("web_search");
  });

  it("4. Free user reaching daily search cap gets answers without search and sees limit notice in thinking panel", async () => {
    setUserPlanOverride(user.id, "FREE");

    // Insert completed generations today that exhaust the 10 searches limit
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    for (let i = 0; i < 10; i++) {
      await db.generation.create({
        data: {
          id: `gen_prior_${i}_${Date.now()}`,
          workspaceId: workspace.id,
          actorId: actor.userId,
          billedAccountId: (await getAccountByUserId(user.id))!.id,
          kind: "TEXT",
          status: "COMPLETED",
          modelKey: "text-economy",
          providerModelId: "mock-model",
          promptVersion: "2026-11-14",
          idempotencyKey: `prior_idem_${i}_${Date.now()}`,
          usage: { inputTokens: 10, outputTokens: 10, searches: 1 },
          createdAt: new Date(),
        },
      });
    }

    const todayCount = await countSearchesToday(actor.userId);
    expect(todayCount).toBeGreaterThanOrEqual(10);

    const { stream } = await createAndStreamGeneration(actor, workspace.id, {
      idempotencyKey: `idem_free_capped_${Date.now()}`,
      prompt: "What is the current price of widget?",
      modelKey: "text-economy",
      kind: "TEXT",
    });

    const { events } = await readAllSse(stream);

    // Tool should not have been offered because daily search cap was reached
    expect(mockProvider.offeredTools).not.toContain("web_search");

    // Thinking panel event received limit message
    const thoughtEvents = events.filter((e) => e.event === "thought");
    const hasLimitNotice = thoughtEvents.some((e) =>
      typeof e.data?.text === "string" && e.data.text.includes("Web search limit reached for today")
    );
    expect(hasLimitNotice).toBe(true);

    // Completed version also contains thoughtSummary with limit notice
    const version = await db.responseVersion.findFirst({
      where: { createdById: actor.userId },
      orderBy: { createdAt: "desc" },
    });
    expect(version?.thoughtSummary).toContain("Web search limit reached for today");
  });

  it("5. create_document and web_search are both available together in one generation", async () => {
    setUserPlanOverride(user.id, "STANDARD");

    const { stream } = await createAndStreamGeneration(actor, workspace.id, {
      idempotencyKey: `idem_both_tools_${Date.now()}`,
      prompt: "Research and generate a specification document",
      modelKey: "text-standard",
      kind: "TEXT",
    });

    await readAllSse(stream);

    expect(mockProvider.offeredTools).toContain("create_document");
    expect(mockProvider.offeredTools).toContain("web_search");
  });
});
