import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { requireProject } from "@/server/authz/access";
import { getProject, getProjectWorkspaces } from "@/server/services/project";
import { ProjectView } from "@/components/project/project-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;

  let project;
  let workspacesData;
  try {
    await requireProject(actor, id, "workspace.read");
    project = await getProject(actor, id);
    workspacesData = await getProjectWorkspaces(actor, id, {
      limit: 50,
      sort: "lastActivity",
    });
  } catch {
    notFound();
  }

  return (
    <ProjectView
      project={{
        id: project.id,
        name: project.name,
        description: project.description,
        ownerId: project.ownerId,
        archivedAt: project.archivedAt ? project.archivedAt.toISOString() : null,
        deletedAt: project.deletedAt ? project.deletedAt.toISOString() : null,
        role: project.role,
        capabilities: project.capabilities,
        owner: project.owner,
        members: project.members?.map((m) => ({
          id: m.id,
          role: m.role,
          user: m.user,
        })),
        _count: project._count,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      }}
      initialWorkspaces={{
        items: workspacesData.items.map((w) => ({
          id: w.id,
          title: w.title,
          ownerId: w.ownerId,
          projectId: w.projectId,
          archivedAt: w.archivedAt ? w.archivedAt.toISOString() : null,
          deletedAt: w.deletedAt ? w.deletedAt.toISOString() : null,
          lastActivityAt: w.lastActivityAt ? w.lastActivityAt.toISOString() : null,
          createdAt: w.createdAt.toISOString(),
          updatedAt: w.updatedAt.toISOString(),
          owner: w.owner,
          _count: w._count,
        })),
        nextCursor: workspacesData.nextCursor,
      }}
      currentUserId={actor.userId}
    />
  );
}
