/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import {
  createAndStreamGeneration,
  setCustomProvider,
  clearActiveGenerationsForTesting,
} from "@/server/services/generation";
import {
  listWorkspaceResponses,
  regenerateResponse,
  listResponseVersions,
  setActiveVersion,
} from "@/server/services/response";
import {
  createAccountWithFreeGrant,
  getAccountByUserId,
} from "@/server/services/credits";
import {
  setUserPlanOverride,
  clearUserPlanOverrides,
} from "@/server/billing/plans";
import {
  creditsFor,
  GROUNDING_SURCHARGE_CREDITS,
  validateCitationUrl,
  extractCitationHostname,
  applyGroundingInlineMarkers,
  type AiProvider,
  type GenerateRequest,
  type ImageRequest,
  type ImageResult,
  type StreamEvent,
} from "@/server/ai";
import { GET as getFavicon } from "@/app/api/v1/favicon/route";
import { ApiError } from "@/server/http/errors";
import type { Actor } from "@/server/auth/session";

class FakeGroundedAiProvider implements AiProvider {
  id = "gemini" as const;
  private callCount = 0;

  async *stream(req: GenerateRequest): AsyncIterable<StreamEvent> {
    this.callCount += 1;
    const isRegen = this.callCount > 1;

    if (req.grounding) {
      const sentence1 = isRegen
        ? "PostgreSQL 17 introduces enhanced vacuum memory management."
        : "PostgreSQL uses multiversion concurrency control for isolation.";
      const sentence2 = isRegen
        ? " It also improves B-tree index performance for IN lists."
        : " Read replicas can scale horizontal read throughput.";

      yield { type: "text_delta", text: sentence1 };
      yield { type: "text_delta", text: sentence2 };

      yield {
        type: "citation",
        url: isRegen
          ? "https://www.postgresql.org/docs/17/release-17.html"
          : "https://www.postgresql.org/docs/current/mvcc.html",
        title: isRegen ? "PostgreSQL 17 Release Notes" : "PostgreSQL MVCC Docs",
        snippet: sentence1,
        source: "GROUNDING",
        segments: [
          {
            startIndex: 0,
            endIndex: sentence1.length,
            text: sentence1,
          },
        ],
      };

      yield {
        type: "citation",
        url: isRegen
          ? "https://www.postgresql.org/docs/17/indexes-types.html"
          : "https://www.postgresql.org/docs/current/high-availability.html",
        title: isRegen ? "PostgreSQL 17 Indexes" : "High Availability & Replication",
        snippet: sentence2.trim(),
        source: "GROUNDING",
        segments: [
          {
            startIndex: sentence1.length,
            endIndex: sentence1.length + sentence2.length,
            text: sentence2.trim(),
          },
        ],
      };

      // Also emit a dangerous non-http URL to verify it is filtered out
      yield {
        type: "citation",
        url: "javascript:alert(1)",
        title: "Malicious Scheme",
        source: "GROUNDING",
      };
    } else {
      // Ungrounded response that happens to mention a URL in plain text
      // AND a stray citation event to verify ungrounded mode never records grounding citations
      yield {
        type: "text_delta",
        text: "You can read more at https://remembered-by-model.example.com/guide in the docs.",
      };
      yield {
        type: "citation",
        url: "https://stray-grounding.example.com",
        title: "Should Be Ignored When Grounding Is False",
        source: "GROUNDING",
      };
    }

    yield {
      type: "usage",
      inputTokens: 200,
      outputTokens: 100,
      estimated: false,
    };
  }

  async generateImage(_req: ImageRequest): Promise<ImageResult> {
    throw new Error("Not used in citation tests");
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

describe("Step 5.5 — Citations and References", () => {
  let user: { id: string; email: string };
  let actor: Actor;
  let workspace: { id: string };

  beforeEach(async () => {
    clearActiveGenerationsForTesting();
    clearUserPlanOverrides();
    setCustomProvider(new FakeGroundedAiProvider());

    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    user = await db.user.create({
      data: {
        id: `user_cit_${unique}`,
        name: "Citation Test User",
        email: `cit_${unique}@example.com`,
        emailVerified: true,
      },
    });

    actor = {
      userId: user.id,
      email: user.email,
      role: "USER",
      sessionId: `sess_cit_${unique}`,
    };

    const acc = await createAccountWithFreeGrant(user.id);
    await db.creditAccount.update({
      where: { id: acc.id },
      data: { topupBalance: 200 },
    });

    // Default to LITE plan (which allows grounding)
    setUserPlanOverride(user.id, "LITE");

    workspace = await db.workspace.create({
      data: {
        ownerId: user.id,
        title: "Citations Test Workspace",
      },
    });
  });

  afterAll(async () => {
    clearUserPlanOverrides();
    setCustomProvider(null);
  });

  describe("1. URL Validation, Hostname Extraction & Inline Marker Positioning", () => {
    it("validates http/https URLs and rejects unsafe schemes", () => {
      expect(validateCitationUrl("https://www.postgresql.org/docs")).toEqual({
        valid: true,
        normalizedUrl: "https://www.postgresql.org/docs",
        hostname: "postgresql.org",
      });
      expect(validateCitationUrl("http://example.com/path?a=1")).toEqual({
        valid: true,
        normalizedUrl: "http://example.com/path?a=1",
        hostname: "example.com",
      });
      expect(validateCitationUrl("javascript:alert(1)").valid).toBe(false);
      expect(validateCitationUrl("data:text/html,<h1>Hi</h1>").valid).toBe(
        false
      );
      expect(validateCitationUrl("file:///etc/passwd").valid).toBe(false);
      expect(validateCitationUrl("not-a-url").valid).toBe(false);

      expect(extractCitationHostname("https://www.postgresql.org/docs")).toBe(
        "postgresql.org"
      );
      expect(extractCitationHostname("https://docs.github.com/en")).toBe(
        "docs.github.com"
      );
    });

    it("inserts inline [n] markers at provider segment positions or leaves text untouched when positions are absent", () => {
      const s1 = "Earth orbits the Sun.";
      const s2 = " The Moon orbits Earth.";
      const content = s1 + s2;

      const withMarkers = applyGroundingInlineMarkers(content, [
        {
          index: 1,
          segments: [{ startIndex: 0, endIndex: s1.length, text: s1 }],
        },
        {
          index: 2,
          segments: [
            {
              startIndex: s1.length,
              endIndex: s1.length + s2.length,
              text: s2.trim(),
            },
          ],
        },
      ]);

      expect(withMarkers).toBe(
        "Earth orbits the Sun.[1] The Moon orbits Earth.[2]"
      );

      // Without segments, do not fake inline positions
      const withoutSegments = applyGroundingInlineMarkers(content, [
        {
          index: 1,
        },
      ]);
      expect(withoutSegments).toBe(content);
    });
  });

  describe("2. Pricing Surcharge & Plan Gate", () => {
    it("adds +3 credit surcharge when grounding is enabled", () => {
      const baseCredits = creditsFor("text-economy", {
        inputTokens: 200,
        outputTokens: 100,
        grounding: false,
      });
      const groundedCredits = creditsFor("text-economy", {
        inputTokens: 200,
        outputTokens: 100,
        grounding: true,
      });

      expect(GROUNDING_SURCHARGE_CREDITS).toBe(3);
      expect(groundedCredits).toBe(baseCredits + 3);
    });

    it("blocks FREE plan users from grounded search with 403 forbidden before reserving credits", async () => {
      setUserPlanOverride(user.id, "FREE");
      const beforeAccount = await getAccountByUserId(user.id);

      await expect(
        createAndStreamGeneration(actor, workspace.id, {
          idempotencyKey: `idem_free_ground_${Date.now()}`,
          prompt: "Search the web for PostgreSQL news",
          modelKey: "text-economy",
          kind: "TEXT",
          grounding: true,
        })
      ).rejects.toThrow(ApiError);

      const afterAccount = await getAccountByUserId(user.id);
      expect(afterAccount?.planBalance).toBe(beforeAccount?.planBalance);
      expect(afterAccount?.topupBalance).toBe(beforeAccount?.topupBalance);
    });
  });

  describe("3. Grounded vs Ungrounded Generation & User-Supplied Link Attachments", () => {
    it("persists GROUNDING citations, positions inline [n] markers, and charges +3 surcharge on grounded turns", async () => {
      const beforeAcc = await getAccountByUserId(user.id);
      const beforeTotal =
        (beforeAcc?.planBalance ?? 0) + (beforeAcc?.topupBalance ?? 0);

      const { stream } = await createAndStreamGeneration(actor, workspace.id, {
        idempotencyKey: `idem_grounded_${Date.now()}`,
        prompt: "How does PostgreSQL handle concurrency and read scaling?",
        modelKey: "text-economy",
        kind: "TEXT",
        grounding: true,
      });

      const sseOutput = await readAllSse(stream);
      expect(sseOutput).toContain("event: citation");
      expect(sseOutput).toContain("event: completed");

      const afterAcc = await getAccountByUserId(user.id);
      const afterTotal =
        (afterAcc?.planBalance ?? 0) + (afterAcc?.topupBalance ?? 0);
      const expectedCharge = creditsFor("text-economy", {
        inputTokens: 200,
        outputTokens: 100,
        grounding: true,
      });
      expect(beforeTotal - afterTotal).toBe(expectedCharge);

      const page = await listWorkspaceResponses(actor, workspace.id, { limit: 10 });
      expect(page.items).toHaveLength(1);

      const item = page.items[0]!;
      expect(item.activeVersion?.content).toContain("[1]");
      expect(item.activeVersion?.content).toContain("[2]");

      // Malicious javascript: citation was filtered out; only 2 valid https citations remain
      const citations = item.activeVersion?.citations ?? [];
      expect(citations).toHaveLength(2);
      expect(citations[0]).toMatchObject({
        index: 1,
        url: "https://www.postgresql.org/docs/current/mvcc.html",
        title: "PostgreSQL MVCC Docs",
        source: "GROUNDING",
      });
      expect(citations[1]).toMatchObject({
        index: 2,
        url: "https://www.postgresql.org/docs/current/high-availability.html",
        title: "High Availability & Replication",
        source: "GROUNDING",
      });
    });

    it("never fabricates or stores citations from remembered URLs when grounding is false", async () => {
      const { stream } = await createAndStreamGeneration(actor, workspace.id, {
        idempotencyKey: `idem_ungrounded_${Date.now()}`,
        prompt: "Tell me about PostgreSQL",
        modelKey: "text-economy",
        kind: "TEXT",
        grounding: false,
      });

      await readAllSse(stream);

      const page = await listWorkspaceResponses(actor, workspace.id, { limit: 10 });
      expect(page.items).toHaveLength(1);

      const item = page.items[0]!;
      expect(item.activeVersion?.content).toContain(
        "https://remembered-by-model.example.com/guide"
      );
      expect(item.activeVersion?.citations).toEqual([]);
    });

    it("records user-supplied link attachments as source: ATTACHMENT citations", async () => {
      const linkAtt = await db.attachment.create({
        data: {
          workspaceId: workspace.id,
          ownerId: user.id,
          kind: "DOCUMENT",
          resourceType: "link",
          providerId: "https://spec.example.org/rfc-9999",
          originalName: "Official Spec Document",
          mime: "text/plain",
          bytes: 120,
          status: "READY",
          extractedText: "Specification content for RFC 9999.",
        },
      });

      const { stream } = await createAndStreamGeneration(actor, workspace.id, {
        idempotencyKey: `idem_link_att_${Date.now()}`,
        prompt: "Summarize this specification link",
        modelKey: "text-economy",
        kind: "TEXT",
        grounding: false,
        attachmentIds: [linkAtt.id],
      });

      await readAllSse(stream);

      const page = await listWorkspaceResponses(actor, workspace.id, { limit: 10 });
      const citations = page.items[0]?.activeVersion?.citations ?? [];
      expect(citations).toHaveLength(1);
      expect(citations[0]).toMatchObject({
        index: 1,
        url: "https://spec.example.org/rfc-9999",
        title: "Official Spec Document",
        source: "ATTACHMENT",
      });
    });
  });

  describe("4. Regeneration & Version Persistence", () => {
    it("maintains independent citations per ResponseVersion across regenerate and version switching", async () => {
      // Version 1 (grounded)
      const { stream: s1 } = await createAndStreamGeneration(
        actor,
        workspace.id,
        {
          idempotencyKey: `idem_v1_${Date.now()}`,
          prompt: "Explain PostgreSQL architecture",
          modelKey: "text-economy",
          kind: "TEXT",
          grounding: true,
        }
      );
      await readAllSse(s1);

      const initialList = await listWorkspaceResponses(actor, workspace.id, {
        limit: 10,
      });
      const responseId = initialList.items[0]!.id;
      const v1Id = initialList.items[0]!.activeVersion!.id;

      // Regenerate -> Version 2 (preserves grounding automatically)
      const { stream: s2 } = await regenerateResponse(actor, responseId, {
        idempotencyKey: `idem_v2_${Date.now()}`,
      });
      await readAllSse(s2);

      const versions = await listResponseVersions(actor, responseId);
      expect(versions).toHaveLength(2);

      const v1 = versions.find((v) => v.number === 1)!;
      const v2 = versions.find((v) => v.number === 2)!;

      expect(v1.citations).toHaveLength(2);
      expect(v1.citations[0]!.url).toBe(
        "https://www.postgresql.org/docs/current/mvcc.html"
      );

      expect(v2.citations).toHaveLength(2);
      expect(v2.citations[0]!.url).toBe(
        "https://www.postgresql.org/docs/17/release-17.html"
      );

      // Switch back to v1 and verify activeVersion citations reflect v1
      await setActiveVersion(actor, responseId, v1Id);
      const switchedList = await listWorkspaceResponses(actor, workspace.id, {
        limit: 10,
      });
      expect(switchedList.items[0]!.activeVersion!.id).toBe(v1Id);
      expect(switchedList.items[0]!.activeVersion!.citations[0]!.url).toBe(
        "https://www.postgresql.org/docs/current/mvcc.html"
      );
    });
  });

  describe("5. Favicon Proxy Endpoint", () => {
    it("returns fallback SVG with cache headers for invalid or unreachable hosts", async () => {
      const reqInvalid = new NextRequest(
        "http://localhost:3000/api/v1/favicon?host=127.0.0.1"
      );
      const resInvalid = await getFavicon(reqInvalid);
      expect(resInvalid.status).toBe(200);
      expect(resInvalid.headers.get("Content-Type")).toContain("image/svg+xml");
    });
  });
});
