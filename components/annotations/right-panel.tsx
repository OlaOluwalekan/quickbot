"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  X,
  MessageSquare,
  CornerDownRight,
  HelpCircle,
  MoreHorizontal,
  Check,
  Globe,
  Trash2,
  Send,
  Loader2,
  History,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Markdown } from "@/components/markdown";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

export interface AnnotationAuthor {
  id: string;
  name?: string | null;
  email?: string;
  image?: string | null;
}

export interface AnnotationMessageItem {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  generationId?: string | null;
  createdAt: string | Date;
  author?: AnnotationAuthor | null;
}

export interface AnnotationItem {
  id: string;
  workspaceId: string;
  responseId: string;
  versionId: string;
  kind: "COMMENT" | "REPLY" | "QUESTION";
  questionState?: "NONE" | "QUEUED" | "ANSWERING" | "ANSWERED" | "FAILED" | "CANCELLED";
  visibility: "PRIVATE" | "WORKSPACE";
  resolvedAt?: string | Date | null;
  detachedAt?: string | Date | null;
  anchorExact: string;
  anchorPrefix?: string;
  anchorSuffix?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  createdBy: AnnotationAuthor;
  messages: AnnotationMessageItem[];
}

export interface RightPanelProps {
  workspaceId?: string;
  activeResponseId?: string;
  className?: string;
}

export function RightPanel({
  workspaceId: propWorkspaceId,
  activeResponseId: propActiveResponseId,
  className,
}: RightPanelProps) {
  const params = useParams();
  const workspaceId =
    propWorkspaceId || (typeof params?.id === "string" ? params.id : undefined);

  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);
  const setRightPanelOpen = useUiStore((s) => s.setRightPanelOpen);
  const rightPanelWidth = useUiStore((s) => s.rightPanelWidth);
  const setRightPanelWidth = useUiStore((s) => s.setRightPanelWidth);
  const rightPanelFocus = useUiStore((s) => s.rightPanelFocus);
  const setRightPanelFocus = useUiStore((s) => s.setRightPanelFocus);

  const [scope, setScope] = React.useState<"response" | "workspace">("response");
  const [activeTab, setActiveTab] = React.useState<"comments" | "replies" | "questions">(
    "comments"
  );
  const [annotations, setAnnotations] = React.useState<AnnotationItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [replyInput, setReplyInput] = React.useState<Record<string, string>>({});
  const [replyLoading, setReplyLoading] = React.useState<Record<string, boolean>>({});
  const [expandedQuotes, setExpandedQuotes] = React.useState<Record<string, boolean>>({});
  const [isMobile, setIsMobile] = React.useState(false);

  // Resize handling
  const isResizingRef = React.useRef(false);

  // Sync focus tab when rightPanelFocus changes
  React.useEffect(() => {
    if (rightPanelFocus?.tab) {
      setActiveTab(rightPanelFocus.tab);
    }
  }, [rightPanelFocus?.tab]);

  // Check mobile viewport
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== "undefined" && window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch annotations
  const fetchAnnotations = React.useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/annotations`);
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json)
          ? json
          : [];
        setAnnotations(items);
      }
    } catch {
      // Ignore network errors in polling/loading
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  React.useEffect(() => {
    if (rightPanelOpen && workspaceId) {
      fetchAnnotations();
    }
  }, [rightPanelOpen, workspaceId, fetchAnnotations]);

  // Filtered annotations by scope and kind
  const currentResponseId =
    propActiveResponseId || rightPanelFocus?.responseId;

  const scopedAnnotations = React.useMemo(() => {
    if (scope === "response" && currentResponseId) {
      return annotations.filter((a) => a.responseId === currentResponseId);
    }
    return annotations;
  }, [annotations, scope, currentResponseId]);

  const comments = React.useMemo(
    () => scopedAnnotations.filter((a) => a.kind === "COMMENT"),
    [scopedAnnotations]
  );
  const replies = React.useMemo(
    () => scopedAnnotations.filter((a) => a.kind === "REPLY"),
    [scopedAnnotations]
  );
  const questions = React.useMemo(
    () => scopedAnnotations.filter((a) => a.kind === "QUESTION"),
    [scopedAnnotations]
  );

  // Resize handlers
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = window.innerWidth - moveEvent.clientX;
      const clampedWidth = Math.max(320, Math.min(520, newWidth));
      setRightPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Actions
  const handleToggleResolve = async (annotation: AnnotationItem) => {
    const isResolved = !!annotation.resolvedAt;
    try {
      const res = await fetch(`/api/v1/annotations/${annotation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: !isResolved }),
      });
      if (res.ok) {
        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === annotation.id
              ? { ...a, resolvedAt: isResolved ? null : new Date().toISOString() }
              : a
          )
        );
      }
    } catch {
      // Ignore
    }
  };

  const handleMakeVisible = async (annotation: AnnotationItem) => {
    try {
      const res = await fetch(`/api/v1/annotations/${annotation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: "WORKSPACE" }),
      });
      if (res.ok) {
        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === annotation.id ? { ...a, visibility: "WORKSPACE" } : a
          )
        );
      }
    } catch {
      // Ignore
    }
  };

  const handleDeleteAnnotation = async (annotationId: string) => {
    try {
      const res = await fetch(`/api/v1/annotations/${annotationId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
      }
    } catch {
      // Ignore
    }
  };

  // Follow-up reply sending via SSE
  const handleSendFollowUp = async (annotationId: string) => {
    const promptText = (replyInput[annotationId] || "").trim();
    if (!promptText || replyLoading[annotationId]) return;

    setReplyLoading((prev) => ({ ...prev, [annotationId]: true }));
    setReplyInput((prev) => ({ ...prev, [annotationId]: "" }));

    // Optimistically add user message and placeholder assistant message
    const tempUserMsgId = `user_${Date.now()}`;
    const tempAssistantMsgId = `asst_${Date.now()}`;

    setAnnotations((prev) =>
      prev.map((a) => {
        if (a.id !== annotationId) return a;
        return {
          ...a,
          messages: [
            ...a.messages,
            {
              id: tempUserMsgId,
              role: "USER",
              content: promptText,
              createdAt: new Date().toISOString(),
            },
            {
              id: tempAssistantMsgId,
              role: "ASSISTANT",
              content: "",
              createdAt: new Date().toISOString(),
            },
          ],
        };
      })
    );

    try {
      const res = await fetch(`/api/v1/annotations/${annotationId}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": `reply_${annotationId}_${Date.now()}`,
        },
        body: JSON.stringify({ prompt: promptText }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Reply stream failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const block of lines) {
          const eventLine = block.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
          const eventType = eventLine ? eventLine.replace("event:", "").trim() : "";
          const eventData = dataLine ? JSON.parse(dataLine.replace("data:", "").trim()) : {};

          if (eventType === "delta" && eventData.text) {
            setAnnotations((prev) =>
              prev.map((a) => {
                if (a.id !== annotationId) return a;
                const newMessages = a.messages.map((m) =>
                  m.id === tempAssistantMsgId
                    ? { ...m, content: m.content + eventData.text }
                    : m
                );
                return { ...a, messages: newMessages };
              })
            );
          }
        }
      }
    } catch {
      // Re-fetch to get actual persisted state on error
      fetchAnnotations();
    } finally {
      setReplyLoading((prev) => ({ ...prev, [annotationId]: false }));
    }
  };

  // Status Chip Renderer
  const renderStatusChips = (item: AnnotationItem) => {
    const isResolved = !!item.resolvedAt;
    const isDetached = !!item.detachedAt;

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {isResolved && (
          <span className="bg-success/10 text-success inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium">
            Resolved
          </span>
        )}
        {isDetached && (
          <span className="bg-muted/15 text-muted-fg inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium">
            Detached
          </span>
        )}
        {item.kind === "QUESTION" && item.questionState && (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
              item.questionState === "QUEUED" && "bg-accent/10 text-accent",
              item.questionState === "ANSWERING" && "bg-warning/10 text-warning animate-pulse",
              item.questionState === "ANSWERED" && "bg-success/10 text-success",
              item.questionState === "FAILED" && "bg-danger/10 text-danger"
            )}
          >
            {item.questionState.charAt(0) + item.questionState.slice(1).toLowerCase()}
          </span>
        )}
        {item.kind === "REPLY" && (
          <span className="bg-subtle text-subtle inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium">
            {replyLoading[item.id] ? "Answering" : "Answered"}
          </span>
        )}
      </div>
    );
  };

  // Item Card
  const renderItemCard = (item: AnnotationItem) => {
    const isQuoteExpanded = expandedQuotes[item.id] || false;
    const authorName = item.createdBy?.name || item.createdBy?.email || "User";
    const authorInitials = authorName.slice(0, 2).toUpperCase();

    const hasAssistantAnswer = item.messages.some((m) => m.role === "ASSISTANT");

    return (
      <div
        key={item.id}
        data-annotation-id={item.id}
        className={cn(
          "border-border bg-surface text-fg rounded-lg border p-3.5 shadow-xs transition-colors",
          rightPanelFocus?.annotationId === item.id && "ring-accent/40 ring-2"
        )}
      >
        {/* Header: Author + Timestamp + Status + More Menu */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="h-6 w-6 shrink-0">
              {item.createdBy?.image && (
                <AvatarImage src={item.createdBy.image} alt={authorName} />
              )}
              <AvatarFallback className="text-[10px]">{authorInitials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 truncate">
              <span className="text-fg truncate text-xs font-medium">{authorName}</span>
              <span className="text-subtle ml-1.5 text-[11px]">
                {new Date(item.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {renderStatusChips(item)}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 p-0"
                  aria-label="Annotation options"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleToggleResolve(item)}>
                  <Check className="mr-2 h-3.5 w-3.5" />
                  <span>{item.resolvedAt ? "Unresolve" : "Resolve"}</span>
                </DropdownMenuItem>
                {item.visibility === "PRIVATE" && (
                  <DropdownMenuItem onClick={() => handleMakeVisible(item)}>
                    <Globe className="mr-2 h-3.5 w-3.5" />
                    <span>Make visible to workspace</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-danger focus:text-danger"
                  onClick={() => handleDeleteAnnotation(item.id)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Quoted Passage */}
        {item.anchorExact && (
          <div className="bg-subtle/50 border-border/80 mb-3 rounded border-l-2 py-1 pl-2.5 pr-1.5">
            <p
              className={cn(
                "text-subtle text-xs italic",
                !isQuoteExpanded && "line-clamp-2"
              )}
            >
              &ldquo;{item.anchorExact}&rdquo;
            </p>
            {item.anchorExact.length > 80 && (
              <button
                type="button"
                onClick={() =>
                  setExpandedQuotes((prev) => ({
                    ...prev,
                    [item.id]: !isQuoteExpanded,
                  }))
                }
                className="text-accent hover:underline mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium"
              >
                {isQuoteExpanded ? (
                  <>
                    Show less <ChevronUp className="h-3 w-3" />
                  </>
                ) : (
                  <>
                    Show more <ChevronDown className="h-3 w-3" />
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Message Thread */}
        <div className="space-y-2.5">
          {item.messages.map((msg) => {
            const isUser = msg.role === "USER";
            return (
              <div
                key={msg.id}
                className={cn(
                  "rounded-md p-2.5 text-xs",
                  isUser
                    ? "bg-subtle text-fg"
                    : "bg-surface border-border text-fg border"
                )}
              >
                <div className="text-subtle mb-1 flex items-center justify-between text-[10px]">
                  <span className="font-semibold">{isUser ? "User" : "AI"}</span>
                  <span>
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {isUser ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="prose prose-xs max-w-none">
                    <Markdown content={msg.content} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Action Buttons for Answered Items (Step 6.7 stubs) */}
        {hasAssistantAnswer && (
          <div className="border-border/60 mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] px-2"
              onClick={() => {
                // Wired in 6.7
              }}
            >
              <History className="mr-1 h-3 w-3" />
              Add to workspace history
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] px-2"
              onClick={() => {
                // Wired in 6.7
              }}
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              New workspace from this
            </Button>
          </div>
        )}

        {/* Inline Follow-up prompt for Reply threads */}
        {item.kind === "REPLY" && (
          <div className="border-border/60 mt-3 flex items-center gap-1.5 border-t pt-2">
            <input
              type="text"
              placeholder="Ask follow-up..."
              value={replyInput[item.id] || ""}
              onChange={(e) =>
                setReplyInput((prev) => ({ ...prev, [item.id]: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendFollowUp(item.id);
                }
              }}
              disabled={replyLoading[item.id]}
              className="border-border bg-bg text-fg placeholder:text-muted focus:ring-accent flex-1 rounded px-2.5 py-1 text-xs border outline-none focus:ring-1"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              disabled={!replyInput[item.id]?.trim() || replyLoading[item.id]}
              onClick={() => handleSendFollowUp(item.id)}
              aria-label="Send follow-up"
            >
              {replyLoading[item.id] ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Empty State Helper
  const renderEmptyState = (kind: "comments" | "replies" | "questions") => (
    <div className="text-subtle flex flex-col items-center justify-center p-8 text-center">
      <div className="bg-subtle/50 mb-3 rounded-full p-3">
        {kind === "comments" && <MessageSquare className="h-6 w-6 text-muted" />}
        {kind === "replies" && <CornerDownRight className="h-6 w-6 text-muted" />}
        {kind === "questions" && <HelpCircle className="h-6 w-6 text-muted" />}
      </div>
      <p className="text-fg mb-1 text-xs font-medium">
        No {kind} in this {scope === "response" ? "response" : "workspace"} yet
      </p>
      <p className="text-subtle text-[11px]">
        Select text in a response to start
      </p>
    </div>
  );

  // Panel Content Component
  const panelContent = (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Top Header */}
      <div className="border-border flex h-14 shrink-0 items-center justify-between border-b px-4">
        <h2 className="text-fg text-sm font-semibold">Annotations & Notes</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={() => setRightPanelOpen(false)}
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>

      {/* Scope Filter Switch */}
      <div className="border-border bg-subtle/20 flex shrink-0 items-center justify-between border-b px-4 py-2">
        <span className="text-subtle text-xs font-medium">Scope</span>
        <div className="border-border bg-bg flex rounded-md border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setScope("response")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              scope === "response"
                ? "bg-surface text-fg shadow-xs"
                : "text-subtle hover:text-fg"
            )}
          >
            This response
          </button>
          <button
            type="button"
            onClick={() => setScope("workspace")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              scope === "workspace"
                ? "bg-surface text-fg shadow-xs"
                : "text-subtle hover:text-fg"
            )}
          >
            Entire workspace
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(val) =>
          setActiveTab(val as "comments" | "replies" | "questions")
        }
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="border-border shrink-0 border-b px-4 pt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="comments" className="text-xs">
              Comments ({comments.length})
            </TabsTrigger>
            <TabsTrigger value="replies" className="text-xs">
              Replies ({replies.length})
            </TabsTrigger>
            <TabsTrigger value="questions" className="text-xs">
              Questions ({questions.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab Contents: Independent scroll container isolated with overscroll-y-contain */}
        <div
          data-slot="right-panel-scroll-area"
          className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-4 outline-none"
          tabIndex={0}
          aria-label="Annotation list"
        >
          <TabsContent value="comments" className="m-0 space-y-3 outline-none">
            {comments.length === 0
              ? renderEmptyState("comments")
              : comments.map(renderItemCard)}
          </TabsContent>

          <TabsContent value="replies" className="m-0 space-y-3 outline-none">
            {replies.length === 0
              ? renderEmptyState("replies")
              : replies.map(renderItemCard)}
          </TabsContent>

          <TabsContent value="questions" className="m-0 space-y-3 outline-none">
            {questions.length === 0
              ? renderEmptyState("questions")
              : questions.map(renderItemCard)}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );

  if (!rightPanelOpen) return null;

  // Mobile drawer mode
  if (isMobile) {
    return (
      <Sheet open={rightPanelOpen} onOpenChange={setRightPanelOpen}>
        <SheetContent
          side="right"
          className="border-border bg-surface flex h-full max-h-dvh min-h-0 w-full flex-col overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Annotations & Notes</SheetTitle>
          </SheetHeader>
          {panelContent}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop resizable panel mode
  return (
    <aside
      aria-label="Annotations & Notes"
      style={{ width: `${rightPanelWidth}px` }}
      className={cn(
        "border-border bg-surface text-fg relative hidden h-full max-h-dvh min-h-0 shrink-0 flex-col overflow-hidden border-l lg:flex",
        className
      )}
    >
      {/* Resizing handle on left edge */}
      <div
        onMouseDown={handleMouseDownResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize annotations panel"
        className="hover:bg-accent/40 absolute -left-1 top-0 z-20 h-full w-2 cursor-col-resize transition-colors"
      />
      {panelContent}
    </aside>
  );
}
