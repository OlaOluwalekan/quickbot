import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { ApiError } from "@/server/http/errors";
import { getProject, getProjectWorkspaces } from "@/server/services/project";
import { ProjectView } from "@/components/project/project-view";
import { PROJECT_WORKSPACES_PAGE_SIZE } from "@/components/project/constants";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;

  let data;
  try {
    // getProject runs requireProject(actor, id, "workspace.read").
    const project = await getProject(actor, id);
    const workspaces = await getProjectWorkspaces(actor, id, {
      limit: PROJECT_WORKSPACES_PAGE_SIZE,
      sort: "lastActivity",
    });
    data = { project, workspaces };
  } catch (err) {
    // Strangers and deleted projects get the 404 page (no existence leak).
    // Anything else is a real error and goes to the error boundary.
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const { project, workspaces } = data;

  return (
    <ProjectView
      currentUserId={actor.userId}
      project={{
        id: project.id,
        name: project.name,
        description: project.description,
        ownerId: project.ownerId,
        archivedAt: project.archivedAt?.toISOString() ?? null,
        role: project.role,
        capabilities: project.capabilities,
        owner: project.owner,
        members: project.members,
        _count: project._count,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      }}
      initialWorkspaces={{
        nextCursor: workspaces.nextCursor,
        items: workspaces.items.map((w) => ({
          id: w.id,
          title: w.title,
          ownerId: w.ownerId,
          projectId: w.projectId,
          archivedAt: w.archivedAt?.toISOString() ?? null,
          lastActivityAt: w.lastActivityAt.toISOString(),
          createdAt: w.createdAt.toISOString(),
          updatedAt: w.updatedAt.toISOString(),
          owner: w.owner,
          _count: w._count,
          capabilities: w.capabilities,
        })),
      }}
    />
  );
}
