/**
 * PripravaTab — hlavný tab modulu Príprava.
 *
 * Two views:
 *   - PipelineList: rollup all projects with 4 gates + readiness %
 *   - ProjectChecklist: per-project per-item editor (doc_ok, status, notes)
 */

import { useState } from "react";

import type { TpvPermissions } from "../shared/types";
import { PipelineList } from "./components/PipelineList";
import { ProjectChecklist } from "./components/ProjectChecklist";

interface PripravaTabProps {
  permissions: TpvPermissions;
}

export function PripravaTab({ permissions }: PripravaTabProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const canEdit = permissions.canEditPreparation;

  return (
    <div className="flex flex-col gap-4 p-4">
      {selected ? (
        <ProjectChecklist
          projectId={selected}
          onBack={() => setSelected(null)}
          canEdit={canEdit}
        />
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold">Príprava</h2>
            <div className="text-xs text-muted-foreground">
              Pripravenosť projektov k uvoľneniu do výroby — dokumentácia,
              hodiny, materiál, subdodávky.
            </div>
          </div>
          <PipelineList
            onSelectProject={setSelected}
            canEdit={canEdit}
          />
        </>
      )}
    </div>
  );
}
