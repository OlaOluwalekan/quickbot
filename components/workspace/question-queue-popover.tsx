"use client";

import * as React from "react";
import { Layers, Loader2, Play, Trash2, Edit2, Check, X } from "lucide-react";
import { useQuery, useQueryClient, QueryClientContext } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { useUiStore } from "@/lib/stores/ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export interface QueuedQuestion {
  id: string;
  workspaceId: string;
  responseId: string;
  versionId: string;
  kind: "ASK";
  questionState: "NONE" | "QUEUED" | "ANSWERING" | "ANSWERED" | "CANCELLED" | "FAILED";
  anchorExact: string;
  createdAt: string;
  messages: Array<{
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    createdAt: string;
  }>;
}

export interface QuestionQueuePopoverProps {
  workspaceId?: string | null;
  className?: string;
}

function QuestionQueuePopoverInner({
  workspaceId,
  className,
}: QuestionQueuePopoverProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState("");
  const setRightPanelOpen = useUiStore((s) => s.setRightPanelOpen);
  const setRightPanelFocus = useUiStore((s) => s.setRightPanelFocus);

  // Fetch queued questions
  const { data: questions = [], isLoading } = useQuery<QueuedQuestion[]>({
    queryKey: ["workspaces", workspaceId, "questions", "QUEUED"],
    queryFn: async () => {
      if (!workspaceId) return [];
      return api<QueuedQuestion[]>(
        `/api/v1/workspaces/${workspaceId}/questions?state=QUEUED`
      );
    },
    enabled: Boolean(workspaceId),
    refetchInterval: isRunning ? 2000 : 10000,
  });

  const queuedCount = questions.length;

  // Handle Remove/Cancel question
  const handleRemoveQuestion = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await api(`/api/v1/annotations/${id}`, {
        method: "PATCH",
        json: { questionState: "CANCELLED" },
      });
      queryClient.setQueryData<QueuedQuestion[]>(
        ["workspaces", workspaceId, "questions", "QUEUED"],
        (old) => (old ? old.filter((q) => q.id !== id) : [])
      );
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceId, "annotations"],
      });
      toast.success("Question removed from queue");
    } catch {
      toast.error("Failed to remove question");
    }
  };

  // Handle Edit question text
  const startEditing = (q: QueuedQuestion, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const userMsg = q.messages.find((m) => m.role === "USER");
    setEditingId(q.id);
    setEditText(userMsg ? userMsg.content : "");
  };

  const saveEdit = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!editText.trim()) return;
    try {
      await api(`/api/v1/annotations/${id}`, {
        method: "PATCH",
        json: { text: editText.trim() },
      });
      queryClient.setQueryData<QueuedQuestion[]>(
        ["workspaces", workspaceId, "questions", "QUEUED"],
        (old) =>
          old
            ? old.map((q) => {
                if (q.id !== id) return q;
                return {
                  ...q,
                  messages: q.messages.map((m) =>
                    m.role === "USER" ? { ...m, content: editText.trim() } : m
                  ),
                };
              })
            : []
      );
      setEditingId(null);
      setEditText("");
      toast.success("Question updated");
    } catch {
      toast.error("Failed to update question");
    }
  };

  // Run Batch SSE
  const handleRunBatch = async () => {
    if (!workspaceId || queuedCount === 0 || isRunning) return;

    setIsRunning(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/questions/run`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            annotationIds: questions.map((q) => q.id),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to start batch (status ${response.status})`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const evt of events) {
          const lines = evt.split("\n");
          let eventName = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventName = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              dataStr = line.slice(6).trim();
            }
          }

          if (eventName === "question_answered") {
            try {
              const data = JSON.parse(dataStr);
              queryClient.setQueryData<QueuedQuestion[]>(
                ["workspaces", workspaceId, "questions", "QUEUED"],
                (old) => (old ? old.filter((q) => q.id !== data.id) : [])
              );
            } catch {
              // ignore json error
            }
          } else if (eventName === "done") {
            toast.success("All questions answered");
          } else if (eventName === "error") {
            toast.error("Question answering encountered an issue");
          }
        }
      }

      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceId, "questions"],
      });
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceId, "annotations"],
      });

      // Open right panel focused on Questions tab
      setRightPanelFocus({ tab: "questions" });
      setRightPanelOpen(true);
      setIsOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to run questions";
      toast.error(msg);
    } finally {
      setIsRunning(false);
    }
  };

  const estimatedCredits = Math.max(1, queuedCount * 2);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="composer-queue-button"
          aria-label={
            queuedCount > 0
              ? `Questions (${queuedCount})`
              : "Questions queue"
          }
          title={
            queuedCount > 0
              ? `Questions (${queuedCount})`
              : "Questions queue"
          }
          className={cn(
            "relative flex h-7 items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors cursor-pointer border",
            queuedCount > 0
              ? "bg-accent/10 border-accent/30 text-accent hover:bg-accent/20"
              : "bg-surface-2 border-border/50 text-muted hover:text-fg hover:bg-surface-3",
            className
          )}
        >
          <Layers className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} />
          <span>Questions</span>
          {queuedCount > 0 && (
            <span
              data-testid="composer-queue-badge"
              className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg shadow-xs"
            >
              {queuedCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        data-testid="composer-queue-popover"
        className="w-80 sm:w-96 max-h-[420px] p-0 flex flex-col shadow-lg border-border bg-surface text-fg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-accent" />
            <span className="text-xs font-semibold">Question Queue</span>
            {queuedCount > 0 && (
              <span className="rounded-full bg-accent/15 px-2 py-0.2 text-[10px] font-medium text-accent">
                {queuedCount}
              </span>
            )}
          </div>
          {isRunning && (
            <div className="flex items-center gap-1 text-[11px] text-accent font-medium">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Answering...</span>
            </div>
          )}
        </div>

        {/* List of questions */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 max-h-[260px]">
          {isLoading ? (
            <div className="py-6 flex items-center justify-center text-xs text-muted">
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              <span>Loading questions...</span>
            </div>
          ) : queuedCount === 0 ? (
            <div className="py-6 text-center text-xs text-muted px-4 space-y-1">
              <p className="font-medium text-fg">Queue is empty</p>
              <p className="text-[11px] text-subtle">
                Highlight text in any response and choose &ldquo;Add question&rdquo; to build your queue.
              </p>
            </div>
          ) : (
            questions.map((q) => {
              const userMsg = q.messages.find((m) => m.role === "USER");
              const isEditing = editingId === q.id;

              return (
                <div
                  key={q.id}
                  data-testid={`queued-question-${q.id}`}
                  className="rounded-lg border border-border/80 bg-surface-2/40 p-2.5 text-xs space-y-1.5 group"
                >
                  {/* Quoted passage snippet */}
                  <div className="border-l-2 border-accent/60 pl-2 text-[11px] italic text-subtle line-clamp-2">
                    &ldquo;{q.anchorExact}&rdquo;
                  </div>

                  {/* Question content / Edit mode */}
                  {isEditing ? (
                    <div className="space-y-1.5 pt-1">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full text-xs rounded border border-border bg-surface p-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
                        rows={2}
                        maxLength={500}
                        autoFocus
                      />
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-2 py-0.5 rounded text-[11px] text-muted hover:text-fg hover:bg-surface-2"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={(e) => saveEdit(q.id, e)}
                          className="px-2 py-0.5 rounded text-[11px] bg-accent text-accent-fg font-medium"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2 pt-0.5">
                      <p className="font-medium text-fg flex-1">
                        {userMsg?.content || "(Empty question)"}
                      </p>
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          aria-label="Edit question"
                          onClick={(e) => startEditing(q, e)}
                          className="p-1 rounded text-muted hover:text-fg hover:bg-surface-2 transition-colors"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label="Remove question"
                          onClick={(e) => handleRemoveQuestion(q.id, e)}
                          className="p-1 rounded text-muted hover:text-danger hover:bg-surface-2 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer with Ask All button and credit estimate */}
        {queuedCount > 0 && (
          <div className="border-t border-border/60 bg-surface-2/60 p-2.5 flex items-center justify-between gap-2">
            <span className="text-[11px] text-subtle font-medium">
              ~{estimatedCredits} credits
            </span>
            <Button
              type="button"
              size="sm"
              disabled={isRunning}
              onClick={handleRunBatch}
              data-testid="composer-queue-ask-all"
              className="h-7 text-xs bg-accent text-accent-fg hover:bg-accent/90 gap-1.5 font-medium cursor-pointer"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Answering...</span>
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 fill-current" />
                  <span>Ask all ({queuedCount})</span>
                </>
              )}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function QuestionQueuePopover(props: QuestionQueuePopoverProps) {
  const queryClient = React.useContext(QueryClientContext);
  if (!queryClient) {
    return (
      <button
        type="button"
        disabled
        data-testid="composer-queue-button"
        aria-label="Questions queue"
        className={cn(
          "relative flex h-7 items-center justify-center rounded-lg px-2 text-xs font-medium bg-surface-2 border-border/50 text-muted opacity-60 cursor-default border",
          props.className
        )}
      >
        <Layers className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} />
        <span>Questions</span>
      </button>
    );
  }

  return <QuestionQueuePopoverInner {...props} />;
}
