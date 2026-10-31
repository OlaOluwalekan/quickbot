import "server-only";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import type { Actor } from "@/server/auth/session";
import { requireWorkspace } from "@/server/authz/access";
import {
  reserve,
  settle,
  release,
  createAccountWithFreeGrant,
  getAccountByUserId,
} from "@/server/services/credits";
import {
  getModel,
  assertModelAccess,
  creditsFor,
  ModelKey,
} from "@/server/ai/registry";
import {
  streamAi,
  AiProvider,
  GenerateRequest,
} from "@/server/ai";
import { buildContext, estimateTokens } from "@/server/ai/context-builder";
import { PROMPT_VERSION } from "@/server/ai/prompts/system";
import {
  createGenerationSchema,
  CreateGenerationInput,
} from "@/lib/schemas/generation";
import { normalizeGeminiError } from "@/server/ai/errors";

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
  tokensEmitted: boolean;
  isComplete: boolean;
}

const activeGenerations = new Map<string, ActiveGeneration>();

let customProviderForTesting: AiProvider | null = null;

export function setCustomProvider(provider: AiProvider | null) {
  customProviderForTesting = provider;
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
  modelKey: ModelKey;
  prompt: string;
  kind: "TEXT" | "IMAGE";
  truncated: boolean;
  reservedCredits: number;
  inputMessages: GenerateRequest["messages"];
  systemPrompt: string;
  providerInstance?: AiProvider;
  isFirstTurn: boolean;
  abortController: AbortController;
}) {
  const {
    generationId,
    workspaceId,
    responseId,
    versionId,
    billedAccountId,
    modelKey,
    prompt,
    kind,
    truncated,
    inputMessages,
    systemPrompt,
    providerInstance,
    isFirstTurn,
    abortController,
  } = params;

  const active = activeGenerations.get(generationId);
  if (!active || active.isComplete) return;

  const activeProvider = providerInstance || customProviderForTesting || undefined;
  const settleKey = `stl_${generationId}`;
  const releaseKey = `rel_${generationId}`;

  // Emit status: preparing
  broadcastEvent(active, "status", { stage: "preparing", truncated });

  let checkpointInterval: NodeJS.Timeout | null = null;
  let lastSavedLength = 0;

  // Persist partial text every ~2 seconds
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

  try {
    if (kind === "IMAGE") {
      broadcastEvent(active, "status", { stage: "writing" });
      if (!activeProvider?.generateImage) {
        throw new Error("Provider not configured for image generation");
      }

      const imgResult = await activeProvider.generateImage({
        modelKey: getModel(modelKey).providerModelId,
        prompt,
      });

      if (abortController.signal.aborted) {
        throw new Error("Cancelled");
      }

      const base64Data = imgResult.bytes.toString("base64");
      active.currentContent = `![Generated Image](data:${imgResult.mime};base64,${base64Data})`;
      active.tokensEmitted = true;

      const chargedCredits = creditsFor(modelKey, { images: 1 });
      await settle(billedAccountId, generationId, chargedCredits, settleKey);

      await db.$transaction(async (tx) => {
        await tx.responseVersion.update({
          where: { id: versionId },
          data: {
            status: "COMPLETE",
            content: active.currentContent,
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
      });

      broadcastEvent(active, "delta", { text: active.currentContent });
      broadcastEvent(active, "usage", {
        inputTokens: 0,
        outputTokens: 0,
        credits: chargedCredits,
      });
      broadcastEvent(active, "completed", {
        responseId,
        versionId,
        content: active.currentContent,
      });

      if (isFirstTurn) {
        generateWorkspaceTitle(workspaceId, prompt, activeProvider).catch(() => {});
      }
      return;
    }

    // TEXT generation
    broadcastEvent(active, "status", { stage: "writing" });

    const stream = streamAi(
      {
        modelKey,
        messages: inputMessages,
        system: systemPrompt,
      },
      {
        userPlan: "FREE",
        providerInstance: activeProvider,
      }
    );

    let usage = { inputTokens: 0, outputTokens: 0 };

    for await (const event of stream) {
      if (abortController.signal.aborted) {
        throw new Error("Cancelled");
      }

      if (event.type === "thought_delta") {
        active.currentThought += event.text;
        active.tokensEmitted = true;
        broadcastEvent(active, "thought", { text: event.text });
      } else if (event.type === "text_delta") {
        active.currentContent += event.text;
        active.tokensEmitted = true;
        broadcastEvent(active, "delta", { text: event.text });
      } else if (event.type === "usage") {
        usage = {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
        };
      }
    }

    if (abortController.signal.aborted) {
      throw new Error("Cancelled");
    }

    // If usage was not provided by provider, estimate from content length
    if (usage.outputTokens === 0 && active.currentContent.length > 0) {
      usage.outputTokens = estimateTokens(active.currentContent);
    }

    // Settle credits
    const chargedCredits = creditsFor(modelKey, {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    await settle(billedAccountId, generationId, chargedCredits, settleKey);

    // Save final state
    await db.$transaction(async (tx) => {
      await tx.responseVersion.update({
        where: { id: versionId },
        data: {
          status: "COMPLETE",
          content: active.currentContent,
          thoughtSummary: active.currentThought || null,
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
          usage,
          finishedAt: new Date(),
        },
      });
    });

    broadcastEvent(active, "usage", {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      credits: chargedCredits,
    });
    broadcastEvent(active, "completed", {
      responseId,
      versionId,
      content: active.currentContent,
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
            ? creditsFor(modelKey, { outputTokens: estimatedOutput })
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
    const normalized = normalizeGeminiError(err);
    const errorCode = normalized.category || "generation_error";

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
        outputTokens: estimateTokens(active.currentContent),
      });

      await settle(billedAccountId, generationId, chargedCredits, settleKey).catch(() => {});

      await db.generation
        .update({
          where: { id: generationId },
          data: {
            status: "FAILED",
            errorCode,
            chargedCredits,
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

    broadcastEvent(active, "error", { code: errorCode });
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
 * Creates and streams a generation according to Step 2.4 specifications.
 */
export async function createAndStreamGeneration(
  actor: Actor,
  workspaceId: string,
  rawInput: CreateGenerationInput,
  options: { providerInstance?: AiProvider } = {}
): Promise<{ stream: ReadableStream<Uint8Array>; generationId: string }> {
  // Validate / parse defaults
  const input = createGenerationSchema.parse(rawInput);

  // 1. Authorize workspace
  const access = await requireWorkspace(actor, workspaceId, "workspace.generate");
  const wsOwnerId = access.ws.ownerId;

  // 2. Resolve billing account = workspace owner's credit account
  let ownerAccount = await getAccountByUserId(wsOwnerId);
  if (!ownerAccount) {
    ownerAccount = await createAccountWithFreeGrant(wsOwnerId);
  }
  const billedAccountId = ownerAccount.id;

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
          if (version?.content) {
            controller.enqueue(
              encoder.encode(formatSSEEvent("delta", { text: version.content }))
            );
          }
          controller.enqueue(
            encoder.encode(
              formatSSEEvent("completed", {
                responseId: existingGen.responseId,
                versionId: existingGen.versionId,
                content: version?.content ?? "",
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
                // controller already closed
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

  // 4. Validate Model & Calculate Token Reservation
  const modelKey = (input.modelKey ?? "text-economy") as ModelKey;
  const model = getModel(modelKey);
  assertModelAccess(modelKey, "FREE");

  const kind = input.kind === "IMAGE" ? "IMAGE" : "TEXT";

  // Build context for text generation
  let systemPrompt = "";
  let messages: GenerateRequest["messages"] = [];
  let truncated = false;
  let estimatedInputTokens = estimateTokens(input.prompt);

  if (kind === "TEXT") {
    const ctx = await buildContext({
      workspaceId,
      upToResponseId: input.regenerateResponseId,
      excludeUpToResponseId: !!input.regenerateResponseId,
      newPrompt: input.prompt,
      modelKey,
      language: input.language ?? "en",
    });

    systemPrompt = ctx.system;
    messages = ctx.messages;
    truncated = ctx.truncated;

    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === "text") {
          estimatedInputTokens += estimateTokens(part.text);
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

  // Pre-generate UUID for generation record to link with reservation
  const generationId = crypto.randomUUID();

  // 5. Reserve credits (402 if insufficient)
  const reservationKey = `res_gen_${input.idempotencyKey}`;
  await reserve(billedAccountId, reserveAmount, reservationKey, {
    generationId,
    actorId: actor.userId,
    estimated: true,
  });

  // 6. DB Creation: Response + ResponseVersion + Generation in one transaction
  const responseCount = await db.response.count({
    where: { workspaceId, deletedAt: null },
  });
  const isFirstTurn = responseCount === 0;

  const { response, version, generation } = await db.$transaction(async (tx) => {
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

    return { response: targetResponse, version: newVersion, generation: newGen };
  });

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

  // 8. Run detached generation pipeline
  executeDetachedGeneration({
    generationId: generation.id,
    workspaceId,
    responseId: response.id,
    versionId: version.id,
    actorId: actor.userId,
    billedAccountId,
    modelKey,
    prompt: input.prompt,
    kind,
    truncated,
    reservedCredits: reserveAmount,
    inputMessages: messages,
    systemPrompt,
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
      errorCode: gen.errorCode,
    };
  }

  const version = gen.versionId
    ? await db.responseVersion.findUnique({
        where: { id: gen.versionId },
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
