import "server-only";
import crypto from "node:crypto";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { requireWorkspace } from "@/server/authz/access";
import { resolveBilledAccount, reserveForWorkspaceGeneration } from "./billing-owner";
import { notify } from "./notify";
import type { Actor } from "@/server/auth/session";
import type { RunQuestionBatchInput } from "@/lib/schemas/annotation";
import {
  settle,
  release,
} from "@/server/services/credits";
import {
  assertModelAccess,
  getModel,
  creditsFor,
  ModelKey,
} from "@/server/ai/registry";
import { getEntitlements } from "@/server/billing/entitlements";
import { streamAi, type AiProvider } from "@/server/ai";
import { getCustomProvider } from "@/server/services/generation";
import { estimateTokens } from "@/server/ai/context-builder";
import { loadActiveNotes } from "@/server/ai/notes";
import { windowTargetText } from "@/server/ai/ask-context";
import { buildSystemPrompt } from "@/server/ai/prompts/system";
import {
  buildQuestionBatchPrompt,
  questionBatchResponseSchema,
  QUESTION_BATCH_PROMPT_VERSION,
  type TargetQuestionsGroup,
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
 * 1. Re-checks permissions (workspace.ask) at run time.
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
  // 1. Enforce workspace.ask permission
  const wsAccess = await requireWorkspace(actor, workspaceId, "workspace.ask");

  // 2. Fetch candidate questions (caller's questions in QUEUED state, max 10)
  const candidateAnnotations = await db.annotation.findMany({
    where: {
      workspaceId,
      createdById: actor.userId,
      kind: "ASK",
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
      targetMessage: {
        include: {
          annotation: {
            select: {
              deletedAt: true,
              messages: {
                where: { role: "USER" },
                orderBy: { createdAt: "asc" },
                select: { content: true, createdAt: true },
              },
            },
          },
        },
      },
    },
  });

  // Drop any whose target (version or parent message) is soft-deleted
  const validCandidates = candidateAnnotations.filter((a) => {
    if (a.deletedAt !== null) return false;
    if (a.targetType === "RESPONSE_VERSION" || a.versionId) {
      return a.version && a.version.response && a.version.response.deletedAt === null;
    }
    if (a.targetType === "ANNOTATION_MESSAGE" || a.targetMessageId) {
      return (
        a.targetMessage &&
        a.targetMessage.annotation &&
        a.targetMessage.annotation.deletedAt === null
      );
    }
    return true;
  });

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
      targetMessage: {
        include: {
          annotation: {
            select: {
              deletedAt: true,
              messages: {
                where: { role: "USER" },
                orderBy: { createdAt: "asc" },
                select: { content: true, createdAt: true },
              },
            },
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
  const { billedAccountId } = await resolveBilledAccount(wsAccess.ws);

  // 5. Group questions by target (version, parent message, or document revision)
  const targetMap = new Map<string, TargetQuestionsGroup>();
  for (const annot of claimedAnnotations) {
    let targetKey = "";
    let targetType = annot.targetType || "RESPONSE_VERSION";
    let rawTargetText = "";
    let sourceDesc = "";

    if (targetType === "RESPONSE_VERSION" || annot.versionId) {
      const v = annot.version;
      if (!v) continue;
      targetKey = `version:${v.id}`;
      rawTargetText = v.content;
      sourceDesc = v.response?.prompt
        ? `Original Request: "${v.response.prompt}"`
        : "Original Request";
    } else if (targetType === "ANNOTATION_MESSAGE" || annot.targetMessageId) {
      const tm = annot.targetMessage;
      if (!tm) continue;
      targetKey = `message:${tm.id}`;
      rawTargetText = tm.content;
      const priorUserMsgs = (tm.annotation.messages || []).filter(
        (m: { createdAt: Date }) => m.createdAt <= tm.createdAt
      );
      const parentQ = priorUserMsgs.length
        ? priorUserMsgs[priorUserMsgs.length - 1].content
        : "";
      sourceDesc = parentQ ? `Parent Answer to question: "${parentQ}"` : "Parent Answer";
    } else {
      targetKey = `target:${annot.id}`;
      rawTargetText = annot.anchorExact;
      sourceDesc = "Document content";
    }

    if (!targetMap.has(targetKey)) {
      const containingText = windowTargetText(rawTargetText, annot.anchorExact);
      targetMap.set(targetKey, {
        targetKey,
        targetType,
        containingText,
        sourceDescription: sourceDesc,
        questions: [],
      });
    }

    const userMsg = annot.messages.find((m) => m.role === "USER");
    const questionText = userMsg ? userMsg.content : "";
    targetMap.get(targetKey)!.questions.push({
      id: annot.id,
      passage: annot.anchorExact,
      question: questionText.slice(0, 500),
    });
  }
  const groups = Array.from(targetMap.values());

  // 6. Credit estimation & reservation
  const ownerEntitlements = await getEntitlements(wsAccess.ws.ownerId);
  const modelKey = (input.modelKey || "text-economy") as ModelKey;
  const model = getModel(modelKey);
  try {
    assertModelAccess(modelKey, ownerEntitlements.plan);
  } catch (err: unknown) {
    throw Errors.forbidden(
      err instanceof Error ? err.message : `Model '${modelKey}' is not available on your current plan.`
    );
  }
  const generationId = crypto.randomUUID();

  let estimatedInputTokens = 500;
  for (const group of groups) {
    estimatedInputTokens +=
      estimateTokens(group.containingText) +
      estimateTokens(group.sourceDescription || "");
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

  try {
    await reserveForWorkspaceGeneration({
      workspace: wsAccess.ws,
      actorId: actor.userId,
      amount: reserveAmount,
      reservationKey,
      generationId,
      estimated: true,
    });
  } catch (err) {
    await db.annotation.updateMany({
      where: { id: { in: claimedAnnotations.map((a) => a.id) }, questionState: "ANSWERING" },
      data: { questionState: "QUEUED" },
    });
    throw err;
  }

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

        const baseSystem = buildSystemPrompt("en");
        const notesPrompt = await loadActiveNotes(workspaceId);
        const system = [baseSystem, notesPrompt].filter(Boolean).join("\n\n");

        const aiStream = streamAi(
          {
            modelKey,
            system,
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
            userPlan: ownerEntitlements.plan,
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
        // Per question author, so each person hears about their own questions
        const answeredByAuthor = new Map<string, number>();

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
                status: "COMPLETE",
                modelKey,
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
            answeredByAuthor.set(
              annot.createdById,
              (answeredByAuthor.get(annot.createdById) ?? 0) + 1
            );
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

        // Best-effort: questions may have been queued by other members, and
        // the runner may have left the page before the stream finished.
        for (const [authorId, count] of answeredByAuthor) {
          await notify(
            authorId,
            "QUESTIONS_ANSWERED",
            {
              workspaceId,
              answeredCount: count,
              href: `/workspaces/${workspaceId}`,
            },
            { dedupeKey: `questions_answered:${generationId}` }
          ).catch((notifyErr) => {
            console.error("[QuestionBatch] Failed to notify:", notifyErr);
          });
        }

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
