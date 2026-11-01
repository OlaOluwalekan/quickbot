import { requireActor } from "@/server/auth/session";
import { getHomeData } from "@/server/services/home";
import { WorkspaceHome } from "@/components/home/workspace-home";

export default async function WorkspacesHomePage() {
  const actor = await requireActor();
  const initialData = await getHomeData(actor);

  return (
    <WorkspaceHome
      userId={actor.userId}
      userName={actor.name ?? ""}
      initialData={initialData}
    />
  );
}
