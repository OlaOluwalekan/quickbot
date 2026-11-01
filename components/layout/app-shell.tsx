"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { useUiStore, writeSidebarCookie } from "@/lib/stores/ui";
import {
  createProjectSchema,
  updateWorkspaceSchema,
  type CreateProjectInput,
  type UpdateWorkspaceInput,
} from "@/lib/schemas/workspace";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import type {
  AppShellUser,
  SidebarProjectItem,
  SidebarWorkspaceItem,
} from "./types";

export interface AppShellProps {
  user: AppShellUser;
  initialSidebarCollapsed: boolean;
  initialProjects: SidebarProjectItem[];
  initialWorkspaces: SidebarWorkspaceItem[];
  children: React.ReactNode;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

export function AppShell({
  user,
  initialSidebarCollapsed,
  initialProjects,
  initialWorkspaces,
  children,
}: AppShellProps) {
  const t = useTranslations("AppShell");
  const tChat = useTranslations("Chat");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const pathname = usePathname() || "/workspaces";

  // Keep server-rendered collapse state until hydrated so reload never flashes
  const storeCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const setStoreSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setStoreSidebarCollapsed(initialSidebarCollapsed);
    setHydrated(true);
  }, [initialSidebarCollapsed, setStoreSidebarCollapsed]);

  const collapsed = hydrated ? storeCollapsed : initialSidebarCollapsed;

  const handleToggleCollapsed = React.useCallback(() => {
    const next = !collapsed;
    writeSidebarCookie(next);
    setStoreSidebarCollapsed(next);
  }, [collapsed, setStoreSidebarCollapsed]);

  const mobileNavIsOpen = useUiStore((s) => s.mobileNavIsOpen);
  const toggleMobileNavOpen = useUiStore((s) => s.toggleMobileNavOpen);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);
  const setRightPanelOpen = useUiStore((s) => s.setRightPanelOpen);
  const currentPageId = useUiStore((s) => s.currentPageId);
  const setCurrentPageTitle = useUiStore((s) => s.setCurrentPageTitle);

  const [projects, setProjects] =
    React.useState<SidebarProjectItem[]>(initialProjects);
  const [workspaces, setWorkspaces] =
    React.useState<SidebarWorkspaceItem[]>(initialWorkspaces);

  React.useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  React.useEffect(() => {
    setWorkspaces(initialWorkspaces);
  }, [initialWorkspaces]);

  const activeWorkspaceId = React.useMemo(() => {
    if (
      pathname.startsWith("/workspaces/") &&
      pathname !== "/workspaces" &&
      pathname.split("/").length >= 3
    ) {
      return pathname.split("/")[2] || null;
    }
    return currentPageId;
  }, [pathname, currentPageId]);

  const activeWorkspace = React.useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  );

  // Global keyboard shortcuts: `[` for sidebar collapse, `Ctrl/⌘ + K` for Command Palette
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!useUiStore.getState().commandPaletteOpen);
        return;
      }

      if (
        e.key === "[" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditableElement(e.target)
      ) {
        e.preventDefault();
        handleToggleCollapsed();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleToggleCollapsed, setCommandPaletteOpen]);

  // Dialog states: Rename Workspace, Create Project, Delete Workspace
  const [renamingWorkspace, setRenamingWorkspace] =
    React.useState<SidebarWorkspaceItem | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] =
    React.useState<SidebarWorkspaceItem | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = React.useState(false);
  const [isMutating, setIsMutating] = React.useState(false);

  const renameForm = useForm<UpdateWorkspaceInput>({
    resolver: zodResolver(updateWorkspaceSchema),
    defaultValues: { title: "" },
  });

  const createProjectForm = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: "" },
  });

  const handleRenameWorkspace = async (workspaceId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    const previous = workspaces;
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === workspaceId ? { ...w, title: trimmed } : w)),
    );

    try {
      await api(`/api/v1/workspaces/${workspaceId}`, {
        method: "PATCH",
        body: { title: trimmed },
      });
      if (activeWorkspaceId === workspaceId) {
        setCurrentPageTitle(trimmed);
      }
      toast.success(tChat("renameSuccess"));
      router.refresh();
    } catch {
      setWorkspaces(previous);
      toast.error(tChat("renameError"));
    }
  };

  const handleMoveWorkspace = async (
    workspaceId: string,
    projectId: string | null,
  ) => {
    const previous = workspaces;
    const targetProjectName = projectId
      ? (projects.find((p) => p.id === projectId)?.name ?? null)
      : null;

    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === workspaceId
          ? { ...w, projectId, projectName: targetProjectName }
          : w,
      ),
    );

    try {
      await api(`/api/v1/workspaces/${workspaceId}`, {
        method: "PATCH",
        body: { projectId },
      });
      toast.success(t("movedSuccess"));
      router.refresh();
    } catch {
      setWorkspaces(previous);
      toast.error(tChat("renameError"));
    }
  };

  const handleArchiveWorkspace = async (workspaceId: string) => {
    const previous = workspaces;
    setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));

    try {
      await api(`/api/v1/workspaces/${workspaceId}`, {
        method: "PATCH",
        body: { archived: true },
      });
      toast.success(t("archivedSuccess"));
      if (activeWorkspaceId === workspaceId) {
        router.push("/workspaces");
      }
      router.refresh();
    } catch {
      setWorkspaces(previous);
      toast.error(tChat("deleteError"));
    }
  };

  const handleConfirmDeleteWorkspace = async () => {
    if (!deletingWorkspace) return;
    setIsMutating(true);
    const targetId = deletingWorkspace.id;
    const previous = workspaces;
    setWorkspaces((prev) => prev.filter((w) => w.id !== targetId));

    try {
      await api(`/api/v1/workspaces/${targetId}`, { method: "DELETE" });
      toast.success(tChat("deleteSuccess"));
      setDeletingWorkspace(null);
      if (activeWorkspaceId === targetId) {
        router.push("/workspaces");
      }
      router.refresh();
    } catch {
      setWorkspaces(previous);
      toast.error(tChat("deleteError"));
    } finally {
      setIsMutating(false);
    }
  };

  const handleCreateProjectSubmit = async (values: CreateProjectInput) => {
    setIsMutating(true);
    try {
      const created = await api<{
        id: string;
        name: string;
        description?: string | null;
        updatedAt?: string;
      }>("/api/v1/projects", {
        method: "POST",
        body: { name: values.name.trim() },
      });
      setProjects((prev) => [
        {
          id: created.id,
          name: created.name,
          description: created.description ?? null,
          updatedAt: created.updatedAt ?? new Date().toISOString(),
        },
        ...prev,
      ]);
      toast.success(t("projectCreated"));
      setCreateProjectOpen(false);
      createProjectForm.reset({ name: "" });
      router.refresh();
    } catch {
      toast.error(tChat("renameError"));
    } finally {
      setIsMutating(false);
    }
  };

  const sidebarWidthVar = collapsed ? "64px" : "280px";

  return (
    <div
      style={{ "--sidebar-w": sidebarWidthVar } as React.CSSProperties}
      className="grid h-dvh w-full grid-cols-1 md:grid-cols-[var(--sidebar-w)_minmax(0,1fr)_auto] overflow-hidden bg-bg text-fg pb-[env(safe-area-inset-bottom)]"
    >
      {/* Desktop Sidebar Column */}
      <div className="hidden md:flex h-full min-h-0 overflow-hidden">
        <Sidebar
          user={user}
          collapsed={collapsed}
          onToggleCollapsed={handleToggleCollapsed}
          activeWorkspaceId={activeWorkspaceId}
          projects={projects}
          workspaces={workspaces}
          onOpenSearch={() => setCommandPaletteOpen(true)}
          onRequestCreateProject={() => {
            createProjectForm.reset({ name: "" });
            setCreateProjectOpen(true);
          }}
          onRequestRenameWorkspace={(ws) => {
            renameForm.reset({ title: ws.title });
            setRenamingWorkspace(ws);
          }}
          onMoveWorkspace={handleMoveWorkspace}
          onArchiveWorkspace={handleArchiveWorkspace}
          onRequestDeleteWorkspace={(ws) => setDeletingWorkspace(ws)}
        />
      </div>

      {/* Mobile Drawer (< 768px) */}
      <Sheet
        open={mobileNavIsOpen}
        onOpenChange={(open) => toggleMobileNavOpen(open)}
      >
        <SheetContent
          side="left"
          className="w-[280px] p-0 border-r border-border bg-surface md:hidden"
        >
          <SheetTitle className="sr-only">{t("openNavigation")}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("workspaces")}
          </SheetDescription>
          <Sidebar
            user={user}
            collapsed={false}
            onToggleCollapsed={() => toggleMobileNavOpen(false)}
            activeWorkspaceId={activeWorkspaceId}
            projects={projects}
            workspaces={workspaces}
            onOpenSearch={() => {
              toggleMobileNavOpen(false);
              setCommandPaletteOpen(true);
            }}
            onNavigate={() => toggleMobileNavOpen(false)}
            onRequestCreateProject={() => {
              toggleMobileNavOpen(false);
              createProjectForm.reset({ name: "" });
              setCreateProjectOpen(true);
            }}
            onRequestRenameWorkspace={(ws) => {
              toggleMobileNavOpen(false);
              renameForm.reset({ title: ws.title });
              setRenamingWorkspace(ws);
            }}
            onMoveWorkspace={handleMoveWorkspace}
            onArchiveWorkspace={handleArchiveWorkspace}
            onRequestDeleteWorkspace={(ws) => {
              toggleMobileNavOpen(false);
              setDeletingWorkspace(ws);
            }}
            isMobileDrawer
          />
        </SheetContent>
      </Sheet>

      {/* Main Content Column */}
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <Topbar
          activeWorkspace={activeWorkspace}
          projects={projects}
          onRenameWorkspace={handleRenameWorkspace}
          onMoveWorkspace={handleMoveWorkspace}
          onArchiveWorkspace={handleArchiveWorkspace}
          onRequestDeleteWorkspace={(ws) => setDeletingWorkspace(ws)}
        />

        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>

      {/* Right Panel Column (Annotations & Notes — wired in Step 6.4) */}
      {rightPanelOpen && (
        <aside
          aria-label={t("rightPanelTitle")}
          className="hidden lg:flex h-full w-80 shrink-0 flex-col border-l border-border bg-surface text-fg"
        >
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <h2 className="text-sm font-semibold text-fg">
              {t("rightPanelTitle")}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={tCommon("close")}
              onClick={() => setRightPanelOpen(false)}
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </div>
          <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-subtle">
            {t("rightPanelEmpty")}
          </div>
        </aside>
      )}

      {/* Command Palette (Ctrl/⌘ + K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        projects={projects}
        workspaces={workspaces}
      />

      {/* Rename Workspace Dialog */}
      <Dialog
        open={Boolean(renamingWorkspace)}
        onOpenChange={(open) => {
          if (!open) setRenamingWorkspace(null);
        }}
      >
        <DialogContent>
          <Form {...renameForm}>
            <form
              onSubmit={renameForm.handleSubmit(async (values) => {
                if (!renamingWorkspace || !values.title) return;
                const targetId = renamingWorkspace.id;
                setRenamingWorkspace(null);
                await handleRenameWorkspace(targetId, values.title);
              })}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle>{tChat("renameChat")}</DialogTitle>
              </DialogHeader>
              <FormField
                control={renameForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tChat("renameChat")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={tChat("renamePlaceholder")}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRenamingWorkspace(null)}
                >
                  {tCommon("cancel")}
                </Button>
                <Button type="submit">{tCommon("save")}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create Project Dialog */}
      <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
        <DialogContent>
          <Form {...createProjectForm}>
            <form
              onSubmit={createProjectForm.handleSubmit(
                handleCreateProjectSubmit,
              )}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle>{t("newProject")}</DialogTitle>
              </DialogHeader>
              <FormField
                control={createProjectForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("projects")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("newProjectPlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateProjectOpen(false)}
                >
                  {tCommon("cancel")}
                </Button>
                <Button type="submit" disabled={isMutating}>
                  {tCommon("save")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Workspace ConfirmDialog */}
      <ConfirmDialog
        open={Boolean(deletingWorkspace)}
        onOpenChange={(open) => {
          if (!open) setDeletingWorkspace(null);
        }}
        title={tChat("deleteConfirmTitle")}
        description={tChat("deleteConfirmDescription", {
          title: deletingWorkspace?.title ?? "",
        })}
        confirmLabel={tChat("confirmDelete")}
        cancelLabel={tCommon("cancel")}
        variant="destructive"
        loading={isMutating}
        onConfirm={handleConfirmDeleteWorkspace}
      />
    </div>
  );
}

export default AppShell;
