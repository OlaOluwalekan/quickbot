"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  ArrowUpDown,
  Clock,
  Crown,
  FolderInput,
  FolderKanban,
  FolderMinus,
  LayoutGrid,
  List,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Gated } from "@/components/ui/gated";
import { Spinner } from "@/components/ui/spinner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShareAndPeopleDialog } from "@/components/workspace/ShareAndPeopleDialog";
import {
  useDeleteProject,
  useMovableWorkspaces,
  useProject,
  useProjects,
  useProjectWorkspaces,
  useUpdateProject,
  type PaginatedProjectWorkspaces,
  type ProjectDto,
  type ProjectPersonDto,
  type ProjectWorkspaceDto,
  type ProjectWorkspaceSort,
} from "@/lib/api/hooks/projects";
import {
  useCreateWorkspace,
  useDeleteWorkspace,
  useUpdateWorkspace,
} from "@/lib/api/hooks/workspaces";
import { queryKeys } from "@/lib/api/hooks/query-keys";
import type { GateReason } from "@/lib/entitlements/shared";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";
import {
  PROJECT_VIEW_MODE_KEY,
  PROJECT_WORKSPACES_PAGE_SIZE,
} from "./constants";

export interface ProjectViewProps {
  project: ProjectDto;
  initialWorkspaces: PaginatedProjectWorkspaces;
  currentUserId: string;
}

type ViewMode = "grid" | "list";
type ProjectT = ReturnType<typeof useTranslations<"Project">>;

/** Disabled-with-tooltip reason when `caps` lacks `perm`, else null. */
function gate(
  caps: readonly string[] | undefined,
  perm: string,
  action: string,
): GateReason | null {
  return caps?.includes(perm)
    ? null
    : { code: "no_permission", capability: action };
}

function initial(person?: ProjectPersonDto) {
  return (person?.name || person?.username || "?").charAt(0).toUpperCase();
}

export function ProjectView({
  project: initialProject,
  initialWorkspaces,
  currentUserId,
}: ProjectViewProps) {
  const t = useTranslations("Project");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const queryClient = useQueryClient();
  const setCurrentPageTitle = useUiStore((s) => s.setCurrentPageTitle);

  const { data: project = initialProject } = useProject(
    currentUserId,
    initialProject.id,
    { initialData: initialProject, staleTime: 30_000 },
  );

  React.useEffect(() => {
    setCurrentPageTitle(project.name);
  }, [project.name, setCurrentPageTitle]);

  // ── Permissions (server-computed; the server re-checks every action) ──
  const caps = project.capabilities;
  const isArchived = Boolean(project.archivedAt);
  const isOwner = project.role === "OWNER";
  const renameGate = gate(caps, "workspace.rename", t("caps.renameProject"));
  const archiveGate = gate(caps, "workspace.archive", t("caps.archiveProject"));
  const deleteGate = gate(caps, "workspace.delete", t("caps.deleteProject"));
  const transferGate: GateReason | null = isOwner
    ? null
    : { code: "no_permission", capability: t("caps.transferProject") };
  const createGate: GateReason | null = isArchived
    ? { code: "no_permission", capability: t("caps.createInArchived") }
    : gate(caps, "workspace.generate", t("caps.createWorkspace"));

  // ── Toolbar state ──
  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [sortBy, setSortBy] =
    React.useState<ProjectWorkspaceSort>("lastActivity");
  const [viewMode, setViewMode] = React.useState<ViewMode>("grid");

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(PROJECT_VIEW_MODE_KEY);
      // Read after mount (not in the initializer) to avoid a hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "grid" || saved === "list") setViewMode(saved);
    } catch {
      // storage unavailable — keep default
    }
  }, []);

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(PROJECT_VIEW_MODE_KEY, mode);
    } catch {
      // storage unavailable — not remembered
    }
  };

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Server-rendered first page only matches the default filters.
  const isDefaultFilters = !debouncedSearch && sortBy === "lastActivity";
  const workspacesQuery = useProjectWorkspaces(
    currentUserId,
    project.id,
    {
      q: debouncedSearch || undefined,
      sort: sortBy,
      limit: PROJECT_WORKSPACES_PAGE_SIZE,
    },
    { initialPage: isDefaultFilters ? initialWorkspaces : undefined },
  );
  const workspaces = React.useMemo(
    () => workspacesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [workspacesQuery.data],
  );
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = workspacesQuery;

  // Infinite scroll
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refreshAfterWorkspaceChange = React.useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.projects.workspacesAll(currentUserId, project.id),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.projects.detail(currentUserId, project.id),
    });
    // The sidebar tree is server-rendered by the (app) layout.
    router.refresh();
  }, [queryClient, currentUserId, project.id, router]);

  // ── Mutations ──
  const updateProject = useUpdateProject(currentUserId);
  const deleteProject = useDeleteProject(currentUserId);
  const createWorkspace = useCreateWorkspace(currentUserId);
  const updateWorkspace = useUpdateWorkspace(currentUserId);
  const deleteWorkspace = useDeleteWorkspace(currentUserId);

  // Inline project rename
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(project.name);

  const startRename = () => {
    if (renameGate) return;
    setDraftTitle(project.name);
    setIsEditingTitle(true);
  };

  const commitRename = async () => {
    setIsEditingTitle(false);
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === project.name) return;
    try {
      await updateProject.mutateAsync({
        projectId: project.id,
        input: { name: trimmed },
      });
      toast.success(t("toasts.projectRenamed"));
      router.refresh();
    } catch {
      toast.error(t("toasts.projectRenameFailed"));
    }
  };

  const toggleArchiveProject = async () => {
    try {
      await updateProject.mutateAsync({
        projectId: project.id,
        input: { archived: !isArchived },
      });
      toast.success(
        isArchived ? t("toasts.projectRestored") : t("toasts.projectArchived"),
      );
      router.refresh();
    } catch {
      toast.error(t("toasts.projectUpdateFailed"));
    }
  };

  const [deleteProjectOpen, setDeleteProjectOpen] = React.useState(false);
  const confirmDeleteProject = async () => {
    try {
      await deleteProject.mutateAsync(project.id);
      toast.success(t("toasts.projectDeleted"));
      setDeleteProjectOpen(false);
      router.push("/workspaces");
      router.refresh();
    } catch {
      toast.error(t("toasts.projectDeleteFailed"));
    }
  };

  const [shareOpen, setShareOpen] = React.useState(false);

  const handleCreateWorkspace = async () => {
    if (createGate || createWorkspace.isPending) return;
    try {
      const created = await createWorkspace.mutateAsync({
        projectId: project.id,
      });
      router.push(`/workspaces/${created.id}`);
      router.refresh();
    } catch {
      toast.error(t("toasts.workspaceCreateFailed"));
    }
  };

  // Move an existing workspace into this project
  const [moveInOpen, setMoveInOpen] = React.useState(false);
  const [moveInId, setMoveInId] = React.useState("");
  const [moveInSearch, setMoveInSearch] = React.useState("");
  const [moveInQuery, setMoveInQuery] = React.useState("");
  React.useEffect(() => {
    const timer = setTimeout(() => setMoveInQuery(moveInSearch.trim()), 250);
    return () => clearTimeout(timer);
  }, [moveInSearch]);
  const movableQuery = useMovableWorkspaces(
    currentUserId,
    project.id,
    moveInQuery,
    { enabled: moveInOpen },
  );
  const movable = movableQuery.data?.items ?? [];

  const closeMoveIn = () => {
    setMoveInOpen(false);
    setMoveInId("");
    setMoveInSearch("");
  };

  const confirmMoveIn = async () => {
    if (!moveInId) return;
    try {
      await updateWorkspace.mutateAsync({
        workspaceId: moveInId,
        input: { projectId: project.id },
      });
      toast.success(t("toasts.workspaceMovedIn"));
      closeMoveIn();
      refreshAfterWorkspaceChange();
    } catch {
      toast.error(t("toasts.workspaceMoveFailed"));
    }
  };

  // Per-workspace actions
  const [renameWs, setRenameWs] = React.useState<ProjectWorkspaceDto | null>(
    null,
  );
  const [renameWsTitle, setRenameWsTitle] = React.useState("");
  const [moveWs, setMoveWs] = React.useState<ProjectWorkspaceDto | null>(null);
  const [moveWsTarget, setMoveWsTarget] = React.useState("");
  const [deleteWs, setDeleteWs] = React.useState<ProjectWorkspaceDto | null>(
    null,
  );

  const { data: projectsData } = useProjects(currentUserId, undefined, {
    enabled: Boolean(moveWs),
  });
  const otherProjects = React.useMemo(
    () => (projectsData?.items ?? []).filter((p) => p.id !== project.id),
    [projectsData, project.id],
  );

  const runWorkspaceUpdate = async (
    workspaceId: string,
    input: { title?: string; projectId?: string | null; archived?: boolean },
    success: string,
    failure: string,
  ) => {
    try {
      await updateWorkspace.mutateAsync({ workspaceId, input });
      toast.success(success);
      refreshAfterWorkspaceChange();
      return true;
    } catch {
      toast.error(failure);
      return false;
    }
  };

  const confirmRenameWs = async () => {
    const title = renameWsTitle.trim();
    if (!renameWs || !title) return;
    const ok = await runWorkspaceUpdate(
      renameWs.id,
      { title },
      t("toasts.workspaceRenamed"),
      t("toasts.workspaceRenameFailed"),
    );
    if (ok) setRenameWs(null);
  };

  const confirmMoveWs = async () => {
    if (!moveWs || !moveWsTarget) return;
    const ok = await runWorkspaceUpdate(
      moveWs.id,
      { projectId: moveWsTarget === "none" ? null : moveWsTarget },
      t("toasts.workspaceMoved"),
      t("toasts.workspaceMoveFailed"),
    );
    if (ok) {
      setMoveWs(null);
      setMoveWsTarget("");
    }
  };

  const confirmDeleteWs = async () => {
    if (!deleteWs) return;
    try {
      await deleteWorkspace.mutateAsync(deleteWs.id);
      toast.success(t("toasts.workspaceDeleted"));
      setDeleteWs(null);
      refreshAfterWorkspaceChange();
    } catch {
      toast.error(t("toasts.workspaceDeleteFailed"));
    }
  };

  const workspaceMenu = (ws: ProjectWorkspaceDto) => {
    const wsRename = gate(ws.capabilities, "workspace.rename", t("caps.renameWorkspace"));
    const wsArchive = gate(ws.capabilities, "workspace.archive", t("caps.archiveWorkspace"));
    const wsDelete = gate(ws.capabilities, "workspace.delete", t("caps.deleteWorkspace"));
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-subtle hover:text-fg h-7 w-7 shrink-0"
            aria-label={t("workspaceOptions", { title: ws.title })}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <GatedMenuItem
            reason={wsRename}
            onSelect={() => {
              setRenameWs(ws);
              setRenameWsTitle(ws.title);
            }}
            icon={<Pencil className="mr-2 h-4 w-4" />}
            label={t("actions.rename")}
          />
          <GatedMenuItem
            reason={wsRename}
            onSelect={() => setMoveWs(ws)}
            icon={<FolderInput className="mr-2 h-4 w-4" />}
            label={t("actions.moveToProject")}
          />
          <GatedMenuItem
            reason={wsRename}
            onSelect={() =>
              void runWorkspaceUpdate(
                ws.id,
                { projectId: null },
                t("toasts.workspaceRemoved"),
                t("toasts.workspaceMoveFailed"),
              )
            }
            icon={<FolderMinus className="mr-2 h-4 w-4" />}
            label={t("actions.removeFromProject")}
          />
          <GatedMenuItem
            reason={wsArchive}
            onSelect={() =>
              void runWorkspaceUpdate(
                ws.id,
                { archived: !ws.archivedAt },
                ws.archivedAt
                  ? t("toasts.workspaceRestored")
                  : t("toasts.workspaceArchived"),
                t("toasts.workspaceUpdateFailed"),
              )
            }
            icon={
              ws.archivedAt ? (
                <ArchiveRestore className="mr-2 h-4 w-4" />
              ) : (
                <Archive className="mr-2 h-4 w-4" />
              )
            }
            label={ws.archivedAt ? t("actions.unarchive") : t("actions.archive")}
          />
          <DropdownMenuSeparator />
          <GatedMenuItem
            reason={wsDelete}
            destructive
            onSelect={() => setDeleteWs(ws)}
            icon={<Trash2 className="mr-2 h-4 w-4" />}
            label={t("actions.delete")}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const headerPeople: ProjectPersonDto[] = [
    ...(project.owner ? [project.owner] : []),
    ...(project.members ?? []).map((m) => m.user),
  ].slice(0, 4);
  const totalPeople = (project._count?.members ?? 0) + 1; // + owner

  const createButton = (
    <Gated reason={createGate}>
      <Button
        size="sm"
        className="h-9 gap-1.5 text-xs font-semibold"
        onClick={handleCreateWorkspace}
        disabled={createWorkspace.isPending}
      >
        {createWorkspace.isPending ? (
          <Spinner className="h-3.5 w-3.5" />
        ) : (
          <Plus className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{t("newWorkspace")}</span>
      </Button>
    </Gated>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto w-full max-w-7xl flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
        {/* Header */}
        <div className="border-border flex flex-col items-start justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <FolderKanban
                className="text-accent h-6 w-6 shrink-0"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {isEditingTitle ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void commitRename();
                  }}
                >
                  <Input
                    autoFocus
                    value={draftTitle}
                    aria-label={t("renameProjectLabel")}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onBlur={() => void commitRename()}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setIsEditingTitle(false);
                      }
                    }}
                    className="bg-surface h-9 text-lg font-bold"
                    maxLength={120}
                  />
                </form>
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="text-fg truncate text-xl font-bold tracking-tight sm:text-2xl">
                    {project.name}
                  </h1>
                  {!renameGate && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-subtle hover:text-fg h-7 w-7"
                      onClick={startRename}
                      aria-label={t("renameProjectLabel")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isArchived && (
                    <Badge variant="outline" className="text-muted text-xs">
                      {t("archivedBadge")}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            {project.description && (
              <p className="text-fg-muted max-w-2xl text-sm">
                {project.description}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              aria-label={t("peopleCount", { count: totalPeople })}
              className="focus-visible:ring-ring flex cursor-pointer items-center -space-x-2 rounded-full transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
            >
              {headerPeople.map((person) => (
                <Avatar
                  key={person.id}
                  className="ring-surface border-border h-8 w-8 border ring-2"
                >
                  {person.image && <AvatarImage src={person.image} alt="" />}
                  <AvatarFallback className="bg-surface-2 text-fg text-[10px] font-semibold">
                    {initial(person)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {totalPeople > headerPeople.length && (
                <span className="bg-surface-2 ring-surface text-fg flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold ring-2">
                  +{totalPeople - headerPeople.length}
                </span>
              )}
            </button>

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={() => setShareOpen(true)}
            >
              <Users className="text-accent h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("shareAndPeople")}</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-subtle hover:text-fg h-9 w-9"
                  aria-label={t("projectOptions")}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <GatedMenuItem
                  reason={renameGate}
                  onSelect={startRename}
                  icon={<Pencil className="mr-2 h-4 w-4" />}
                  label={t("actions.rename")}
                />
                <GatedMenuItem
                  reason={archiveGate}
                  onSelect={() => void toggleArchiveProject()}
                  icon={
                    isArchived ? (
                      <ArchiveRestore className="mr-2 h-4 w-4" />
                    ) : (
                      <Archive className="mr-2 h-4 w-4" />
                    )
                  }
                  label={
                    isArchived ? t("unarchiveProject") : t("archiveProject")
                  }
                />
                <GatedMenuItem
                  reason={transferGate}
                  onSelect={() => setShareOpen(true)}
                  icon={<Crown className="mr-2 h-4 w-4" />}
                  label={t("transferProject")}
                />
                <DropdownMenuSeparator />
                <GatedMenuItem
                  reason={deleteGate}
                  destructive
                  onSelect={() => setDeleteProjectOpen(true)}
                  icon={<Trash2 className="mr-2 h-4 w-4" />}
                  label={t("deleteProject")}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex max-w-md flex-1 items-center gap-2">
            <div className="relative flex-1">
              <Search
                className="text-muted absolute top-2.5 left-2.5 h-4 w-4"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder={t("searchWorkspaces")}
                aria-label={t("searchWorkspaces")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                maxLength={100}
                className="bg-surface h-9 pl-8 text-xs"
              />
            </div>
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as ProjectWorkspaceSort)}
            >
              <SelectTrigger
                className="bg-surface h-9 w-40 shrink-0 text-xs"
                aria-label={t("sortBy")}
              >
                <ArrowUpDown
                  className="text-muted mr-1 h-3.5 w-3.5"
                  aria-hidden="true"
                />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lastActivity">
                  {t("sortLastActivity")}
                </SelectItem>
                <SelectItem value="name">{t("sortName")}</SelectItem>
                <SelectItem value="createdAt">{t("sortCreatedAt")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div
              role="group"
              aria-label={t("viewMode")}
              className="border-border bg-surface-2/40 flex items-center rounded-lg border p-0.5"
            >
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => changeViewMode("grid")}
                aria-label={t("viewGrid")}
                aria-pressed={viewMode === "grid"}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => changeViewMode("list")}
                aria-label={t("viewList")}
                aria-pressed={viewMode === "list"}
              >
                <List className="h-3.5 w-3.5" />
              </Button>
            </div>
            {createButton}
          </div>
        </div>

        {/* Content */}
        {workspacesQuery.isPending ? (
          <div className="flex items-center justify-center py-20">
            <Spinner className="text-accent h-7 w-7" />
          </div>
        ) : workspacesQuery.isError ? (
          <EmptyState
            title={t("loadErrorTitle")}
            description={t("loadErrorDescription")}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => void workspacesQuery.refetch()}
              >
                {t("retry")}
              </Button>
            }
          />
        ) : workspaces.length === 0 ? (
          debouncedSearch ? (
            <EmptyState
              title={t("noMatchesTitle")}
              description={t("noMatchesDescription", { q: debouncedSearch })}
            />
          ) : (
            <EmptyState
              title={t("emptyTitle")}
              description={t("emptyDescription")}
              action={
                <div className="flex flex-col items-center gap-2 sm:flex-row">
                  {createButton}
                  <Gated reason={createGate}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 text-xs"
                      onClick={() => setMoveInOpen(true)}
                    >
                      <ArrowRightLeft
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      <span>{t("moveWorkspace")}</span>
                    </Button>
                  </Gated>
                </div>
              }
            />
          )
        ) : (
          <>
            <ul
              className={cn(
                viewMode === "grid"
                  ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                  : "border-border bg-surface divide-border divide-y overflow-hidden rounded-xl border",
              )}
            >
              {workspaces.map((ws) => (
                <WorkspaceItem
                  key={ws.id}
                  ws={ws}
                  mode={viewMode}
                  currentUserId={currentUserId}
                  menu={workspaceMenu(ws)}
                  t={t}
                />
              ))}
            </ul>
            <div ref={sentinelRef} aria-hidden="true" />
            {isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <Spinner className="text-accent h-5 w-5" />
              </div>
            )}
          </>
        )}

        {shareOpen && (
          <ShareAndPeopleDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            projectId={project.id}
            projectName={project.name}
            currentUserId={currentUserId}
          />
        )}

        <ConfirmDialog
          open={deleteProjectOpen}
          onOpenChange={setDeleteProjectOpen}
          title={t("deleteProject")}
          description={t("deleteProjectConfirm")}
          confirmLabel={t("actions.delete")}
          cancelLabel={tCommon("cancel")}
          loading={deleteProject.isPending}
          onConfirm={confirmDeleteProject}
        />

        <ConfirmDialog
          open={Boolean(deleteWs)}
          onOpenChange={(open) => !open && setDeleteWs(null)}
          title={t("deleteWorkspaceTitle")}
          description={t("deleteWorkspaceConfirm", {
            title: deleteWs?.title ?? "",
          })}
          confirmLabel={t("actions.delete")}
          cancelLabel={tCommon("cancel")}
          loading={deleteWorkspace.isPending}
          onConfirm={confirmDeleteWs}
        />

        {/* Move an existing workspace into this project */}
        <Dialog
          open={moveInOpen}
          onOpenChange={(open) => (open ? setMoveInOpen(true) : closeMoveIn())}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("moveWorkspaceTitle")}</DialogTitle>
              <DialogDescription>
                {t("moveWorkspaceDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="relative">
              <Search
                className="text-muted absolute top-2.5 left-2.5 h-4 w-4"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={moveInSearch}
                onChange={(e) => setMoveInSearch(e.target.value)}
                placeholder={t("searchWorkspaces")}
                aria-label={t("searchWorkspaces")}
                maxLength={100}
                className="h-9 pl-8 text-xs"
              />
            </div>
            {movableQuery.isPending ? (
              <div className="flex justify-center py-4">
                <Spinner className="text-accent h-5 w-5" />
              </div>
            ) : movable.length === 0 ? (
              <p className="text-muted py-2 text-xs">
                {moveInQuery
                  ? t("noMatchesDescription", { q: moveInQuery })
                  : t("noWorkspacesToMove")}
              </p>
            ) : (
              <div
                role="radiogroup"
                aria-label={t("selectWorkspace")}
                className="border-border divide-border max-h-64 divide-y overflow-y-auto rounded-lg border"
              >
                {movable.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    role="radio"
                    aria-checked={moveInId === w.id}
                    onClick={() => setMoveInId(w.id)}
                    className={cn(
                      "hover:bg-surface-2 focus-visible:ring-ring flex w-full flex-col items-start px-3 py-2 text-left focus-visible:ring-2 focus-visible:outline-none",
                      moveInId === w.id && "bg-surface-2",
                    )}
                  >
                    <span className="text-fg w-full truncate text-sm font-medium">
                      {w.title}
                    </span>
                    <span className="text-muted w-full truncate text-xs">
                      {w.project
                        ? t("currentlyIn", { name: w.project.name })
                        : t("noProject")}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {movable.length > 0 && !moveInQuery && (
              <p className="text-subtle text-xs">{t("moveSearchHint")}</p>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={closeMoveIn}>
                {tCommon("cancel")}
              </Button>
              <Button
                size="sm"
                disabled={!moveInId || updateWorkspace.isPending}
                onClick={() => void confirmMoveIn()}
              >
                {updateWorkspace.isPending ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  t("move")
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Move a workspace to another project */}
        <Dialog
          open={Boolean(moveWs)}
          onOpenChange={(open) => {
            if (!open) {
              setMoveWs(null);
              setMoveWsTarget("");
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("moveToProjectTitle")}</DialogTitle>
              <DialogDescription>
                {t("moveToProjectDescription", { title: moveWs?.title ?? "" })}
              </DialogDescription>
            </DialogHeader>
            <Select value={moveWsTarget} onValueChange={setMoveWsTarget}>
              <SelectTrigger
                className="h-9 text-xs"
                aria-label={t("selectProject")}
              >
                <SelectValue placeholder={t("selectProject")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("noProject")}</SelectItem>
                {otherProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMoveWs(null)}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                size="sm"
                disabled={!moveWsTarget || updateWorkspace.isPending}
                onClick={() => void confirmMoveWs()}
              >
                {t("move")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename a workspace */}
        <Dialog
          open={Boolean(renameWs)}
          onOpenChange={(open) => !open && setRenameWs(null)}
        >
          <DialogContent className="max-w-md">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void confirmRenameWs();
              }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle>{t("renameWorkspaceTitle")}</DialogTitle>
              </DialogHeader>
              <Input
                autoFocus
                value={renameWsTitle}
                onChange={(e) => setRenameWsTitle(e.target.value)}
                aria-label={t("workspaceName")}
                placeholder={t("workspaceName")}
                className="h-9 text-sm"
                maxLength={120}
              />
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRenameWs(null)}
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!renameWsTitle.trim() || updateWorkspace.isPending}
                >
                  {tCommon("save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function GatedMenuItem({
  reason,
  onSelect,
  icon,
  label,
  destructive,
}: {
  reason: GateReason | null;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
}) {
  return (
    <Gated reason={reason} className="flex w-full" side="left">
      <DropdownMenuItem
        disabled={Boolean(reason)}
        onSelect={onSelect}
        className={cn(
          "w-full",
          destructive && "text-danger focus:bg-danger/10 focus:text-danger",
        )}
      >
        {icon}
        <span>{label}</span>
      </DropdownMenuItem>
    </Gated>
  );
}

function WorkspaceItem({
  ws,
  mode,
  currentUserId,
  menu,
  t,
}: {
  ws: ProjectWorkspaceDto;
  mode: ViewMode;
  currentUserId: string;
  menu: React.ReactNode;
  t: ProjectT;
}) {
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const showOwner = ws.ownerId !== currentUserId && ws.owner;
  const lastActivity = format.relativeTime(
    new Date(ws.lastActivityAt ?? ws.createdAt),
    now,
  );
  const responses = t("responseCount", { count: ws._count?.responses ?? 0 });
  const ownerAvatar = showOwner ? (
    <Avatar
      className="border-border h-5 w-5 border"
      title={t("ownedBy", { name: ws.owner!.name })}
    >
      {ws.owner!.image && <AvatarImage src={ws.owner!.image} alt="" />}
      <AvatarFallback className="bg-surface-2 text-[9px]">
        {initial(ws.owner)}
      </AvatarFallback>
    </Avatar>
  ) : null;
  const archivedBadge = ws.archivedAt ? (
    <Badge variant="outline" className="text-muted shrink-0 text-[10px]">
      {t("archivedBadge")}
    </Badge>
  ) : null;

  if (mode === "list") {
    return (
      <li className="hover:bg-surface-2/40 flex items-center justify-between gap-3 px-4 py-3 transition-colors">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            href={`/workspaces/${ws.id}`}
            className="text-fg hover:text-accent truncate text-sm font-medium"
          >
            {ws.title}
          </Link>
          {archivedBadge}
        </div>
        <div className="text-muted flex shrink-0 items-center gap-4 text-xs">
          <span className="hidden items-center gap-1 sm:inline-flex">
            <MessageSquare className="h-3 w-3" aria-hidden="true" />
            {responses}
          </span>
          <span className="hidden w-28 truncate text-right sm:inline-block">
            {lastActivity}
          </span>
          {ownerAvatar}
          {menu}
        </div>
      </li>
    );
  }

  return (
    <li className="group border-border bg-surface hover:border-accent/40 flex flex-col justify-between space-y-3 rounded-xl border p-4 transition-all hover:shadow-md">
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/workspaces/${ws.id}`}
            className="text-fg hover:text-accent block flex-1 truncate text-sm font-semibold"
          >
            {ws.title}
          </Link>
          {archivedBadge}
          {menu}
        </div>
        <div className="text-muted flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {lastActivity}
          </span>
          <span aria-hidden="true">•</span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" aria-hidden="true" />
            {responses}
          </span>
        </div>
      </div>
      {showOwner && (
        <div className="border-border/40 text-muted flex items-center gap-1.5 border-t pt-2 text-xs">
          {ownerAvatar}
          <span className="truncate">{ws.owner!.name}</span>
        </div>
      )}
    </li>
  );
}
