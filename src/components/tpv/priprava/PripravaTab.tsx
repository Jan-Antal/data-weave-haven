/**
 * PripravaTab — placeholder.
 *
 * Plánovaný obsah:
 *   - Per-project readiness scoring (rozpracovane / ready / riziko / blokovane)
 *     postavený nad tpv_preparation tabuľkou
 *   - Checklist items per projekt (TPV položky, materiálová dostupnosť,
 *     subdodávky stav, hodiny schválené...)
 *   - Aggregate dashboard "moje projekty pripravené k uvoľneniu"
 *
 * DB tabuľky (overené):
 *   - tpv_preparation (readiness_status: rozpracovane/ready/riziko/blokovane)
 *   - tpv_project_preparation (calc_status: draft/review/released)
 */

import { Construction } from "lucide-react";
import type { TpvPermissions } from "../shared/types";

interface PripravaTabProps {
  permissions: TpvPermissions;
}

export function PripravaTab({ permissions: _permissions }: PripravaTabProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
      <Construction className="h-12 w-12 mb-3 opacity-30" />
      <h3 className="text-lg font-semibold">Príprava</h3>
      <p className="text-sm mt-1 max-w-md text-center">
        Sekcia v príprave — readiness scoring, checklisty pripravenosti
        projektov k uvoľneniu do výroby.
      </p>
    </div>
  );
}
