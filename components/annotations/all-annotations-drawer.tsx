"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  MessageSquare,
  Sparkles,
  ListTodo,
  Check,
  Globe,
  Lock,
  Trash2,
  ExternalLink,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useThreadStackStore } from "@/lib/stores/thread-stack";
import { useUiStore } from "@/lib/stores/ui";
import { RenderMentions } from "@/components/annotations";
import { isQueuedAsk } from "@/lib/annotations/anchor";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface AnnotationAuthor {
  id: string;
  name?: string | null;
  email?: string;
  image?: string | null;
  username?: string | null;
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
  kind: "COMMENT" | "ASK";
  depth: number;
  questionState?: "NONE" | "QUEUED" | "ANSWERING" | "ANSWERED" | "FAILED" | "CANCELLED";
  visibility: "PRIVATE" | "WORKSPACE";
  resolvedAt?: string | Date | null;
  detachedAt?: string | Date | null;
  anchorExact: string;
  anchorPrefix?: string;
  anchorSuffix?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  createdById: string;
  createdBy: AnnotationAuthor;
  messages: AnnotationMessageItem[];
}

export interface AllAnnotationsDrawerProps {
  workspaceId?: string;
  activeResponseId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AllAnnotationsDrawer({
  workspaceId: propWorkspaceId,
  activeResponseId: propActiveResponseId,
  open,
  onOpenChange,
}: AllAnnotationsDrawerProps) {
  const t = useTranslations("Annotations");
  const params = useParams();
  const workspaceId =
    propWorkspaceId || (typeof params?.id === "string" ? params.id : undefined);

  const openStackEntry = useThreadStackStore((s) => s.open);
  const setStack = useThreadStackStore((s) => s.setStack);

  const [activeTab, setActiveTab] = React.useState<"comments" | "asks" | "queue">("comments");
  const [scope, setScope] = React.useState<"response" | "workspace">("workspace");
  const [annotations, setAnnotations] = React.useState<AnnotationItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  // Fetch annotations
  const fetchAnnotations = React.useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/annotations`);
      if (res.ok) {
        const json = await res.json();
        const data = json?.data?.annotations || json?.annotations || json?.data || [];
        setAnnotations(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  React.useEffect(() => {
    if (open) {
      fetchAnnotations();
    }
  }, [open, fetchAnnotations]);

  // Scope filter: response vs entire workspace
  const scopedAnnotations = React.useMemo(() => {
    if (scope === "response" && propActiveResponseId) {
      return annotations.filter((a) => a.responseId === propActiveResponseId);
    }
    return annotations;
  }, [annotations, scope, propActiveResponseId]);

  // Tab splits
  const comments = React.useMemo(
    () => scopedAnnotations.filter((a) => a.kind === "COMMENT"),
    [scopedAnnotations]
  );
  const asks = React.useMemo(
    () => scopedAnnotations.filter((a) => a.kind === "ASK" && !isQueuedAsk(a)),
    [scopedAnnotations]
  );
  const queue = React.useMemo(
    () => scopedAnnotations.filter((a) => isQueuedAsk(a)),
    [scopedAnnotations]
  );

  // Open item into nested column layout
  const handleOpenItem = async (item: AnnotationItem) => {
    if (item.depth === 0) {
      openStackEntry({ kind: "annotation", id: item.id }, { fromIndex: 0 });
      onOpenChange(false);
    } else {
      try {
        const res = await api<AnnotationItem[] | { data: AnnotationItem[] }>(
          `/api/v1/annotations/${item.id}/chain`
        );
        const list = Array.isArray(res)
          ? res
          : Array.isArray((res as { data?: unknown })?.data)
            ? ((res as { data: AnnotationItem[] }).data)
            : [];
        if (list.length > 0) {
          setStack(list.map((c) => ({ kind: "annotation", id: c.id })));
          onOpenChange(false);
          return;
        }
      } catch (err) {
        console.error(err);
      }
      openStackEntry({ kind: "annotation", id: item.id });
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col bg-background border-l border-border h-full shadow-2xl"
      >
        <SheetHeader className="p-4 border-b border-border flex flex-row items-center justify-between space-y-0 shrink-0">
          <SheetTitle className="text-sm font-semibold flex items-center gap-2">
            <span>{t("panel.title")}</span>
            <span className="text-xs font-normal text-muted">
              ({scopedAnnotations.length})
            </span>
          </SheetTitle>
        </SheetHeader>

        {/* Filter controls */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface/50 text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setScope("workspace")}
              className={cn(
                "px-2 py-1 rounded transition-colors",
                scope === "workspace"
                  ? "bg-accent/15 text-accent font-medium"
                  : "text-muted hover:text-foreground"
              )}
            >
              {t("panel.filterEntireWorkspace")}
            </button>
            {propActiveResponseId && (
              <button
                type="button"
                onClick={() => setScope("response")}
                className={cn(
                  "px-2 py-1 rounded transition-colors",
                  scope === "response"
                    ? "bg-accent/15 text-accent font-medium"
                    : "text-muted hover:text-foreground"
                )}
              >
                {t("panel.filterThisResponse")}
              </button>
            )}
          </div>
        </div>

        {/* Tabbed content */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "comments" | "asks" | "queue")}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid grid-cols-3 mx-4 mt-3 bg-surface/80 border border-border">
            <TabsTrigger value="comments" className="text-xs gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{t("panel.tabComments")}</span>
              <span className="text-[10px] opacity-70">({comments.length})</span>
            </TabsTrigger>
            <TabsTrigger value="asks" className="text-xs gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t("panel.tabAsks")}</span>
              <span className="text-[10px] opacity-70">({asks.length})</span>
            </TabsTrigger>
            <TabsTrigger value="queue" className="text-xs gap-1.5">
              <ListTodo className="w-3.5 h-3.5" />
              <span>{t("panel.tabQueue")}</span>
              <span className="text-[10px] opacity-70">({queue.length})</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted text-xs">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span>Loading…</span>
              </div>
            ) : (
              <>
                <TabsContent value="comments" className="m-0 space-y-2.5">
                  {comments.length === 0 ? (
                    <div className="text-center py-12 text-muted text-xs">
                      {t("panel.noComments")}
                    </div>
                  ) : (
                    comments.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleOpenItem(item)}
                        className="group p-3 rounded-lg border border-border bg-surface/40 hover:bg-surface/80 hover:border-accent/50 cursor-pointer transition-all space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between text-[11px] text-muted">
                          <span className="font-medium text-foreground">
                            {item.createdBy?.name || "Member"}
                          </span>
                          <span className="flex items-center gap-1 group-hover:text-accent transition-colors">
                            <span>Open</span>
                            <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>
                        <blockquote className="italic line-clamp-2 text-muted/90 border-l-2 border-accent/40 pl-2">
                          «{item.anchorExact}»
                        </blockquote>
                        <div className="text-foreground/90 line-clamp-2">
                          <RenderMentions text={item.messages[0]?.content || ""} />
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="asks" className="m-0 space-y-2.5">
                  {asks.length === 0 ? (
                    <div className="text-center py-12 text-muted text-xs">
                      {t("panel.noAsks")}
                    </div>
                  ) : (
                    asks.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleOpenItem(item)}
                        className="group p-3 rounded-lg border border-border bg-surface/40 hover:bg-surface/80 hover:border-accent/50 cursor-pointer transition-all space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between text-[11px] text-muted">
                          <span className="font-semibold text-accent flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            Level {item.depth + 1}
                          </span>
                          <span className="flex items-center gap-1 group-hover:text-accent transition-colors">
                            <span>Open</span>
                            <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>
                        <blockquote className="italic line-clamp-2 text-muted/90 border-l-2 border-accent/40 pl-2">
                          «{item.anchorExact}»
                        </blockquote>
                        <div className="text-foreground/90 font-medium line-clamp-2">
                          {item.messages[0]?.content}
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="queue" className="m-0 space-y-2.5">
                  {queue.length === 0 ? (
                    <div className="text-center py-12 text-muted text-xs">
                      {t("panel.noQueued")}
                    </div>
                  ) : (
                    queue.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleOpenItem(item)}
                        className="group p-3 rounded-lg border border-border bg-surface/40 hover:bg-surface/80 hover:border-accent/50 cursor-pointer transition-all space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between text-[11px] text-muted">
                          <span className="font-semibold text-warning flex items-center gap-1">
                            <ListTodo className="w-3 h-3" />
                            Queued
                          </span>
                          <span className="flex items-center gap-1 group-hover:text-accent transition-colors">
                            <span>Open</span>
                            <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>
                        <blockquote className="italic line-clamp-2 text-muted/90 border-l-2 border-warning/40 pl-2">
                          «{item.anchorExact}»
                        </blockquote>
                        <div className="text-foreground/90 font-medium line-clamp-2">
                          {item.messages[0]?.content}
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
