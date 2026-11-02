"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import {
  FolderKanban,
  MessageSquare,
  MessageSquarePlus,
  Moon,
  PanelLeft,
  Settings,
  Sun,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useUiStore } from "@/lib/stores/ui";
import { api } from "@/lib/api/client";
import type { SidebarProjectItem, SidebarWorkspaceItem } from "./types";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: SidebarProjectItem[];
  workspaces: SidebarWorkspaceItem[];
}

export function CommandPalette({
  open,
  onOpenChange,
  projects,
  workspaces,
}: CommandPaletteProps) {
  const t = useTranslations("AppShell");
  const tChat = useTranslations("Chat");
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const toggleSidebarCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);

  const [query, setQuery] = React.useState("");
  const [remoteWorkspaces, setRemoteWorkspaces] = React.useState<
    SidebarWorkspaceItem[] | null
  >(null);
  const [remoteProjects, setRemoteProjects] = React.useState<
    SidebarProjectItem[] | null
  >(null);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setRemoteWorkspaces(null);
      setRemoteProjects(null);
    }
  }, [open]);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) {
      setRemoteWorkspaces(null);
      setRemoteProjects(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const [wsRes, projRes] = await Promise.all([
          api<{
            items?: Array<{
              id: string;
              title: string;
              ownerId?: string;
              createdBy?: string;
              projectId?: string | null;
              updatedAt: string;
            }>;
          }>(`/api/v1/workspaces?q=${encodeURIComponent(trimmed)}&limit=10`, {
            signal: controller.signal,
          }).catch(() => ({ items: undefined })),
          api<{
            items?: Array<{
              id: string;
              name: string;
              description?: string | null;
              updatedAt: string;
            }>;
          }>(`/api/v1/projects?q=${encodeURIComponent(trimmed)}&limit=10`, {
            signal: controller.signal,
          }).catch(() => ({ items: undefined })),
        ]);

        if (wsRes.items) {
          setRemoteWorkspaces(
            wsRes.items.map((w) => ({
              id: w.id,
              title: w.title,
              ownerId: w.ownerId ?? w.createdBy ?? "",
              projectId: w.projectId ?? null,
              updatedAt: w.updatedAt,
            })),
          );
        }
        if (projRes.items) {
          setRemoteProjects(projRes.items);
        }
      } catch {
        // Ignore aborted requests
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const displayedWorkspaces = React.useMemo(() => {
    if (remoteWorkspaces) return remoteWorkspaces;
    return workspaces.slice(0, 15);
  }, [remoteWorkspaces, workspaces]);

  const displayedProjects = React.useMemo(() => {
    if (remoteProjects) return remoteProjects;
    return projects.slice(0, 10);
  }, [remoteProjects, projects]);

  const runAction = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={t("searchPlaceholder")}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{tChat("noSearchResults")}</CommandEmpty>

        <CommandGroup heading={t("quickActions")}>
          <CommandItem
            value="action-new-workspace"
            onSelect={() => runAction(() => router.push("/workspaces"))}
          >
            <MessageSquarePlus className="h-4 w-4 text-accent" />
            <span>{t("newWorkspace")}</span>
          </CommandItem>

          <CommandItem
            value="action-open-settings"
            onSelect={() => runAction(() => router.push("/settings"))}
          >
            <Settings className="h-4 w-4 text-muted" />
            <span>{t("openSettings")}</span>
          </CommandItem>

          <CommandItem
            value="action-toggle-theme"
            onSelect={() =>
              runAction(() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark"),
              )
            }
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4 text-muted" />
            ) : (
              <Moon className="h-4 w-4 text-muted" />
            )}
            <span>{t("toggleTheme")}</span>
          </CommandItem>

          <CommandItem
            value="action-toggle-sidebar"
            onSelect={() => runAction(() => toggleSidebarCollapsed())}
          >
            <PanelLeft className="h-4 w-4 text-muted" />
            <span>{t("collapseSidebar")}</span>
            <CommandShortcut>[</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {displayedProjects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("projects")}>
              {displayedProjects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={`project-${project.name}-${project.id}`}
                  onSelect={() =>
                    runAction(() =>
                      router.push(`/workspaces?projectId=${project.id}`),
                    )
                  }
                >
                  <FolderKanban className="h-4 w-4 text-accent" />
                  <span className="truncate">{project.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {displayedWorkspaces.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("workspaces")}>
              {displayedWorkspaces.map((ws) => (
                <CommandItem
                  key={ws.id}
                  value={`workspace-${ws.title}-${ws.id}`}
                  onSelect={() =>
                    runAction(() => router.push(`/workspaces/${ws.id}`))
                  }
                >
                  <MessageSquare className="h-4 w-4 text-muted" />
                  <span className="truncate">{ws.title}</span>
                  {ws.projectName && (
                    <span className="ml-auto text-xs text-subtle truncate max-w-32">
                      {ws.projectName}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export default CommandPalette;
