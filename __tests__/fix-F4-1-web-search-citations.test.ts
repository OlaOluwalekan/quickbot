/**
 * @jest-environment node
 *
 * F4.1 — web search results come back to the model numbered like the answer's
 * citations, so the answer carries inline [n] markers; Asks search the same
 * way and are charged per executed search.
 */
import crypto from "node:crypto";
import { db } from "@/server/db/client";
import {
  createAndStreamGeneration,
  setCustomProvider,
  clearActiveGenerationsForTesting,
} from "@/server/services/generation";
import {
  createAnnotation,
  streamAnnotationAnswer,
  setAnnotationCustomProviderForTesting,
} from "@/server/services/annotation";
import { createAccountWithFreeGrant } from "@/server/services/credits";
import { executeWebSearchTool, webSearchNotice } from "@/server/services/web-search";
import { setUserPlanOverride, clearUserPlanOverrides } from "@/server/billing/plans";
import { updateUserPreferences } from "@/server/services/user-preferences";
import type {
  AiProvider,
  GenerateRequest,
  ImageRequest,
  ImageResult,
  StreamEvent,
} from "@/server/ai";
import type { Actor } from "@/server/auth/session";

const SEARCH_SUMMARY = "Widgets cost $50 today. Gadgets cost $20.";

/**
 * Grounded sub-request: a summary whose sentences are tied to two sources.
 * Main request: calls web_search once, then answers using the numbers it got.
 */
class NumberingProvider implements AiProvider {
  id = "gemini" as const;
  public toolResponses: unknown[] = [];
  public offeredTools: string[][] = [];

  async *stream(req: GenerateRequest): AsyncIterable<StreamEvent> {
    if (req.grounding) {
      yield { type: "text_delta", text: SEARCH_SUMMARY };
      yield {
        type: "citation",
        url: "https://widgets.example.com/prices",
        title: "Widget prices",
        source: "GROUNDING",
        segments: [{ startIndex: 0, endIndex: 23, text: "Widgets cost $50 today." }],
      };
      yield {
        type: "citation",
        url: "https://gadgets.example.com/",
        title: "Gadget prices",
        source: "GROUNDING",
        segments: [{ text: "Gadgets cost $20." }],
      };
      yield { type: "citation", url: "javascript:alert(1)", source: "GROUNDING" };
      return;
    }

    this.offeredTools.push((req.tools ?? []).map((t) => t.name));
    const toolResponse = req.messages
      .flatMap((m) => m.parts)
      .find((p) => p.type === "tool_response" && p.name === "web_search");

    if (!toolResponse && req.tools?.some((t) => t.name === "web_search")) {
      yield { type: "tool_call", name: "web_search", args: { query: "widget price" } };
      return;
    }

    if (toolResponse && toolResponse.type === "tool_response") {
      this.toolResponses.push(toolResponse.response);
    }
    yield { type: "text_delta", text: "A widget costs $50 [1]. A gadget costs $20 [2]." };
    yield { type: "usage", inputTokens: 100, outputTokens: 40, estimated: false };
  }

  async generateImage(_req: ImageRequest): Promise<ImageResult> {
    throw new Error("Not used");
  }
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe("F4.1 — numbered web search sources and inline citations", () => {
  let owner: { id: string; email: string };
  let ownerActor: Actor;
  let workspace: { id: string };
  let provider: NumberingProvider;

  beforeEach(async () => {
    clearActiveGenerationsForTesting();
    clearUserPlanOverrides();
    provider = new NumberingProvider();
    setCustomProvider(provider);
    setAnnotationCustomProviderForTesting(provider);

    const unique = crypto.randomUUID().slice(0, 8);
    owner = await db.user.create({
      data: {
        id: `user_f41c_${unique}`,
        name: "F41 Citations",
        email: `f41c_${unique}@example.com`,
        emailVerified: true,
      },
    });
    ownerActor = {
      userId: owner.id,
      email: owner.email,
      role: "USER",
      sessionId: `sess_${unique}`,
    };
    const acc = await createAccountWithFreeGrant(owner.id);
    await db.creditAccount.update({ where: { id: acc.id }, data: { topupBalance: 200 } });
    setUserPlanOverride(owner.id, "STANDARD");

    workspace = await db.workspace.create({
      data: { ownerId: owner.id, title: "F41 citations" },
    });
  });

  afterAll(() => {
    setCustomProvider(null);
    setAnnotationCustomProviderForTesting(null);
    clearUserPlanOverrides();
  });

  it("numbers sources after existing citations, marks the summary and asks for inline [n]", async () => {
    const added: Array<{ index: number; url: string }> = [];
    const existing = [{ index: 1, url: "https://spec.example.org/attached" }];

    const result = await executeWebSearchTool({
      args: { query: "  widget price  " },
      providerInstance: provider,
      citations: existing,
      onCitation: (c) => added.push(c),
    });

    expect(result.executed).toBe(true);
    expect(result.query).toBe("widget price");
    // Unsafe URL dropped; numbering continues after the attachment citation.
    expect(added).toEqual([
      expect.objectContaining({ index: 2, url: "https://widgets.example.com/prices" }),
      expect.objectContaining({ index: 3, url: "https://gadgets.example.com/" }),
    ]);
    expect(result.response.sources).toEqual([
      { number: 2, title: "Widget prices", url: "https://widgets.example.com/prices" },
      { number: 3, title: "Gadget prices", url: "https://gadgets.example.com/" },
    ]);
    expect(result.response.summary).toBe("Widgets cost $50 today.[2] Gadgets cost $20.[3]");
    expect(String(result.response.instructions)).toContain("[1]");
  });

  it("does not run (or count) a search with an empty query", async () => {
    const onCitation = jest.fn();
    const result = await executeWebSearchTool({
      args: { query: "   " },
      providerInstance: provider,
      citations: [],
      onCitation,
    });
    expect(result.executed).toBe(false);
    expect(onCitation).not.toHaveBeenCalled();
  });

  it("main answer: the model gets numbered sources and the saved answer keeps its [n] markers", async () => {
    const { stream } = await createAndStreamGeneration(ownerActor, workspace.id, {
      idempotencyKey: `f41c_main_${Date.now()}`,
      prompt: "How much is a widget?",
      modelKey: "text-economy",
      kind: "TEXT",
    });
    await drain(stream);

    expect(provider.toolResponses).toHaveLength(1);
    expect(provider.toolResponses[0]).toMatchObject({
      sources: [
        { number: 1, url: "https://widgets.example.com/prices" },
        { number: 2, url: "https://gadgets.example.com/" },
      ],
    });

    const version = await db.responseVersion.findFirst({
      where: { createdById: owner.id },
      orderBy: { createdAt: "desc" },
      include: { citations: { orderBy: { index: "asc" } } },
    });
    expect(version?.content).toContain("$50 [1]");
    expect(version?.content).toContain("$20 [2]");
    expect(version?.citations.map((c) => [c.index, c.url])).toEqual([
      [1, "https://widgets.example.com/prices"],
      [2, "https://gadgets.example.com/"],
    ]);
    expect(version?.thoughtSummary).toContain(
      webSearchNotice(null, "searchedWeb", { query: "widget price" })
    );
  });

  it("Ask answer: searches with the same tool, cites inline and records the search", async () => {
    const response = await db.response.create({
      data: {
        workspaceId: workspace.id,
        createdById: owner.id,
        origin: "DIRECT",
        prompt: "Tell me about widgets",
      },
    });
    const version = await db.responseVersion.create({
      data: {
        responseId: response.id,
        number: 1,
        content: "Widgets are small devices sold everywhere.",
        modelKey: "text-economy",
        providerModelId: "fake",
        promptVersion: "v1",
        status: "COMPLETE",
        createdById: owner.id,
      },
    });
    await db.response.update({
      where: { id: response.id },
      data: { activeVersionId: version.id },
    });

    const annot = await createAnnotation(ownerActor, version.id, {
      kind: "ASK",
      mode: "now",
      anchor: { exact: "small devices" },
      text: "What does one cost today?",
    });

    const { stream, generationId } = await streamAnnotationAnswer(ownerActor, annot.id, {
      idempotencyKey: `f41c_ask_${Date.now()}`,
    });
    const sse = await drain(stream);
    expect(sse).toContain('"stage":"searching"');

    const message = await db.annotationMessage.findFirst({
      where: { annotationId: annot.id, role: "ASSISTANT" },
    });
    expect(message?.content).toContain("[1]");
    expect(message?.citations).toEqual([
      expect.objectContaining({ index: 1, url: "https://widgets.example.com/prices" }),
      expect.objectContaining({ index: 2, url: "https://gadgets.example.com/" }),
    ]);

    const generation = await db.generation.findUnique({ where: { id: generationId } });
    expect((generation?.usage as { searches?: number } | null)?.searches).toBe(1);
  });

  it("Ask answer: no search tool when the asker turned web search off", async () => {
    await updateUserPreferences(owner.id, { webSearchEnabled: false });

    const response = await db.response.create({
      data: {
        workspaceId: workspace.id,
        createdById: owner.id,
        origin: "DIRECT",
        prompt: "Tell me about widgets",
      },
    });
    const version = await db.responseVersion.create({
      data: {
        responseId: response.id,
        number: 1,
        content: "Widgets are small devices sold everywhere.",
        modelKey: "text-economy",
        providerModelId: "fake",
        promptVersion: "v1",
        status: "COMPLETE",
        createdById: owner.id,
      },
    });
    const annot = await createAnnotation(ownerActor, version.id, {
      kind: "ASK",
      mode: "now",
      anchor: { exact: "small devices" },
      text: "What does one cost today?",
    });

    const { stream, generationId } = await streamAnnotationAnswer(ownerActor, annot.id, {
      idempotencyKey: `f41c_ask_off_${Date.now()}`,
    });
    await drain(stream);

    expect(provider.offeredTools.every((tools) => !tools.includes("web_search"))).toBe(true);
    const generation = await db.generation.findUnique({ where: { id: generationId } });
    expect((generation?.usage as { searches?: number } | null)?.searches).toBe(0);
  });
});
