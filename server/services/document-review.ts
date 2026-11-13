import "server-only";
import crypto from "node:crypto";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import type { Actor } from "@/server/auth/session";
import { requireWorkspace } from "@/server/authz/access";
import { resolveBilledAccount, reserveForWorkspaceGeneration } from "./billing-owner";
import { getProvider, streamAi } from "@/server/ai";
import { getModel, creditsFor } from "@/server/ai/registry";
import { estimateTokens } from "@/server/ai/context-builder";
import { loadActiveNotes } from "@/server/ai/notes";
import { settle, release } from "@/server/services/credits";
import { applySuggestion } from "@/lib/documents/apply-suggestion";
import { sim, allIndexesOf, ANCHOR_CONTEXT_LENGTH, ANCHOR_SIMILARITY_THRESHOLD } from "@/lib/annotations/anchor";
import {
  DOCUMENT_REVIEW_PROMPT_VERSION,
  PRESET_INSTRUCTIONS,
  type ReviewPreset,
  buildDocumentReviewSystemPrompt,
  documentReviewResponseSchema,
} from "@/server/ai/prompts/document-review";
import type { GenerateRequest, Msg } from "@/server/ai/types";

export interface DocumentReviewInput {
  instruction?: string;
  preset?: ReviewPreset;
  visibility?: "PRIVATE" | "WORKSPACE";
  idempotencyKey?: string;
}

export interface ReviewFindingRaw {
  exact: string;
  prefix: string;
  suffix: string;
  comment: string;
  category: "spelling" | "grammar" | "clarity" | "consistency" | "factual" | "structure" | "other";
  severity: "low" | "medium" | "high";
  replacement?: string;
}

export interface ReviewChunk {
  index: number;
  total: number;
  charOffset: number;
  markdown: string;
}

/**
 * Splits document Markdown into chunks by headings, keeping each chunk <= 8k tokens (~32k chars).
 */
export function chunkDocumentByHeadings(markdown: string, maxTokens = 8_000): ReviewChunk[] {
  const maxChars = maxTokens * 4;
  if (!markdown || markdown.trim().length === 0) {
    return [];
  }

  // Find heading boundaries (#, ##, ###, etc.)
  const regex = /(?:^|\n)(#{1,6}\s+[^\n]+)/g;
  const splitPoints: number[] = [0];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    const idx = match.index === 0 ? 0 : match.index + 1;
    if (idx > 0 && !splitPoints.includes(idx)) {
      splitPoints.push(idx);
    }
  }
  if (!splitPoints.includes(markdown.length)) {
    splitPoints.push(markdown.length);
  }

  // Combine small sections into chunks up to maxChars
  const sections: { start: number; end: number }[] = [];
  for (let i = 0; i < splitPoints.length - 1; i++) {
    sections.push({ start: splitPoints[i]!, end: splitPoints[i + 1]! });
  }

  const chunks: ReviewChunk[] = [];
  let currentStart = 0;
  let currentEnd = 0;

  for (const sec of sections) {
    if (currentEnd === 0) {
      currentStart = sec.start;
      currentEnd = sec.end;
      continue;
    }

    if (sec.end - currentStart <= maxChars) {
      currentEnd = sec.end;
    } else {
      chunks.push({
        index: chunks.length,
        total: 0,
        charOffset: currentStart,
        markdown: markdown.slice(currentStart, currentEnd),
      });
      currentStart = sec.start;
      currentEnd = sec.end;
    }
  }

  if (currentEnd > currentStart) {
    chunks.push({
      index: chunks.length,
      total: 0,
      charOffset: currentStart,
      markdown: markdown.slice(currentStart, currentEnd),
    });
  }

  // Handle oversized chunks without headings by splitting by paragraphs
  const finalChunks: ReviewChunk[] = [];
  for (const c of chunks) {
    if (c.markdown.length <= maxChars) {
      finalChunks.push(c);
    } else {
      let offset = c.charOffset;
      const paragraphs = c.markdown.split(/\n\s*\n/);
      let buffer = "";
      for (const p of paragraphs) {
        if (buffer.length + p.length + 2 <= maxChars) {
          buffer = buffer ? `${buffer}\n\n${p}` : p;
        } else {
          if (buffer) {
            finalChunks.push({
              index: finalChunks.length,
              total: 0,
              charOffset: offset,
              markdown: buffer,
            });
            offset += buffer.length + 2;
          }
          buffer = p.slice(0, maxChars);
        }
      }
      if (buffer) {
        finalChunks.push({
          index: finalChunks.length,
          total: 0,
          charOffset: offset,
          markdown: buffer,
        });
      }
    }
  }

  const total = finalChunks.length;
  return finalChunks.map((c, idx) => ({
    ...c,
    index: idx + 1,
    total,
  }));
}

/**
 * Validates finding against chunk and full markdown source.
 */
export function validateFinding(
  chunk: ReviewChunk,
  finding: ReviewFindingRaw,
  fullSource: string
): {
  valid: boolean;
  anchor: {
    exact: string;
    prefix: string;
    suffix: string;
    start: number;
    end: number;
  };
  suggestion: {
    exact: string;
    prefix: string;
    suffix: string;
    replacement: string;
  } | null;
} | null {
  const exact = (finding.exact || "").trim();
  if (!exact || exact.length < 3 || exact.length > 200) {
    return null;
  }

  const chunkText = chunk.markdown;
  const hits = allIndexesOf(chunkText, exact);
  if (hits.length === 0) {
    return null;
  }

  let chosenLocalIndex = hits[0]!;
  if (hits.length > 1) {
    const scored = hits.map((idx) => {
      const candPrefix = chunkText.slice(Math.max(0, idx - ANCHOR_CONTEXT_LENGTH), idx);
      const candSuffix = chunkText.slice(
        idx + exact.length,
        Math.min(chunkText.length, idx + exact.length + ANCHOR_CONTEXT_LENGTH)
      );
      const score =
        sim(candPrefix, finding.prefix || "") + sim(candSuffix, finding.suffix || "");
      return { idx, score };
    });
    scored.sort((a, b) => b.score - a.score);
    if (scored[0]!.score < ANCHOR_SIMILARITY_THRESHOLD && hits.length > 1) {
      return null;
    }
    chosenLocalIndex = scored[0]!.idx;
  }

  const globalStart = chunk.charOffset + chosenLocalIndex;
  const globalEnd = globalStart + exact.length;

  const prefix = fullSource.slice(Math.max(0, globalStart - ANCHOR_CONTEXT_LENGTH), globalStart);
  const suffix = fullSource.slice(
    globalEnd,
    Math.min(fullSource.length, globalEnd + ANCHOR_CONTEXT_LENGTH)
  );

  let suggestion: {
    exact: string;
    prefix: string;
    suffix: string;
    replacement: string;
  } | null = null;

  if (finding.replacement && typeof finding.replacement === "string" && finding.replacement.trim() !== exact) {
    const candidateSuggestion = {
      exact,
      prefix,
      suffix,
      replacement: finding.replacement.trim(),
    };
    const applyRes = applySuggestion(fullSource, candidateSuggestion);
    if (applyRes.ok) {
      suggestion = candidateSuggestion;
    }
  }

  return {
    valid: true,
    anchor: {
      exact,
      prefix,
      suffix,
      start: globalStart,
      end: globalEnd,
    },
    suggestion,
  };
}

export type ReviewStreamSender = (event: string, data: unknown) => void;

export async function executeDocumentReview(args: {
  actor: Actor;
  versionId: string;
  input: DocumentReviewInput;
  send: ReviewStreamSender;
  close: () => void;
  options?: { providerInstance?: any };
}) {
  const { actor, versionId, input, send, close, options } = args;

  const version = await db.responseVersion.findUnique({
    where: { id: versionId },
    include: {
      edits: {
        orderBy: { revision: "desc" },
        take: 1,
      },
      response: {
        select: { id: true, workspaceId: true, deletedAt: true, kind: true },
      },
    },
  });

  if (!version || version.response.deletedAt) {
    throw Errors.notFound("ResponseVersion");
  }

  const workspaceId = version.response.workspaceId;
  const wsAccess = await requireWorkspace(actor, workspaceId, "workspace.ask");
  const billing = await resolveBilledAccount(wsAccess.ws);
  const billedAccountId = billing.billedAccountId;

  const activeContent = version.edits[0]?.content ?? version.content;
  const chunks = chunkDocumentByHeadings(activeContent);

  if (chunks.length === 0) {
    send("summary", { total: 0, byCategory: {} });
    send("done", {});
    close();
    return;
  }

  const effectivePreset: ReviewPreset = input.preset || "errors";
  const effectiveInstruction =
    input.instruction?.trim() || PRESET_INSTRUCTIONS[effectivePreset] || PRESET_INSTRUCTIONS.errors;
  const visibility = input.visibility === "WORKSPACE" ? "WORKSPACE" : "PRIVATE";

  const modelKey = "text-economy";
  const model = getModel(modelKey);
  const provider = options?.providerInstance ?? getProvider(modelKey);

  const totalInputTokens = chunks.reduce(
    (sum, c) => sum + estimateTokens(c.markdown),
    0
  );
  const estimatedOutputTokens = 1500 * chunks.length;
  const reserveAmount = creditsFor(modelKey, {
    inputTokens: totalInputTokens,
    outputTokens: estimatedOutputTokens,
  });

  const idempotencyKey = input.idempotencyKey || crypto.randomUUID();
  const generationId = crypto.randomUUID();
  const reservationKey = `res_review_${idempotencyKey}`;
  const settleKey = `stl_review_${generationId}`;
  const releaseKey = `rel_review_${generationId}`;

  await reserveForWorkspaceGeneration({
    workspace: wsAccess.ws,
    actorId: actor.userId,
    amount: reserveAmount,
    reservationKey,
    generationId,
    estimated: true,
  });

  await db.generation.create({
    data: {
      id: generationId,
      workspaceId,
      actorId: actor.userId,
      billedAccountId,
      kind: "DOCUMENT_REVIEW",
      status: "RUNNING",
      modelKey,
      providerModelId: model.providerModelId,
      promptVersion: DOCUMENT_REVIEW_PROMPT_VERSION,
      idempotencyKey,
      reservedCredits: reserveAmount,
      startedAt: new Date(),
    },
  });

  const notesText = await loadActiveNotes(workspaceId);
  const systemPrompt = buildDocumentReviewSystemPrompt({
    instruction: effectiveInstruction,
    notesText,
  });

  let totalFindingsCreated = 0;
  const byCategory: Record<string, number> = {};
  const seenSpans = new Set<string>();
  let accumulatedOutputTokens = 0;

  try {
    for (const chunk of chunks) {
      send("progress", {
        stage: "reviewing",
        section: chunk.index,
        totalSections: chunk.total,
        message: `Reviewing section ${chunk.index} of ${chunk.total}…`,
      });

      const messages: Msg[] = [
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: `Review the following document chunk (${chunk.index} of ${chunk.total}):\n\n${chunk.markdown}`,
            },
          ],
        },
      ];

      const request: GenerateRequest = {
        modelKey,
        system: systemPrompt,
        messages,
        responseSchema: documentReviewResponseSchema,
        thinking: { summaries: false },
        maxOutputTokens: 2048,
        temperature: 0.1,
      };

      const stream = streamAi(request, {
        providerInstance: options?.providerInstance,
      });
      let chunkRawText = "";

      for await (const event of stream) {
        if (event.type === "text_delta") {
          chunkRawText += event.text;
        } else if (event.type === "usage") {
          accumulatedOutputTokens += event.outputTokens || 0;
        }
      }

      if (!chunkRawText.trim()) continue;

      let findings: ReviewFindingRaw[] = [];
      try {
        let jsonStr = chunkRawText.trim();
        if (jsonStr.startsWith("```")) {
          jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        }
        const parsed = JSON.parse(jsonStr);
        findings = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.findings)
          ? parsed.findings
          : [];
      } catch (parseErr) {
        console.warn("[DocumentReview] Failed to parse model output as JSON:", parseErr, chunkRawText);
        continue;
      }

      for (const raw of findings.slice(0, 30)) {
        if (totalFindingsCreated >= 100) break;

        const validated = validateFinding(chunk, raw, activeContent);
        if (!validated) continue;

        const spanKey = `${validated.anchor.exact}::${raw.category}`;
        if (seenSpans.has(spanKey)) continue;
        seenSpans.add(spanKey);

        const annotationId = crypto.randomUUID();
        const messageId = crypto.randomUUID();
        const now = new Date();

        const suggestionData = {
          category: raw.category,
          severity: raw.severity,
          ...(validated.suggestion ?? {}),
        };

        const createdAnnotation = await db.annotation.create({
          data: {
            id: annotationId,
            workspaceId,
            responseId: version.response.id,
            versionId: version.id,
            targetType: "RESPONSE_VERSION",
            depth: 0,
            authorType: "AI",
            createdById: actor.userId,
            kind: "COMMENT",
            questionState: "NONE",
            visibility,
            anchorExact: validated.anchor.exact,
            anchorPrefix: validated.anchor.prefix,
            anchorSuffix: validated.anchor.suffix,
            anchorStart: validated.anchor.start,
            anchorEnd: validated.anchor.end,
            suggestion: suggestionData,
            suggestionState: validated.suggestion ? "PENDING" : null,
            createdAt: now,
            updatedAt: now,
            messages: {
              create: [
                {
                  id: messageId,
                  role: "ASSISTANT",
                  content: raw.comment || "Review finding",
                  status: "COMPLETE",
                  createdAt: now,
                },
              ],
            },
          },
          include: {
            messages: true,
          },
        });

        totalFindingsCreated++;
        byCategory[raw.category] = (byCategory[raw.category] ?? 0) + 1;

        send("finding", {
          annotationId: createdAnnotation.id,
          messageId,
          anchor: validated.anchor,
          category: raw.category,
          severity: raw.severity,
          comment: raw.comment,
          suggestion: suggestionData,
          suggestionState: validated.suggestion ? "PENDING" : null,
          authorType: "AI",
          visibility,
        });
      }

      if (totalFindingsCreated >= 100) break;
    }

    const chargedCredits = creditsFor(modelKey, {
      inputTokens: totalInputTokens,
      outputTokens: accumulatedOutputTokens || estimatedOutputTokens,
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

    send("summary", {
      total: totalFindingsCreated,
      byCategory,
    });
    send("done", { generationId, total: totalFindingsCreated });
    close();
  } catch (err: unknown) {
    console.error("[DocumentReview] Review failed:", err);
    await release(billedAccountId, generationId, releaseKey);
    await db.generation.update({
      where: { id: generationId },
      data: {
        status: "FAILED",
        errorCode: "review_failed",
        finishedAt: new Date(),
      },
    });
    send("error", {
      message: err instanceof Error ? err.message : "Review generation failed",
    });
    close();
  }
}
