/**
 * HodinyTab — hlavný tab modulu Hodiny.
 *
 * Two views:
 *   - ProjectsList: top-level rollup of all projects with KPIs
 *   - ProjectDetailView: drill-down to edit hours per item with workflow
 *
 * Permissions:
 *   canSubmitHours  → kalkulant: edit + submit
 *   canApproveHours → PM: approve + return
 */

import { useState } from "react";

import type { TpvPermissions } from "../shared/types";
import { ProjectsList } from "./components/ProjectsList";
import { ProjectDetailView } from "./components/ProjectDetailView";

interface HodinyTabProps {
  permissions: TpvPermissions;
}

export function HodinyTab({ permissions }: HodinyTabProps) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4 p-4">
      {selectedProject ? (
        <ProjectDetailView
          projectId={selectedProject}
          onBack={() => setSelectedProject(null)}
          canSubmit={permissions.canSubmitHours}
          canApprove={permissions.canApproveHours}
        />
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold">Hodiny</h2>
            <div className="text-xs text-muted-foreground">
              Hodinová dotácia per projekt — kalkulant navrhuje, PM schvaľuje.
            </div>
          </div>
          <ProjectsList onSelectProject={setSelectedProject} />
        </>
      )}
    </div>
  );
}
