import { ingestLinkAttachment } from "./attachment";
import { CREATE_DOCUMENT_TOOL, executeCreateDocumentToolCall } from "@/server/documents";
import { WEB_SEARCH_TOOL } from "@/server/ai/tools/web-search";
import {
  MAX_SEARCHES_PER_GENERATION,
  executeWebSearchTool,
  resolveWebSearchAccess,
  webSearchNotice,
} from "@/server/services/web-search";
import "server-only";
import crypto from "node:crypto";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { ApiError, Errors } from "@/server/http/errors";
import type { Actor } from "@/server/auth/session";
import { requireWorkspace } from "@/server/authz/access";
import { logActivity } from "./activity";
import { resolveBilledAccount, reserveForWorkspaceGeneration } from "./billing-owner";
import {
  settle,
  release,
  getDailyUsage,
} from "@/server/services/credits";
import {
  getModel,
  isModelKey,
  assertModelAccess,
  creditsFor,
  ModelKey,
  PlanTier,
} from "@/server/ai/registry";
import {
  streamAi,
  getProvider,
  AiProvider,
  GenerateRequest,
  enforceImagePromptModeration,
  ModerationProvider,
  validateCitationUrl,
  applyGroundingInlineMarkers,
  CitationItem,
} from "@/server/ai";
import {
  PLANS,
  PlanKey,
  getDailyCapForPlan,
} from "@/server/billing/plans";
import { getEntitlements, entitlementsForPlan } from "@/server/billing/entitlements";
import { getUserPreferences } from "@/server/services/user-preferences";
import { buildContext, estimateTokens } from "@/server/ai/context-builder";
import { PROMPT_VERSION } from "@/server/ai/prompts/system";
import {
  createGenerationSchema,
  CreateGenerationInput,
} from "@/lib/schemas/generation";
import { getStorageProvider } from "@/server/storage";
import type { Msg, Part, ToolSpec } from "@/server/ai/types";
import { normalizeGeminiError } from "@/server/ai/errors";
import { resolveEffectiveAiLanguage } from "@/lib/locale";

// In-memory active generation tracking
export type ActiveSubscriber = {
  onChunk: (chunk: string) => void;
  onClose: () => void;
};

interface ActiveGeneration {
  generationId: string;
  workspaceId: string;
  responseId: string;
  versionId: string;
  abortController: AbortController;
  subscribers: Set<ActiveSubscriber>;
  bufferedEvents: string[];
  currentContent: string;
  currentThought: string;
  citations: CitationItem[];
  tokensEmitted: boolean;
  isComplete: boolean;
}

const activeGenerations = new Map<string, ActiveGeneration>();

let customProviderForTesting: AiProvider | null = null;

export function setCustomProvider(provider: AiProvider | null) {
  customProviderForTesting = provider;
}

export function getCustomProvider(): AiProvider | null {
  return customProviderForTesting;
}

export function clearActiveGenerationsForTesting() {
  activeGenerations.clear();
}

export function formatSSEEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function broadcastEvent(active: ActiveGeneration, eventName: string, data: unknown) {
  const formatted = formatSSEEvent(eventName, data);
  active.bufferedEvents.push(formatted);
  for (const sub of active.subscribers) {
    try {
      sub.onChunk(formatted);
    } catch {
      // subscriber error ignored
    }
  }
}

/**
 * Resolves the effective plan tier for a workspace owner's credit account.
 */
async function resolveEffectiveUserPlan(
  userId: string,
  _account: { id: string; planBalance: number; topupBalance: number },
  explicitPlan?: PlanTier
): Promise<PlanKey> {
  if (explicitPlan && explicitPlan in PLANS) {
    return explicitPlan as PlanKey;
  }

  const entitlements = await getEntitlements(userId);
  return entitlements.plan;
}

/**
 * Generates an automated title for the workspace on the first turn.
 * Billed to platform (0 credits to user), economy model, fallback to first 60 chars of prompt.
 */
async function generateWorkspaceTitle(
  workspaceId: string,
  prompt: string,
  provider?: AiProvider
) {
  try {
    const activeProvider = provider || customProviderForTesting || undefined;
    const titlePrompt = `Summarize the following user request into a concise 3 to 6 word title. Do not include quotes, markdown, or punctuation:\n\n${prompt}`;
    let generatedTitle = "";

    const stream = streamAi(
      {
        modelKey: "text-economy",
        messages: [{ role: "user", parts: [{ type: "text", text: titlePrompt }] }],
        thinking: { summaries: false },
      },
      {
        userPlan: "FREE",
        providerInstance: activeProvider,
      }
    );

    for await (const ev of stream) {
      if (ev.type === "text_delta") {
        generatedTitle += ev.text;
      }
    }

    const cleanTitle = generatedTitle.replace(/["'\n\r]/g, "").trim();
    const finalTitle =
      cleanTitle.length >= 3 && cleanTitle.length <= 80
        ? cleanTitle
        : prompt.slice(0, 60).trim();

    await db.workspace.update({
      where: { id: workspaceId },
      data: { title: finalTitle },
    });
  } catch {
    const fallbackTitle = prompt.slice(0, 60).trim() || "New workspace";
    await db.workspace
      .update({
        where: { id: workspaceId },
        data: { title: fallbackTitle },
      })
      .catch(() => {});
  }
}

/**
 * Runs the model streaming pipeline detached from the HTTP connection.
 */
async function executeDetachedGeneration(params: {
  generationId: string;
  workspaceId: string;
  responseId: string;
  versionId: string;
  actorId: string;
  billedAccountId: string;
  userPlan: PlanKey;
  modelKey: ModelKey;
  prompt: string;
  kind: "TEXT" | "IMAGE";
  truncated: boolean;
  reservedCredits: number;
  inputMessages: GenerateRequest["messages"];
  systemPrompt: string;
  think?: boolean;
  initialCitations?: CitationItem[];
  providerInstance?: AiProvider;
  isFirstTurn: boolean;
  abortController: AbortController;
}) {
  const {
    generationId,
    workspaceId,
    responseId,
    versionId,
    actorId,
    billedAccountId,
    userPlan,
    modelKey,
    prompt,
    kind,
    truncated,
    inputMessages,
    systemPrompt,
    think,
    initialCitations = [],
    providerInstance,
    isFirstTurn,
    abortController,
  } = params;

  const active = activeGenerations.get(generationId);
  if (!active || active.isComplete) return;

  const activeProvider = providerInstance || customProviderForTesting || undefined;
  const settleKey = `stl_${generationId}`;
  const releaseKey = `rel_${generationId}`;

  // Emit status: preparing (includes context_truncated flag if truncated)
  broadcastEvent(active, "status", { stage: "preparing", truncated });

  // Seed any user-supplied attachment/link citations first
  for (const initCit of initialCitations) {
    const existing = active.citations.find((c) => c.url === initCit.url);
    if (!existing) {
      const nextIndex = active.citations.length + 1;
      const item: CitationItem = {
        ...initCit,
        index: nextIndex,
      };
      active.citations.push(item);
      broadcastEvent(active, "citation", {
        index: item.index,
        url: item.url,
        title: item.title,
        snippet: item.snippet,
        source: item.source,
      });
    }
  }

  let checkpointInterval: NodeJS.Timeout | null = null;
  let lastSavedLength = 0;

  // Persist partial text and thoughtSummary every ~2 seconds
  checkpointInterval = setInterval(async () => {
    if (active.currentContent.length !== lastSavedLength && !active.isComplete) {
      lastSavedLength = active.currentContent.length;
      try {
        await db.responseVersion.update({
          where: { id: versionId },
          data: {
            content: active.currentContent,
            thoughtSummary: active.currentThought || null,
          },
        });
      } catch {
        // checkpoint db error ignored
      }
    }
  }, 2000);
  checkpointInterval.unref();

  // Declared outside `try`: a cancelled generation still bills the tokens
  // and the searches that ran.
  const usage = { inputTokens: 0, outputTokens: 0 };
  let searchesExecuted = 0;

  try {
    if (kind === "IMAGE") {
      broadcastEvent(active, "status", { stage: "writing" });
      const imgProvider = activeProvider || getProvider(modelKey);
      if (!imgProvider?.generateImage) {
        throw new Error("Provider not configured for image generation");
      }

      const imgResult = await imgProvider.generateImage({
        modelKey: getModel(modelKey).providerModelId,
        prompt,
      });

      if (abortController.signal.aborted) {
        throw new Error("Cancelled");
      }

      broadcastEvent(active, "status", { stage: "saving" });

      // Step 5.4: Upload generated image bytes to Cloudinary (kind: GENERATED_IMAGE, private),
      // create the Attachment, link to ResponseVersion, and store ONLY the attachment ID.
      const storage = getStorageProvider();
      const folder = env.CLOUDINARY_UPLOAD_FOLDER || "klecx/dev";
      const ext =
        imgResult.mime === "image/jpeg"
          ? "jpg"
          : imgResult.mime === "image/webp"
            ? "webp"
            : "png";
      const publicId = `${folder}/${workspaceId}/gen_${crypto.randomUUID()}`;

      const uploaded = await storage.uploadBuffer(imgResult.bytes, {
        publicId,
        folder,
        resourceType: "image",
        format: ext,
        mime: imgResult.mime,
        isPublic: false,
      });

      const sha256 = crypto
        .createHash("sha256")
        .update(imgResult.bytes)
        .digest("hex");

      const chargedCredits = creditsFor(modelKey, { images: 1 });
      await settle(billedAccountId, generationId, chargedCredits, settleKey);

      const createdAttachment = await db.$transaction(async (tx) => {
        const attachment = await tx.attachment.create({
          data: {
            ownerId: actorId,
            workspaceId,
            responseId,
            kind: "GENERATED_IMAGE",
            status: "READY",
            providerId: uploaded.publicId,
            resourceType: "image",
            mime: imgResult.mime,
            bytes: imgResult.bytes.byteLength,
            width: uploaded.width ?? 1024,
            height: uploaded.height ?? 1024,
            originalName: `generated-${versionId}.${ext}`,
            sha256,
          },
        });

        await tx.responseVersion.update({
          where: { id: versionId },
          data: {
            status: "COMPLETE",
            content: attachment.id,
          },
        });
        await tx.response.update({
          where: { id: responseId },
          data: { activeVersionId: versionId },
        });
        await tx.workspace.update({
          where: { id: workspaceId },
          data: { lastActivityAt: new Date() },
        });
        await tx.generation.update({
          where: { id: generationId },
          data: {
            status: "COMPLETED",
            chargedCredits,
            finishedAt: new Date(),
          },
        });

        return attachment;
      });

      active.currentContent = createdAttachment.id;
      active.tokensEmitted = true;

      broadcastEvent(active, "status", { stage: "done" });
      broadcastEvent(active, "delta", {
        text: createdAttachment.id,
        attachmentId: createdAttachment.id,
      });
      broadcastEvent(active, "usage", {
        inputTokens: 0,
        outputTokens: 0,
        credits: chargedCredits,
      });
      broadcastEvent(active, "completed", {
        responseId,
        versionId,
        content: createdAttachment.id,
        attachmentId: createdAttachment.id,
      });

      if (isFirstTurn) {
        generateWorkspaceTitle(workspaceId, prompt, activeProvider).catch(() => {});
      }
      return;
    }

    // TEXT generation
    const modelDef = getModel(modelKey);
    const supportsThinking = modelDef.caps.thinkingSummaries === true;
    const thinkingConfig = supportsThinking
      ? {
          summaries: true,
          level: think ? ("high" as const) : ("low" as const),
        }
      : { summaries: false };

    // F4.1: web search is a tool, offered per the actor's preference, the
    // owner's plan (the owner pays) and the actor's daily search count.
    const webSearch = modelDef.caps.tools
      ? await resolveWebSearchAccess(actorId, billedAccountId, entitlementsForPlan(userPlan))
      : { allowed: false, reachedDailyCap: false, locale: null };

    if (webSearch.reachedDailyCap) {
      const limitNotice = webSearchNotice(webSearch.locale, "searchLimitReached");
      active.currentThought = limitNotice;
      broadcastEvent(active, "thought", { text: `${limitNotice}\n\n` });
    }

    let stage: "preparing" | "thinking" | "writing" = "preparing";
    // Documents created by the tool (F3.4): sent with `completed`, so the
    // finished answer shows its cards at once (no shift when the list reloads).
    const createdDocuments: Array<{
      id: string;
      title: string;
      format: string;
      currentRevision: number;
    }> = [];
    let currentMessages: Msg[] = [...inputMessages];
    let toolIterations = 0;
    const MAX_TOOL_ITERATIONS = 4;

    while (toolIterations <= MAX_TOOL_ITERATIONS) {
      const availableTools: ToolSpec[] = [];
      if (modelDef.caps.tools && toolIterations < MAX_TOOL_ITERATIONS) {
        if (createdDocuments.length === 0) {
          availableTools.push(CREATE_DOCUMENT_TOOL);
        }
        if (webSearch.allowed && searchesExecuted < MAX_SEARCHES_PER_GENERATION) {
          availableTools.push(WEB_SEARCH_TOOL);
        }
      }

      const stream = streamAi(
        {
          modelKey,
          messages: currentMessages,
          system: systemPrompt,
          thinking: thinkingConfig,
          tools: availableTools.length > 0 ? availableTools : undefined,
        },
        {
          userPlan,
          providerInstance: activeProvider,
        }
      );

      let toolCallEmitted: {
        name: string;
        args: unknown;
        thoughtSignature?: string;
      } | null = null;
      let assistantTextInThisTurn = "";
      // A provider may report usage on several chunks, each a running total
      // for this call: keep the last one, then add the calls together.
      let callUsage = { inputTokens: 0, outputTokens: 0 };

      for await (const event of stream) {
        if (abortController.signal.aborted) {
          throw new Error("Cancelled");
        }

        if (event.type === "thought_delta") {
          if (supportsThinking) {
            if (stage !== "thinking") {
              stage = "thinking";
              broadcastEvent(active, "status", { stage: "thinking" });
            }
            active.currentThought += event.text;
            active.tokensEmitted = true;
            broadcastEvent(active, "thought", { text: event.text });
          }
        } else if (event.type === "thought_signature") {
          if (toolCallEmitted && !toolCallEmitted.thoughtSignature) {
            toolCallEmitted.thoughtSignature = event.signature;
          }
        } else if (event.type === "text_delta") {
          if (stage !== "writing") {
            stage = "writing";
            broadcastEvent(active, "status", { stage: "writing" });
          }
          active.currentContent += event.text;
          assistantTextInThisTurn += event.text;
          active.tokensEmitted = true;
          broadcastEvent(active, "delta", { text: event.text });
        } else if (
          event.type === "tool_call" &&
          (event.name === "create_document" ||
            event.name.endsWith("create_document") ||
            event.name === "web_search" ||
            event.name.endsWith("web_search"))
        ) {
          toolCallEmitted = {
            name: event.name.endsWith("web_search")
              ? "web_search"
              : event.name.endsWith("create_document")
              ? "create_document"
              : event.name,
            args: event.args,
            thoughtSignature: event.thoughtSignature,
          };
        } else if (event.type === "citation") {
          // The main request is never grounded by the provider (F4.1: search
          // is the web_search tool, whose sources are added when it runs), so
          // provider citations here are ignored. Never parse URLs from text.
        } else if (event.type === "usage") {
          callUsage = {
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
          };
        }
      }

      usage.inputTokens += callUsage.inputTokens;
      usage.outputTokens += callUsage.outputTokens;

      if (toolCallEmitted && toolIterations < MAX_TOOL_ITERATIONS) {
        toolIterations++;
        if (stage !== "writing") {
          stage = "writing";
          broadcastEvent(active, "status", { stage: "writing" });
        }

        let toolResponse: Record<string, unknown>;

        const offeredNow = new Set(availableTools.map((t) => t.name));

        if (!offeredNow.has(toolCallEmitted.name)) {
          // The model called a tool it was not offered this turn (search off,
          // limit reached, or a document already created).
          toolResponse = {
            success: false,
            error: "This tool is not available now. Answer without it.",
          };
        } else if (toolCallEmitted.name === "web_search") {
          const result = await executeWebSearchTool({
            args: toolCallEmitted.args,
            providerInstance: activeProvider,
            citations: active.citations,
            onCitation: (citation) => {
              active.citations.push(citation);
              broadcastEvent(active, "citation", citation);
            },
            onSearchStart: (query) => {
              broadcastEvent(active, "status", { stage: "searching", query });
            },
          });
          if (result.executed) {
            searchesExecuted++;
            const searchThought = webSearchNotice(webSearch.locale, "searchedWeb", {
              query: result.query,
            });
            active.currentThought = active.currentThought
              ? `${active.currentThought}\n\n${searchThought}`
              : searchThought;
            broadcastEvent(active, "thought", { text: `\n\n${searchThought}\n\n` });
          }
          toolResponse = result.response;
        } else {
          // create_document
          try {
            const docResult = await executeCreateDocumentToolCall({
              actorId,
              workspaceId,
              versionId,
              args: toolCallEmitted.args,
            });
            const docEvent = {
              id: docResult.documentId,
              title: docResult.title,
              format: docResult.format,
              currentRevision: docResult.currentRevision,
            };
            createdDocuments.push(docEvent);
            broadcastEvent(active, "document", docEvent);
            toolResponse = {
              success: true,
              documentId: docResult.documentId,
              title: docResult.title,
              format: docResult.format,
            };
          } catch (err) {
            if (!(err instanceof ApiError)) throw err;
            toolResponse = { success: false, error: err.message };
          }
        }

        currentMessages = [
          ...currentMessages,
          {
            role: "assistant",
            parts: [
              ...(assistantTextInThisTurn
                ? [{ type: "text" as const, text: assistantTextInThisTurn }]
                : []),
              {
                type: "tool_call" as const,
                name: toolCallEmitted.name,
                args: toolCallEmitted.args,
                thoughtSignature: toolCallEmitted.thoughtSignature,
              },
            ],
          },
          {
            role: "user",
            parts: [
              {
                type: "tool_response" as const,
                name: toolCallEmitted.name,
                response: toolResponse,
              },
            ],
          },
        ];

        continue;
      }

      break;
    }

    if (abortController.signal.aborted) {
      throw new Error("Cancelled");
    }

    // Stage: saving
    broadcastEvent(active, "status", { stage: "saving" });

    // Position inline [n] markers if grounding segments provided exact offsets
    if (active.citations.some((c) => c.segments && c.segments.length > 0)) {
      active.currentContent = applyGroundingInlineMarkers(
        active.currentContent,
        active.citations
      );
    }

    // If usage was not provided by provider, estimate from content length
    if (usage.outputTokens === 0 && active.currentContent.length > 0) {
      usage.outputTokens = estimateTokens(active.currentContent);
    }

    // Settle credits (including +3 surcharge per executed web search)
    const chargedCredits = creditsFor(modelKey, {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      searches: searchesExecuted,
    });

    await settle(billedAccountId, generationId, chargedCredits, settleKey);

    // Save final state (ResponseVersion + Citations + Response + Workspace + Generation)
    const savedCitations = await db.$transaction(async (tx) => {
      await tx.responseVersion.update({
        where: { id: versionId },
        data: {
          status: "COMPLETE",
          content: active.currentContent,
          thoughtSummary: active.currentThought || null,
        },
      });

      if (active.citations.length > 0 && "citation" in tx && tx.citation) {
        await tx.citation.createMany({
          data: active.citations.map((c) => ({
            versionId,
            index: c.index,
            url: c.url,
            title: c.title ?? null,
            snippet: c.snippet ?? null,
            source: c.source,
          })),
        });
      }

      await tx.response.update({
        where: { id: responseId },
        data: { activeVersionId: versionId },
      });
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { lastActivityAt: new Date() },
      });
      await tx.generation.update({
        where: { id: generationId },
        data: {
          status: "COMPLETED",
          chargedCredits,
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            searches: searchesExecuted,
          },
          finishedAt: new Date(),
        },
      });

      if ("citation" in tx && tx.citation) {
        return tx.citation.findMany({
          where: { versionId },
          orderBy: { index: "asc" },
        });
      }
      return [];
    });

    // Stage: done
    broadcastEvent(active, "status", { stage: "done" });
    broadcastEvent(active, "usage", {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      credits: chargedCredits,
    });
    broadcastEvent(active, "completed", {
      responseId,
      versionId,
      content: active.currentContent,
      citations: savedCitations,
      documents: createdDocuments,
    });

    if (isFirstTurn) {
      generateWorkspaceTitle(workspaceId, prompt, activeProvider).catch(() => {});
    }
  } catch (err: unknown) {
    const isCancelled =
      abortController.signal.aborted ||
      (err instanceof Error && err.message === "Cancelled");

    if (isCancelled) {
      // If cancelled, check if cancelGeneration already handled DB / credits
      const currentGen = await db.generation.findUnique({
        where: { id: generationId },
      });
      if (currentGen?.status !== "CANCELLED") {
        const estimatedOutput = estimateTokens(active.currentContent);
        const chargedCredits =
          active.currentContent.length > 0
            ? creditsFor(modelKey, {
                inputTokens: usage.inputTokens,
                outputTokens: estimatedOutput,
                searches: searchesExecuted,
              })
            : 0;

        if (chargedCredits > 0) {
          await settle(billedAccountId, generationId, chargedCredits, settleKey).catch(() => {});
        } else {
          await release(billedAccountId, generationId, releaseKey).catch(() => {});
        }

        await db.generation
          .update({
            where: { id: generationId },
            data: {
              status: "CANCELLED",
              chargedCredits,
              usage: {
                inputTokens: usage.inputTokens,
                outputTokens: estimatedOutput,
                searches: searchesExecuted,
              },
              finishedAt: new Date(),
            },
          })
          .catch(() => {});

        await db.responseVersion
          .update({
            where: { id: versionId },
            data: {
              status: active.currentContent.length > 0 ? "COMPLETE" : "FAILED",
              content: active.currentContent,
              thoughtSummary: active.currentThought || null,
            },
          })
          .catch(() => {});
      }

      broadcastEvent(active, "status", { stage: "cancelled" });
      return;
    }

    // Provider or unexpected error
    if (process.env.NODE_ENV !== "test") {
      console.error("[Generation] Error during generation:", err);
    }
    const normalized = normalizeGeminiError(err);
    const errorCode = normalized.category || "generation_error";
    const errorMessage =
      err instanceof Error && err.message
        ? err.message
        : normalized.message || "Failed to generate response";

    if (!active.tokensEmitted || active.currentContent.length === 0) {
      // Nothing produced -> 100% full refund
      await release(billedAccountId, generationId, releaseKey).catch(() => {});

      await db.generation
        .update({
          where: { id: generationId },
          data: {
            status: "FAILED",
            errorCode,
            finishedAt: new Date(),
          },
        })
        .catch(() => {});

      await db.responseVersion
        .update({
          where: { id: versionId },
          data: { status: "FAILED" },
        })
        .catch(() => {});
    } else {
      // Partial output produced and provider billed us -> settle partial
      const chargedCredits = creditsFor(modelKey, {
        inputTokens: usage.inputTokens,
        outputTokens: estimateTokens(active.currentContent),
        searches: searchesExecuted,
      });

      await settle(billedAccountId, generationId, chargedCredits, settleKey).catch(() => {});

      await db.generation
        .update({
          where: { id: generationId },
          data: {
            status: "FAILED",
            errorCode,
            chargedCredits,
            usage: {
              inputTokens: usage.inputTokens,
              outputTokens: estimateTokens(active.currentContent),
              searches: searchesExecuted,
            },
            finishedAt: new Date(),
          },
        })
        .catch(() => {});

      await db.responseVersion
        .update({
          where: { id: versionId },
          data: {
            status: "FAILED",
            content: active.currentContent,
            thoughtSummary: active.currentThought || null,
          },
        })
        .catch(() => {});
    }

    broadcastEvent(active, "status", { stage: "failed" });
    broadcastEvent(active, "error", { code: errorCode, message: errorMessage });
  } finally {
    if (checkpointInterval) {
      clearInterval(checkpointInterval);
    }
    active.isComplete = true;
    for (const sub of active.subscribers) {
      try {
        sub.onClose();
      } catch {}
    }
    active.subscribers.clear();
    const cleanupTimer = setTimeout(() => {
      activeGenerations.delete(generationId);
    }, 1000);
    cleanupTimer.unref();
  }
}

/**
 * Creates and streams a generation according to Step 2.4, Step 2.5, Step 5.4, and Step 5.5 specifications.
 */
export async function createAndStreamGeneration(
  actor: Actor,
  workspaceId: string,
  rawInput: CreateGenerationInput,
  options: {
    providerInstance?: AiProvider;
    userPlan?: PlanTier;
    moderationProvider?: ModerationProvider;
  } = {}
): Promise<{ stream: ReadableStream<Uint8Array>; generationId: string }> {
  // Validate / parse defaults
  const input = createGenerationSchema.parse(rawInput);

  // 1. Authorize workspace
  const access = await requireWorkspace(actor, workspaceId, "workspace.generate");
  const wsOwnerId = access.ws.ownerId;

  // 2. Resolve billing account = workspace owner's credit account
  const { account: ownerAccount, billedAccountId } = await resolveBilledAccount(access.ws);

  // 3. Idempotency check
  const existingGen = await db.generation.findUnique({
    where: {
      actorId_idempotencyKey: {
        actorId: actor.userId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });

  const encoder = new TextEncoder();

  if (existingGen) {
    // If completed: replay completion stream
    if (existingGen.status === "COMPLETED") {
      const version = existingGen.versionId
        ? await db.responseVersion.findUnique({
            where: { id: existingGen.versionId },
            include: {
              citations: { orderBy: { index: "asc" } },
              documents: {
                where: { deletedAt: null },
                orderBy: { createdAt: "asc" },
                select: { id: true, title: true, format: true, currentRevision: true },
              },
            },
          })
        : null;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              formatSSEEvent("started", {
                generationId: existingGen.id,
                responseId: existingGen.responseId,
                versionId: existingGen.versionId,
              })
            )
          );
          if (version?.thoughtSummary) {
            controller.enqueue(
              encoder.encode(formatSSEEvent("thought", { text: version.thoughtSummary }))
            );
          }
          if (version?.content) {
            controller.enqueue(
              encoder.encode(formatSSEEvent("delta", { text: version.content }))
            );
          }
          if (version?.citations && version.citations.length > 0) {
            for (const cit of version.citations) {
              controller.enqueue(
                encoder.encode(
                  formatSSEEvent("citation", {
                    index: cit.index,
                    url: cit.url,
                    title: cit.title,
                    snippet: cit.snippet,
                    source: cit.source,
                  })
                )
              );
            }
          }
          controller.enqueue(
            encoder.encode(formatSSEEvent("status", { stage: "done" }))
          );
          controller.enqueue(
            encoder.encode(
              formatSSEEvent("completed", {
                responseId: existingGen.responseId,
                versionId: existingGen.versionId,
                content: version?.content ?? "",
                citations: version?.citations ?? [],
                documents: version?.documents ?? [],
              })
            )
          );
          controller.close();
        },
      });

      return { stream, generationId: existingGen.id };
    }

    // If running: attach to active generation in memory
    const active = activeGenerations.get(existingGen.id);
    if (active) {
      let pingInterval: NodeJS.Timeout | null = null;
      let subscriber: ActiveSubscriber;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          subscriber = {
            onChunk: (chunk: string) => {
              try {
                controller.enqueue(encoder.encode(chunk));
              } catch {
                // controller closed
              }
            },
            onClose: () => {
              if (pingInterval) {
                clearInterval(pingInterval);
                pingInterval = null;
              }
              try {
                controller.close();
              } catch {
                // already closed
              }
            },
          };

          // Replay buffered events
          for (const ev of active.bufferedEvents) {
            controller.enqueue(encoder.encode(ev));
          }

          if (active.isComplete) {
            controller.close();
            return;
          }

          active.subscribers.add(subscriber);

          pingInterval = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": ping\n\n"));
            } catch {
              if (pingInterval) clearInterval(pingInterval);
            }
          }, 15000);
          pingInterval.unref();
        },
        cancel() {
          if (pingInterval) clearInterval(pingInterval);
          if (active && subscriber) {
            active.subscribers.delete(subscriber);
          }
        },
      });

      return { stream, generationId: existingGen.id };
    }
  }

  // 4. Determine Kind, Validate Moderation, Plan Access & Model
  const kind = input.kind === "IMAGE" ? "IMAGE" : "TEXT";

  // Step 5.4: For IMAGE prompts, run abuse & moderation checks BEFORE reserving credits
  if (kind === "IMAGE") {
    await enforceImagePromptModeration(actor.userId, input.prompt, {
      hasAttachments: Boolean(input.attachmentIds && input.attachmentIds.length > 0),
      provider: options.moderationProvider,
    });
  }

  const resolvedPlan = await resolveEffectiveUserPlan(
    wsOwnerId,
    ownerAccount,
    options.userPlan
  );
  const ownerEntitlements = entitlementsForPlan(resolvedPlan);
  const userPlan = ownerEntitlements.plan;

  let modelKey: ModelKey;
  if (kind === "IMAGE") {
    modelKey =
      input.modelKey &&
      isModelKey(input.modelKey) &&
      getModel(input.modelKey).kind === "IMAGE"
        ? input.modelKey
        : "image-standard";

    // Plan gate: Free = disabled (§4.4)
    if (!PLANS[userPlan].limits.images) {
      throw Errors.forbidden(
        "Image generation is not available on the Free plan. Please upgrade to Lite, Standard, or Pro."
      );
    }
  } else {
    modelKey = (input.modelKey ?? "text-economy") as ModelKey;
  }

  const model = getModel(modelKey);
  try {
    assertModelAccess(modelKey, ownerEntitlements.plan);
  } catch (err: unknown) {
    throw Errors.forbidden(
      err instanceof Error ? err.message : `Model '${modelKey}' is not available on your current plan.`
    );
  }

  // Validate attachments if provided (or if regenerating TEXT turn, include its original prompt attachments)
  let attachmentIds = input.attachmentIds;
  if (
    (!attachmentIds || attachmentIds.length === 0) &&
    input.regenerateResponseId &&
    kind === "TEXT"
  ) {
    const existingAtts = await db.attachment.findMany({
      where: {
        responseId: input.regenerateResponseId,
        deletedAt: null,
        kind: { in: ["IMAGE", "DOCUMENT"] },
      },
      select: { id: true },
    });
    if (existingAtts.length > 0) {
      attachmentIds = existingAtts.map((a) => a.id);
    }
  }

  const contextAttachments: Part[] = [];
  const initialAttachmentCitations: CitationItem[] = [];
  let existingAttachments: Array<{ id: string; providerId: string }> = [];

  if (attachmentIds && attachmentIds.length > 0 && kind === "TEXT") {
    const attachments = await db.attachment.findMany({
      where: { id: { in: attachmentIds } },
    });

    if (attachments.length !== attachmentIds.length) {
      throw Errors.validation([
        { field: "attachmentIds", message: "One or more attachments not found" },
      ]);
    }

    const storage = getStorageProvider();

    existingAttachments = attachments.map((a) => ({ id: a.id, providerId: a.providerId }));
    for (const att of attachments) {
      if (att.workspaceId !== workspaceId) {
        throw Errors.validation([
          { field: "attachmentIds", message: `Attachment ${att.id} does not belong to this workspace` },
        ]);
      }
      if (att.status !== "READY") {
        throw Errors.validation([
          { field: "attachmentIds", message: `Attachment ${att.id} is not ready` },
        ]);
      }
      if (att.responseId && att.responseId !== input.regenerateResponseId) {
        throw Errors.validation([
          { field: "attachmentIds", message: `Attachment ${att.id} is already attached to another response` },
        ]);
      }

      if (att.kind === "DOCUMENT") {
        const docText = att.extractedText || "";
        contextAttachments.push({
          type: "text",
          text: `<document name="${att.originalName}">\n${docText}\n</document>`,
        });

        // Step 5.5: If attachment is a user-supplied link (providerId is valid http/https URL), record as ATTACHMENT citation
        const urlCheck = validateCitationUrl(att.providerId);
        if (urlCheck.valid && urlCheck.normalizedUrl) {
          initialAttachmentCitations.push({
            index: initialAttachmentCitations.length + 1,
            url: urlCheck.normalizedUrl,
            title: att.originalName || urlCheck.hostname || null,
            snippet: docText ? docText.slice(0, 240).trim() : null,
            source: "ATTACHMENT",
          });
        }
      } else if (att.kind === "IMAGE" || att.kind === "GENERATED_IMAGE") {
        try {
          const buffer = await storage.downloadBuffer(att.providerId, {
            resourceType: "image",
          });
          const base64 = buffer.toString("base64");
          contextAttachments.push({
            type: "image",
            url: `data:${att.mime};base64,${base64}`,
            mime: att.mime,
          });
        } catch (err) {
          console.error(`Failed to download attachment buffer for ${att.id}:`, err);
        }
      }
    }
  }

  // Auto-ingest safe URLs from prompt for TEXT turns (Step 5.3: cap 5 links per prompt)
  if (kind === "TEXT") {
    const urlMatches = input.prompt.match(/https?:\/\/[^\s<>"'{}|\^`\[\]]+/gi) || [];
    const promptUrls = urlMatches
      .map((u) => u.replace(/[.,;!?)]+$/, ""))
      .slice(0, 5);

    for (const urlStr of promptUrls) {
      try {
        const alreadyAttached = existingAttachments.some(
          (a) => a.providerId === urlStr
        );
        if (!alreadyAttached) {
          const linkAtt = await ingestLinkAttachment(actor, workspaceId, urlStr);
          attachmentIds = attachmentIds ? [...attachmentIds, linkAtt.id] : [linkAtt.id];
          existingAttachments.push({ id: linkAtt.id, providerId: urlStr });
          contextAttachments.push({
            type: "text",
            text: `<document name="${linkAtt.originalName}">\n${linkAtt.extractedText || ""}\n</document>`,
          });

          const urlCheck = validateCitationUrl(linkAtt.providerId);
          if (urlCheck.valid && urlCheck.normalizedUrl) {
            initialAttachmentCitations.push({
              index: initialAttachmentCitations.length + 1,
              url: urlCheck.normalizedUrl,
              title: linkAtt.originalName || urlCheck.hostname || null,
              snippet: linkAtt.extractedText
                ? linkAtt.extractedText.slice(0, 240).trim()
                : null,
              source: "ATTACHMENT",
            });
          }
        }
      } catch (err: unknown) {
        console.warn(`[SafeFetch] Could not auto-ingest link "${urlStr}":`, err);
      }
    }
  }

  // Build context for text generation
  let systemPrompt = "";
  let messages: GenerateRequest["messages"] = [];
  let truncated = false;
  let estimatedInputTokens = estimateTokens(input.prompt);

  if (kind === "TEXT") {
    // Step F4.2: AI language is a user preference (null = Auto / match my message)
    const userPref = await getUserPreferences(actor.userId).catch(() => null);
    const targetLanguage = userPref?.aiLanguage ?? null;

    const ctx = await buildContext({
      workspaceId,
      upToResponseId: input.regenerateResponseId,
      excludeUpToResponseId: !!input.regenerateResponseId,
      newPrompt: input.prompt,
      attachments: contextAttachments,
      modelKey,
      language: targetLanguage,
    });

    systemPrompt = ctx.system;
    messages = ctx.messages;
    truncated = ctx.truncated;

    estimatedInputTokens = estimateTokens(systemPrompt);
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === "text") {
          estimatedInputTokens += estimateTokens(part.text);
        } else {
          estimatedInputTokens += 258;
        }
      }
    }
  }

  const reserveAmount =
    kind === "IMAGE"
      ? creditsFor(modelKey, { images: 1 })
      : creditsFor(modelKey, {
          inputTokens: estimatedInputTokens,
          outputTokens: 4096,
        });

  // Daily cap check for image generation (Step 5.4)
  if (kind === "IMAGE") {
    const dailyCap = getDailyCapForPlan(userPlan);
    const spentToday = await getDailyUsage(billedAccountId);
    if (spentToday + reserveAmount > dailyCap) {
      throw Errors.paymentRequired(
        `Daily credit cap of ${dailyCap} credits reached for your ${PLANS[userPlan].name} plan.`
      );
    }
  }

  // Pre-generate UUID for generation record to link with reservation
  const generationId = crypto.randomUUID();

  // 5. Reserve credits on owner's account & enforce collaborator cap (402 if insufficient or cap exceeded)
  const reservationKey = `res_gen_${input.idempotencyKey}`;
  await reserveForWorkspaceGeneration({
    workspace: access.ws,
    actorId: actor.userId,
    amount: reserveAmount,
    reservationKey,
    generationId,
    estimated: true,
  });

  // 6. DB Creation: Response + ResponseVersion + Generation in one transaction
  const responseCount = await db.response.count({
    where: { workspaceId, deletedAt: null },
  });
  const isFirstTurn = responseCount === 0;

  type TxResult = {
    response: any;
    version: any;
    generation: any;
  };
  let txResult: TxResult | null = null;
  let retries = 0;

  while (retries < 5) {
    try {
      txResult = await db.$transaction(async (tx) => {
        let targetResponse;
        let versionNumber = 1;

        if (input.regenerateResponseId) {
          targetResponse = await tx.response.findUnique({
            where: { id: input.regenerateResponseId },
          });
          if (!targetResponse) {
            throw Errors.notFound("Target response for regeneration");
          }
          const maxVer = await tx.responseVersion.aggregate({
            where: { responseId: targetResponse.id },
            _max: { number: true },
          });
          versionNumber = (maxVer._max.number ?? 1) + 1;
        } else {
          targetResponse = await tx.response.create({
            data: {
              workspaceId,
              createdById: actor.userId,
              prompt: input.prompt,
              kind: kind === "IMAGE" ? "IMAGE" : "TEXT",
              origin: "DIRECT",
            },
          });
        }

        const newVersion = await tx.responseVersion.create({
          data: {
            responseId: targetResponse.id,
            number: versionNumber,
            status: "STREAMING",
            content: "",
            modelKey,
            providerModelId: model.providerModelId,
            promptVersion: PROMPT_VERSION,
            createdById: actor.userId,
          },
        });

        const newGen = await tx.generation.create({
          data: {
            id: generationId,
            workspaceId,
            responseId: targetResponse.id,
            versionId: newVersion.id,
            actorId: actor.userId,
            billedAccountId,
            kind: kind === "IMAGE" ? "IMAGE" : "TEXT",
            status: "RUNNING",
            modelKey,
            providerModelId: model.providerModelId,
            promptVersion: PROMPT_VERSION,
            idempotencyKey: input.idempotencyKey,
            reservedCredits: reserveAmount,
            startedAt: new Date(),
          },
        });

        await tx.responseVersion.update({
          where: { id: newVersion.id },
          data: { generationId: newGen.id },
        });

        if (attachmentIds && attachmentIds.length > 0 && kind === "TEXT") {
          await tx.attachment.updateMany({
            where: { id: { in: attachmentIds } },
            data: { responseId: targetResponse.id },
          });
        }

        await logActivity(tx, {
          workspaceId,
          actorId: actor.userId,
          action: input.regenerateResponseId ? "response.regenerated" : "response.created",
          targetType: "response",
          targetId: targetResponse.id,
          meta: { versionNumber, kind: targetResponse.kind },
        });

        return { response: targetResponse, version: newVersion, generation: newGen };
      });
      break;
    } catch (err: unknown) {
      const pErr = err as { code?: string; message?: string };
      if (
        pErr?.code === "P2002" ||
        pErr?.message?.includes("response_versions_response_id_number_key")
      ) {
        retries++;
        if (retries >= 5) throw err;
        await new Promise((r) => setTimeout(r, 20 * retries));
        continue;
      }
      throw err;
    }
  }

  const { response, version, generation } = txResult!;

  // 7. Initialize in-memory active generation
  const abortController = new AbortController();
  const active: ActiveGeneration = {
    generationId: generation.id,
    workspaceId,
    responseId: response.id,
    versionId: version.id,
    abortController,
    subscribers: new Set(),
    bufferedEvents: [],
    currentContent: "",
    currentThought: "",
    citations: [],
    tokensEmitted: false,
    isComplete: false,
  };
  activeGenerations.set(generation.id, active);

  // Emit initial started event immediately
  broadcastEvent(active, "started", {
    generationId: generation.id,
    responseId: response.id,
    versionId: version.id,
  });

  // Emit initial queued status event
  broadcastEvent(active, "status", { stage: "queued" });

  // 8. Run detached generation pipeline
  executeDetachedGeneration({
    generationId: generation.id,
    workspaceId,
    responseId: response.id,
    versionId: version.id,
    actorId: actor.userId,
    billedAccountId,
    userPlan,
    modelKey,
    prompt: input.prompt,
    kind,
    truncated,
    reservedCredits: reserveAmount,
    inputMessages: messages,
    systemPrompt,
    think: input.think,
    initialCitations: initialAttachmentCitations,
    providerInstance: options.providerInstance || customProviderForTesting || undefined,
    isFirstTurn,
    abortController,
  }).catch((err) => {
    console.error(`[Generation Service] Error in detached pipeline:`, err);
  });

  // 9. Build ReadableStream for SSE HTTP response
  let pingInterval: NodeJS.Timeout | null = null;
  let subscriber: ActiveSubscriber;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      subscriber = {
        onChunk: (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            // stream closed
          }
        },
        onClose: () => {
          if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
          }
          try {
            controller.close();
          } catch {
            // already closed
          }
        },
      };

      for (const ev of active.bufferedEvents) {
        controller.enqueue(encoder.encode(ev));
      }

      if (active.isComplete) {
        controller.close();
        return;
      }

      active.subscribers.add(subscriber);

      pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          if (pingInterval) clearInterval(pingInterval);
        }
      }, 15000);
      pingInterval.unref();
    },
    cancel() {
      if (pingInterval) clearInterval(pingInterval);
      if (active && subscriber) {
        active.subscribers.delete(subscriber);
      }
    },
  });

  return { stream, generationId: generation.id };
}

/**
 * Recovers orphaned generations running for longer than 10 minutes.
 */
export async function recoverOrphanedGenerations(): Promise<number> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  const orphaned = await db.generation.findMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: tenMinutesAgo },
    },
  });

  for (const gen of orphaned) {
    const releaseKey = `rel_orphan_${gen.id}`;
    await release(gen.billedAccountId, gen.id, releaseKey).catch(() => {});

    await db.generation.update({
      where: { id: gen.id },
      data: {
        status: "FAILED",
        errorCode: "timeout_orphaned",
        finishedAt: new Date(),
      },
    });

    if (gen.versionId) {
      await db.responseVersion.update({
        where: { id: gen.versionId },
        data: { status: "FAILED" },
      }).catch(() => {});
    }
  }

  return orphaned.length;
}

/**
 * Retrieves generation status and latest partial or complete content.
 */
export async function getGenerationStatus(actor: Actor, generationId: string) {
  const gen = await db.generation.findUnique({
    where: { id: generationId },
  });
  if (!gen) {
    throw Errors.notFound("Generation");
  }

  // Enforce workspace.read access
  await requireWorkspace(actor, gen.workspaceId, "workspace.read");

  const active = activeGenerations.get(generationId);
  if (active) {
    return {
      id: gen.id,
      status: gen.status,
      workspaceId: gen.workspaceId,
      responseId: active.responseId,
      versionId: active.versionId,
      content: active.currentContent,
      thoughtSummary: active.currentThought || null,
      citations: active.citations,
      errorCode: gen.errorCode,
    };
  }

  const version = gen.versionId
    ? await db.responseVersion.findUnique({
        where: { id: gen.versionId },
        include: {
          citations: { orderBy: { index: "asc" } },
          documents: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            select: { id: true, title: true, format: true, currentRevision: true },
          },
        },
      })
    : null;

  return {
    id: gen.id,
    status: gen.status,
    workspaceId: gen.workspaceId,
    responseId: gen.responseId,
    versionId: gen.versionId,
    content: version?.content ?? "",
    thoughtSummary: version?.thoughtSummary ?? null,
    citations: version?.citations ?? [],
    documents: version?.documents ?? [],
    errorCode: gen.errorCode,
  };
}

/**
 * Explicitly cancels an ongoing generation.
 */
export async function cancelGeneration(actor: Actor, generationId: string) {
  const gen = await db.generation.findUnique({
    where: { id: generationId },
  });
  if (!gen) {
    throw Errors.notFound("Generation");
  }

  await requireWorkspace(actor, gen.workspaceId, "workspace.generate");

  if (gen.status !== "RUNNING" && gen.status !== "QUEUED") {
    return { success: true, status: gen.status };
  }

  const active = activeGenerations.get(generationId);
  if (active) {
    active.abortController.abort();
    active.isComplete = true;

    const estimatedOutput = estimateTokens(active.currentContent);
    const chargedCredits =
      active.currentContent.length > 0
        ? creditsFor((gen.modelKey as ModelKey) || "text-economy", { outputTokens: estimatedOutput })
        : 0;

    const settleKey = `stl_${generationId}`;
    const releaseKey = `rel_${generationId}`;

    if (chargedCredits > 0) {
      await settle(gen.billedAccountId, generationId, chargedCredits, settleKey).catch(() => {});
    } else {
      await release(gen.billedAccountId, generationId, releaseKey).catch(() => {});
    }

    await db.generation.update({
      where: { id: generationId },
      data: {
        status: "CANCELLED",
        chargedCredits,
        finishedAt: new Date(),
      },
    });

    if (gen.versionId) {
      await db.responseVersion.update({
        where: { id: gen.versionId },
        data: {
          status: active.currentContent.length > 0 ? "COMPLETE" : "FAILED",
          content: active.currentContent,
          thoughtSummary: active.currentThought || null,
        },
      }).catch(() => {});
    }

    broadcastEvent(active, "status", { stage: "cancelled" });

    for (const sub of active.subscribers) {
      try {
        sub.onClose();
      } catch {}
    }
    active.subscribers.clear();
    activeGenerations.delete(generationId);
  } else {
    await release(gen.billedAccountId, gen.id, `rel_cancel_${gen.id}`).catch(() => {});

    await db.generation.update({
      where: { id: generationId },
      data: {
        status: "CANCELLED",
        finishedAt: new Date(),
      },
    });

    if (gen.versionId) {
      await db.responseVersion.update({
        where: { id: gen.versionId },
        data: { status: "FAILED" },
      }).catch(() => {});
    }
  }

  return { success: true, status: "CANCELLED" };
}
