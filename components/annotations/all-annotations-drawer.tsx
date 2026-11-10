"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  MessageSquare,
  Sparkles,
  ListTodo,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { openAnnotationThread } from "@/lib/stores/thread-stack";
import { useUiStore } from "@/lib/stores/ui";
import { RenderMentions } from "./mention-textarea";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type DrawerTab = "comments" | "asks" | "queue";

interface DrawerAuthor {
  id: string;
  name?: string | null;
  username?: string | null;
}

interface DrawerAnnotation {
  id: string;
  responseId?: string | null;
  kind: "COMMENT" | "ASK";
  depth: number;
  questionState?: string | null;
  resolvedAt?: string | Date | null;
  anchorExact: string;
  createdBy?: DrawerAuthor | null;
  messages: Array<{ id: string; role: "USER" | "ASSISTANT"; content: string }>;
}

/**
 * A question that still waits in the queue (or is being answered, or could
 * not be answered). Everything else of kind ASK is an answered thread and is
 * listed under Asks, however it was asked: asked now, answered from the
 * queue, or migrated from the old "reply" kind.
 */
function isWaitingInQueue(a: DrawerAnnotation): boolean {
  if (a.kind !== "ASK") return false;
  if (a.messages.some((m) => m.role === "ASSISTANT")) return false;
  return (
    a.questionState === "QUEUED" ||
    a.questionState === "ANSWERING" ||
    a.questionState === "FAILED"
  );
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
  const t = useTranslations("Annotations.panel");
  const params = useParams();
  const workspaceId =
    propWorkspaceId || (typeof params?.id === "string" ? params.id : undefined);

  const focus = useUiStore((s) => s.rightPanelFocus);
  const activeResponseId = propActiveResponseId || focus?.responseId;

  const [activeTab, setActiveTab] = React.useState<DrawerTab>("comments");
  const [scope, setScope] = React.useState<"response" | "workspace">("workspace");
  const [annotations, setAnnotations] = React.useState<DrawerAnnotation[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);

  // A caller can ask for a tab (e.g. after the queue was answered).
  const focusTab = focus?.tab;
  React.useEffect(() => {
    if (!open || !focusTab) return;
    setActiveTab(focusTab === "comments" ? "comments" : "asks");
  }, [open, focusTab]);

  const fetchAnnotations = React.useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    setLoadFailed(false);
    try {
      const data = await api<DrawerAnnotation[]>(
        `/api/v1/workspaces/${workspaceId}/annotations`
      );
      setAnnotations(Array.isArray(data) ? data : []);
    } catch {
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  React.useEffect(() => {
    if (!open) return;
    void fetchAnnotations();
    const refresh = () => void fetchAnnotations();
    window.addEventListener("annotation-changed", refresh);
    return () => window.removeEventListener("annotation-changed", refresh);
  }, [open, fetchAnnotations]);

  const scoped = React.useMemo(
    () =>
      scope === "response" && activeResponseId
        ? annotations.filter((a) => a.responseId === activeResponseId)
        : annotations,
    [annotations, scope, activeResponseId]
  );

  const lists: Record<DrawerTab, DrawerAnnotation[]> = React.useMemo(
    () => ({
      comments: scoped.filter((a) => a.kind === "COMMENT"),
      asks: scoped.filter((a) => a.kind === "ASK" && !isWaitingInQueue(a)),
      queue: scoped.filter(isWaitingInQueue),
    }),
    [scoped]
  );

  // Opens the item's column (with its ancestor columns when it is nested).
  const handleOpenItem = (item: DrawerAnnotation) => {
    onOpenChange(false);
    void openAnnotationThread(item.id);
  };

  const tabs: Array<{
    value: DrawerTab;
    label: string;
    empty: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { value: "comments", label: t("tabComments"), empty: t("noComments"), icon: MessageSquare },
    { value: "asks", label: t("tabAsks"), empty: t("noAsks"), icon: Sparkles },
    { value: "queue", label: t("tabQueue"), empty: t("noQueued"), icon: ListTodo },
  ];

  const scopeButton = (value: "workspace" | "response", label: string) => (
    <button
      type="button"
      onClick={() => setScope(value)}
      aria-pressed={scope === value}
      className={cn(
        "px-2 py-1 rounded transition-colors",
        scope === value
          ? "bg-accent/15 text-accent font-medium"
          : "text-muted hover:text-foreground"
      )}
    >
      {label}
    </button>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col bg-background border-l border-border h-full shadow-2xl"
      >
        <SheetHeader className="p-4 border-b border-border space-y-0 shrink-0">
          <SheetTitle className="text-sm font-semibold flex items-center gap-2">
            <span>{t("title")}</span>
            <span className="text-xs font-normal text-muted">({scoped.length})</span>
          </SheetTitle>
          <SheetDescription className="sr-only">{t("description")}</SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-surface/50 text-xs shrink-0">
          {scopeButton("workspace", t("filterEntireWorkspace"))}
          {activeResponseId && scopeButton("response", t("filterThisResponse"))}
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as DrawerTab)}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid grid-cols-3 mx-4 mt-3 bg-surface/80 border border-border">
            {tabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="text-xs gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
                <span className="text-[10px] opacity-70">({lists[value].length})</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 overflow-y-auto p-4">
            {isLoading && annotations.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-muted text-xs">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span>{t("loading")}</span>
              </div>
            ) : loadFailed ? (
              <div className="text-center py-12 text-muted text-xs">{t("loadFailed")}</div>
            ) : (
              tabs.map(({ value, empty }) => (
                <TabsContent key={value} value={value} className="m-0 space-y-2.5">
                  {lists[value].length === 0 ? (
                    <div className="text-center py-12 text-muted text-xs">{empty}</div>
                  ) : (
                    lists[value].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleOpenItem(item)}
                        data-testid={`drawer-item-${item.id}`}
                        className="group block w-full text-left p-3 rounded-lg border border-border bg-surface/40 hover:bg-surface/80 hover:border-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent cursor-pointer transition-all space-y-2 text-xs"
                      >
                        <span className="flex items-center justify-between text-[11px] text-muted">
                          <span className="flex items-center gap-1.5 font-medium text-foreground">
                            {item.kind === "COMMENT"
                              ? item.createdBy?.name ||
                                item.createdBy?.username ||
                                t("member")
                              : t("level", { level: item.depth + 1 })}
                            {item.resolvedAt && (
                              <span className="font-normal text-success">{t("resolved")}</span>
                            )}
                            {value === "queue" && (
                              <span className="font-normal text-warning">
                                {item.questionState === "FAILED" ? t("failed") : t("queued")}
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-1 group-hover:text-accent transition-colors">
                            <span>{t("open")}</span>
                            <ChevronRight className="w-3 h-3" />
                          </span>
                        </span>
                        <span className="block italic line-clamp-2 text-muted/90 border-l-2 border-accent/40 pl-2">
                          «{item.anchorExact}»
                        </span>
                        <span className="block text-foreground/90 line-clamp-2">
                          {item.kind === "COMMENT" ? (
                            <RenderMentions text={item.messages[0]?.content || ""} />
                          ) : (
                            item.messages[0]?.content
                          )}
                        </span>
                      </button>
                    ))
                  )}
                </TabsContent>
              ))
            )}
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
