import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { getWorkspace } from "@/server/services/workspace";
import { listWorkspaceResponses } from "@/server/services/response";
import { WorkspaceView } from "@/components/workspace/workspace-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SingleWorkspacePage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const actor = await requireActor();
  const workspaceId = (await params).id;

  let workspace;
  try {
    workspace = await getWorkspace(actor, workspaceId);
  } catch {
    notFound();
  }

  const responsesPage = await listWorkspaceResponses(actor, workspaceId, {
    limit: 50,
  }).catch(() => ({ items: [], nextCursor: null }));

  return (
    <WorkspaceView
      workspace={{
        id: workspace.id,
        title: workspace.title,
        createdBy: workspace.ownerId,
        projectId: workspace.projectId,
        memberCount: workspace.memberCount,
        role: workspace.role,
        capabilities: workspace.capabilities,
        sourceProvenance: workspace.sourceProvenance,
        createdAt: workspace.createdAt.toISOString(),
        updatedAt: workspace.updatedAt.toISOString(),
      }}
      initialResponses={responsesPage.items.map((r) => ({
        id: r.id,
        prompt: r.prompt,
        kind: (r.kind as "TEXT" | "IMAGE" | "DOCUMENT") || "TEXT",
        origin: r.origin,
        quote: r.quote,
        sourceAnnotationId: r.sourceAnnotationId,
        sourceWorkspaceId: r.sourceWorkspaceId,
        sourceChain: r.sourceChain,
        sourceRemoved: r.sourceRemoved,
        sourceAccessible: r.sourceAccessible,
        content: r.activeVersion?.content || "",
        activeVersionId: r.activeVersionId,
        createdAt: r.createdAt,
        author: r.author,
        citations: r.activeVersion?.citations ?? [],
        attachments: r.attachments ?? [],
        uploadedAttachment: r.uploadedAttachment ?? null,
      }))}
      actor={actor}
    />
  );
};

export default SingleWorkspacePage;
