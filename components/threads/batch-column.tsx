"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Home, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnswerBody } from "@/components/response/answer-body";
import { api } from "@/lib/api/client";
import { useThreadStackStore } from "@/lib/stores/thread-stack";
import {
  useQuestionBatchStore,
  type BatchQuestion,
} from "@/lib/stores/question-batch";
import { cn } from "@/lib/utils";

export interface BatchColumnProps {
  /** Generation id of the "Ask all" run. */
  id: string;
  /** Position in the column stack (1 = first column next to the main conversation). */
  index: number;
  width: number;
  workspaceId: string;
  onBack: () => void;
  onCloseAll: () => void;
  className?: string;
}

interface SavedBatch {
  generationId: string;
  items: Array<{
    id: string;
    depth: number;
    quote: string;
    question: string;
    answer: { messageId: string; content: string; createdAt: string } | null;
  }>;
}

/**
 * The answers of one "Ask all" run of the question queue, as a single
 * response in a column: each queued question with its passage, followed by
 * its answer. It opens when the run starts (like "Ask now") and fills in as
 * the answers arrive. Every answer still belongs to its own question, so it
 * can be highlighted, and continued in its own thread.
 */
export function BatchColumn({
  id,
  index,
  width,
  workspaceId,
  onBack,
  onCloseAll,
  className,
}: BatchColumnProps) {
  const t = useTranslations("Threads");
  const live = useQuestionBatchStore((s) => s.batches[id]);
  const [saved, setSaved] = React.useState<BatchQuestion[] | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [notFound, setNotFound] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Opened from a link or after a reload: the run is not in this tab's memory.
  React.useEffect(() => {
    if (live) return;
    let cancelled = false;
    setIsLoading(true);
    setNotFound(false);
    api<SavedBatch>(`/api/v1/workspaces/${workspaceId}/questions/batches/${id}`)
      .then((res) => {
        if (cancelled) return;
        setSaved(
          res.items.map((item) => ({
            id: item.id,
            depth: item.depth,
            quote: item.quote,
            question: item.question,
            state: item.answer ? "answered" : "failed",
            answer: item.answer?.content,
            messageId: item.answer?.messageId,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, live, workspaceId]);

  const questions = live?.questions ?? saved ?? [];
  const isRunning = live?.status === "running";
  const answered = questions.filter((q) => q.state === "answered").length;

  const openThread = (q: BatchQuestion) => {
    const store = useThreadStackStore.getState();
    store.rememberQuotes([{ id: q.id, quote: q.quote }]);
    store.open({ kind: "annotation", id: q.id }, { fromIndex: index });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (!containerRef.current?.contains(e.target as HTMLElement)) return;
    e.stopPropagation();
    onBack();
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      style={{ width }}
      data-thread-column-index={index}
      data-testid={`batch-column-${id}`}
      className={cn(
        "flex flex-col h-full min-w-0 bg-background border-r border-border focus-visible:outline-none shrink-0 transition-[width] duration-200 ease-out motion-reduce:transition-none select-text",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="w-7 h-7 text-muted hover:text-foreground shrink-0"
            title={t("backShortcut")}
            aria-label={t("back")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
          <h2 className="text-xs font-semibold text-foreground truncate">
            {t("batch.title", { count: questions.length })}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCloseAll}
          className="w-7 h-7 text-muted hover:text-foreground shrink-0"
          title={t("mainShortcut")}
          aria-label={t("main")}
        >
          <Home className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-muted">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-xs">{t("loading")}</span>
          </div>
        ) : notFound || questions.length === 0 ? (
          <div className="text-center py-12 text-muted text-xs">{t("batch.notAvailable")}</div>
        ) : (
          <>
            <p className="text-xs text-muted" role="status" data-testid="batch-status">
              {isRunning ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t("batch.answering", { count: questions.length })}
                </span>
              ) : (
                t("batch.answered", { answered, total: questions.length })
              )}
            </p>

            <ol className="space-y-5">
              {questions.map((q, i) => (
                <li
                  key={q.id}
                  data-testid={`batch-item-${q.id}`}
                  className="space-y-2 border-b border-border/60 pb-5 last:border-b-0 last:pb-0"
                >
                  <div className="rounded-lg bg-surface border-l-2 border-accent p-3 text-xs space-y-1">
                    <blockquote className="italic text-foreground/80 line-clamp-2">
                      «{q.quote}»
                    </blockquote>
                    <p className="font-medium text-foreground">
                      <span className="text-muted mr-1">{i + 1}.</span>
                      {q.question}
                    </p>
                  </div>

                  {q.state === "answering" && (
                    <p className="flex items-center gap-2 text-xs text-muted">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {t("answering")}
                    </p>
                  )}

                  {q.state === "failed" && (
                    <p className="text-xs text-danger">{t("queueFailed")}</p>
                  )}

                  {q.state === "answered" && (
                    <div className="text-sm text-foreground/90 leading-relaxed break-words">
                      <AnswerBody
                        content={q.answer ?? ""}
                        targetType="ANNOTATION_MESSAGE"
                        targetId={q.messageId}
                        depth={q.depth + 1}
                        workspaceId={workspaceId}
                        showCopyButton
                      />
                    </div>
                  )}

                  {q.state !== "answering" && (
                    <div className="flex justify-end" data-annot-ignore="true">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openThread(q)}
                        data-testid={`batch-open-${q.id}`}
                        className="h-7 px-2 text-xs text-accent hover:text-accent-hover hover:bg-accent-soft gap-1"
                      >
                        <span>{t("batch.openThread")}</span>
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
