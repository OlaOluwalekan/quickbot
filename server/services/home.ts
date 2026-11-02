import "server-only";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { getAccountByUserId } from "@/server/services/credits";

export interface HomeRecentWorkspace {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  lastActivityAt: string;
  updatedAt: string;
  lastSnippet: string | null;
}

export interface HomeProjectCard {
  id: string;
  name: string;
  description: string | null;
  workspacesCount: number;
  membersCount: number;
  updatedAt: string;
}

export interface HomeSharedWorkspace {
  id: string;
  title: string;
  ownerName: string;
  lastActivityAt: string;
  updatedAt: string;
}

export interface HomeCredits {
  plan: string;
  balance: number;
  resetsAt: string | null;
}

export interface HomeOnboarding {
  emailVerified: boolean;
  usernameChosen: boolean;
  hasWorkspace: boolean;
  hasProject: boolean;
}

export interface HomeData {
  recent: HomeRecentWorkspace[];
  projects: HomeProjectCard[];
  sharedWithMe: HomeSharedWorkspace[];
  credits: HomeCredits;
  onboarding: HomeOnboarding;
}

function truncateSnippet(text: string, maxLength = 160): string {
  const cleaned = text.replace(/[\r\n]+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim() + "…";
}

export async function getHomeData(actor: Actor): Promise<HomeData> {
  const now = new Date();
  const nextMonthReset = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  // Run independent database fetches in parallel
  const [userRecord, creditAccount, recentRows, projectRows, sharedRows, workspaceCount, projectCount] =
    await Promise.all([
      db.user.findUnique({
        where: { id: actor.userId },
        select: { name: true, email: true, emailVerified: true },
      }),
      getAccountByUserId(actor.userId).catch(() => null),
      db.workspace.findMany({
        where: {
          deletedAt: null,
          archivedAt: null,
          OR: [
            { ownerId: actor.userId },
            {
              members: {
                some: {
                  userId: actor.userId,
                  role: { not: "NONE" },
                },
              },
            },
          ],
        },
        orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
        take: 6,
        select: {
          id: true,
          title: true,
          projectId: true,
          lastActivityAt: true,
          updatedAt: true,
          project: {
            select: {
              name: true,
            },
          },
          responses: {
            where: { deletedAt: null },
            orderBy: [{ sortAt: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              prompt: true,
              versions: {
                where: { status: "COMPLETE" },
                orderBy: { number: "desc" },
                take: 1,
                select: { content: true },
              },
            },
          },
        },
      }),
      db.project.findMany({
        where: {
          deletedAt: null,
          archivedAt: null,
          OR: [
            { ownerId: actor.userId },
            { members: { some: { userId: actor.userId } } },
          ],
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 8,
        select: {
          id: true,
          name: true,
          description: true,
          updatedAt: true,
          _count: {
            select: {
              workspaces: { where: { deletedAt: null } },
              members: true,
            },
          },
        },
      }),
      db.workspace.findMany({
        where: {
          deletedAt: null,
          archivedAt: null,
          ownerId: { not: actor.userId },
          OR: [
            {
              members: {
                some: {
                  userId: actor.userId,
                  role: { not: "NONE" },
                },
              },
            },
            {
              project: {
                deletedAt: null,
                members: { some: { userId: actor.userId } },
              },
            },
          ],
        },
        orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
        take: 6,
        select: {
          id: true,
          title: true,
          lastActivityAt: true,
          updatedAt: true,
          owner: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      }),
      db.workspace.count({
        where: { ownerId: actor.userId, deletedAt: null },
      }),
      db.project.count({
        where: { ownerId: actor.userId, deletedAt: null },
      }),
    ]);

  const recent: HomeRecentWorkspace[] = recentRows.map((ws) => {
    let lastSnippet: string | null = null;
    const latestResp = ws.responses[0];
    if (latestResp) {
      const versionContent = latestResp.versions[0]?.content;
      if (versionContent && versionContent.trim()) {
        lastSnippet = truncateSnippet(versionContent);
      } else if (latestResp.prompt && latestResp.prompt.trim()) {
        lastSnippet = truncateSnippet(latestResp.prompt);
      }
    }

    return {
      id: ws.id,
      title: ws.title,
      projectId: ws.projectId,
      projectName: ws.project?.name ?? null,
      lastActivityAt: (ws.lastActivityAt || ws.updatedAt).toISOString(),
      updatedAt: ws.updatedAt.toISOString(),
      lastSnippet,
    };
  });

  const projects: HomeProjectCard[] = projectRows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    workspacesCount: p._count.workspaces,
    membersCount: p._count.members,
    updatedAt: p.updatedAt.toISOString(),
  }));

  const sharedWithMe: HomeSharedWorkspace[] = sharedRows.map((ws) => ({
    id: ws.id,
    title: ws.title,
    ownerName: ws.owner.name || ws.owner.email,
    lastActivityAt: (ws.lastActivityAt || ws.updatedAt).toISOString(),
    updatedAt: ws.updatedAt.toISOString(),
  }));

  const balance =
    (creditAccount?.planBalance ?? 0) + (creditAccount?.topupBalance ?? 0);

  const email = userRecord?.email ?? actor.email;
  const name = userRecord?.name ?? actor.name ?? "";
  const emailPrefix = email.split("@")[0] || "";
  const usernameChosen = Boolean(
    name.trim().length > 0 && name.trim().toLowerCase() !== emailPrefix.toLowerCase()
  );

  return {
    recent,
    projects,
    sharedWithMe,
    credits: {
      plan: "Free",
      balance,
      resetsAt: nextMonthReset,
    },
    onboarding: {
      emailVerified: Boolean(userRecord?.emailVerified),
      usernameChosen,
      hasWorkspace: workspaceCount > 0,
      hasProject: projectCount > 0,
    },
  };
}
