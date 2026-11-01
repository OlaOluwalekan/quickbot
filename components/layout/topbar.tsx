"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Archive,
  ChevronRight,
  FolderInput,
  FolderKanban,
  Menu,
  MoreHorizontal,
  PanelRight,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUiStore } from "@/lib/stores/ui";
import LocaleSwitcher from "@/components/general/LocaleSwitcher";
import type { SidebarProjectItem, SidebarWorkspaceItem } from "./types";

export interface TopbarProps {
  activeWorkspace: SidebarWorkspaceItem | null;
  projects: SidebarProjectItem[];
  onRenameWorkspace: (workspaceId: string, title: string) => Promise<void>;
  onMoveWorkspace: (
    workspaceId: string,
    projectId: string | null,
  ) => Promise<void>;
  onArchiveWorkspace: (workspaceId: string) => Promise<void>;
  onRequestDeleteWorkspace: (workspace: SidebarWorkspaceItem) => void;
}

export function Topbar({
  activeWorkspace,
  projects,
  onRenameWorkspace,
  onMoveWorkspace,
  onArchiveWorkspace,
  onRequestDeleteWorkspace,
}: TopbarProps) {
  const t = useTranslations("AppShell");
  const tChat = useTranslations("Chat");
  const mobileNavIsOpen = useUiStore((s) => s.mobileNavIsOpen);
  const toggleMobileNavOpen = useUiStore((s) => s.toggleMobileNavOpen);
  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);
  const toggleRightPanelOpen = useUiStore((s) => s.toggleRightPanelOpen);
  const currentPageTitle = useUiStore((s) => s.currentPageTitle);
  const setCurrentPageTitle = useUiStore((s) => s.setCurrentPageTitle);

  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const displayedTitle =
    activeWorkspace?.title || currentPageTitle || tChat("newChat");
  const projectName = React.useMemo(() => {
    if (!activeWorkspace?.projectId) return null;
    if (activeWorkspace.projectName) return activeWorkspace.projectName;
    return (
      projects.find((p) => p.id === activeWorkspace.projectId)?.name ?? null
    );
  }, [activeWorkspace, projects]);

  const startEditingTitle = () => {
    if (!activeWorkspace) return;
    setDraftTitle(displayedTitle);
    setIsEditingTitle(true);
  };

  React.useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingTitle]);

  const commitTitleEdit = async () => {
    if (!activeWorkspace) {
      setIsEditingTitle(false);
      return;
    }
    const trimmed = draftTitle.trim();
    setIsEditingTitle(false);
    if (!trimmed || trimmed === activeWorkspace.title) {
      setDraftTitle(activeWorkspace.title);
      return;
    }
    setCurrentPageTitle(trimmed);
    await onRenameWorkspace(activeWorkspace.id, trimmed);
  };

  const cancelTitleEdit = () => {
    setIsEditingTitle(false);
    setDraftTitle(displayedTitle);
  };

  const handleTitleKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await commitTitleEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelTitleEdit();
    }
  };

  const handleShareClick = () => {
    toast.info(t("shareComingSoon"));
  };

  return (
    <header className="flex h-14 w-full shrink-0 items-center justify-between gap-2 border-b border-border bg-surface/85 px-3 sm:px-5 backdrop-blur-md z-20">
      {/* Left: Mobile Drawer Trigger + Project Breadcrumb + Inline-Editable Workspace Title */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden shrink-0"
          aria-label={t("openNavigation")}
          aria-expanded={mobileNavIsOpen}
          onClick={() => toggleMobileNavOpen(true)}
        >
          <Menu className="h-4 w-4" strokeWidth={1.5} />
        </Button>

        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-sm"
        >
          {projectName && (
            <>
              <span className="inline-flex max-w-36 sm:max-w-48 items-center gap-1.5 truncate rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
                <FolderKanban
                  className="h-3.5 w-3.5 shrink-0 text-accent"
                  strokeWidth={1.5}
                />
                <span className="truncate">{projectName}</span>
              </span>
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 text-subtle"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </>
          )}

          {isEditingTitle && activeWorkspace ? (
            <input
              ref={inputRef}
              type="text"
              value={draftTitle}
              aria-label={t("editTitleLabel")}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              onBlur={commitTitleEdit}
              maxLength={120}
              className="min-w-0 flex-1 max-w-md rounded-md border border-accent bg-surface px-2 py-1 text-sm font-semibold text-fg focus:outline-none focus:ring-2 focus:ring-ring"
            />
          ) : activeWorkspace ? (
            <button
              type="button"
              onClick={startEditingTitle}
              title={t("editTitleLabel")}
              className="group inline-flex min-w-0 max-w-md items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-left text-sm sm:text-base font-semibold text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            >
              <span className="truncate">{displayedTitle}</span>
              <Pencil
                className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
          ) : (
            <h1 className="truncate px-1.5 py-1 text-sm sm:text-base font-semibold text-fg">
              {displayedTitle}
            </h1>
          )}
        </nav>
      </div>

      {/* Right: Share, Right Panel Toggle, Locale, Overflow Menu */}
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleShareClick}
          className="hidden sm:inline-flex"
        >
          <Share2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>{t("share")}</span>
        </Button>

        <Button
          type="button"
          variant={rightPanelOpen ? "secondary" : "ghost"}
          size="icon"
          aria-label={t("toggleRightPanel")}
          aria-pressed={rightPanelOpen}
          aria-expanded={rightPanelOpen}
          tooltip={t("toggleRightPanel")}
          onClick={() => toggleRightPanelOpen()}
        >
          <PanelRight className="h-4 w-4" strokeWidth={1.5} />
        </Button>

        <LocaleSwitcher compact />

        {activeWorkspace && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("workspaceOptions")}
                tooltip={t("workspaceOptions")}
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={startEditingTitle}>
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
                    disabled={activeWorkspace.projectId === null}
                    onSelect={() => onMoveWorkspace(activeWorkspace.id, null)}
                  >
                    <span>{t("noProject")}</span>
                  </DropdownMenuItem>
                  {projects.map((proj) => (
                    <DropdownMenuItem
                      key={proj.id}
                      disabled={activeWorkspace.projectId === proj.id}
                      onSelect={() =>
                        onMoveWorkspace(activeWorkspace.id, proj.id)
                      }
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

              <DropdownMenuItem
                onSelect={() => onArchiveWorkspace(activeWorkspace.id)}
              >
                <Archive className="h-4 w-4" strokeWidth={1.5} />
                <span>{t("archive")}</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="text-danger focus:text-danger"
                onSelect={() => onRequestDeleteWorkspace(activeWorkspace)}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                <span>{t("delete")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}

export default Topbar;
