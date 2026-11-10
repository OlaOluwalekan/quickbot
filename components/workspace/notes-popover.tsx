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
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { openAnnotationThread } from "@/lib/stores/thread-stack";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface WorkspaceNoteDto {
  id: string;
  annotationId: string;
  quote: string;
  instruction: string;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  archivedAt: string | null;
  author: {
    name: string | null;
    username: string | null;
    image: string | null;
  };
  /** Server-decided: the caller is the author or a workspace admin. */
  canManage: boolean;
}

interface NotesResponse {
  notes: WorkspaceNoteDto[];
  /** True when the oldest active notes no longer fit into the prompt. */
  overBudget: boolean;
}

export interface NotesPopoverProps {
  workspaceId?: string | null;
  className?: string;
}

const FILTERS = ["ACTIVE", "ARCHIVED", "ALL"] as const;
type NotesFilter = (typeof FILTERS)[number];

function NotesPopoverInner({ workspaceId, className }: NotesPopoverProps) {
  const t = useTranslations("Notes");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<NotesFilter>("ACTIVE");
  const [actionInProgress, setActionInProgress] = React.useState<string | null>(
    null
  );


  const queryKey = React.useMemo(
    () => ["workspaces", workspaceId, "notes"],
    [workspaceId]
  );

  const { data, isLoading } = useQuery<NotesResponse>({
    queryKey,
    queryFn: () =>
      api<NotesResponse>(`/api/v1/workspaces/${workspaceId}/notes`),
    enabled: Boolean(workspaceId),
    // Other members can add notes too; poll slowly, faster while open.
    refetchInterval: isOpen ? 10_000 : 60_000,
  });

  // A saved, edited, resolved or deleted comment can add or archive a note.
  React.useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey });
    };
    window.addEventListener("annotation-changed", refresh);
    return () => window.removeEventListener("annotation-changed", refresh);
  }, [queryClient, queryKey]);

  const notes = data?.notes ?? [];
  const activeCount = notes.filter((n) => n.status === "ACTIVE").length;
  const displayedNotes =
    filter === "ALL" ? notes : notes.filter((n) => n.status === filter);

  const filterLabels: Record<NotesFilter, string> = {
    ACTIVE: t("active"),
    ARCHIVED: t("archived"),
    ALL: t("all"),
  };

  const handleToggleStatus = async (note: WorkspaceNoteDto) => {
    const nextStatus = note.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    setActionInProgress(note.id);
    try {
      await api(`/api/v1/notes/${note.id}`, {
        method: "PATCH",
        json: { status: nextStatus },
      });
      await queryClient.invalidateQueries({ queryKey });
      toast.success(
        nextStatus === "ARCHIVED" ? t("noteArchived") : t("noteRestored")
      );
    } catch {
      toast.error(t("updateFailed"));
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDelete = async (note: WorkspaceNoteDto) => {
    setActionInProgress(note.id);
    try {
      await api(`/api/v1/notes/${note.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey });
      toast.success(t("noteDeleted"));
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      setActionInProgress(null);
    }
  };

  // "View in context" opens the column of the comment that recorded the
  // note (with its ancestor columns when the comment is nested).
  const handleViewInContext = (note: WorkspaceNoteDto) => {
    setIsOpen(false);
    void openAnnotationThread(note.annotationId);
  };

  // Hidden while the workspace has no notes at all. It stays visible when
  // every note is archived, otherwise nothing could be restored.
  if (notes.length === 0 && !isOpen) {
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
          <div
            role="group"
            aria-label={t("filter")}
            className="flex items-center gap-1 bg-surface-2 p-0.5 rounded-md text-[11px]"
          >
            {FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                className={cn(
                  "px-2 py-0.5 rounded font-medium transition-colors",
                  filter === value
                    ? "bg-surface text-fg shadow-xs"
                    : "text-muted hover:text-fg"
                )}
                onClick={() => setFilter(value)}
              >
                {filterLabels[value]}
              </button>
            ))}
          </div>
        </div>

        {/* Warning row when notes exceed context budget */}
        {data?.overBudget && (
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
              <span>{t("loading")}</span>
            </div>
          ) : displayedNotes.length === 0 ? (
            <div className="p-6 text-center text-muted text-xs leading-relaxed">
              {t("empty")}
            </div>
          ) : (
            displayedNotes.map((note) => {
              const isWorking = actionInProgress === note.id;
              const authorName =
                note.author.name || note.author.username || t("unknownAuthor");

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
                        {note.author.image && (
                          <AvatarImage src={note.author.image} alt="" />
                        )}
                        <AvatarFallback className="text-[9px]">
                          {authorName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-fg truncate">
                        {authorName}
                      </span>
                      {note.author.username && (
                        <span className="text-muted truncate">
                          @{note.author.username}
                        </span>
                      )}
                    </div>
                    <span>
                      {format.dateTime(new Date(note.createdAt), {
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

                    {note.canManage && (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isWorking}
                          className="h-6 px-1.5 text-[11px] text-muted hover:text-fg"
                          onClick={() => handleToggleStatus(note)}
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isWorking}
                          className="h-6 px-1.5 text-[11px] text-muted hover:text-danger"
                          onClick={() => handleDelete(note)}
                          title={t("delete")}
                          aria-label={t("delete")}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
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
