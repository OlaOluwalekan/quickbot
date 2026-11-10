"use client";

import * as React from "react";
import {
  ArrowLeft,
  Home,
  MoreHorizontal,
  Send,
  Loader2,
  Trash2,
  Check,
  Globe,
  Lock,
  ExternalLink,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Markdown } from "@/components/markdown";
import { MentionTextarea } from "@/components/annotations/mention-textarea";
import { RenderMentions } from "@/components/annotations";
import { ThreadBreadcrumb, type BreadcrumbItem } from "./breadcrumb";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface ThreadColumnProps {
  id: string;
  index: number;
  width: number;
  workspaceId: string;
  currentUserId?: string;
  onBack: () => void;
  onCloseAll: () => void;
  onNavigate: (index: number) => void;
  className?: string;
}

interface AnnotationAuthor {
  id: string;
  name?: string | null;
  email?: string;
  image?: string | null;
  username?: string | null;
}

interface AnnotationMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
  author?: AnnotationAuthor | null;
}

interface AnnotationDetail {
  id: string;
  workspaceId: string;
  kind: "COMMENT" | "ASK";
  depth: number;
  anchorExact: string;
  visibility: "PRIVATE" | "WORKSPACE";
  questionState?: string;
  resolvedAt?: string | null;
  createdById: string;
  createdBy: AnnotationAuthor;
  messages: AnnotationMessage[];
}

export function ThreadColumn({
  id,
  index,
  width,
  workspaceId,
  currentUserId,
  onBack,
  onCloseAll,
  onNavigate,
  className,
}: ThreadColumnProps) {
  const t = useTranslations("Threads");

  const [annotation, setAnnotation] = React.useState<AnnotationDetail | null>(null);
  const [chain, setChain] = React.useState<AnnotationDetail[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [inputText, setInputText] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Fetch full ancestor chain & target annotation
  const loadChain = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api<AnnotationDetail[] | { data: AnnotationDetail[] }>(
        `/api/v1/annotations/${id}/chain`
      );
      const list = Array.isArray(res)
        ? res
        : Array.isArray((res as { data?: unknown })?.data)
          ? ((res as { data: AnnotationDetail[] }).data)
          : [];
      setChain(list);
      const target = list[list.length - 1];
      if (target) {
        setAnnotation(target);
      }
    } catch (err) {
      console.error(err);
      toast.error(t("emptyState"));
    } finally {
      setIsLoading(false);
    }
  }, [id, t]);

  React.useEffect(() => {
    loadChain();
  }, [loadChain]);

  // Scroll to bottom on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [annotation?.messages]);

  // Keyboard navigation inside column: Esc = Back, Alt+Left = Back, Alt+Home = Main
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      // Don't trigger if focus is inside an open popover or textarea with text
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" && inputText) {
        return;
      }
      e.stopPropagation();
      onBack();
    } else if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      onBack();
    } else if (e.altKey && e.key === "Home") {
      e.preventDefault();
      e.stopPropagation();
      onCloseAll();
    }
  };

  const handleSendMessage = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isSubmitting || !annotation) return;

    setIsSubmitting(true);
    try {
      await api(`/api/v1/annotations/${annotation.id}/messages`, {
        method: "POST",
        json: { content: trimmed },
      });

      setInputText("");
      await loadChain();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleResolve = async () => {
    if (!annotation) return;
    const isResolved = Boolean(annotation.resolvedAt);

    try {
      await api(`/api/v1/annotations/${annotation.id}`, {
        method: "PATCH",
        json: { resolved: !isResolved },
      });

      setAnnotation((prev) =>
        prev ? { ...prev, resolvedAt: isResolved ? null : new Date().toISOString() } : null
      );
      toast.success(isResolved ? t("unresolve") : t("resolve"));
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleToggleVisibility = async () => {
    if (!annotation) return;
    const newVis = annotation.visibility === "PRIVATE" ? "WORKSPACE" : "PRIVATE";

    try {
      await api(`/api/v1/annotations/${annotation.id}`, {
        method: "PATCH",
        json: { visibility: newVis },
      });

      setAnnotation((prev) => (prev ? { ...prev, visibility: newVis } : null));
    } catch {
      toast.error("Failed to update visibility");
    }
  };

  const handleDelete = async () => {
    if (!annotation) return;

    try {
      await api(`/api/v1/annotations/${annotation.id}`, {
        method: "DELETE",
      });

      toast.success("Annotation deleted");
      onBack();
    } catch {
      toast.error("Failed to delete");
    }
  };

  // Build breadcrumb items from chain
  const breadcrumbItems: BreadcrumbItem[] = React.useMemo(() => {
    if (!Array.isArray(chain)) return [];
    return chain.map((item) => ({
      id: item.id,
      quote: item.anchorExact,
      depth: item.depth,
      kind: "annotation" as const,
    }));
  }, [chain]);

  const isResolved = Boolean(annotation?.resolvedAt);
  const isAuthor = annotation?.createdById === currentUserId;

  // Swipe-right on header to go Back (mobile touch)
  const touchStartXRef = React.useRef<number | null>(null);
  const handleHeaderTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      touchStartXRef.current = touch.clientX;
    }
  };
  const handleHeaderTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const touch = e.changedTouches[0];
    if (touch) {
      const deltaX = touch.clientX - touchStartXRef.current;
      if (deltaX > 60) {
        onBack();
      }
    }
    touchStartXRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      style={{ width }}
      className={cn(
        "flex flex-col h-full bg-background border-r border-border focus-visible:outline-none shrink-0 transition-[width] duration-200 ease-out motion-reduce:transition-none select-text",
        className
      )}
    >
      {/* Column Header */}
      <div
        onTouchStart={handleHeaderTouchStart}
        onTouchEnd={handleHeaderTouchEnd}
        className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border bg-background/80 backdrop-blur-sm shrink-0"
      >
        <div className="flex items-center gap-1.5 overflow-hidden">
          {/* Back button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="w-7 h-7 text-muted hover:text-foreground shrink-0"
            title={`${t("back")} (Esc)`}
            aria-label={t("back")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          {/* Breadcrumb trail */}
          <ThreadBreadcrumb
            items={breadcrumbItems}
            onNavigate={onNavigate}
            className="truncate"
          />
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onCloseAll}
            className="w-7 h-7 text-muted hover:text-foreground"
            title={`${t("main")} (Alt+Home)`}
            aria-label={t("main")}
          >
            <Home className="w-4 h-4" />
          </Button>

          {annotation && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 text-muted hover:text-foreground"
                  aria-label="Thread actions"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 text-xs">
                {annotation.kind === "COMMENT" && (
                  <DropdownMenuItem onClick={handleToggleResolve} className="cursor-pointer">
                    <Check className="w-3.5 h-3.5 mr-2" />
                    {isResolved ? t("unresolve") : t("resolve")}
                  </DropdownMenuItem>
                )}

                {isAuthor && (
                  <DropdownMenuItem onClick={handleToggleVisibility} className="cursor-pointer">
                    {annotation.visibility === "PRIVATE" ? (
                      <>
                        <Globe className="w-3.5 h-3.5 mr-2" />
                        {t("workspaceVisible")}
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5 mr-2" />
                        {t("privateVisible")}
                      </>
                    )}
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  {t("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Column Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-muted">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-xs">Loading thread…</span>
          </div>
        ) : !annotation ? (
          <div className="text-center py-12 text-muted text-xs">
            {t("emptyState")}
          </div>
        ) : (
          <>
            {/* Anchored Quote Block */}
            <div className="rounded-lg bg-surface border-l-2 border-accent p-3 text-xs text-foreground/90 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span className="flex items-center gap-1 font-medium">
                  {annotation.kind === "ASK" ? (
                    <Sparkles className="w-3 h-3 text-accent" />
                  ) : (
                    <MessageSquare className="w-3 h-3 text-accent" />
                  )}
                  {annotation.kind === "ASK" ? "Asked about" : "Quoting"}
                </span>
                <span className="text-[10px] text-muted/70">
                  Level {annotation.depth + 1}
                </span>
              </div>
              <blockquote className="italic font-sans text-xs line-clamp-3">
                «{annotation.anchorExact}»
              </blockquote>
            </div>

            {/* Thread Messages */}
            <div className="space-y-3">
              {annotation.messages.map((msg, idx) => {
                const isAssistant = msg.role === "ASSISTANT";

                return (
                  <div
                    key={msg.id || idx}
                    className={cn(
                      "rounded-lg p-3 text-xs space-y-1.5 transition-colors",
                      isAssistant
                        ? "bg-surface/50 border border-border"
                        : "bg-surface border border-border/60"
                    )}
                  >
                    {/* Message Header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-5 h-5">
                          <AvatarImage src={msg.author?.image || undefined} />
                          <AvatarFallback className="text-[10px]">
                            {isAssistant ? "AI" : (msg.author?.name || "U")[0]}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-semibold text-foreground text-xs">
                          {isAssistant ? "Klecx" : msg.author?.name || "Member"}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted">
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {/* Message Content */}
                    <div className="text-foreground/90 leading-relaxed break-words">
                      {isAssistant ? (
                        <div
                          className="prose prose-xs dark:prose-invert max-w-none"
                          data-annot-root="true"
                          data-annot-target-type="ANNOTATION_MESSAGE"
                          data-annot-target-id={msg.id}
                          data-annot-depth={annotation.depth + 1}
                          data-workspace-id={workspaceId}
                        >
                          <Markdown content={msg.content} />
                        </div>
                      ) : (
                        <RenderMentions text={msg.content} />
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </div>

      {/* Sticky Footer Composer */}
      {annotation && (
        <div className="border-t border-border p-3 bg-background/95 backdrop-blur-sm shrink-0">
          <div className="relative rounded-lg border border-border focus-within:border-accent bg-surface/40 transition-colors">
            <MentionTextarea
              workspaceId={workspaceId}
              value={inputText}
              onChange={setInputText}
              onSubmit={handleSendMessage}
              placeholder={
                annotation.kind === "ASK"
                  ? t("followUpPlaceholder")
                  : t("replyPlaceholder")
              }
              rows={2}
              className="w-full text-xs bg-transparent border-0 resize-none p-2.5 focus:ring-0 focus:outline-none text-foreground placeholder:text-muted"
            />
            <div className="flex items-center justify-end px-2.5 pb-2">
              <Button
                size="sm"
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isSubmitting}
                className="h-7 px-2.5 text-xs font-medium gap-1.5"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <span>{t("send")}</span>
                    <Send className="w-3 h-3" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
