import { ReactNode } from "react";
import { cookies } from "next/headers";
import { requireActor } from "@/server/auth/session";
import { getAccountByUserId } from "@/server/services/credits";
import { listProjects } from "@/server/services/project";
import { listWorkspaces } from "@/server/services/workspace";
import { parseSidebarCookie, SIDEBAR_COOKIE_NAME } from "@/lib/stores/ui";
import { AppShell } from "@/components/layout/app-shell";
import type {
  AppShellUser,
  SidebarProjectItem,
  SidebarWorkspaceItem,
} from "@/components/layout/types";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  const cookieStore = await cookies();
  const initialSidebarCollapsed = parseSidebarCookie(
    cookieStore.get(SIDEBAR_COOKIE_NAME)?.value,
  );

  const [creditAccount, projectsPage, workspacesPage] = await Promise.all([
    getAccountByUserId(actor.userId).catch(() => null),
    listProjects(actor, { limit: 50 }).catch(() => ({
      items: [],
      nextCursor: null,
    })),
    listWorkspaces(actor, { limit: 100 }).catch(() => ({
      items: [],
      nextCursor: null,
    })),
  ]);

  const user: AppShellUser = {
    id: actor.userId,
    name: actor.name ?? "",
    email: actor.email,
    image: actor.image ?? null,
    planName: "Free",
    creditBalance:
      (creditAccount?.planBalance ?? 0) + (creditAccount?.topupBalance ?? 0),
  };

  const initialProjects: SidebarProjectItem[] = projectsPage.items.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    updatedAt: (p.updatedAt instanceof Date
      ? p.updatedAt
      : new Date(p.updatedAt)
    ).toISOString(),
  }));

  const initialWorkspaces: SidebarWorkspaceItem[] = workspacesPage.items.map(
    (ws) => {
      const updated = ws.lastActivityAt || ws.updatedAt;
      return {
        id: ws.id,
        title: ws.title,
        ownerId: ws.ownerId,
        projectId: ws.projectId ?? null,
        projectName: ws.project?.name ?? null,
        updatedAt: (updated instanceof Date
          ? updated
          : new Date(updated)
        ).toISOString(),
      };
    },
  );

  return (
    <AppShell
      user={user}
      initialSidebarCollapsed={initialSidebarCollapsed}
      initialProjects={initialProjects}
      initialWorkspaces={initialWorkspaces}
    >
      {children}
    </AppShell>
  );
}
