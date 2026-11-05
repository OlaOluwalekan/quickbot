import "server-only";
import crypto from "node:crypto";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { requireWorkspace } from "@/server/authz/access";
import type { Actor } from "@/server/auth/session";
import type { RunQuestionBatchInput } from "@/lib/schemas/annotation";
import {
  getAccountByUserId,
  createAccountWithFreeGrant,
  reserve,
  settle,
  release,
} from "@/server/services/credits";
import {
  getModel,
  creditsFor,
  ModelKey,
} from "@/server/ai/registry";
import { streamAi, type AiProvider } from "@/server/ai";
import { getCustomProvider } from "@/server/services/generation";
import { estimateTokens } from "@/server/ai/context-builder";
import {
  buildQuestionBatchPrompt,
  questionBatchResponseSchema,
  QUESTION_BATCH_PROMPT_VERSION,
  type VersionQuestionsGroup,
} from "@/server/ai/prompts/question-batch";

let customQuestionBatchProviderForTesting: AiProvider | null = null;

export function setQuestionBatchCustomProviderForTesting(
  provider: AiProvider | null
) {
  customQuestionBatchProviderForTesting = provider;
}

function formatSSEEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Runs batch answers for queued questions in a workspace.
 *
 * Rules:
 * 1. Re-checks permissions (workspace.generate) at run time.
 * 2. Concurrency: uses row-level atomic update QUEUED -> ANSWERING.
 * 3. Billed to workspace owner, actor recorded.
 * 4. Groups questions by version so version context is included once.
 * 5. Calls model with responseSchema (structured JSON).
 * 6. Validates response JSON: answered questions marked ANSWERED + ASSISTANT message,
 *    missing questions marked FAILED (not charged separately).
 * 7. Emits SSE events in real-time.
 */
export async function runQuestionBatch(
  actor: Actor,
  workspaceId: string,
  input: RunQuestionBatchInput,
  options: { providerInstance?: AiProvider } = {}
): Promise<{ stream: ReadableStream<Uint8Array>; generationId: string; count: number }> {
  // 1. Enforce workspace.generate permission
  const wsAccess = await requireWorkspace(actor, workspaceId, "workspace.generate");

  // 2. Fetch candidate questions (caller's questions in QUEUED state, max 10)
  const candidateAnnotations = await db.annotation.findMany({
    where: {
      workspaceId,
      createdById: actor.userId,
      kind: "QUESTION",
      questionState: "QUEUED",
      deletedAt: null,
      ...(input.annotationIds && input.annotationIds.length > 0
        ? { id: { in: input.annotationIds } }
        : {}),
    },
    take: 10,
    orderBy: { createdAt: "asc" },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      version: {
        include: {
          response: {
            select: { id: true, workspaceId: true, prompt: true, deletedAt: true },
          },
        },
      },
    },
  });

  // Drop any whose version or response is soft-deleted
  const validCandidates = candidateAnnotations.filter(
    (a) =>
      a.version &&
      a.version.response &&
      a.version.response.deletedAt === null &&
      a.deletedAt === null
  );

  if (validCandidates.length === 0) {
    throw Errors.badRequest("No queued questions available to run");
  }

  const candidateIds = validCandidates.map((a) => a.id);

  // 3. Row-level atomic state transition QUEUED -> ANSWERING (concurrency protection)
  const updateResult = await db.annotation.updateMany({
    where: {
      id: { in: candidateIds },
      questionState: "QUEUED",
      deletedAt: null,
    },
    data: {
      questionState: "ANSWERING",
    },
  });

  if (updateResult.count === 0) {
    throw Errors.badRequest("Selected questions are already being answered");
  }

  // Load the claimed annotations
  const claimedAnnotations = await db.annotation.findMany({
    where: {
      id: { in: candidateIds },
      questionState: "ANSWERING",
      deletedAt: null,
    },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      version: {
        include: {
          response: {
            select: { id: true, workspaceId: true, prompt: true, deletedAt: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (claimedAnnotations.length === 0) {
    throw Errors.badRequest("Selected questions are already being answered");
  }

  // 4. Resolve workspace owner's credit account
  const wsOwnerId = wsAccess.ws.ownerId;
  let ownerAccount = await getAccountByUserId(wsOwnerId);
  if (!ownerAccount) {
    ownerAccount = await createAccountWithFreeGrant(wsOwnerId);
  }
  const billedAccountId = ownerAccount.id;

  // 5. Group questions by version
  const versionMap = new Map<string, VersionQuestionsGroup>();
  for (const annot of claimedAnnotations) {
    const vId = annot.versionId;
    if (!versionMap.has(vId)) {
      versionMap.set(vId, {
        versionId: vId,
        versionNumber: annot.version.number,
        versionContent: annot.version.content,
        originalPrompt: annot.version.response.prompt,
        questions: [],
      });
    }
    const userMsg = annot.messages.find((m) => m.role === "USER");
    const questionText = userMsg ? userMsg.content : "";
    versionMap.get(vId)!.questions.push({
      id: annot.id,
      passage: annot.anchorExact,
      question: questionText.slice(0, 500),
    });
  }
  const groups = Array.from(versionMap.values());

  // 6. Credit estimation & reservation
  const modelKey = (input.modelKey || "text-economy") as ModelKey;
  const model = getModel(modelKey);
  const generationId = crypto.randomUUID();

  let estimatedInputTokens = 500;
  for (const group of groups) {
    estimatedInputTokens +=
      estimateTokens(group.versionContent) +
      estimateTokens(group.originalPrompt);
    for (const q of group.questions) {
      estimatedInputTokens +=
        estimateTokens(q.passage) + estimateTokens(q.question);
    }
  }
  const estimatedOutputTokens = 250 * claimedAnnotations.length;

  const reserveAmount = creditsFor(modelKey, {
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
  });

  const idempotencyKey =
    input.idempotencyKey || `qbatch_${crypto.randomUUID()}`;
  const reservationKey = `res_qbatch_${idempotencyKey}`;
  const settleKey = `stl_qbatch_${generationId}`;
  const releaseKey = `rel_qbatch_${generationId}`;

  await reserve(billedAccountId, reserveAmount, reservationKey, {
    generationId,
    actorId: actor.userId,
    estimated: true,
  });

  await db.generation.create({
    data: {
      id: generationId,
      workspaceId,
      actorId: actor.userId,
      billedAccountId,
      kind: "QUESTION_BATCH",
      status: "RUNNING",
      modelKey,
      providerModelId: model.providerModelId,
      promptVersion: QUESTION_BATCH_PROMPT_VERSION,
      idempotencyKey,
      reservedCredits: reserveAmount,
      startedAt: new Date(),
    },
  });

  const promptText = buildQuestionBatchPrompt(groups);
  const encoder = new TextEncoder();
  const activeProvider =
    options.providerInstance ||
    customQuestionBatchProviderForTesting ||
    getCustomProvider() ||
    undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let accumulatedText = "";
      let reportedInputTokens: number | null = null;
      let reportedOutputTokens: number | null = null;

      try {
        controller.enqueue(
          encoder.encode(
            formatSSEEvent("started", {
              generationId,
              questionCount: claimedAnnotations.length,
            })
          )
        );
        controller.enqueue(
          encoder.encode(formatSSEEvent("status", { stage: "queued" }))
        );
        controller.enqueue(
          encoder.encode(
            formatSSEEvent("status", { stage: "preparing", truncated: false })
          )
        );
        controller.enqueue(
          encoder.encode(formatSSEEvent("status", { stage: "answering" }))
        );

        const aiStream = streamAi(
          {
            modelKey,
            messages: [
              {
                role: "user",
                parts: [{ type: "text", text: promptText }],
              },
            ],
            responseSchema: questionBatchResponseSchema,
            thinking: { summaries: false },
          },
          {
            providerInstance: activeProvider,
          }
        );

        for await (const chunk of aiStream) {
          if (chunk.type === "text_delta" && chunk.text) {
            accumulatedText += chunk.text;
          } else if (chunk.type === "usage") {
            reportedInputTokens = chunk.inputTokens;
            reportedOutputTokens = chunk.outputTokens;
          }
        }

        // 7. Parse & Validate structured JSON
        let parsedResults: Array<{ id: string; answer: string }> = [];
        try {
          let jsonString = accumulatedText.trim();
          // Strip optional ```json ... ``` code fence
          if (jsonString.startsWith("```")) {
            jsonString = jsonString
              .replace(/^```[a-z]*\s*/i, "")
              .replace(/\s*```$/, "")
              .trim();
          }
          const parsed = JSON.parse(jsonString);
          if (Array.isArray(parsed)) {
            parsedResults = parsed.filter(
              (item) =>
                item &&
                typeof item.id === "string" &&
                typeof item.answer === "string"
            );
          }
        } catch (parseErr) {
          console.warn("[QuestionBatch] JSON parse warning:", parseErr);
        }

        const answersMap = new Map<string, string>();
        for (const item of parsedResults) {
          // Ignore IDs that weren't in the sent batch
          if (candidateIds.includes(item.id)) {
            answersMap.set(item.id, item.answer);
          }
        }

        let answeredCount = 0;
        let failedCount = 0;

        for (const annot of claimedAnnotations) {
          const answer = answersMap.get(annot.id);
          if (answer) {
            // Write ASSISTANT message
            const assistantMsg = await db.annotationMessage.create({
              data: {
                annotationId: annot.id,
                role: "ASSISTANT",
                content: answer,
                generationId: `${generationId}:${annot.id}`,
              },
            });

            // Mark questionState = ANSWERED
            await db.annotation.update({
              where: { id: annot.id },
              data: {
                questionState: "ANSWERED",
              },
            });

            controller.enqueue(
              encoder.encode(
                formatSSEEvent("question_answered", {
                  id: annot.id,
                  answer,
                  messageId: assistantMsg.id,
                })
              )
            );
            answeredCount++;
          } else {
            // Missing in output -> FAILED (retryable, not charged separately)
            await db.annotation.update({
              where: { id: annot.id },
              data: {
                questionState: "FAILED",
              },
            });

            controller.enqueue(
              encoder.encode(
                formatSSEEvent("question_failed", {
                  id: annot.id,
                  reason: "Missing answer from model output",
                })
              )
            );
            failedCount++;
          }
        }

        // 8. Settle credits
        const finalInputTokens = reportedInputTokens ?? estimatedInputTokens;
        const finalOutputTokens =
          reportedOutputTokens ?? estimateTokens(accumulatedText);
        const chargedCredits = creditsFor(modelKey, {
          inputTokens: finalInputTokens,
          outputTokens: finalOutputTokens,
        });

        await settle(billedAccountId, generationId, chargedCredits, settleKey);

        await db.generation.update({
          where: { id: generationId },
          data: {
            status: "COMPLETED",
            finishedAt: new Date(),
            chargedCredits,
          },
        });

        controller.enqueue(
          encoder.encode(formatSSEEvent("status", { stage: "complete" }))
        );
        controller.enqueue(
          encoder.encode(
            formatSSEEvent("done", {
              generationId,
              answeredCount,
              failedCount,
            })
          )
        );
        controller.close();
      } catch (err: unknown) {
        console.error("[QuestionBatch Stream Error]:", err);
        try {
          await release(billedAccountId, generationId, releaseKey);
          await db.generation.update({
            where: { id: generationId },
            data: {
              status: "FAILED",
              finishedAt: new Date(),
              errorCode: "PROVIDER_ERROR",
            },
          });

          // Reset still-ANSWERING questions to FAILED so user can retry
          await db.annotation.updateMany({
            where: {
              id: { in: candidateIds },
              questionState: "ANSWERING",
            },
            data: {
              questionState: "FAILED",
            },
          });
        } catch (cleanupErr) {
          console.error("[QuestionBatch Cleanup Error]:", cleanupErr);
        }

        controller.enqueue(
          encoder.encode(
            formatSSEEvent("error", {
              code: "unknown",
              message:
                "An unexpected error occurred while communicating with the AI service.",
            })
          )
        );
        controller.close();
      }
    },
  });

  return {
    stream,
    generationId,
    count: claimedAnnotations.length,
  };
}
