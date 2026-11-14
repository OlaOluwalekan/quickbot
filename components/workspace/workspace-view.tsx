"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useUiStore } from "@/lib/stores/ui";
import {
  useGenerationStore,
} from "@/lib/stores/generation";
import { streamGeneration, streamRegeneration, type CitationDto } from "@/lib/api/sse";
import {
  insertCompletedResponse,
  useResponses,
  type GeneratedDocumentDto,
} from "@/lib/api/hooks/responses";
import { queryKeys } from "@/lib/api/hooks/query-keys";
import { Composer } from "@/components/workspace/composer";
import { ResponseList } from "@/components/response/response-list";
import { ThreadStackLayout } from "@/components/threads/thread-stack-layout";
import { SelectionToolbar } from "@/components/annotations/selection-toolbar";
import type { ResponseItemData } from "@/components/response/response-card";
import type { Actor } from "@/server/auth/session";
import type { WorkspaceDto } from "@/lib/api/hooks/workspaces";

export interface WorkspaceViewProps {
  workspace: WorkspaceDto;
  initialResponses?: Array<{
    id: string;
    prompt: string;
    kind?: "TEXT" | "IMAGE" | "DOCUMENT";
    origin?: "DIRECT" | "PROMOTED" | "UPLOAD" | string;
    quote?: string | null;
    sourceAnnotationId?: string | null;
    sourceWorkspaceId?: string | null;
    sourceChain?: Array<{ id: string; quote: string; depth: number }> | null;
    sourceRemoved?: boolean;
    sourceAccessible?: boolean;
    content?: string;
    activeVersionId?: string | null;
    createdAt?: string | Date;
    author?: {
      name?: string;
      avatarUrl?: string;
    };
    citations?: CitationDto[];
    documents?: GeneratedDocumentDto[];
    attachments?: Array<{
      id: string;
      kind: string;
      originalName: string;
      mime: string;
      bytes: number;
      width?: number | null;
      height?: number | null;
    }>;
    uploadedAttachment?: {
      id: string;
      originalName: string;
      mime: string;
      bytes: number;
      createdAt?: string | Date;
    } | null;
  }>;
  actor: Actor;
}

const EMPTY_INITIAL_RESPONSES: NonNullable<WorkspaceViewProps["initialResponses"]> = [];

export function WorkspaceView({
  workspace,
  initialResponses = EMPTY_INITIAL_RESPONSES,
  actor,
}: WorkspaceViewProps) {
  const router = useRouter();
  const tThreads = useTranslations("Threads");
  const queryClient = useQueryClient();
  const setCurrentPageTitle = useUiStore((s) => s.setCurrentPageTitle);
  const setCurrentPageId = useUiStore((s) => s.setCurrentPageId);

  // Sync title and id to UI store on mount/update
  React.useEffect(() => {
    setCurrentPageId(workspace.id);
    setCurrentPageTitle(workspace.title || "Workspace");
  }, [workspace.id, workspace.title, setCurrentPageId, setCurrentPageTitle]);

  // Refresh timeline when a side question is promoted to this workspace.
  React.useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ workspaceId?: string }>).detail;
      if (detail?.workspaceId && detail.workspaceId !== workspace.id) return;
      queryClient.invalidateQueries({
        queryKey: queryKeys.responses.all(actor.userId, workspace.id),
      });
    };
    window.addEventListener("workspace-responses-changed", onChanged);
    return () => {
      window.removeEventListener("workspace-responses-changed", onChanged);
    };
  }, [workspace.id, actor.userId, queryClient]);

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
            origin?: string;
            quote?: string | null;
            sourceAnnotationId?: string | null;
            sourceWorkspaceId?: string | null;
            sourceChain?: Array<{ id: string; quote: string; depth: number }> | null;
            sourceRemoved?: boolean;
            sourceAccessible?: boolean;
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
              latestEdit?: {
                id?: string;
                revision?: number;
                content?: string;
              } | null;
              latestEditContent?: string | null;
              citations?: CitationDto[];
              documents?: GeneratedDocumentDto[];
            };
            response?: string;
            latestEdit?: { id?: string; revision?: number; content?: string };
            citations?: CitationDto[];
            attachments?: Array<{
              id: string;
              kind: string;
              originalName: string;
              mime: string;
              bytes: number;
              width?: number | null;
              height?: number | null;
            }>;
            uploadedAttachment?: {
              id: string;
              originalName: string;
              mime: string;
              bytes: number;
              createdAt?: string | Date;
            } | null;
            author?: {
              name?: string;
              avatarUrl?: string;
            };
            pageCount?: number | null;
            totalRows?: number | null;
            truncated?: boolean;
          };

          const activeVer = raw.activeVersion;
          const latestEdit = activeVer?.latestEditContent || raw.latestEdit?.content;
          const effectiveContent =
            latestEdit ||
            activeVer?.content ||
            raw.response ||
            "";
          const verCitations = activeVer?.citations ?? raw.citations ?? [];

          return {
            id: r.id,
            workspaceId: workspace.id,
            prompt: r.prompt,
            kind: (raw.kind as "TEXT" | "IMAGE" | "DOCUMENT") || "TEXT",
            origin: raw.origin,
            quote: raw.quote ?? null,
            sourceAnnotationId: raw.sourceAnnotationId ?? null,
            sourceWorkspaceId: raw.sourceWorkspaceId ?? null,
            sourceChain: raw.sourceChain ?? null,
            sourceRemoved: Boolean(raw.sourceRemoved),
            sourceAccessible: Boolean(raw.sourceAccessible),
            content: effectiveContent,
            response: effectiveContent,
            versionCount: raw.versionCount || 1,
            activeVersionId: r.activeVersionId || activeVer?.id,
            createdAt: r.createdAt,
            author: raw.author,
            citations: verCitations,
            attachments: (r as { attachments?: any[] }).attachments ?? raw.attachments ?? [],
            uploadedAttachment: r.uploadedAttachment ?? raw.uploadedAttachment ?? null,
            pageCount: raw.pageCount ?? null,
            totalRows: raw.totalRows ?? null,
            truncated: raw.truncated,
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
                  latestEdit: activeVer.latestEdit ?? null,
                  latestEditContent: latestEdit,
                  documents: activeVer.documents ?? [],
                  citations: verCitations,
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
      kind: r.kind || ("TEXT" as const),
      origin: r.origin,
      quote: r.quote ?? null,
      sourceAnnotationId: r.sourceAnnotationId ?? null,
      sourceWorkspaceId: r.sourceWorkspaceId ?? null,
      sourceChain: r.sourceChain ?? null,
      sourceRemoved: Boolean(r.sourceRemoved),
      sourceAccessible: Boolean(r.sourceAccessible),
      content: r.content || "",
      response: r.content || "",
      versionCount: 1,
      activeVersionId: r.activeVersionId || "ver-" + r.id,
      createdAt: r.createdAt,
      author: r.author,
      citations: r.citations ?? [],
      attachments: r.attachments ?? [],
      uploadedAttachment: r.uploadedAttachment ?? null,
      activeVersion: {
        id: r.activeVersionId || "ver-" + r.id,
        number: 1,
        content: r.content || "",
        originalContent: r.content || "",
        citations: r.citations ?? [],
        documents: r.documents ?? [],
      },
    }));
  }, [responsesData, localResponses, workspace.id]);

  const [optimisticFirstPrompt, setOptimisticFirstPrompt] = React.useState<string | null>(null);

  // Execute or retry stream generation
  const startStreamTurn = React.useCallback(
    (promptText: string, idempotencyKey: string, options?: { modelKey?: string; kind?: "TEXT" | "IMAGE"; think?: boolean; attachmentIds?: string[] }) => {
      const genStore = useGenerationStore.getState();
      const effectiveKind = options?.kind || "TEXT";
      genStore.startStream(workspace.id, { prompt: promptText, kind: effectiveKind });

      const abortController = new AbortController();
      genStore.setController(workspace.id, abortController);

      streamGeneration(
        workspace.id,
        {
          idempotencyKey,
          prompt: promptText,
          modelKey: options?.modelKey || (effectiveKind === "IMAGE" ? "image-standard" : "text-economy"),
          kind: effectiveKind,
          think: options?.think,
          attachmentIds: options?.attachmentIds,
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
          onCitation: (data) => {
            useGenerationStore.getState().appendCitation(workspace.id, data);
          },
          onCompleted: (data) => {
            insertCompletedResponse(queryClient, actor.userId, workspace.id, {
              ...data,
              prompt: promptText,
            });
            useGenerationStore.getState().completeStream(workspace.id, data.content, data.citations);
            setLocalResponses((prev) => [
              ...prev,
              {
                id: data.responseId || "res-" + Date.now(),
                prompt: promptText,
                kind: effectiveKind,
                content: data.content,
                citations: data.citations ?? [],
                documents: data.documents ?? [],
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
      attachmentIds: pending.attachmentIds,
    });
  }, [workspace.id, startStreamTurn]);

  // Handle Turn Regeneration (Step 2.6 / 3.7)
  const handleRegenerateTurn = React.useCallback(
    (responseId: string) => {
      const targetResponse = displayedResponses.find((r) => r.id === responseId);
      if (!targetResponse) return;

      const genStore = useGenerationStore.getState();
      genStore.startStream(workspace.id, {
        prompt: targetResponse.prompt,
        kind: (targetResponse.kind as "TEXT" | "IMAGE") || "TEXT",
      });

      const abortController = new AbortController();
      genStore.setController(workspace.id, abortController);

      const idemKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : "regen-" + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

      streamRegeneration(
        responseId,
        {
          idempotencyKey: idemKey,
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
          onCitation: (data) => {
            useGenerationStore.getState().appendCitation(workspace.id, data);
          },
          onCompleted: (data) => {
            useGenerationStore.getState().completeStream(workspace.id, data.content, data.citations);
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

  // Update the composer's queue badge right away.
  const handleQuestionQueued = () => {
    queryClient.invalidateQueries({
      queryKey: ["workspaces", workspace.id, "questions", "QUEUED"],
    });
  };
  const sourceProvenance = workspace.sourceProvenance;
  // Adding an answer to the timeline needs the same right as generating.
  const canPromoteToTimeline = workspace.capabilities
    ? workspace.capabilities.includes("workspace.generate")
    : undefined;
  const canEditResponse = workspace.capabilities
    ? workspace.capabilities.includes("workspace.edit_response")
    : true;
  const canComment = workspace.capabilities
    ? workspace.capabilities.includes("workspace.comment")
    : undefined;
  const canAsk = workspace.capabilities
    ? workspace.capabilities.includes("workspace.ask")
    : undefined;

  return (
    <>
    <ThreadStackLayout
      workspaceId={workspace.id}
      currentUserId={actor.userId}
      canComment={canComment}
      canAsk={canAsk}
      canPromoteToTimeline={canPromoteToTimeline}
      canEditResponse={canEditResponse}
      className="flex-1 h-full w-full"
    >
      <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-bg">
        {sourceProvenance && (
          <div
            data-testid="workspace-provenance-banner"
            className="border-b border-border/60 bg-surface-2/60 px-4 sm:px-6 py-2 text-xs text-muted shrink-0"
          >
            <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-1.5">
              <ArrowUpLeft className="h-3.5 w-3.5 text-subtle shrink-0" />
              {sourceProvenance.canAccess ? (
                <>
                  <span>
                    {tThreads.rich("provenance.startedFrom", {
                      title: sourceProvenance.sourceWorkspaceTitle,
                      link: (chunks) => (
                        <Link
                          href={
                            sourceProvenance.threadParam
                              ? `/workspaces/${sourceProvenance.sourceWorkspaceId}?thread=${sourceProvenance.threadParam}`
                              : `/workspaces/${sourceProvenance.sourceWorkspaceId}`
                          }
                          className="font-medium text-accent hover:underline"
                          data-testid="workspace-provenance-link"
                        >
                          {chunks}
                        </Link>
                      ),
                    })}
                  </span>
                  {sourceProvenance.annotationRemoved && (
                    <span
                      className="text-subtle"
                      data-testid="workspace-provenance-annotation-removed"
                    >
                      · {tThreads("provenance.questionRemoved")}
                    </span>
                  )}
                </>
              ) : sourceProvenance.removed ? (
                <span data-testid="workspace-provenance-removed">
                  {tThreads("provenance.sourceRemoved")}
                </span>
              ) : (
                <span data-testid="workspace-provenance-inaccessible">
                  {tThreads("provenance.sourceInaccessible")}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Response Timeline List */}
        <ResponseList
          workspaceId={workspace.id}
          actor={actor}
          responses={displayedResponses}
          memberCount={workspace.memberCount ?? 1}
          capabilities={workspace.capabilities}
          onQuestionQueued={handleQuestionQueued}
          withSelectionToolbar={false}
          optimisticPrompt={optimisticFirstPrompt}
          onRegenerateTurn={handleRegenerateTurn}
          onRetryFailed={handleRetryFailed}
        />

        {/* Fixed Bottom Composer with view-transition-name: composer */}
        <div className="border-t border-border/50 bg-bg/80 backdrop-blur-md px-4 sm:px-6 py-3 shrink-0">
          <div className="max-w-4xl mx-auto">
            <Composer
              workspaceId={workspace.id}
              userId={actor.userId}
              size="compact"
              className="vt-composer shadow-lg"
              onCompleted={(data, prompt) =>
                insertCompletedResponse(queryClient, actor.userId, workspace.id, {
                  ...data,
                  prompt,
                })
              }
              onSubmitted={() => {
                refetchResponses();
                queryClient.invalidateQueries({
                  queryKey: queryKeys.responses.all(actor.userId, workspace.id),
                });
                router.refresh();
              }}
            />
          </div>
        </div>
      </div>
    </ThreadStackLayout>

    {/* One selection toolbar for every column: main responses and Ask
        answers at any depth. It lives outside the main column, which is
        hidden while it is collapsed to a spine. */}
    <SelectionToolbar
      workspaceId={workspace.id}
      canComment={canComment}
      canAsk={canAsk}
      onQuestionCreated={handleQuestionQueued}
    />
    </>
  );
}

export default WorkspaceView;
