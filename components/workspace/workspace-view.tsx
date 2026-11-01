"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Brain, Sparkles, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/stores/ui";
import {
  useGenerationStore,
  type WorkspaceGenerationStream,
  DEFAULT_WORKSPACE_STREAM,
} from "@/lib/stores/generation";
import { queryKeys } from "@/lib/api/hooks/query-keys";
import { useResponses } from "@/lib/api/hooks/responses";
import { streamGeneration } from "@/lib/api/sse";
import { Composer } from "./composer";
import type { WorkspaceDto } from "@/lib/api/hooks/workspaces";
import type { Actor } from "@/server/auth/session";

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

  // Combined responses from TanStack Query or local state
  const displayedResponses = React.useMemo(() => {
    if (responsesData && responsesData.pages.length > 0) {
      const items = responsesData.pages.flatMap((p) => p.items);
      if (items.length > 0) {
        return items.map((r) => ({
          id: r.id,
          prompt: r.prompt,
          content: (r as unknown as { response?: string; activeVersion?: { content?: string } }).response ||
                   (r as unknown as { activeVersion?: { content?: string } }).activeVersion?.content || "",
          createdAt: r.createdAt,
        }));
      }
    }
    return localResponses;
  }, [responsesData, localResponses]);

  // Generation stream for this workspace
  const stream: WorkspaceGenerationStream = useGenerationStore(
    (s) => s.streams[workspace.id] ?? DEFAULT_WORKSPACE_STREAM,
  );

  const [optimisticFirstPrompt, setOptimisticFirstPrompt] = React.useState<string | null>(null);
  const [activeStage, setActiveStage] = React.useState<string | null>(null);
  const scrollEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = React.useCallback(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

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

    // Start stream in store
    genStore.startStream(workspace.id, {
      prompt: pending.prompt,
    });

    const abortController = new AbortController();
    genStore.setController(workspace.id, abortController);

    const idemKey =
      pending.idempotencyKey ||
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "idem-" + Math.random().toString(36).substring(2, 12));

    streamGeneration(
      workspace.id,
      {
        idempotencyKey: idemKey,
        prompt: pending.prompt,
        modelKey: pending.modelKey || "text-economy",
        kind: pending.mode === "image" ? "IMAGE" : "TEXT",
        think: pending.thinkHarder,
        language: pending.language || undefined,
      },
      {
        onStarted: (data) => {
          useGenerationStore.getState().setGenerationId(workspace.id, data.generationId);
        },
        onStatus: (data) => {
          setActiveStage(data.stage);
          useGenerationStore.getState().setProgress(workspace.id, data.stage);
        },
        onThought: (data) => {
          useGenerationStore.getState().appendThought(workspace.id, data.text);
          scrollToBottom();
        },
        onDelta: (data) => {
          useGenerationStore.getState().appendDelta(workspace.id, data.text);
          scrollToBottom();
        },
        onCompleted: (data) => {
          useGenerationStore.getState().completeStream(workspace.id, data.content);
          setLocalResponses((prev) => [
            ...prev,
            {
              id: data.responseId || "res-" + Date.now(),
              prompt: pending.prompt,
              content: data.content,
              createdAt: new Date(),
            },
          ]);
          setOptimisticFirstPrompt(null);
          useGenerationStore.getState().setController(workspace.id, null);

          // Invalidate cache so sidebar and recents reflect new activity
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

    // We do NOT abort on cleanup here so the in-flight stream survives React StrictMode remounts.
    // The abort controller is stored in the store and called on explicit cancelStream.
  }, [workspace.id, actor.userId, queryClient, router, scrollToBottom]);

  const isStreaming = stream.status === "streaming";
  const hasStreamOutput = Boolean(
    isStreaming || stream.status === "failed" || (optimisticFirstPrompt && stream.text),
  );

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-bg">
      {/* Scrollable Conversation Timeline */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Past conversation responses */}
          {displayedResponses.map((res, idx) => (
            <div key={res.id} className="space-y-4">
              {/* User Prompt */}
              <div className="flex justify-end">
                <div
                  className={cn(
                    "max-w-xl rounded-2xl bg-surface-2 border border-border px-4 py-2.5 text-sm sm:text-base text-fg shadow-xs",
                    idx === 0 && !optimisticFirstPrompt && "vt-first-prompt",
                  )}
                >
                  {res.prompt}
                </div>
              </div>

              {/* Assistant Response */}
              {res.content && (
                <div className="flex gap-3 text-left">
                  <div className="h-8 w-8 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0 border border-border">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="flex-1 rounded-2xl border border-border bg-surface p-4 sm:p-5 text-sm sm:text-base leading-relaxed text-fg shadow-xs">
                    {res.content}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Optimistic Prompt Bubble (with view-transition-name: first-prompt) */}
          {optimisticFirstPrompt && (
            <div className="flex justify-end">
              <div
                className="vt-first-prompt max-w-xl rounded-2xl bg-surface-2 border border-border px-4 py-2.5 text-sm sm:text-base text-fg shadow-xs"
              >
                {optimisticFirstPrompt}
              </div>
            </div>
          )}

          {/* Active Generation Stream / Thinking Panel */}
          {hasStreamOutput && (
            <div className="flex gap-3 text-left animate-fade-in">
              <div className="h-8 w-8 rounded-xl bg-accent text-accent-fg flex items-center justify-center shrink-0 shadow-xs">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-3">
                {/* Thinking / Progress Summary Panel */}
                {(stream.thought || activeStage || isStreaming) && (
                  <div className="rounded-xl border border-border bg-surface-2 p-3 space-y-2 text-xs">
                    <div className="flex items-center gap-2 font-medium text-muted">
                      <Brain className="h-3.5 w-3.5 animate-pulse text-accent" />
                      <span className="capitalize">
                        {activeStage ? `${activeStage}...` : "Thinking..."}
                      </span>
                    </div>
                    {stream.thought && (
                      <div className="font-mono text-[11px] text-muted whitespace-pre-wrap max-h-36 overflow-y-auto">
                        {stream.thought}
                      </div>
                    )}
                  </div>
                )}

                {/* Assistant Output Content */}
                {stream.text && (
                  <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5 text-sm sm:text-base leading-relaxed text-fg shadow-xs whitespace-pre-wrap">
                    {stream.text}
                    {isStreaming && (
                      <span className="inline-block h-4 w-1 bg-accent animate-pulse ml-0.5 align-middle" />
                    )}
                  </div>
                )}

                {/* Stream Error Card */}
                {stream.status === "failed" && stream.error && (
                  <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{stream.error}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={scrollEndRef} className="h-2" />
        </div>
      </div>

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
