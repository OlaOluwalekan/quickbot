"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useUiStore } from "@/lib/stores/ui";
import {
  useGenerationStore,
  DEFAULT_WORKSPACE_STREAM,
  type WorkspaceGenerationStream,
} from "@/lib/stores/generation";
import { streamGeneration, streamRegeneration } from "@/lib/api/sse";
import { useResponses } from "@/lib/api/hooks/responses";
import { queryKeys } from "@/lib/api/hooks/query-keys";
import { Composer } from "@/components/workspace/composer";
import { ResponseList } from "@/components/response/response-list";
import type { ResponseItemData } from "@/components/response/response-card";
import type { Actor } from "@/server/auth/session";
import type { WorkspaceDto } from "@/lib/api/hooks/workspaces";

export interface WorkspaceViewProps {
  workspace: WorkspaceDto;
  initialResponses?: Array<{
    id: string;
    prompt: string;
    content?: string;
    createdAt?: string | Date;
  }>;
  actor: Actor;
}

const EMPTY_INITIAL_RESPONSES: Array<{
  id: string;
  prompt: string;
  content?: string;
  createdAt?: string | Date;
}> = [];

export function WorkspaceView({
  workspace,
  initialResponses = EMPTY_INITIAL_RESPONSES,
  actor,
}: WorkspaceViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setCurrentPageTitle = useUiStore((s) => s.setCurrentPageTitle);
  const setCurrentPageId = useUiStore((s) => s.setCurrentPageId);

  // Sync title and id to UI store on mount/update
  React.useEffect(() => {
    setCurrentPageId(workspace.id);
    setCurrentPageTitle(workspace.title || "Workspace");
  }, [workspace.id, workspace.title, setCurrentPageId, setCurrentPageTitle]);

  // Query responses reactively with TanStack Query
  const { data: responsesData, refetch: refetchResponses } = useResponses(
    actor.userId,
    workspace.id,
    { view: "edited", limit: 50 },
  );

  // Local state seeded by initialResponses
  const [localResponses, setLocalResponses] = React.useState(initialResponses);

  // Sync when initialResponses prop changes (using a ref to prevent loops if a caller passes new references)
  const prevInitialResponsesRef = React.useRef(initialResponses);
  React.useEffect(() => {
    if (prevInitialResponsesRef.current !== initialResponses && initialResponses.length > 0) {
      prevInitialResponsesRef.current = initialResponses;
      setLocalResponses(initialResponses);
    }
  }, [initialResponses]);

  // Combined responses formatted as ResponseItemData
  const displayedResponses: ResponseItemData[] = React.useMemo(() => {
    if (responsesData && responsesData.pages.length > 0) {
      const items = responsesData.pages.flatMap((p) => p.items);
      if (items.length > 0) {
        return items.map((r) => {
          const raw = r as unknown as {
            kind?: string;
            versionCount?: number;
            activeVersion?: {
              id: string;
              number: number;
              content: string;
              originalContent?: string;
              thoughtSummary?: string | null;
              modelKey?: string | null;
              edited?: boolean;
              hasEdits?: boolean;
              latestEditContent?: string | null;
            };
            response?: string;
            latestEdit?: { content?: string };
          };

          const activeVer = raw.activeVersion;
          const latestEdit = activeVer?.latestEditContent || raw.latestEdit?.content;
          const effectiveContent =
            latestEdit ||
            activeVer?.content ||
            raw.response ||
            "";

          return {
            id: r.id,
            workspaceId: workspace.id,
            prompt: r.prompt,
            kind: (raw.kind as "TEXT" | "IMAGE") || "TEXT",
            content: effectiveContent,
            response: effectiveContent,
            versionCount: raw.versionCount || 1,
            activeVersionId: r.activeVersionId || activeVer?.id,
            createdAt: r.createdAt,
            activeVersion: activeVer
              ? {
                  id: activeVer.id,
                  number: activeVer.number || 1,
                  content: effectiveContent,
                  originalContent:
                    activeVer.originalContent || activeVer.content || effectiveContent,
                  thoughtSummary: activeVer.thoughtSummary,
                  modelKey: activeVer.modelKey,
                  edited: Boolean(activeVer.edited || activeVer.hasEdits || latestEdit),
                  hasEdits: Boolean(activeVer.hasEdits || latestEdit),
                  latestEditContent: latestEdit,
                }
              : null,
          };
        });
      }
    }

    return localResponses.map((r) => ({
      id: r.id,
      workspaceId: workspace.id,
      prompt: r.prompt,
      kind: "TEXT" as const,
      content: r.content || "",
      response: r.content || "",
      versionCount: 1,
      createdAt: r.createdAt,
      activeVersion: {
        id: "ver-" + r.id,
        number: 1,
        content: r.content || "",
        originalContent: r.content || "",
      },
    }));
  }, [responsesData, localResponses, workspace.id]);

  const [optimisticFirstPrompt, setOptimisticFirstPrompt] = React.useState<string | null>(null);

  // Execute or retry stream generation
  const startStreamTurn = React.useCallback(
    (promptText: string, idempotencyKey: string, options?: { modelKey?: string; kind?: "TEXT" | "IMAGE"; think?: boolean; language?: string }) => {
      const genStore = useGenerationStore.getState();
      genStore.startStream(workspace.id, { prompt: promptText });

      const abortController = new AbortController();
      genStore.setController(workspace.id, abortController);

      streamGeneration(
        workspace.id,
        {
          idempotencyKey,
          prompt: promptText,
          modelKey: options?.modelKey || "text-economy",
          kind: options?.kind || "TEXT",
          think: options?.think,
          language: options?.language,
        },
        {
          onStarted: (data) => {
            useGenerationStore.getState().setGenerationId(workspace.id, data.generationId);
          },
          onStatus: (data) => {
            useGenerationStore.getState().setProgress(workspace.id, data.stage);
          },
          onThought: (data) => {
            useGenerationStore.getState().appendThought(workspace.id, data.text);
          },
          onDelta: (data) => {
            useGenerationStore.getState().appendDelta(workspace.id, data.text);
          },
          onCompleted: (data) => {
            useGenerationStore.getState().completeStream(workspace.id, data.content);
            setLocalResponses((prev) => [
              ...prev,
              {
                id: data.responseId || "res-" + Date.now(),
                prompt: promptText,
                content: data.content,
                createdAt: new Date(),
              },
            ]);
            setOptimisticFirstPrompt(null);
            useGenerationStore.getState().setController(workspace.id, null);

            // Invalidate caches
            queryClient.invalidateQueries({
              queryKey: queryKeys.responses.all(actor.userId, workspace.id),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.workspaces.all(actor.userId),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.home.get(actor.userId),
            });
            router.refresh();
          },
          onError: (err) => {
            useGenerationStore.getState().failStream(workspace.id, err.message || err.code);
            useGenerationStore.getState().setController(workspace.id, null);
          },
        },
        abortController.signal,
      ).catch((err) => {
        if (!abortController.signal.aborted) {
          useGenerationStore.getState().failStream(
            workspace.id,
            err instanceof Error ? err.message : "Stream failed",
          );
          useGenerationStore.getState().setController(workspace.id, null);
        }
      });
    },
    [workspace.id, actor.userId, queryClient, router]
  );

  // Check and consume pendingStart on mount
  React.useEffect(() => {
    const genStore = useGenerationStore.getState();
    const pending = genStore.pendingStart;
    if (!pending || pending.workspaceId !== workspace.id) return;

    // Guard: if already streaming for this workspace, do not duplicate
    if (genStore.streams[workspace.id]?.status === "streaming") {
      return;
    }

    // Consume pendingStart
    genStore.consumePendingStart(workspace.id);
    setOptimisticFirstPrompt(pending.prompt);

    const idemKey =
      pending.idempotencyKey ||
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "idem-" + Math.random().toString(36).substring(2, 12));

    startStreamTurn(pending.prompt, idemKey, {
      modelKey: pending.modelKey,
      kind: pending.mode === "image" ? "IMAGE" : "TEXT",
      think: pending.thinkHarder,
      language: pending.language || undefined,
    });
  }, [workspace.id, startStreamTurn]);

  // Handle Turn Regeneration (Step 2.6 / 3.7)
  const handleRegenerateTurn = React.useCallback(
    (responseId: string) => {
      const targetResponse = displayedResponses.find((r) => r.id === responseId);
      if (!targetResponse) return;

      const genStore = useGenerationStore.getState();
      genStore.startStream(workspace.id, { prompt: targetResponse.prompt });

      const abortController = new AbortController();
      genStore.setController(workspace.id, abortController);

      const idemKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : "regen-" + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

      streamRegeneration(
        responseId,
        { idempotencyKey: idemKey },
        {
          onStarted: (data) => {
            useGenerationStore.getState().setGenerationId(workspace.id, data.generationId);
          },
          onStatus: (data) => {
            useGenerationStore.getState().setProgress(workspace.id, data.stage);
          },
          onThought: (data) => {
            useGenerationStore.getState().appendThought(workspace.id, data.text);
          },
          onDelta: (data) => {
            useGenerationStore.getState().appendDelta(workspace.id, data.text);
          },
          onCompleted: (data) => {
            useGenerationStore.getState().completeStream(workspace.id, data.content);
            useGenerationStore.getState().setController(workspace.id, null);

            queryClient.invalidateQueries({
              queryKey: queryKeys.responses.all(actor.userId, workspace.id),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.responses.versions(actor.userId, responseId),
            });
            router.refresh();
          },
          onError: (err) => {
            useGenerationStore.getState().failStream(workspace.id, err.message || err.code);
            useGenerationStore.getState().setController(workspace.id, null);
          },
        },
        abortController.signal,
      ).catch((err) => {
        if (!abortController.signal.aborted) {
          useGenerationStore.getState().failStream(
            workspace.id,
            err instanceof Error ? err.message : "Regeneration failed",
          );
          useGenerationStore.getState().setController(workspace.id, null);
        }
      });
    },
    [workspace.id, displayedResponses, actor.userId, queryClient, router]
  );

  // Handle Retry Failed Stream (uses new idempotency key)
  const handleRetryFailed = React.useCallback(
    (promptText: string, idempotencyKey: string) => {
      startStreamTurn(promptText, idempotencyKey);
    },
    [startStreamTurn]
  );

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-bg">
      {/* Response Timeline List */}
      <ResponseList
        workspaceId={workspace.id}
        actor={actor}
        responses={displayedResponses}
        optimisticPrompt={optimisticFirstPrompt}
        onRegenerateTurn={handleRegenerateTurn}
        onRetryFailed={handleRetryFailed}
      />

      {/* Fixed Bottom Composer with view-transition-name: composer */}
      <div className="border-t border-border/50 bg-bg/80 backdrop-blur-md px-4 sm:px-6 py-3 shrink-0">
        <div className="max-w-4xl mx-auto">
          <Composer
            workspaceId={workspace.id}
            size="compact"
            className="vt-composer shadow-lg"
            onSubmitted={() => {
              refetchResponses();
              router.refresh();
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default WorkspaceView;
