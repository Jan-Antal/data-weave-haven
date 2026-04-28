/**
 * HodinyTab — placeholder.
 *
 * Plánovaný obsah:
 *   - Per-tpv_item allocation hodín (návrh / submitted / approved / returned)
 *   - Workflow: konstrukter submituje → vedúci_vyroby schvaľuje
 *   - Aggregate per projekt: schválené vs. plánované hodiny
 *
 * DB tabuľka: tpv_hours_allocation
 *   - stav: draft/submitted/approved/returned
 *   - submitted_by, submitted_at, approved_by, approved_at, return_reason
 */

import { Construction } from "lucide-react";
import type { TpvPermissions } from "../shared/types";

interface HodinyTabProps {
  permissions: TpvPermissions;
}

export function HodinyTab({ permissions: _permissions }: HodinyTabProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
      <Construction className="h-12 w-12 mb-3 opacity-30" />
      <h3 className="text-lg font-semibold">Hodiny</h3>
      <p className="text-sm mt-1 max-w-md text-center">
        Sekcia v príprave — schvaľovací workflow hodín alokovaných
        na TPV položky.
      </p>
    </div>
  );
}
