/**
 * @jest-environment node
 *
 * F4.4b — both tool loops (main response and Ask answer) send the right
 * thought signature back with the replayed web_search call.
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
import { setUserPlanOverride, clearUserPlanOverrides } from "@/server/billing/plans";
import type { AiProvider, GenerateRequest, Part, StreamEvent } from "@/server/ai/types";
import type { Actor } from "@/server/auth/session";

type Order = "before" | "after" | "own";

/**
 * Calls web_search once, with the signature sent per `order`:
 * - before: a thought_signature event, then the call without one;
 * - after: the call without one, then a thought_signature event;
 * - own: an earlier thought_signature, then the call carrying its own.
 * Records the tool_call part it gets back on the next request.
 */
class SigningProvider implements AiProvider {
  id = "gemini" as const;
  replayed: Extract<Part, { type: "tool_call" }>[] = [];

  constructor(private order: Order) {}

  async *stream(req: GenerateRequest): AsyncIterable<StreamEvent> {
    if (req.grounding) {
      yield { type: "text_delta", text: "Found it." };
      yield { type: "citation", url: "https://example.com/a", title: "A", source: "GROUNDING" };
      return;
    }

    const replayed = req.messages
      .flatMap((m) => m.parts)
      .filter((p): p is Extract<Part, { type: "tool_call" }> => p.type === "tool_call");
    if (replayed.length > 0 || !req.tools?.some((t) => t.name === "web_search")) {
      // Other requests (e.g. the workspace title) carry no call.
      if (replayed.length > 0) this.replayed = replayed;
      yield { type: "text_delta", text: "Answer." };
      yield { type: "usage", inputTokens: 10, outputTokens: 5, estimated: false };
      return;
    }

    const call = { type: "tool_call" as const, name: "web_search", args: { query: "q" } };
    if (this.order === "before") {
      yield { type: "thought_signature", signature: "sig_before" };
      yield call;
    } else if (this.order === "after") {
      yield call;
      yield { type: "thought_signature", signature: "sig_after" };
    } else {
      yield { type: "thought_signature", signature: "sig_earlier" };
      yield { ...call, thoughtSignature: "sig_own" };
    }
  }
}

const expected: Record<Order, string> = {
  before: "sig_before",
  after: "sig_after",
  own: "sig_own",
};

async function drain(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  while (!(await reader.read()).done) {
    // read to the end
  }
}

async function makeOwner() {
  const id = crypto.randomUUID();
  const user = await db.user.create({
    data: { id, email: `f44b-${id}@example.com`, name: "F4.4b", emailVerified: true },
  });
  const acc = await createAccountWithFreeGrant(user.id);
  await db.creditAccount.update({ where: { id: acc.id }, data: { topupBalance: 100 } });
  setUserPlanOverride(user.id, "LITE");
  const actor: Actor = { userId: user.id, email: user.email, role: "USER", sessionId: `s_${id}` };
  const workspace = await db.workspace.create({ data: { ownerId: user.id, title: "F4.4b" } });
  return { user, actor, workspace };
}

describe("F4.4b — the tool loops send the call's signature back", () => {
  afterEach(() => {
    setCustomProvider(null);
    setAnnotationCustomProviderForTesting(null);
    clearUserPlanOverrides();
  });

  describe.each<Order>(["before", "after", "own"])("signature %s the call", (order) => {
    it("main response (generation.ts)", async () => {
      clearActiveGenerationsForTesting();
      const provider = new SigningProvider(order);
      setCustomProvider(provider);
      const { actor, workspace } = await makeOwner();

      const { stream } = await createAndStreamGeneration(actor, workspace.id, {
        idempotencyKey: `f44b_${crypto.randomUUID()}`,
        prompt: "What is new today?",
        modelKey: "text-economy",
        kind: "TEXT",
      });
      await drain(stream);

      expect(provider.replayed).toEqual([
        expect.objectContaining({ name: "web_search", thoughtSignature: expected[order] }),
      ]);
    });

    it("Ask answer (annotation.ts)", async () => {
      const provider = new SigningProvider(order);
      setAnnotationCustomProviderForTesting(provider);
      const { user, actor, workspace } = await makeOwner();

      const response = await db.response.create({
        data: { workspaceId: workspace.id, createdById: user.id, origin: "DIRECT", prompt: "Q" },
      });
      const version = await db.responseVersion.create({
        data: {
          responseId: response.id,
          number: 1,
          content: "PostgreSQL is a database.",
          modelKey: "text-economy",
          providerModelId: "test-model",
          promptVersion: "v1",
          status: "COMPLETE",
          createdById: user.id,
        },
      });
      await db.response.update({
        where: { id: response.id },
        data: { activeVersionId: version.id },
      });
      const annotation = await createAnnotation(actor, version.id, {
        kind: "ASK",
        mode: "now",
        anchor: { exact: "PostgreSQL" },
        text: "What is new in PostgreSQL?",
      });

      const { stream } = await streamAnnotationAnswer(actor, annotation.id, {
        idempotencyKey: `f44b_${crypto.randomUUID()}`,
      });
      await drain(stream);

      expect(provider.replayed).toEqual([
        expect.objectContaining({ name: "web_search", thoughtSignature: expected[order] }),
      ]);
    });
  });
});
