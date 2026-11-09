"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  FolderKanban,
  Plus,
  Search,
  LayoutGrid,
  List,
  MoreVertical,
  Share2,
  Users,
  Archive,
  ArchiveRestore,
  Trash2,
  Crown,
  Pencil,
  ArrowRightLeft,
  MessageSquare,
  Clock,
  ArrowUpDown,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { ShareAndPeopleDialog } from "@/components/workspace/ShareAndPeopleDialog";
import {
  useProject,
  useProjectWorkspaces,
  useUpdateProject,
  useDeleteProject,
  type ProjectDto,
  type ProjectWorkspaceDto,
  type PaginatedProjectWorkspaces,
} from "@/lib/api/hooks/projects";
import { useWorkspaces } from "@/lib/api/hooks/workspaces";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

export interface ProjectViewProps {
  project: ProjectDto;
  initialWorkspaces: PaginatedProjectWorkspaces;
  currentUserId: string;
}

export function ProjectView({
  project: initialProject,
  initialWorkspaces,
  currentUserId,
}: ProjectViewProps) {
  const t = useTranslations("Project");
  const tApp = useTranslations("AppShell");
  const router = useRouter();

  // Queries & Mutations
  const { data: project = initialProject, refetch: refetchProject } = useProject(
    currentUserId,
    initialProject.id,
    { initialData: initialProject }
  );

  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [sortBy, setSortBy] = React.useState<"lastActivity" | "name" | "createdAt">(
    "lastActivity"
  );
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");

  // Load viewMode preference from localStorage
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("project_view_mode");
      if (saved === "grid" || saved === "list") {
        setViewMode(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleToggleViewMode = (mode: "grid" | "list") => {
    setViewMode(mode);
    try {
      localStorage.setItem("project_view_mode", mode);
    } catch {
      // ignore
    }
  };

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const {
    data: workspacesData = initialWorkspaces,
    isLoading: loadingWorkspaces,
    refetch: refetchWorkspaces,
  } = useProjectWorkspaces(
    currentUserId,
    project.id,
    {
      q: debouncedSearch.trim() || undefined,
      sort: sortBy,
      limit: 100,
    },
    { initialData: initialWorkspaces }
  );

  const workspaces = workspacesData?.items ?? [];

  // Permissions
  const isOwner = project.role === "OWNER" || project.ownerId === currentUserId;
  const isAdmin = project.role === "ADMIN" || isOwner;
  const canRename =
    isAdmin || (project.capabilities?.includes("workspace.rename") ?? false);
  const canArchive =
    isAdmin || (project.capabilities?.includes("workspace.archive") ?? false);
  const canDelete = isOwner;
  const canManageMembers =
    isAdmin || (project.capabilities?.includes("workspace.manage_members") ?? false);
  const canCreateWorkspace = project.role !== "VIEWER";

  // Mutations
  const updateProjectMutation = useUpdateProject(currentUserId);
  const deleteProjectMutation = useDeleteProject(currentUserId);

  // Rename Project State
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(project.name);
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setDraftTitle(project.name);
  }, [project.name]);

  const handleStartRename = () => {
    if (!canRename) return;
    setDraftTitle(project.name);
    setIsEditingTitle(true);
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 50);
  };

  const handleCommitRename = async () => {
    setIsEditingTitle(false);
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === project.name) return;

    try {
      await updateProjectMutation.mutateAsync({
        projectId: project.id,
        input: { name: trimmed },
      });
      toast.success(tApp("projectRenamed") || "Project renamed");
      void refetchProject();
    } catch {
      toast.error(tApp("projectRenameFailed") || "Failed to rename project");
    }
  };

  // Delete Project Dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const handleDeleteProject = async () => {
    setDeleting(true);
    try {
      await deleteProjectMutation.mutateAsync(project.id);
      toast.success(tApp("projectDeleted") || "Project deleted");
      router.push("/workspaces");
    } catch {
      toast.error(tApp("projectDeleteFailed") || "Failed to delete project");
      setDeleting(false);
    }
  };

  // Archive Project
  const handleToggleArchive = async () => {
    try {
      const isArchived = Boolean(project.archivedAt);
      await updateProjectMutation.mutateAsync({
        projectId: project.id,
        input: { archived: !isArchived },
      });
      toast.success(
        isArchived ? t("unarchiveSuccess") || "Project restored" : t("archiveSuccess") || "Project archived"
      );
      void refetchProject();
    } catch {
      toast.error("Failed to update project status");
    }
  };

  // Share & People Dialog
  const [shareOpen, setShareOpen] = React.useState(false);

  // New Workspace Creation
  const [creatingWs, setCreatingWs] = React.useState(false);

  const handleCreateWorkspace = async () => {
    if (!canCreateWorkspace || creatingWs) return;
    setCreatingWs(true);
    try {
      const res = await api<{ id: string }>("/api/v1/workspaces", {
        method: "POST",
        body: {
          title: "Untitled",
          projectId: project.id,
        },
      });
      toast.success("Workspace created");
      router.push(`/workspaces/${res.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create workspace");
      setCreatingWs(false);
    }
  };

  // Move Existing Workspace Dialog
  const [moveModalOpen, setMoveModalOpen] = React.useState(false);
  const [selectedWsIdToMove, setSelectedWsIdToMove] = React.useState<string>("");
  const [movingWs, setMovingWs] = React.useState(false);

  const { data: userWorkspacesData } = useWorkspaces(currentUserId, {
    limit: 100,
  });

  const availableToMove = React.useMemo(() => {
    const list = userWorkspacesData?.items ?? [];
    return list.filter((w) => w.projectId !== project.id && !w.deletedAt);
  }, [userWorkspacesData, project.id]);

  const handleExecuteMove = async () => {
    if (!selectedWsIdToMove || movingWs) return;
    setMovingWs(true);
    try {
      await api(`/api/v1/workspaces/${selectedWsIdToMove}`, {
        method: "PATCH",
        body: { projectId: project.id },
      });
      toast.success("Workspace moved to project");
      setMoveModalOpen(false);
      setSelectedWsIdToMove("");
      void refetchWorkspaces();
      void refetchProject();
    } catch {
      toast.error("Failed to move workspace");
    } finally {
      setMovingWs(false);
    }
  };

  // Single Workspace Actions (rename / remove from project / archive / delete)
  const [actionWs, setActionWs] = React.useState<ProjectWorkspaceDto | null>(null);
  const [wsRenameOpen, setWsRenameOpen] = React.useState(false);
  const [wsRenameTitle, setWsRenameTitle] = React.useState("");

  const handleRenameWorkspace = async () => {
    if (!actionWs || !wsRenameTitle.trim()) return;
    try {
      await api(`/api/v1/workspaces/${actionWs.id}`, {
        method: "PATCH",
        body: { title: wsRenameTitle.trim() },
      });
      toast.success("Workspace renamed");
      setWsRenameOpen(false);
      setActionWs(null);
      void refetchWorkspaces();
    } catch {
      toast.error("Failed to rename workspace");
    }
  };

  const handleRemoveWsFromProject = async (wsId: string) => {
    try {
      await api(`/api/v1/workspaces/${wsId}`, {
        method: "PATCH",
        body: { projectId: null },
      });
      toast.success("Workspace removed from project");
      void refetchWorkspaces();
      void refetchProject();
    } catch {
      toast.error("Failed to remove workspace from project");
    }
  };

  const handleToggleArchiveWs = async (ws: ProjectWorkspaceDto) => {
    try {
      const isArchived = Boolean(ws.archivedAt);
      await api(`/api/v1/workspaces/${ws.id}`, {
        method: "PATCH",
        body: { archived: !isArchived },
      });
      toast.success(isArchived ? "Workspace restored" : "Workspace archived");
      void refetchWorkspaces();
    } catch {
      toast.error("Failed to update workspace status");
    }
  };

  const handleDeleteWs = async (wsId: string) => {
    try {
      await api(`/api/v1/workspaces/${wsId}`, {
        method: "DELETE",
      });
      toast.success("Workspace deleted");
      void refetchWorkspaces();
      void refetchProject();
    } catch {
      toast.error("Failed to delete workspace");
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <FolderKanban className="h-6 w-6 text-accent shrink-0" strokeWidth={1.75} />
              {isEditingTitle ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleCommitRename();
                  }}
                  className="flex items-center gap-2"
                >
                  <Input
                    ref={titleInputRef}
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onBlur={handleCommitRename}
                    className="h-9 text-lg font-bold bg-surface"
                    maxLength={100}
                  />
                  <Button type="submit" size="sm" className="h-8 text-xs">
                    Save
                  </Button>
                </form>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-fg truncate">
                    {project.name}
                  </h1>
                  {canRename && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-subtle hover:text-fg"
                      onClick={handleStartRename}
                      title="Rename project"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {project.archivedAt && (
                    <Badge variant="outline" className="text-xs text-muted">
                      Archived
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {project.description && (
              <p className="text-sm text-fg-muted max-w-2xl">{project.description}</p>
            )}
          </div>

          {/* Right Header Actions: Members Avatars + Share + Menu */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Member avatar stack */}
            <div
              className="flex items-center -space-x-2 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setShareOpen(true)}
              title={t("shareAndPeople")}
            >
              {project.members?.slice(0, 4).map((m) => (
                <Avatar
                  key={m.id}
                  className="inline-block h-8 w-8 rounded-full ring-2 ring-surface border border-border"
                >
                  {m.user.image && <AvatarImage src={m.user.image} alt={m.user.name} />}
                  <AvatarFallback className="text-[10px] font-semibold bg-surface-2 text-fg">
                    {m.user.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              ))}
              {(project._count?.members ?? 0) > 4 && (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 ring-2 ring-surface text-[10px] font-semibold text-fg">
                  +{(project._count?.members ?? 0) - 4}
                </span>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-9 text-xs"
              onClick={() => setShareOpen(true)}
            >
              <Users className="h-3.5 w-3.5 text-accent" />
              <span>{t("shareAndPeople")}</span>
            </Button>

            {/* Project Context Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-subtle hover:text-fg">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-surface">
                {canRename && (
                  <DropdownMenuItem onClick={handleStartRename}>
                    <Pencil className="h-4 w-4 mr-2" />
                    <span>Rename</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setShareOpen(true)}>
                  <Share2 className="h-4 w-4 mr-2" />
                  <span>{t("shareAndPeople")}</span>
                </DropdownMenuItem>
                {canArchive && (
                  <DropdownMenuItem onClick={handleToggleArchive}>
                    {project.archivedAt ? (
                      <>
                        <ArchiveRestore className="h-4 w-4 mr-2" />
                        <span>{t("unarchiveProject")}</span>
                      </>
                    ) : (
                      <>
                        <Archive className="h-4 w-4 mr-2" />
                        <span>{t("archiveProject")}</span>
                      </>
                    )}
                  </DropdownMenuItem>
                )}
                {isOwner && (
                  <DropdownMenuItem onClick={() => setShareOpen(true)}>
                    <Crown className="h-4 w-4 mr-2 text-accent" />
                    <span>{t("transferProject")}</span>
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteDialogOpen(true)}
                      className="text-danger focus:text-danger focus:bg-danger/10"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      <span>{t("deleteProject")}</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Toolbar: Search, Sort, View Toggle, Create Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
              <Input
                placeholder={t("searchWorkspaces")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs bg-surface"
              />
            </div>
            <Select
              value={sortBy}
              onValueChange={(val: "lastActivity" | "name" | "createdAt") => setSortBy(val)}
            >
              <SelectTrigger className="h-9 w-36 text-xs bg-surface shrink-0">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-muted" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lastActivity">{t("sortLastActivity")}</SelectItem>
                <SelectItem value="name">{t("sortName")}</SelectItem>
                <SelectItem value="createdAt">{t("sortCreatedAt")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg border border-border p-0.5 bg-surface-2/40">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => handleToggleViewMode("grid")}
                title={t("viewGrid")}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => handleToggleViewMode("list")}
                title={t("viewList")}
              >
                <List className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Create Workspace Button (gated if VIEWER) */}
            {canCreateWorkspace ? (
              <Button
                size="sm"
                className="h-9 gap-1.5 text-xs font-semibold"
                onClick={handleCreateWorkspace}
                disabled={creatingWs}
              >
                {creatingWs ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>{t("newWorkspace")}</span>
                  </>
                )}
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" className="h-9 gap-1.5 text-xs opacity-50 cursor-not-allowed" disabled>
                      <Plus className="h-4 w-4" />
                      <span>{t("newWorkspace")}</span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("newWorkspaceDisabledTooltip")}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Content: Workspaces List / Grid or Empty State */}
        {loadingWorkspaces ? (
          <div className="flex items-center justify-center py-20">
            <Spinner className="h-7 w-7 text-accent" />
          </div>
        ) : workspaces.length === 0 ? (
          <EmptyState
            title={debouncedSearch ? "No matching workspaces" : t("emptyTitle")}
            description={
              debouncedSearch
                ? `No workspaces in this project matched "${debouncedSearch}".`
                : t("emptyDescription")
            }
            action={
              !debouncedSearch && (
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  {canCreateWorkspace ? (
                    <Button size="sm" onClick={handleCreateWorkspace} disabled={creatingWs} className="gap-1.5">
                      <Plus className="h-4 w-4" />
                      <span>{t("newWorkspace")}</span>
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button size="sm" disabled className="gap-1.5 opacity-50 cursor-not-allowed">
                            <Plus className="h-4 w-4" />
                            <span>{t("newWorkspace")}</span>
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{t("newWorkspaceDisabledTooltip")}</TooltipContent>
                    </Tooltip>
                  )}
                  {canManageMembers && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMoveModalOpen(true)}
                      className="gap-1.5"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      <span>{t("moveWorkspace")}</span>
                    </Button>
                  )}
                </div>
              )
            }
          />
        ) : viewMode === "grid" ? (
          /* Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map((ws) => {
              const isMine = ws.ownerId === currentUserId;
              const responsesCount = ws._count?.responses ?? 0;
              const relativeTime = ws.lastActivityAt
                ? formatDistanceToNow(new Date(ws.lastActivityAt), { addSuffix: true })
                : formatDistanceToNow(new Date(ws.createdAt), { addSuffix: true });

              return (
                <div
                  key={ws.id}
                  className="group relative flex flex-col justify-between p-4 rounded-xl border border-border bg-surface hover:border-accent/40 hover:shadow-md transition-all space-y-3"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/workspaces/${ws.id}`}
                        className="font-semibold text-sm text-fg hover:text-accent truncate flex-1 block"
                      >
                        {ws.title}
                      </Link>

                      {/* Workspace context menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-subtle hover:text-fg opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 bg-surface">
                          <DropdownMenuItem asChild>
                            <Link href={`/workspaces/${ws.id}`}>
                              <ExternalLink className="h-4 w-4 mr-2" />
                              <span>Open</span>
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setActionWs(ws);
                              setWsRenameTitle(ws.title);
                              setWsRenameOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            <span>Rename</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRemoveWsFromProject(ws.id)}>
                            <ArrowRightLeft className="h-4 w-4 mr-2" />
                            <span>Remove from project</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleArchiveWs(ws)}>
                            <Archive className="h-4 w-4 mr-2" />
                            <span>{ws.archivedAt ? "Restore" : "Archive"}</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteWs(ws.id)}
                            className="text-danger focus:text-danger focus:bg-danger/10"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            <span>Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{relativeTime}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        <span>
                          {responsesCount} {responsesCount === 1 ? "response" : "responses"}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Card Footer: Owner avatar if not me */}
                  {!isMine && ws.owner && (
                    <div className="flex items-center gap-1.5 pt-2 border-t border-border/40 text-xs text-muted">
                      <Avatar className="h-5 w-5 rounded-full border border-border">
                        {ws.owner.image && <AvatarImage src={ws.owner.image} alt={ws.owner.name} />}
                        <AvatarFallback className="text-[9px] bg-surface-2">
                          {ws.owner.name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{ws.owner.name}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
            {workspaces.map((ws) => {
              const isMine = ws.ownerId === currentUserId;
              const responsesCount = ws._count?.responses ?? 0;
              const relativeTime = ws.lastActivityAt
                ? formatDistanceToNow(new Date(ws.lastActivityAt), { addSuffix: true })
                : formatDistanceToNow(new Date(ws.createdAt), { addSuffix: true });

              return (
                <div
                  key={ws.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Link
                      href={`/workspaces/${ws.id}`}
                      className="font-medium text-sm text-fg hover:text-accent truncate"
                    >
                      {ws.title}
                    </Link>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted shrink-0">
                    <span className="hidden sm:inline-flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      <span>
                        {responsesCount} {responsesCount === 1 ? "response" : "responses"}
                      </span>
                    </span>

                    <span className="hidden sm:inline-block w-28 text-right truncate">
                      {relativeTime}
                    </span>

                    {!isMine && ws.owner && (
                      <Avatar className="h-6 w-6 rounded-full border border-border" title={ws.owner.name}>
                        {ws.owner.image && <AvatarImage src={ws.owner.image} alt={ws.owner.name} />}
                        <AvatarFallback className="text-[9px] bg-surface-2">
                          {ws.owner.name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-subtle hover:text-fg">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 bg-surface">
                        <DropdownMenuItem asChild>
                          <Link href={`/workspaces/${ws.id}`}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            <span>Open</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setActionWs(ws);
                            setWsRenameTitle(ws.title);
                            setWsRenameOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          <span>Rename</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRemoveWsFromProject(ws.id)}>
                          <ArrowRightLeft className="h-4 w-4 mr-2" />
                          <span>Remove from project</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleArchiveWs(ws)}>
                          <Archive className="h-4 w-4 mr-2" />
                          <span>{ws.archivedAt ? "Restore" : "Archive"}</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeleteWs(ws.id)}
                          className="text-danger focus:text-danger focus:bg-danger/10"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Share & People Dialog for Project */}
        {shareOpen && (
          <ShareAndPeopleDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            projectId={project.id}
            projectName={project.name}
            currentUserId={currentUserId}
          />
        )}

        {/* Delete Project Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="max-w-md bg-surface border-border">
            <DialogHeader>
              <DialogTitle className="text-danger flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                <span>{t("deleteProject")}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted">
                {t("deleteProjectConfirm")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteProject}
                disabled={deleting}
              >
                {deleting ? <Spinner className="h-3.5 w-3.5" /> : t("deleteProject")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Move Workspace into Project Modal */}
        <Dialog open={moveModalOpen} onOpenChange={setMoveModalOpen}>
          <DialogContent className="max-w-md bg-surface border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-fg">
                <ArrowRightLeft className="h-5 w-5 text-accent" />
                <span>{t("moveWorkspaceTitle")}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted">
                {t("moveWorkspaceDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {availableToMove.length === 0 ? (
                <p className="text-xs text-muted py-2">{t("noWorkspacesToMove")}</p>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-fg">{t("selectWorkspace")}</label>
                  <Select value={selectedWsIdToMove} onValueChange={setSelectedWsIdToMove}>
                    <SelectTrigger className="h-9 bg-surface text-xs">
                      <SelectValue placeholder={t("selectWorkspace")} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableToMove.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMoveModalOpen(false)}
                disabled={movingWs}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!selectedWsIdToMove || movingWs}
                onClick={handleExecuteMove}
              >
                {movingWs ? <Spinner className="h-3.5 w-3.5" /> : t("move")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename Workspace Modal */}
        <Dialog open={wsRenameOpen} onOpenChange={setWsRenameOpen}>
          <DialogContent className="max-w-md bg-surface border-border">
            <DialogHeader>
              <DialogTitle>Rename Workspace</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <Input
                value={wsRenameTitle}
                onChange={(e) => setWsRenameTitle(e.target.value)}
                placeholder="Workspace name"
                className="h-9 text-sm bg-surface"
                maxLength={100}
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setWsRenameOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleRenameWorkspace}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
