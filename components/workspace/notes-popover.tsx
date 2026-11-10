"use client";

import * as React from "react";
import {
  StickyNote,
  Archive,
  RotateCcw,
  Trash2,
  ExternalLink,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  useQuery,
  useQueryClient,
  QueryClientContext,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface WorkspaceNoteDto {
  id: string;
  workspaceId: string;
  annotationId: string;
  messageId: string;
  quote: string;
  instruction: string;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  archivedAt: string | null;
  createdById: string;
  author: {
    id: string;
    name: string | null;
    username: string | null;
    email: string;
    image: string | null;
  };
  annotation?: {
    id: string;
    anchorExact: string;
    versionId: string | null;
    responseId: string | null;
  };
}

export interface NotesPopoverProps {
  workspaceId?: string | null;
  currentUserId?: string;
  className?: string;
}

const BUDGET_TOKENS = 4000;

function estimateNoteTokens(quote: string, instruction: string): number {
  return Math.ceil((quote.length + instruction.length + 30) / 4);
}

function NotesPopoverInner({
  workspaceId,
  currentUserId,
  className,
}: NotesPopoverProps) {
  const t = useTranslations("Notes");
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<"ACTIVE" | "ARCHIVED" | "ALL">(
    "ACTIVE"
  );
  const [actionInProgress, setActionInProgress] = React.useState<string | null>(
    null
  );

  const setRightPanelOpen = useUiStore((s) => s.setRightPanelOpen);
  const setRightPanelFocus = useUiStore((s) => s.setRightPanelFocus);

  const queryKey = ["workspaces", workspaceId, "notes"];

  const { data, isLoading } = useQuery<{ notes: WorkspaceNoteDto[] }>({
    queryKey,
    queryFn: async () => {
      if (!workspaceId) return { notes: [] };
      return api<{ notes: WorkspaceNoteDto[] }>(
        `/api/v1/workspaces/${workspaceId}/notes`
      );
    },
    enabled: Boolean(workspaceId),
    refetchInterval: isOpen ? 5000 : 30000,
  });

  const notes = data?.notes ?? [];
  const activeNotes = notes.filter((n) => n.status === "ACTIVE");
  const activeCount = activeNotes.length;

  // Calculate budget: newest first, see if any active notes exceed 4000 tokens
  const preambleTokens = 70;
  let accumulatedTokens = preambleTokens;
  let exceedsBudget = false;

  for (const n of activeNotes) {
    const cost = estimateNoteTokens(n.quote, n.instruction);
    if (accumulatedTokens + cost <= BUDGET_TOKENS) {
      accumulatedTokens += cost;
    } else {
      exceedsBudget = true;
      break;
    }
  }

  // Filter notes
  const displayedNotes = notes.filter((n) => {
    if (filter === "ALL") return true;
    return n.status === filter;
  });

  const handleToggleStatus = async (
    noteId: string,
    currentStatus: "ACTIVE" | "ARCHIVED"
  ) => {
    const nextStatus = currentStatus === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    setActionInProgress(noteId);
    try {
      await api(`/api/v1/notes/${noteId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await queryClient.invalidateQueries({ queryKey });
      toast.success(
        nextStatus === "ARCHIVED" ? t("archived") : t("active")
      );
    } catch {
      toast.error("Failed to update note");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDelete = async (noteId: string) => {
    setActionInProgress(noteId);
    try {
      await api(`/api/v1/notes/${noteId}`, {
        method: "DELETE",
      });
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Note deleted");
    } catch {
      toast.error("Failed to delete note");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleViewInContext = (note: WorkspaceNoteDto) => {
    setIsOpen(false);
    // Dispatch custom event for nested ask column (Step F2.4 / F2.5)
    window.dispatchEvent(
      new CustomEvent("open-ask-column", {
        detail: { annotationId: note.annotationId },
      })
    );
    // Open right panel for standard view
    setRightPanelFocus({ annotationId: note.annotationId });
    setRightPanelOpen(true);
  };

  // Hidden when activeCount === 0 (per spec)
  if (activeCount === 0 && !isOpen) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-7 px-2.5 text-xs font-medium gap-1.5 border-border bg-surface hover:bg-surface-2 transition-colors",
            className
          )}
          aria-label={t("button", { count: activeCount })}
        >
          <StickyNote className="h-3.5 w-3.5 text-accent" />
          <span>{t("button", { count: activeCount })}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-96 p-0 shadow-lg border border-border bg-surface text-fg"
      >
        {/* Header */}
        <div className="p-3.5 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-accent" />
            <span className="font-semibold text-sm">{t("title")}</span>
            <span className="text-xs text-muted font-mono">({activeCount})</span>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-surface-2 p-0.5 rounded-md text-[11px]">
            <button
              type="button"
              className={cn(
                "px-2 py-0.5 rounded font-medium transition-colors",
                filter === "ACTIVE"
                  ? "bg-surface text-fg shadow-xs"
                  : "text-muted hover:text-fg"
              )}
              onClick={() => setFilter("ACTIVE")}
            >
              {t("active")}
            </button>
            <button
              type="button"
              className={cn(
                "px-2 py-0.5 rounded font-medium transition-colors",
                filter === "ARCHIVED"
                  ? "bg-surface text-fg shadow-xs"
                  : "text-muted hover:text-fg"
              )}
              onClick={() => setFilter("ARCHIVED")}
            >
              {t("archived")}
            </button>
            <button
              type="button"
              className={cn(
                "px-2 py-0.5 rounded font-medium transition-colors",
                filter === "ALL"
                  ? "bg-surface text-fg shadow-xs"
                  : "text-muted hover:text-fg"
              )}
              onClick={() => setFilter("ALL")}
            >
              {t("all")}
            </button>
          </div>
        </div>

        {/* Warning row when notes exceed context budget */}
        {exceedsBudget && (
          <div className="p-2.5 bg-warning/10 border-b border-warning/20 text-xs text-warning flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
            <span className="text-[11px] leading-tight font-medium">
              {t("warningBudget")}
            </span>
          </div>
        )}

        {/* Notes List */}
        <div className="max-h-[380px] overflow-y-auto divide-y divide-border/40 p-1">
          {isLoading ? (
            <div className="p-6 text-center text-muted text-xs flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              <span>Loading notes...</span>
            </div>
          ) : displayedNotes.length === 0 ? (
            <div className="p-6 text-center text-muted text-xs leading-relaxed">
              {t("empty")}
            </div>
          ) : (
            displayedNotes.map((note) => {
              const isWorking = actionInProgress === note.id;
              const isAuthor = currentUserId && note.createdById === currentUserId;

              return (
                <div
                  key={note.id}
                  className={cn(
                    "p-3 rounded-lg hover:bg-surface-2/40 transition-colors space-y-2 text-xs",
                    note.status === "ARCHIVED" && "opacity-60 bg-surface-2/20"
                  )}
                >
                  {/* Author & Date */}
                  <div className="flex items-center justify-between text-muted text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Avatar className="h-4 w-4 rounded-full">
                        {note.author?.image && (
                          <AvatarImage src={note.author.image} />
                        )}
                        <AvatarFallback className="text-[9px]">
                          {note.author?.name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-fg truncate">
                        {note.author?.name || "Member"}
                      </span>
                      {note.author?.username && (
                        <span className="text-muted truncate">
                          @{note.author.username}
                        </span>
                      )}
                    </div>
                    <span>
                      {new Date(note.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>

                  {/* Highlight Quote */}
                  <div className="pl-2.5 border-l-2 border-accent/60 text-fg-muted italic text-[11px] line-clamp-2">
                    «{note.quote}»
                  </div>

                  {/* Instruction */}
                  <div className="text-fg font-medium whitespace-pre-wrap leading-snug">
                    {note.instruction}
                  </div>

                  {/* Actions */}
                  <div className="pt-1 flex items-center justify-between gap-2 border-t border-border/30">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
                      onClick={() => handleViewInContext(note)}
                    >
                      <span>{t("viewInContext")}</span>
                      <ExternalLink className="h-3 w-3" />
                    </button>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isWorking}
                        className="h-6 px-1.5 text-[11px] text-muted hover:text-fg"
                        onClick={() =>
                          handleToggleStatus(note.id, note.status)
                        }
                      >
                        {note.status === "ACTIVE" ? (
                          <>
                            <Archive className="h-3 w-3 mr-1" />
                            <span>{t("archive")}</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="h-3 w-3 mr-1" />
                            <span>{t("restore")}</span>
                          </>
                        )}
                      </Button>

                      {isAuthor && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isWorking}
                          className="h-6 px-1.5 text-[11px] text-muted hover:text-danger"
                          onClick={() => handleDelete(note.id)}
                          title={t("delete")}
                          aria-label={t("delete")}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function NotesPopover(props: NotesPopoverProps) {
  const queryClient = React.useContext(QueryClientContext);
  if (!queryClient) {
    return null;
  }
  return <NotesPopoverInner {...props} />;
}
