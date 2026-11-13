import "server-only";
import crypto from "node:crypto";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import type { Actor } from "@/server/auth/session";
import { requireWorkspace } from "@/server/authz/access";
import {
  resolveBilledAccount,
  reserveForWorkspaceGeneration,
} from "./billing-owner";
import { streamAi, type AiProvider } from "@/server/ai";
import {
  assertModelAccess,
  getModel,
  creditsFor,
  type ModelKey,
} from "@/server/ai/registry";
import { getEntitlements } from "@/server/billing/entitlements";
import { getCustomProvider } from "@/server/services/generation";
import { estimateTokens } from "@/server/ai/context-builder";
import { loadActiveNotes } from "@/server/ai/notes";
import { settle, release } from "@/server/services/credits";
import { resolveEffectiveAiLanguage } from "@/lib/locale";
import {
  applySuggestion,
  type SuggestionTarget,
} from "@/lib/documents/apply-suggestion";
import {
  buildMarkdownTextMap,
  type MarkdownTextMap,
} from "@/lib/documents/markdown-text";
import {
  sim,
  allIndexesOf,
  ANCHOR_CONTEXT_LENGTH,
  ANCHOR_SIMILARITY_THRESHOLD,
} from "@/lib/annotations/anchor";
import type { DocumentReviewInput } from "@/lib/schemas/document-review";
import {
  DOCUMENT_REVIEW_PROMPT_VERSION,
  MAX_FINDINGS_PER_CHUNK,
  PRESET_INSTRUCTIONS,
  REVIEW_CATEGORIES,
  REVIEW_SEVERITIES,
  type ReviewCategory,
  type ReviewPreset,
  type ReviewSeverity,
  buildDocumentReviewSystemPrompt,
  documentReviewResponseSchema,
} from "@/server/ai/prompts/document-review";

/** Findings kept for one review run. */
export const MAX_FINDINGS_PER_REVIEW = 100;
/** Longest replacement kept as a quick fix. */
const MAX_REPLACEMENT_CHARS = 1000;
const MAX_COMMENT_CHARS = 1000;
const REVIEW_MODEL: ModelKey = "text-economy";
const OUTPUT_TOKENS_PER_CHUNK = 1500;
/** Parts of a document sent to the model at the same time. */
const REVIEW_CONCURRENCY = 3;

export interface ReviewFindingRaw {
  exact: string;
  prefix?: string;
  suffix?: string;
  comment?: string;
  category?: string;
  severity?: string;
  replacement?: string;
}

export interface ReviewChunk {
  /** 1-based position. */
  index: number;
  total: number;
  /** Offset of the chunk in the document. */
  charOffset: number;
  markdown: string;
}

/**
 * Splits a document into chunks of at most `maxTokens` (≈ 4 chars per token).
 * Chunks start at headings where possible; a section that is too long is cut
 * between paragraphs, and a paragraph that is too long is cut where it must.
 * Every chunk is a slice of the document, so `charOffset` is exact.
 */
export function chunkDocumentByHeadings(
  markdown: string,
  maxTokens = 8_000
): ReviewChunk[] {
  if (!markdown || markdown.trim().length === 0) return [];
  const maxChars = Math.max(1, maxTokens * 4);

  // Places a chunk may start at, best first: headings, then paragraph breaks.
  const headingStarts: number[] = [];
  const headingRegex = /^#{1,6}\s+\S/gm;
  for (
    let m = headingRegex.exec(markdown);
    m;
    m = headingRegex.exec(markdown)
  ) {
    if (m.index > 0) headingStarts.push(m.index);
  }
  const paragraphStarts: number[] = [];
  const paragraphRegex = /\n[ \t]*\n+/g;
  for (
    let m = paragraphRegex.exec(markdown);
    m;
    m = paragraphRegex.exec(markdown)
  ) {
    const at = m.index + m[0].length;
    if (at < markdown.length) paragraphStarts.push(at);
  }

  /** Last candidate in `(from, limit]`, or -1. */
  const lastWithin = (candidates: number[], from: number, limit: number) => {
    let found = -1;
    for (const c of candidates) {
      if (c <= from) continue;
      if (c > limit) break;
      found = c;
    }
    return found;
  };

  const bounds: Array<{ start: number; end: number }> = [];
  let start = 0;
  while (start < markdown.length) {
    const limit = start + maxChars;
    if (limit >= markdown.length) {
      bounds.push({ start, end: markdown.length });
      break;
    }
    let end = lastWithin(headingStarts, start, limit);
    if (end === -1) end = lastWithin(paragraphStarts, start, limit);
    if (end === -1) end = limit;
    bounds.push({ start, end });
    start = end;
  }

  const chunks = bounds.filter(
    (b) => markdown.slice(b.start, b.end).trim().length > 0
  );
  return chunks.map((b, i) => ({
    index: i + 1,
    total: chunks.length,
    charOffset: b.start,
    markdown: markdown.slice(b.start, b.end),
  }));
}

export interface ValidatedFinding {
  /** Where the highlight goes: the passage as shown on the page. */
  anchor: {
    exact: string;
    prefix: string;
    suffix: string;
    start: number;
    end: number;
  };
  /** Offset of the passage in the Markdown source. */
  sourceStart: number;
  /** The quick fix, when the replacement applies cleanly to the source. */
  suggestion: SuggestionTarget | null;
  category: ReviewCategory;
  severity: ReviewSeverity;
  comment: string;
}

/**
 * Checks one finding of the model against the document. Nothing the model
 * says is trusted: the passage must exist in the chunk, be found without
 * doubt, and map to text the reader sees. Returns null to drop the finding.
 */
export function validateFinding(
  chunk: ReviewChunk,
  finding: ReviewFindingRaw,
  fullSource: string,
  textMap: MarkdownTextMap = buildMarkdownTextMap(fullSource)
): ValidatedFinding | null {
  if (!finding || typeof finding.exact !== "string") return null;
  const exact = finding.exact.trim();
  if (exact.length < 3 || exact.length > 200) return null;

  const comment =
    typeof finding.comment === "string"
      ? finding.comment.trim().slice(0, MAX_COMMENT_CHARS)
      : "";
  if (!comment) return null;

  const hits = allIndexesOf(chunk.markdown, exact);
  if (hits.length === 0) return null;

  let localIndex = hits[0]!;
  if (hits.length > 1) {
    const wantedPrefix =
      typeof finding.prefix === "string" ? finding.prefix : "";
    const wantedSuffix =
      typeof finding.suffix === "string" ? finding.suffix : "";
    // No context to tell the places apart: don't guess.
    if (!wantedPrefix.trim() && !wantedSuffix.trim()) return null;
    const scored = hits
      .map((idx) => {
        const before = chunk.markdown.slice(
          Math.max(0, idx - ANCHOR_CONTEXT_LENGTH),
          idx
        );
        const after = chunk.markdown.slice(
          idx + exact.length,
          idx + exact.length + ANCHOR_CONTEXT_LENGTH
        );
        return {
          idx,
          score: sim(before, wantedPrefix) + sim(after, wantedSuffix),
        };
      })
      .sort((a, b) => b.score - a.score);
    // Several places fit equally well, or none fits: don't guess.
    if (scored[0]!.score < ANCHOR_SIMILARITY_THRESHOLD) return null;
    if (scored[0]!.score === scored[1]!.score) return null;
    localIndex = scored[0]!.idx;
  }

  const sourceStart = chunk.charOffset + localIndex;
  const sourceEnd = sourceStart + exact.length;

  const page = textMap.locate(sourceStart, sourceEnd, ANCHOR_CONTEXT_LENGTH);
  if (!page || page.exact.trim().length < 2) return null;

  const category = (REVIEW_CATEGORIES as readonly string[]).includes(
    finding.category ?? ""
  )
    ? (finding.category as ReviewCategory)
    : "other";
  const severity = (REVIEW_SEVERITIES as readonly string[]).includes(
    finding.severity ?? ""
  )
    ? (finding.severity as ReviewSeverity)
    : "low";

  let suggestion: SuggestionTarget | null = null;
  const replacement =
    typeof finding.replacement === "string" ? finding.replacement.trim() : "";
  if (
    replacement &&
    replacement !== exact &&
    replacement.length <= MAX_REPLACEMENT_CHARS
  ) {
    const candidate: SuggestionTarget = {
      exact,
      prefix: fullSource.slice(
        Math.max(0, sourceStart - ANCHOR_CONTEXT_LENGTH),
        sourceStart
      ),
      suffix: fullSource.slice(sourceEnd, sourceEnd + ANCHOR_CONTEXT_LENGTH),
      replacement,
    };
    const applied = applySuggestion(fullSource, candidate);
    const expected =
      fullSource.slice(0, sourceStart) +
      replacement +
      fullSource.slice(sourceEnd);
    // "Quick action only when possible": the fix must land on this passage.
    if (applied.ok && applied.next === expected) suggestion = candidate;
  }

  return { anchor: page, sourceStart, suggestion, category, severity, comment };
}

/** Reads the model's JSON answer. Returns null when it can't be read. */
function parseFindings(raw: string): ReviewFindingRaw[] | null {
  let text = raw.trim();
  if (!text) return null;
  if (text.startsWith("```")) {
    text = text
      .replace(/^```[a-z]*\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed as ReviewFindingRaw[];
    const nested = (parsed as { findings?: unknown } | null)?.findings;
    return Array.isArray(nested) ? (nested as ReviewFindingRaw[]) : null;
  } catch {
    return null;
  }
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** What a review of this text would reserve. Shown before the review starts. */
export async function estimateDocumentReview(
  actor: Actor,
  versionId: string
): Promise<{ estimatedCredits: number; sections: number }> {
  const version = await db.responseVersion.findUnique({
    where: { id: versionId },
    include: {
      edits: { orderBy: { revision: "desc" }, take: 1, select: { content: true } },
      response: { select: { workspaceId: true, deletedAt: true } },
    },
  });
  if (!version || version.response.deletedAt) {
    throw Errors.notFound("ResponseVersion");
  }
  await requireWorkspace(actor, version.response.workspaceId, "workspace.read");

  const chunks = chunkDocumentByHeadings(version.edits[0]?.content ?? version.content);
  return {
    estimatedCredits: chunks.length === 0 ? 0 : reviewReserveAmount(chunks),
    sections: chunks.length,
  };
}

function reviewReserveAmount(chunks: ReviewChunk[]): number {
  return creditsFor(REVIEW_MODEL, {
    inputTokens: chunks.reduce((sum, c) => sum + estimateTokens(c.markdown) + 400, 0),
    outputTokens: OUTPUT_TOKENS_PER_CHUNK * chunks.length,
  });
}

/**
 * "Ask Klecx to review" (F3.3): Klecx reads the text and leaves comments
 * anchored to exact passages, some with a one-click fix.
 *
 * Everything that can refuse the request (not found, no permission, no
 * credits, duplicate request) happens before the stream is returned, so the
 * caller gets a normal HTTP error. Findings are saved as they are found; the
 * review goes on when the reader leaves the page.
 */
export async function startDocumentReview(
  actor: Actor,
  versionId: string,
  input: DocumentReviewInput,
  options: { providerInstance?: AiProvider } = {}
): Promise<{ stream: ReadableStream<Uint8Array>; generationId: string }> {
  const version = await db.responseVersion.findUnique({
    where: { id: versionId },
    include: {
      edits: {
        orderBy: { revision: "desc" },
        take: 1,
        select: { revision: true, content: true },
      },
      response: {
        select: { id: true, workspaceId: true, deletedAt: true, kind: true },
      },
    },
  });
  if (!version || version.response.deletedAt) {
    throw Errors.notFound("ResponseVersion");
  }
  if (version.response.kind === "IMAGE") {
    throw Errors.badRequest("Only text can be reviewed", "not_reviewable");
  }

  const workspaceId = version.response.workspaceId;
  const wsAccess = await requireWorkspace(actor, workspaceId, "workspace.ask");

  // A repeated request (same key) must not start a second review.
  const idempotencyKey = input.idempotencyKey;
  const sameRequest = await db.generation.findUnique({
    where: {
      actorId_idempotencyKey: { actorId: actor.userId, idempotencyKey },
    },
    select: { id: true },
  });
  if (sameRequest) {
    throw Errors.conflict("This request was already sent", "duplicate_request");
  }

  // The text the reader sees: the latest saved edit, else the original.
  const latestEdit = version.edits[0] ?? null;
  const source = latestEdit?.content ?? version.content;
  const chunks = chunkDocumentByHeadings(source);
  if (chunks.length === 0) {
    throw Errors.badRequest("There is no text to review", "empty_document");
  }

  const preset: ReviewPreset = input.preset ?? "errors";
  const custom = input.instruction?.trim();
  const instruction = custom
    ? preset === "custom"
      ? custom
      : `${PRESET_INSTRUCTIONS[preset]}\nAlso: ${custom}`
    : PRESET_INSTRUCTIONS[preset];
  const visibility = input.visibility === "WORKSPACE" ? "WORKSPACE" : "PRIVATE";

  const { billedAccountId } = await resolveBilledAccount(wsAccess.ws);
  const ownerEntitlements = await getEntitlements(wsAccess.ws.ownerId);
  const modelKey = REVIEW_MODEL;
  const model = getModel(modelKey);
  try {
    assertModelAccess(modelKey, ownerEntitlements.plan);
  } catch {
    throw Errors.forbidden(
      "This model is not available on the workspace's plan."
    );
  }

  const reserveAmount = reviewReserveAmount(chunks);

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

  try {
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
  } catch (err) {
    await release(billedAccountId, generationId, releaseKey).catch(() => {});
    throw err;
  }

  const providerInstance =
    options.providerInstance || getCustomProvider() || undefined;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The reader may leave: the review still runs to the end.
      let open = true;
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(sse(event, data)));
        } catch {
          open = false;
        }
      };

      let created = 0;
      let fixes = 0;
      const byCategory: Record<string, number> = {};
      let inputTokens = 0;
      let outputTokens = 0;
      let chunksDone = 0;
      let chunksFailed = 0;

      try {
        send("started", { generationId, sections: chunks.length });

        const [userPref, notesText, openFindings] = await Promise.all([
          db.userPreference.findUnique({
            where: { userId: actor.userId },
            select: { aiLanguage: true, uiLocale: true },
          }),
          loadActiveNotes(workspaceId),
          // Findings of an earlier review that are still open: not reported twice.
          db.annotation.findMany({
            where: {
              versionId,
              authorType: "AI",
              deletedAt: null,
              resolvedAt: null,
            },
            select: { anchorExact: true, anchorPrefix: true },
          }),
        ]);
        const system = buildDocumentReviewSystemPrompt({
          instruction,
          language: resolveEffectiveAiLanguage({
            savedAiLanguage: userPref?.aiLanguage,
            uiLocale: userPref?.uiLocale,
          }),
          notesText,
        });

        const textMap = buildMarkdownTextMap(source);
        const seen = new Set<string>(
          openFindings.map((a) => `${a.anchorExact}\u0000${a.anchorPrefix}`)
        );
        const seenSpans = new Set<string>();

        /** One model call. Never throws: a failed part is reported, not fatal. */
        const readChunk = async (chunk: ReviewChunk) => {
          let raw = "";
          let usedInput: number | null = null;
          let usedOutput: number | null = null;
          try {
            const aiStream = streamAi(
              {
                modelKey,
                system,
                messages: [
                  {
                    role: "user",
                    parts: [
                      {
                        type: "text",
                        text: `Review this part of the document (${chunk.index} of ${chunk.total}):\n\n${chunk.markdown}`,
                      },
                    ],
                  },
                ],
                responseSchema: documentReviewResponseSchema,
                thinking: { summaries: false },
                maxOutputTokens: 8192,
                temperature: 0.1,
              },
              { userPlan: ownerEntitlements.plan, providerInstance }
            );
            for await (const event of aiStream) {
              if (event.type === "text_delta") raw += event.text;
              else if (event.type === "usage") {
                usedInput = event.inputTokens;
                usedOutput = event.outputTokens;
              }
            }
          } catch {
            return null;
          }
          return {
            raw,
            inputTokens:
              usedInput ??
              estimateTokens(system) + estimateTokens(chunk.markdown),
            outputTokens: usedOutput ?? estimateTokens(raw),
          };
        };

        // A few parts at a time: a long document is read in parallel, and its
        // findings are still saved in reading order.
        const queue: Array<{
          chunk: ReviewChunk;
          result: Awaited<ReturnType<typeof readChunk>>;
        }> = [];
        for (let i = 0; i < chunks.length; i += REVIEW_CONCURRENCY) {
          if (created >= MAX_FINDINGS_PER_REVIEW) break;
          const batch = chunks.slice(i, i + REVIEW_CONCURRENCY);
          send("progress", {
            section: batch[batch.length - 1]!.index,
            totalSections: chunks.length,
          });
          const results = await Promise.all(batch.map(readChunk));
          queue.length = 0;
          batch.forEach((chunk, k) =>
            queue.push({ chunk, result: results[k] ?? null })
          );

          for (const { chunk, result } of queue) {
            if (!result) {
              chunksFailed++;
              continue;
            }
            inputTokens += result.inputTokens;
            outputTokens += result.outputTokens;
            const raw = result.raw;

            const findings = parseFindings(raw);
            if (!findings) {
              chunksFailed++;
              continue;
            }
            chunksDone++;

            for (const rawFinding of findings.slice(
              0,
              MAX_FINDINGS_PER_CHUNK
            )) {
              if (created >= MAX_FINDINGS_PER_REVIEW) break;

              const found = validateFinding(chunk, rawFinding, source, textMap);
              if (!found) continue;

              const spanKey = `${found.sourceStart}:${found.anchor.exact.length}:${found.category}`;
              const openKey = `${found.anchor.exact}\u0000${found.anchor.prefix}`;
              if (seenSpans.has(spanKey) || seen.has(openKey)) continue;
              seenSpans.add(spanKey);
              seen.add(openKey);

              const suggestion = {
                category: found.category,
                severity: found.severity,
                ...(found.suggestion ?? {}),
              };
              const now = new Date();
              const annotation = await db.annotation.create({
                data: {
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
                  contentSource: latestEdit ? "EDIT" : "ORIGINAL",
                  editRevision: latestEdit?.revision ?? null,
                  anchorExact: found.anchor.exact,
                  anchorPrefix: found.anchor.prefix,
                  anchorSuffix: found.anchor.suffix,
                  anchorStart: found.anchor.start,
                  anchorEnd: found.anchor.end,
                  suggestion,
                  suggestionState: found.suggestion ? "PENDING" : null,
                  createdAt: now,
                  updatedAt: now,
                  messages: {
                    create: [
                      {
                        role: "ASSISTANT",
                        content: found.comment,
                        status: "COMPLETE",
                        modelKey,
                        generationId: `${generationId}:${crypto.randomUUID()}`,
                        createdAt: now,
                      },
                    ],
                  },
                },
                select: { id: true },
              });

              created++;
              if (found.suggestion) fixes++;
              byCategory[found.category] =
                (byCategory[found.category] ?? 0) + 1;

              send("finding", {
                annotationId: annotation.id,
                responseId: version.response.id,
                versionId: version.id,
                anchor: found.anchor,
                category: found.category,
                severity: found.severity,
                comment: found.comment,
                replacement: found.suggestion?.replacement ?? null,
              });
            }
          }
        }

        // Not one part could be read: nothing was reviewed (and nothing is charged).
        if (chunksDone === 0) {
          throw new Error("review_unreadable");
        }

        const chargedCredits = creditsFor(modelKey, {
          inputTokens,
          outputTokens,
        });
        await settle(billedAccountId, generationId, chargedCredits, settleKey);
        await db.generation.update({
          where: { id: generationId },
          data: { status: "COMPLETED", finishedAt: new Date(), chargedCredits },
        });

        send("summary", {
          total: created,
          fixes,
          byCategory,
          // Some parts could not be reviewed (the service failed part-way).
          incomplete: chunksFailed > 0,
        });
        send("done", { generationId, total: created });
      } catch (err: unknown) {
        // No document text or model output here: only what went wrong.
        console.error("[DocumentReview] failed", {
          generationId,
          error: err instanceof Error ? err.name : "unknown",
        });
        try {
          await release(billedAccountId, generationId, releaseKey);
          await db.generation.update({
            where: { id: generationId },
            data: {
              status: "FAILED",
              errorCode: "PROVIDER_ERROR",
              finishedAt: new Date(),
            },
          });
        } catch {
          // Nothing more can be done here; the generation stays RUNNING for
          // the clean-up of stuck generations to find.
        }
        // Findings saved before the failure stay: `total` tells the page.
        send("error", { code: "review_failed", total: created });
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
    cancel() {
      // Reader left; `start` keeps running and ignores further sends.
    },
  });

  return { stream, generationId };
}
