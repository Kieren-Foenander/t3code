import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";

import { BoardWorkspace } from "../components/board/BoardWorkspace";
import { SidebarInset } from "../components/ui/sidebar";

function ProjectBoardRouteView() {
  const params = Route.useParams();
  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden bg-background text-foreground md:h-dvh">
      <BoardWorkspace
        environmentId={EnvironmentId.make(params.environmentId)}
        projectId={ProjectId.make(params.projectId)}
      />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/$environmentId/board/$projectId")({
  component: ProjectBoardRouteView,
});
