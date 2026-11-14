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
import { useSidebarAutoStore } from "@/lib/stores/sidebar-auto";
import { resolveSidebar, toggleSidebar } from "@/lib/layout/sidebar-auto";
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
import { AllAnnotationsDrawer } from "@/components/annotations";
import { ClaimUsernameDialog } from "@/components/user/claim-username-dialog";
import { ClaimUsernameBanner } from "@/components/user/claim-username-banner";
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

/** Hover delay before the overlay opens, so passing the pointer by doesn't flicker it. */
const OVERLAY_OPEN_DELAY_MS = 250;
const OVERLAY_CLOSE_DELAY_MS = 200;

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

  const userCollapsed = hydrated ? storeCollapsed : initialSidebarCollapsed;

  // Auto-closing sidebar: open columns may collapse it to the rail; the
  // toggle pins it open (remembered). See lib/layout/sidebar-auto.ts.
  const columnsNeedRoom = useSidebarAutoStore((s) => s.columnsNeedRoom);
  const pinnedOpen = useSidebarAutoStore((s) => s.pinnedOpen);
  const setPinnedOpen = useSidebarAutoStore((s) => s.setPinnedOpen);
  const hydratePinned = useSidebarAutoStore((s) => s.hydratePinned);
  React.useEffect(() => hydratePinned(), [hydratePinned]);

  const sidebarState = { userCollapsed, columnsNeedRoom, pinnedOpen };
  const { collapsed, auto: autoCollapsed } = resolveSidebar(sidebarState);

  const [overlayOpen, setOverlayOpen] = React.useState(false);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const railRef = React.useRef<HTMLDivElement>(null);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimers = React.useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);
  React.useEffect(() => clearTimers, [clearTimers]);
  // Nothing to overlay once the sidebar is expanded again.
  React.useEffect(() => {
    if (!autoCollapsed) {
      clearTimers();
      setOverlayOpen(false);
    }
  }, [autoCollapsed, clearTimers]);

  // When focus last left the overlay: focus landing on the rail right after
  // (Shift+Tab, or Escape returning it) must not reopen it.
  const leftOverlayAt = React.useRef(0);
  const closeOverlay = React.useCallback(
    (returnFocus = false) => {
      clearTimers();
      setOverlayOpen(false);
      if (returnFocus) {
        leftOverlayAt.current = Date.now();
        railRef.current
          ?.querySelector<HTMLElement>("a, button")
          ?.focus({ preventScroll: true });
      }
    },
    [clearTimers]
  );

  const handleToggleCollapsed = React.useCallback(() => {
    const next = toggleSidebar(sidebarState);
    if (next.pinnedOpen !== pinnedOpen) setPinnedOpen(next.pinnedOpen);
    if (next.userCollapsed !== userCollapsed) {
      writeSidebarCookie(next.userCollapsed);
      setStoreSidebarCollapsed(next.userCollapsed);
    }
    closeOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCollapsed, columnsNeedRoom, pinnedOpen, setPinnedOpen, setStoreSidebarCollapsed, closeOverlay]);

  /** Mouse (not touch) on the rail: open the overlay after a short delay. */
  const handleRailPointerEnter = (e: React.PointerEvent) => {
    if (!autoCollapsed || e.pointerType !== "mouse") return;
    clearTimers();
    openTimer.current = setTimeout(() => setOverlayOpen(true), OVERLAY_OPEN_DELAY_MS);
  };
  const handleRailPointerLeave = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = null;
  };
  /** Keyboard: reaching the rail with Tab opens the overlay and moves focus into it. */
  const handleRailFocus = (e: React.FocusEvent) => {
    if (!autoCollapsed || overlayOpen) return;
    if (Date.now() - leftOverlayAt.current < 300) return;
    const target = e.target as HTMLElement;
    if (!target.matches?.(":focus-visible")) return;
    setOverlayOpen(true);
    requestAnimationFrame(() =>
      overlayRef.current
        ?.querySelector<HTMLElement>("a, button")
        ?.focus({ preventScroll: true })
    );
  };
  const handleOverlayPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimers();
    closeTimer.current = setTimeout(() => {
      // Keep it while one of its menus is open (menus render outside it).
      if (overlayRef.current?.querySelector('[aria-haspopup][aria-expanded="true"]')) return;
      setOverlayOpen(false);
    }, OVERLAY_CLOSE_DELAY_MS);
  };

  // Click outside or Escape closes the overlay.
  React.useEffect(() => {
    if (!overlayOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (overlayRef.current?.contains(target)) return;
      // Menus opened from the overlay live in portals.
      if ((target as HTMLElement).closest?.("[data-radix-popper-content-wrapper]")) return;
      closeOverlay();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOverlay(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [overlayOpen, closeOverlay]);

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
    [workspaces, activeWorkspaceId]
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

      if (
        e.key === "]" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditableElement(e.target)
      ) {
        e.preventDefault();
        useUiStore.getState().toggleRightPanelOpen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleToggleCollapsed, setCommandPaletteOpen]);

  // Dialog states: Rename Workspace, Create Project, Delete Workspace
  const [renamingWorkspace, setRenamingWorkspace] =
    React.useState<SidebarWorkspaceItem | null>(null);
  const [claimUsernameOpen, setClaimUsernameOpen] = React.useState(false);
  const [claimedUsername, setClaimedUsername] = React.useState<string | null>(
    user.usernameClaimedAt ? user.username ?? null : null
  );

  React.useEffect(() => {
    if (!user.usernameClaimedAt && !claimedUsername) {
      const prompted = typeof window !== "undefined" ? sessionStorage.getItem("klecx_username_prompted") : null;
      if (!prompted) {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("klecx_username_prompted", "true");
        }
        setClaimUsernameOpen(true);
      }
    }
  }, [user.usernameClaimedAt, claimedUsername]);

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
      prev.map((w) => (w.id === workspaceId ? { ...w, title: trimmed } : w))
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
    projectId: string | null
  ) => {
    const previous = workspaces;
    const targetProjectName = projectId
      ? (projects.find((p) => p.id === projectId)?.name ?? null)
      : null;

    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === workspaceId
          ? { ...w, projectId, projectName: targetProjectName }
          : w
      )
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

  const desktopSidebarProps = {
    user,
    activeWorkspaceId,
    projects,
    workspaces,
    onOpenSearch: () => {
      closeOverlay();
      setCommandPaletteOpen(true);
    },
    onRequestCreateProject: () => {
      closeOverlay();
      createProjectForm.reset({ name: "" });
      setCreateProjectOpen(true);
    },
    onRequestRenameWorkspace: (ws: SidebarWorkspaceItem) => {
      closeOverlay();
      renameForm.reset({ title: ws.title });
      setRenamingWorkspace(ws);
    },
    onMoveWorkspace: handleMoveWorkspace,
    onArchiveWorkspace: handleArchiveWorkspace,
    onRequestDeleteWorkspace: (ws: SidebarWorkspaceItem) => {
      closeOverlay();
      setDeletingWorkspace(ws);
    },
  };

  return (
    <div
      style={{ "--sidebar-w": sidebarWidthVar } as React.CSSProperties}
      className="bg-bg text-fg grid h-dvh w-full grid-cols-1 overflow-hidden pb-[env(safe-area-inset-bottom)] md:grid-cols-[var(--sidebar-w)_minmax(0,1fr)_auto]"
    >
      {/* Desktop Sidebar Column */}
      <div
        ref={railRef}
        className="hidden h-full min-h-0 overflow-hidden md:flex"
        data-sidebar-auto={autoCollapsed ? "true" : undefined}
        onPointerEnter={handleRailPointerEnter}
        onPointerLeave={handleRailPointerLeave}
        onFocus={handleRailFocus}
      >
        <Sidebar
          {...desktopSidebarProps}
          collapsed={collapsed}
          onToggleCollapsed={handleToggleCollapsed}
        />
      </div>

      {/* Auto-collapsed: the full sidebar over the page, from hover or keyboard */}
      {autoCollapsed && overlayOpen && (
        <div
          ref={overlayRef}
          data-testid="sidebar-overlay"
          className="animate-in fade-in slide-in-from-left-2 fixed inset-y-0 left-0 z-40 hidden shadow-xl duration-150 motion-reduce:animate-none md:flex"
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") clearTimers();
          }}
          onPointerLeave={handleOverlayPointerLeave}
          onBlur={(e) => {
            const next = e.relatedTarget as Node | null;
            if (next && !overlayRef.current?.contains(next)) {
              leftOverlayAt.current = Date.now();
              closeOverlay();
            }
          }}
        >
          <Sidebar
            {...desktopSidebarProps}
            collapsed={false}
            pinLabel
            onToggleCollapsed={handleToggleCollapsed}
            onNavigate={() => closeOverlay()}
          />
        </div>
      )}

      {/* Mobile Drawer (< 768px) */}
      <Sheet
        open={mobileNavIsOpen}
        onOpenChange={(open) => toggleMobileNavOpen(open)}
      >
        <SheetContent
          side="left"
          className="border-border bg-surface w-70 border-r p-0 md:hidden"
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
          currentUserId={user.id}
          projects={projects}
          onRenameWorkspace={handleRenameWorkspace}
          onMoveWorkspace={handleMoveWorkspace}
          onArchiveWorkspace={handleArchiveWorkspace}
          onRequestDeleteWorkspace={(ws) => setDeletingWorkspace(ws)}
        />

        <ClaimUsernameBanner
          claimed={Boolean(user.usernameClaimedAt || claimedUsername)}
          onClaimClick={() => setClaimUsernameOpen(true)}
        />

        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>

      {/* All Annotations Drawer (Step F2.4) */}
      <AllAnnotationsDrawer
        workspaceId={activeWorkspace?.id}
        open={rightPanelOpen}
        onOpenChange={setRightPanelOpen}
      />

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
                handleCreateProjectSubmit
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

      {/* Claim Username Dialog (Step 7.1) */}
      <ClaimUsernameDialog
        open={claimUsernameOpen}
        onOpenChange={setClaimUsernameOpen}
        currentUsername={user.username}
        onSuccess={(newUsername) => {
          setClaimedUsername(newUsername);
          toast.success(`Username claimed: @${newUsername}`);
          router.refresh();
        }}
      />

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
