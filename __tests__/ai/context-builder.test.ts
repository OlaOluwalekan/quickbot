/**
 * @jest-environment node
 */
import { db } from "@/server/db/client";
import {
  buildContext,
  assembleContextMessages,
  estimateTokens,
  type ContextTurn,
} from "@/server/ai/context-builder";
import { buildSystemPrompt, PROMPT_VERSION } from "@/server/ai/prompts/system";
import {
  buildAnnotationReplyPrompt,
  buildBatchQuestionsPrompt,
  ANNOTATION_PROMPT_VERSION,
} from "@/server/ai/prompts/annotation";

describe("Context builder and system prompts (Step 2.3)", () => {
  let testUserId: string;
  let testWorkspaceId: string;

  beforeAll(async () => {
    testUserId = `user_ctx_${Date.now()}`;
    await db.user.create({
      data: {
        id: testUserId,
        email: `${testUserId}@example.com`,
        name: "Context Builder Tester",
        emailVerified: true,
      },
    });

    const workspace = await db.workspace.create({
      data: {
        id: `ws_ctx_${Date.now()}`,
        ownerId: testUserId,
        title: "Context Builder Workspace",
      },
    });
    testWorkspaceId = workspace.id;
  });

  afterAll(async () => {
    if (testWorkspaceId) {
      await db.workspace.deleteMany({
        where: { id: testWorkspaceId },
      });
    }
    if (testUserId) {
      await db.user.deleteMany({
        where: { id: testUserId },
      });
    }
    await db.$disconnect();
  });

  describe("1. Ordering test", () => {
    it("loads responses in (sortAt, id) order and outputs alternating user/assistant turns followed by newPrompt", async () => {
      const now = Date.now();
      const ws = await db.workspace.create({
        data: {
          id: `ws_order_${now}`,
          ownerId: testUserId,
          title: "Order Test",
        },
      });

      // Create 3 responses with distinct sortAt timestamps
      const r1 = await db.response.create({
        data: {
          id: `resp_1_${now}`,
          workspaceId: ws.id,
          createdById: testUserId,
          prompt: "Prompt 1",
          sortAt: new Date(now + 1000),
        },
      });
      const v1 = await db.responseVersion.create({
        data: {
          id: `v_1_${now}`,
          responseId: r1.id,
          number: 1,
          content: "Answer 1",
          modelKey: "text-economy",
          providerModelId: "gemini-2.5-flash",
          promptVersion: PROMPT_VERSION,
          createdById: testUserId,
        },
      });
      await db.response.update({
        where: { id: r1.id },
        data: { activeVersionId: v1.id },
      });

      const r2 = await db.response.create({
        data: {
          id: `resp_2_${now}`,
          workspaceId: ws.id,
          createdById: testUserId,
          prompt: "Prompt 2",
          sortAt: new Date(now + 2000),
        },
      });
      const v2 = await db.responseVersion.create({
        data: {
          id: `v_2_${now}`,
          responseId: r2.id,
          number: 1,
          content: "Answer 2",
          modelKey: "text-economy",
          providerModelId: "gemini-2.5-flash",
          promptVersion: PROMPT_VERSION,
          createdById: testUserId,
        },
      });
      await db.response.update({
        where: { id: r2.id },
        data: { activeVersionId: v2.id },
      });

      const r3 = await db.response.create({
        data: {
          id: `resp_3_${now}`,
          workspaceId: ws.id,
          createdById: testUserId,
          prompt: "Prompt 3",
          sortAt: new Date(now + 3000),
        },
      });
      const v3 = await db.responseVersion.create({
        data: {
          id: `v_3_${now}`,
          responseId: r3.id,
          number: 1,
          content: "Answer 3",
          modelKey: "text-economy",
          providerModelId: "gemini-2.5-flash",
          promptVersion: PROMPT_VERSION,
          createdById: testUserId,
        },
      });
      await db.response.update({
        where: { id: r3.id },
        data: { activeVersionId: v3.id },
      });

      const result = await buildContext({
        workspaceId: ws.id,
        newPrompt: "Prompt 4 (new)",
        modelKey: "text-economy",
        language: "en",
      });

      expect(result.truncated).toBe(false);
      // 3 historical turns * 2 messages + 1 new prompt = 7 messages
      expect(result.messages.length).toBe(7);

      expect(result.messages[0]).toEqual({
        role: "user",
        parts: [{ type: "text", text: "Prompt 1" }],
      });
      expect(result.messages[1]).toEqual({
        role: "assistant",
        parts: [{ type: "text", text: "Answer 1" }],
      });
      expect(result.messages[2]).toEqual({
        role: "user",
        parts: [{ type: "text", text: "Prompt 2" }],
      });
      expect(result.messages[3]).toEqual({
        role: "assistant",
        parts: [{ type: "text", text: "Answer 2" }],
      });
      expect(result.messages[4]).toEqual({
        role: "user",
        parts: [{ type: "text", text: "Prompt 3" }],
      });
      expect(result.messages[5]).toEqual({
        role: "assistant",
        parts: [{ type: "text", text: "Answer 3" }],
      });
      expect(result.messages[6]).toEqual({
        role: "user",
        parts: [{ type: "text", text: "Prompt 4 (new)" }],
      });

      await db.workspace.delete({ where: { id: ws.id } });
    });
  });

  describe("2. Regenerate from turn N excludes later turns", () => {
    it("excludes turns created after upToResponseId", async () => {
      const now = Date.now();
      const ws = await db.workspace.create({
        data: {
          id: `ws_regen_${now}`,
          ownerId: testUserId,
          title: "Regenerate Test",
        },
      });

      // Create 4 responses
      const responses = [];
      for (let i = 1; i <= 4; i++) {
        const r = await db.response.create({
          data: {
            id: `resp_regen_${i}_${now}`,
            workspaceId: ws.id,
            createdById: testUserId,
            prompt: `Prompt ${i}`,
            sortAt: new Date(now + i * 1000),
          },
        });
        const v = await db.responseVersion.create({
          data: {
            id: `v_regen_${i}_${now}`,
            responseId: r.id,
            number: 1,
            content: `Answer ${i}`,
            modelKey: "text-economy",
            providerModelId: "gemini-2.5-flash",
            promptVersion: PROMPT_VERSION,
            createdById: testUserId,
          },
        });
        await db.response.update({
          where: { id: r.id },
          data: { activeVersionId: v.id },
        });
        responses.push(r);
      }

      // Asking up to turn 2 should only include turns 1 and 2; turns 3 and 4 are excluded!
      const result = await buildContext({
        workspaceId: ws.id,
        upToResponseId: responses[1]!.id, // response 2
        newPrompt: "Regenerated or Follow-up prompt",
        modelKey: "text-economy",
        language: "en",
      });

      // 2 historical turns * 2 + 1 new prompt = 5 messages
      expect(result.messages.length).toBe(5);
      expect(result.messages[0]?.parts[0]).toEqual({
        type: "text",
        text: "Prompt 1",
      });
      expect(result.messages[1]?.parts[0]).toEqual({
        type: "text",
        text: "Answer 1",
      });
      expect(result.messages[2]?.parts[0]).toEqual({
        type: "text",
        text: "Prompt 2",
      });
      expect(result.messages[3]?.parts[0]).toEqual({
        type: "text",
        text: "Answer 2",
      });
      expect(result.messages[4]?.parts[0]).toEqual({
        type: "text",
        text: "Regenerated or Follow-up prompt",
      });

      // With excludeUpToResponseId = true (regenerating turn 2 itself, so history is up to turn 1):
      const regenTurn2 = await buildContext({
        workspaceId: ws.id,
        upToResponseId: responses[1]!.id, // response 2
        excludeUpToResponseId: true,
        newPrompt: "Prompt 2",
        modelKey: "text-economy",
        language: "en",
      });

      expect(regenTurn2.messages.length).toBe(3);
      expect(regenTurn2.messages[0]?.parts[0]).toEqual({
        type: "text",
        text: "Prompt 1",
      });
      expect(regenTurn2.messages[1]?.parts[0]).toEqual({
        type: "text",
        text: "Answer 1",
      });
      expect(regenTurn2.messages[2]?.parts[0]).toEqual({
        type: "text",
        text: "Prompt 2",
      });

      await db.workspace.delete({ where: { id: ws.id } });
    });
  });

  describe("3. Edited text is used", () => {
    it("uses latest user edit as the intended truth instead of raw AI version content", async () => {
      const now = Date.now();
      const ws = await db.workspace.create({
        data: {
          id: `ws_edit_${now}`,
          ownerId: testUserId,
          title: "Edit Test",
        },
      });

      const r = await db.response.create({
        data: {
          id: `resp_edit_${now}`,
          workspaceId: ws.id,
          createdById: testUserId,
          prompt: "What is 2+2?",
          sortAt: new Date(now),
        },
      });

      const v = await db.responseVersion.create({
        data: {
          id: `v_edit_${now}`,
          responseId: r.id,
          number: 1,
          content: "Original AI text with a typo: 2+2=5",
          modelKey: "text-economy",
          providerModelId: "gemini-2.5-flash",
          promptVersion: PROMPT_VERSION,
          createdById: testUserId,
        },
      });
      await db.response.update({
        where: { id: r.id },
        data: { activeVersionId: v.id },
      });

      // Add a user edit
      await db.responseEdit.create({
        data: {
          id: `edit_1_${now}`,
          versionId: v.id,
          revision: 1,
          content: "User corrected text: 2+2=4",
          editorId: testUserId,
        },
      });

      const result = await buildContext({
        workspaceId: ws.id,
        newPrompt: "Next question",
        modelKey: "text-economy",
        language: "en",
      });

      expect(result.messages.length).toBe(3);
      // The assistant message must contain the user's edit, with no special marking
      expect(result.messages[1]).toEqual({
        role: "assistant",
        parts: [{ type: "text", text: "User corrected text: 2+2=4" }],
      });

      await db.workspace.delete({ where: { id: ws.id } });
    });
  });

  describe("4. Truncation keeps first + last turns", () => {
    it("drops oldest complete turns first and strictly preserves the first turn and the last 4 turns", () => {
      // Create 8 complete turns
      const turns: ContextTurn[] = Array.from({ length: 8 }, (_, i) => ({
        responseId: `turn_${i}`,
        prompt: `User prompt for turn ${i} - ${"long text ".repeat(50)}`,
        assistantText: `Assistant response for turn ${i} - ${"detailed answer ".repeat(50)}`,
      }));

      // Calculate tokens per turn
      const turnTokens = turns.map(
        (t) => estimateTokens(t.prompt) + estimateTokens(t.assistantText)
      );

      // Set maxInputTokens to only fit ~5 turns (turn 0 + last 4 turns)
      // This forces the oldest candidate turns (turn 1, turn 2, turn 3) to be dropped!
      const keptCost =
        turnTokens[0]! +
        turnTokens[4]! +
        turnTokens[5]! +
        turnTokens[6]! +
        turnTokens[7]!;

      // Formulate maxInputTokens so historyBudget accommodates keptCost exactly
      const systemTokens = 100;
      const reservedOutput = 1000;
      const newPrompt = "Latest user prompt";
      const newPromptTokens = estimateTokens(newPrompt);
      const maxInputTokens = Math.ceil((keptCost + newPromptTokens + systemTokens + reservedOutput) / 0.9);

      const result = assembleContextMessages({
        turns,
        newPrompt,
        systemTokens,
        maxInputTokens,
        reservedOutputTokens: reservedOutput,
      });

      expect(result.truncated).toBe(true);

      // Verify Turn 0 is kept
      expect(result.messages[0]?.parts[0]).toEqual({
        type: "text",
        text: turns[0]!.prompt,
      });
      expect(result.messages[1]?.parts[0]).toEqual({
        type: "text",
        text: turns[0]!.assistantText,
      });

      // Verify the last 4 turns (turns 4, 5, 6, 7) are kept
      const lastAssistant = result.messages[result.messages.length - 2]?.parts[0];
      expect(lastAssistant).toEqual({
        type: "text",
        text: turns[7]!.assistantText,
      });

      // Turns 1, 2, 3 were dropped because they were the oldest intermediate turns
      const allTexts = result.messages.map((m) =>
        m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")
      );
      expect(allTexts.some((t) => t.includes("turn 1"))).toBe(false);

      // Total messages = 5 kept turns * 2 + 1 new prompt = 11
      expect(result.messages.length).toBe(11);
      expect(result.messages[10]?.parts[0]).toEqual({
        type: "text",
        text: "Latest user prompt",
      });
    });

    it("does not truncate when token budget is sufficient", () => {
      const turns: ContextTurn[] = [
        { responseId: "1", prompt: "Hello", assistantText: "Hi" },
        { responseId: "2", prompt: "How are you?", assistantText: "Good" },
      ];

      const result = assembleContextMessages({
        turns,
        newPrompt: "What is your name?",
        systemTokens: 50,
        maxInputTokens: 200_000,
        reservedOutputTokens: 4096,
      });

      expect(result.truncated).toBe(false);
      expect(result.messages.length).toBe(5);
    });
  });

  describe("5. Language placeholder is filled", () => {
    it("fills the language placeholder properly in buildSystemPrompt", () => {
      const promptEn = buildSystemPrompt("en");
      expect(promptEn).toContain("Response language: en.");
      expect(promptEn).toContain("You are Klecx");
      expect(promptEn).toContain("Acceptable Use Policy");

      const promptFr = buildSystemPrompt("French");
      expect(promptFr).toContain("Response language: French.");

      const promptEs = buildSystemPrompt("Spanish");
      expect(promptEs).toContain("Response language: Spanish.");
    });

    it("passes the language through buildContext", async () => {
      const result = await buildContext({
        workspaceId: testWorkspaceId,
        newPrompt: "Hello",
        modelKey: "text-economy",
        language: "de",
      });

      expect(result.system).toContain("Response language: de.");
      expect(PROMPT_VERSION).toBe("2026-10-1");
    });
  });

  describe("6. Annotation prompt templates", () => {
    it("builds annotation reply and batch questions prompts with versioning", () => {
      expect(ANNOTATION_PROMPT_VERSION).toBe("2026-10-1");

      const replyPrompt = buildAnnotationReplyPrompt({
        highlightedText: "Crucial contract clause",
        userComment: "What does this mean?",
      });
      expect(replyPrompt).toContain('"Crucial contract clause"');
      expect(replyPrompt).toContain("What does this mean?");

      const batchPrompt = buildBatchQuestionsPrompt([
        "What is the total cost?",
        "When is the deadline?",
      ]);
      expect(batchPrompt).toContain("1. What is the total cost?");
      expect(batchPrompt).toContain("2. When is the deadline?");
    });
  });
});
