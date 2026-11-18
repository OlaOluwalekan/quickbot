import { ReactNode } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requireActor } from "@/server/auth/session";
import { getAccountByUserId } from "@/server/services/credits";
import { listProjects } from "@/server/services/project";
import { listWorkspaces } from "@/server/services/workspace";
import { getUserAvatar } from "@/server/services/avatar";
import { getShellIdentity } from "@/server/services/user-profile";
import { parseSidebarCookie, SIDEBAR_COOKIE_NAME } from "@/lib/stores/ui";
import { AppShell } from "@/components/layout/app-shell";
import type {
  AppShellUser,
  SidebarProjectItem,
  SidebarWorkspaceItem,
} from "@/components/layout/types";

import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.app");
  return {
    title: t("title"),
    description: t("description"),
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  const cookieStore = await cookies();
  const initialSidebarCollapsed = parseSidebarCookie(
    cookieStore.get(SIDEBAR_COOKIE_NAME)?.value,
  );

  const [creditAccount, projectsPage, workspacesPage, avatarData, identity] = await Promise.all([
    getAccountByUserId(actor.userId).catch(() => null),
    listProjects(actor, { limit: 50 }).catch(() => ({
      items: [],
      nextCursor: null,
    })),
    listWorkspaces(actor, { limit: 100 }).catch(() => ({
      items: [],
      nextCursor: null,
    })),
    getUserAvatar(actor.userId).catch(() => null),
    // The session's copy of the user can be stale: read what people change
    // (name, username) from the database.
    getShellIdentity(actor.userId).catch(() => null),
  ]);

  const usernameClaimedAt =
    identity !== null ? identity.usernameClaimedAt : actor.usernameClaimedAt ?? null;

  const user: AppShellUser = {
    id: actor.userId,
    name: identity?.name ?? actor.name ?? "",
    email: actor.email,
    image: avatarData?.avatarUrl ?? actor.image ?? null,
    planName: "Free",
    creditBalance:
      (creditAccount?.planBalance ?? 0) + (creditAccount?.topupBalance ?? 0),
    username: identity ? identity.username : actor.username ?? null,
    usernameClaimedAt: usernameClaimedAt ? usernameClaimedAt.toISOString() : null,
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
