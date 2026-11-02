"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Coins,
  FolderInput,
  FolderKanban,
  HelpCircle,
  Laptop,
  LogOut,
  MessageSquare,
  MessageSquarePlus,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Settings,
  Share2,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/utils/format";
import { authClient } from "@/lib/auth-client";
import { clearAllClientCaches } from "@/components/providers/query-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Logo from "@/components/logo/Logo";
import AppName from "@/components/logo/AppName";
import type {
  AppShellUser,
  SidebarProjectItem,
  SidebarWorkspaceItem,
} from "./types";

export type DateBucket = "today" | "yesterday" | "previous7Days" | "older";

export function getDateBucket(isoDate: string, now = new Date()): DateBucket {
  const date = new Date(isoDate);
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOf7DaysAgo = new Date(startOfToday);
  startOf7DaysAgo.setDate(startOf7DaysAgo.getDate() - 7);

  if (date >= startOfToday) return "today";
  if (date >= startOfYesterday) return "yesterday";
  if (date >= startOf7DaysAgo) return "previous7Days";
  return "older";
}

export interface SidebarProps {
  user: AppShellUser;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  activeWorkspaceId: string | null;
  projects: SidebarProjectItem[];
  workspaces: SidebarWorkspaceItem[];
  onOpenSearch: () => void;
  onNavigate?: () => void;
  onRequestCreateProject: () => void;
  onRequestRenameWorkspace: (workspace: SidebarWorkspaceItem) => void;
  onMoveWorkspace: (
    workspaceId: string,
    projectId: string | null
  ) => Promise<void>;
  onArchiveWorkspace: (workspaceId: string) => Promise<void>;
  onRequestDeleteWorkspace: (workspace: SidebarWorkspaceItem) => void;
  isMobileDrawer?: boolean;
}

export function Sidebar({
  user,
  collapsed,
  onToggleCollapsed,
  activeWorkspaceId,
  projects,
  workspaces,
  onOpenSearch,
  onNavigate,
  onRequestCreateProject,
  onRequestRenameWorkspace,
  onMoveWorkspace,
  onArchiveWorkspace,
  onRequestDeleteWorkspace,
  isMobileDrawer = false,
}: SidebarProps) {
  const t = useTranslations("AppShell");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setTheme } = useTheme();

  const [projectsSectionOpen, setProjectsSectionOpen] = React.useState(true);
  const [expandedProjectIds, setExpandedProjectIds] = React.useState<
    Record<string, boolean>
  >({});
  const [sharedSectionOpen, setSharedSectionOpen] = React.useState(true);

  const toggleProjectNode = (projectId: string) => {
    setExpandedProjectIds((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const { standaloneByBucket, projectWorkspacesMap, sharedWorkspaces } =
    React.useMemo(() => {
      const buckets: Record<DateBucket, SidebarWorkspaceItem[]> = {
        today: [],
        yesterday: [],
        previous7Days: [],
        older: [],
      };
      const byProject: Record<string, SidebarWorkspaceItem[]> = {};
      const shared: SidebarWorkspaceItem[] = [];

      for (const ws of workspaces) {
        if (ws.ownerId && ws.ownerId !== user.id) {
          shared.push(ws);
          continue;
        }
        if (ws.projectId) {
          const list = byProject[ws.projectId] ?? [];
          list.push(ws);
          byProject[ws.projectId] = list;
        } else {
          const bucket = getDateBucket(ws.updatedAt);
          buckets[bucket].push(ws);
        }
      }

      return {
        standaloneByBucket: buckets,
        projectWorkspacesMap: byProject,
        sharedWorkspaces: shared,
      };
    }, [workspaces, user.id]);

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          clearAllClientCaches(queryClient);
          router.push("/auth/login");
          router.refresh();
        },
      },
    });
  };

  const handleShareClick = () => {
    toast.info(t("shareComingSoon"));
  };

  const renderWorkspaceRow = (ws: SidebarWorkspaceItem, nested = false) => {
    const isActive = activeWorkspaceId === ws.id;

    if (collapsed && !isMobileDrawer) {
      return (
        <Tooltip key={ws.id}>
          <TooltipTrigger asChild>
            <Link
              href={`/workspaces/${ws.id}`}
              aria-current={isActive ? "page" : undefined}
              aria-label={ws.title}
              onClick={onNavigate}
              className={cn(
                "focus-visible:ring-ring mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none",
                isActive
                  ? "bg-accent-soft text-accent border-border border font-medium"
                  : "text-muted hover:bg-surface-2 hover:text-fg"
              )}
            >
              <MessageSquare className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{ws.title}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <div
        key={ws.id}
        className={cn(
          "group flex items-center justify-between gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors sm:text-sm",
          nested && "pl-6",
          isActive
            ? "bg-accent-soft text-accent border-border border font-medium"
            : "text-muted hover:bg-surface-2 hover:text-fg"
        )}
      >
        <Link
          href={`/workspaces/${ws.id}`}
          aria-current={isActive ? "page" : undefined}
          onClick={onNavigate}
          className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-2 truncate rounded-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <MessageSquare
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              isActive ? "text-accent" : "text-subtle"
            )}
            strokeWidth={1.5}
          />
          <span className="truncate">{ws.title}</span>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${t("workspaceOptions")}: ${ws.title}`}
              className="text-subtle hover:bg-surface-3 hover:text-fg focus-visible:ring-ring shrink-0 cursor-pointer rounded-md p-1 opacity-100 focus:opacity-100 focus-visible:ring-2 focus-visible:outline-none sm:opacity-0 sm:group-hover:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => onRequestRenameWorkspace(ws)}>
              <Pencil className="h-4 w-4" strokeWidth={1.5} />
              <span>{t("rename")}</span>
            </DropdownMenuItem>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="h-4 w-4" strokeWidth={1.5} />
                <span>{t("moveToProject")}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuItem
                  disabled={ws.projectId === null}
                  onSelect={() => onMoveWorkspace(ws.id, null)}
                >
                  <span>{t("noProject")}</span>
                </DropdownMenuItem>
                {projects.map((proj) => (
                  <DropdownMenuItem
                    key={proj.id}
                    disabled={ws.projectId === proj.id}
                    onSelect={() => onMoveWorkspace(ws.id, proj.id)}
                  >
                    <FolderKanban className="h-4 w-4" strokeWidth={1.5} />
                    <span className="truncate">{proj.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuItem onSelect={handleShareClick}>
              <Share2 className="h-4 w-4" strokeWidth={1.5} />
              <span>{t("share")}</span>
            </DropdownMenuItem>

            <DropdownMenuItem onSelect={() => onArchiveWorkspace(ws.id)}>
              <Archive className="h-4 w-4" strokeWidth={1.5} />
              <span>{t("archive")}</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="text-danger focus:text-danger"
              onSelect={() => onRequestDeleteWorkspace(ws)}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              <span>{t("delete")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const userInitials = (user.name || user.email || "K")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isCollapsedRail = collapsed && !isMobileDrawer;

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        aria-label="Sidebar navigation"
        data-collapsed={isCollapsedRail ? "true" : "false"}
        className={cn(
          "border-border bg-surface text-fg flex h-full flex-col border-r transition-[width] duration-200 ease-in-out select-none",
          isCollapsedRail ? "w-16" : "w-70"
        )}
      >
        {/* Top Brand + Collapse Rail Toggle */}
        <div
          className={cn(
            "border-border flex h-14 shrink-0 items-center border-b px-3",
            isCollapsedRail ? "justify-center" : "justify-between"
          )}
        >
          {!isCollapsedRail && (
            <Link
              href="/workspaces"
              onClick={onNavigate}
              className="focus-visible:ring-ring flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:outline-none"
            >
              <Logo size="icon" />
              <AppName />
            </Link>
          )}

          {!isMobileDrawer && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={
                    isCollapsedRail ? t("expandSidebar") : t("collapseSidebar")
                  }
                  aria-expanded={!isCollapsedRail}
                  onClick={onToggleCollapsed}
                >
                  {isCollapsedRail ? (
                    <PanelLeftOpen className="h-4 w-4" strokeWidth={1.5} />
                  ) : (
                    <PanelLeftClose className="h-4 w-4" strokeWidth={1.5} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <span>
                  {isCollapsedRail ? t("expandSidebar") : t("collapseSidebar")}{" "}
                  <kbd className="bg-surface-3 ml-1 rounded px-1 py-0.5 font-mono text-[10px]">
                    [
                  </kbd>
                </span>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Primary Actions: New Workspace & Search (Command Palette) */}
        <div className="border-border flex flex-col gap-1.5 border-b p-2.5">
          {isCollapsedRail ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    size="icon"
                    className="mx-auto"
                    aria-label={t("newWorkspace")}
                  >
                    <Link href="/workspaces" onClick={onNavigate}>
                      <MessageSquarePlus
                        className="h-4 w-4"
                        strokeWidth={1.5}
                      />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {t("newWorkspace")}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="mx-auto"
                    aria-label={t("search")}
                    onClick={onOpenSearch}
                  >
                    <Search className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <span>
                    {t("search")}{" "}
                    <kbd className="bg-surface-3 ml-1 rounded px-1 py-0.5 font-mono text-[10px]">
                      ⌘K
                    </kbd>
                  </span>
                </TooltipContent>
              </Tooltip>
            </>
          ) : (
            <>
              <Button asChild className="w-full justify-start gap-2">
                <Link href="/workspaces" onClick={onNavigate}>
                  <MessageSquarePlus className="h-4 w-4" strokeWidth={1.5} />
                  <span>{t("newWorkspace")}</span>
                </Link>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={onOpenSearch}
                className="text-muted hover:text-fg w-full justify-between"
              >
                <span className="flex items-center gap-2">
                  <Search className="h-4 w-4" strokeWidth={1.5} />
                  <span>{t("search")}</span>
                </span>
                <kbd className="border-border bg-surface-2 text-subtle rounded border px-1.5 py-0.5 font-mono text-[10px]">
                  Ctrl K
                </kbd>
              </Button>
            </>
          )}
        </div>

        {/* Scrollable Navigation Content */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-2.5">
          {/* Projects Tree */}
          <div>
            {isCollapsedRail ? (
              <div className="flex flex-col items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("newProject")}
                      onClick={onRequestCreateProject}
                    >
                      <FolderKanban
                        className="text-accent h-4 w-4"
                        strokeWidth={1.5}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{t("projects")}</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between px-2 py-1">
                  <button
                    type="button"
                    aria-expanded={projectsSectionOpen}
                    onClick={() => setProjectsSectionOpen((o) => !o)}
                    className="text-subtle hover:text-fg focus-visible:ring-ring flex cursor-pointer items-center gap-1 rounded-sm text-[11px] font-semibold tracking-wider uppercase focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {projectsSectionOpen ? (
                      <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
                    ) : (
                      <ChevronRight className="h-3 w-3" strokeWidth={1.5} />
                    )}
                    <span>{t("projects")}</span>
                  </button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    aria-label={t("newProject")}
                    tooltip={t("newProject")}
                    onClick={onRequestCreateProject}
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>
                </div>

                {projectsSectionOpen && (
                  <div className="mt-1 space-y-0.5">
                    {projects.length === 0 ? (
                      <p className="text-subtle px-2 py-1 text-xs">
                        {t("noProjects")}
                      </p>
                    ) : (
                      projects.map((project) => {
                        const isExpanded = Boolean(
                          expandedProjectIds[project.id]
                        );
                        const childWorkspaces =
                          projectWorkspacesMap[project.id] ?? [];

                        return (
                          <div key={project.id} className="space-y-0.5">
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              onClick={() => toggleProjectNode(project.id)}
                              className="text-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-ring flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs focus-visible:ring-2 focus-visible:outline-none sm:text-sm"
                            >
                              <span className="flex min-w-0 items-center gap-2 truncate">
                                {isExpanded ? (
                                  <ChevronDown
                                    className="text-subtle h-3.5 w-3.5 shrink-0"
                                    strokeWidth={1.5}
                                  />
                                ) : (
                                  <ChevronRight
                                    className="text-subtle h-3.5 w-3.5 shrink-0"
                                    strokeWidth={1.5}
                                  />
                                )}
                                <FolderKanban
                                  className="text-accent h-3.5 w-3.5 shrink-0"
                                  strokeWidth={1.5}
                                />
                                <span className="truncate font-medium">
                                  {project.name}
                                </span>
                              </span>
                              <span className="text-subtle text-[11px]">
                                {childWorkspaces.length}
                              </span>
                            </button>

                            {isExpanded && childWorkspaces.length > 0 && (
                              <div className="space-y-0.5">
                                {childWorkspaces.map((ws) =>
                                  renderWorkspaceRow(ws, true)
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Standalone Workspaces Grouped by Date */}
          <div className="space-y-3">
            {!isCollapsedRail && (
              <div className="px-2">
                <span className="text-subtle text-[11px] font-semibold tracking-wider uppercase">
                  {t("workspaces")}
                </span>
              </div>
            )}

            {(
              ["today", "yesterday", "previous7Days", "older"] as DateBucket[]
            ).map((bucket) => {
              const items = standaloneByBucket[bucket];
              if (items.length === 0) return null;

              return (
                <div key={bucket} className="space-y-0.5">
                  {!isCollapsedRail && (
                    <div className="px-2 pt-1">
                      <span className="text-subtle text-[11px] font-medium">
                        {t(bucket)}
                      </span>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {items.map((ws) => renderWorkspaceRow(ws, false))}
                  </div>
                </div>
              );
            })}

            {!isCollapsedRail &&
              standaloneByBucket.today.length === 0 &&
              standaloneByBucket.yesterday.length === 0 &&
              standaloneByBucket.previous7Days.length === 0 &&
              standaloneByBucket.older.length === 0 && (
                <p className="text-subtle px-2 py-1 text-xs">
                  {t("noWorkspaces")}
                </p>
              )}
          </div>

          {/* Shared With Me */}
          {sharedWorkspaces.length > 0 && (
            <div>
              {isCollapsedRail ? (
                <div className="border-border flex flex-col items-center gap-1 border-t pt-2">
                  {sharedWorkspaces.map((ws) => renderWorkspaceRow(ws, false))}
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    aria-expanded={sharedSectionOpen}
                    onClick={() => setSharedSectionOpen((o) => !o)}
                    className="text-subtle hover:text-fg focus-visible:ring-ring flex w-full cursor-pointer items-center gap-1 rounded-sm px-2 py-1 text-[11px] font-semibold tracking-wider uppercase focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {sharedSectionOpen ? (
                      <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
                    ) : (
                      <ChevronRight className="h-3 w-3" strokeWidth={1.5} />
                    )}
                    <Users className="mr-0.5 h-3 w-3" strokeWidth={1.5} />
                    <span>{t("sharedWithMe")}</span>
                  </button>

                  {sharedSectionOpen && (
                    <div className="mt-1 space-y-0.5">
                      {sharedWorkspaces.map((ws) =>
                        renderWorkspaceRow(ws, false)
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer: Credits Meter + User Menu */}
        <div className="border-border shrink-0 space-y-2 border-t p-2.5">
          {/* Credits Meter */}
          {isCollapsedRail ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/settings"
                  aria-label={t("creditsBalance", {
                    count: formatNumber(user.creditBalance),
                  })}
                  onClick={onNavigate}
                  className="bg-surface-2 text-accent hover:bg-surface-3 focus-visible:ring-ring mx-auto flex h-9 w-9 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Coins className="h-4 w-4" strokeWidth={1.5} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="text-xs">
                  <p className="font-semibold">
                    {t("creditsPlan", { plan: user.planName })}
                  </p>
                  <p className="text-muted">
                    {t("creditsBalance", {
                      count: formatNumber(user.creditBalance),
                    })}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="border-border bg-surface-2 flex items-center justify-between rounded-xl border px-3 py-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <Coins
                  className="text-accent h-3.5 w-3.5 shrink-0"
                  strokeWidth={1.5}
                />
                <div className="truncate">
                  <span className="text-fg font-semibold">
                    {t("creditsPlan", { plan: user.planName })}
                  </span>
                  <span className="text-subtle mx-1.5">·</span>
                  <span className="text-muted">
                    {t("creditsBalance", {
                      count: formatNumber(user.creditBalance),
                    })}
                  </span>
                </div>
              </div>
              <Link
                href="/settings"
                onClick={onNavigate}
                className="text-accent focus-visible:ring-ring shrink-0 rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                {t("usageLink")}
              </Link>
            </div>
          )}

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {isCollapsedRail ? (
                <button
                  type="button"
                  aria-label={user.name || user.email}
                  className="focus-visible:ring-ring mx-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Avatar className="h-8 w-8">
                    {user.image && (
                      <AvatarImage src={user.image} alt={user.name} />
                    )}
                    <AvatarFallback>{userInitials}</AvatarFallback>
                  </Avatar>
                </button>
              ) : (
                <button
                  type="button"
                  className="hover:bg-surface-2 focus-visible:ring-ring flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    {user.image && (
                      <AvatarImage src={user.image} alt={user.name} />
                    )}
                    <AvatarFallback>{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-fg truncate text-xs font-medium sm:text-sm">
                      {user.name || user.email}
                    </p>
                    <p className="text-subtle truncate text-[11px]">
                      {user.email}
                    </p>
                  </div>
                </button>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-0.5">
                  <p className="text-fg truncate text-sm font-medium">
                    {user.name}
                  </p>
                  <p className="text-subtle truncate text-xs">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={() => {
                  onNavigate?.();
                  router.push("/settings");
                }}
              >
                <Settings className="h-4 w-4" strokeWidth={1.5} />
                <span>{t("settings")}</span>
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Sun className="h-4 w-4" strokeWidth={1.5} />
                  <span>{t("theme")}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onSelect={() => setTheme("light")}>
                    <Sun className="h-4 w-4" strokeWidth={1.5} />
                    <span>{t("themeLight")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setTheme("dark")}>
                    <Moon className="h-4 w-4" strokeWidth={1.5} />
                    <span>{t("themeDark")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setTheme("system")}>
                    <Laptop className="h-4 w-4" strokeWidth={1.5} />
                    <span>{t("themeSystem")}</span>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuItem
                onSelect={() => {
                  window.open("/help", "_blank", "noopener");
                }}
              >
                <HelpCircle className="h-4 w-4" strokeWidth={1.5} />
                <span>{t("help")}</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="text-danger focus:text-danger"
                onSelect={handleSignOut}
              >
                <LogOut className="h-4 w-4" strokeWidth={1.5} />
                <span>{t("signOut")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}

export default Sidebar;
