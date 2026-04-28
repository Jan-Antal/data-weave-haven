/**
 * MaterialTab — placeholder.
 *
 * Plánovaný obsah:
 *   - Per-project zoznam materiálových potrieb
 *   - Stav: nezadany / objednane / caka / dodane (DB CHECK overené)
 *   - Bulk import z Excelu (analogicky k Subdodávkam)
 *   - Linkovanie na konkrétne tpv_items (TpvItemRefDisplay zo shared)
 *
 * DB tabuľka: tpv_material (CHECK stav: nezadany/objednane/caka/dodane).
 */

import { Construction } from "lucide-react";
import type { TpvPermissions } from "../shared/types";

interface MaterialTabProps {
  permissions: TpvPermissions;
}

export function MaterialTab({ permissions: _permissions }: MaterialTabProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
      <Construction className="h-12 w-12 mb-3 opacity-30" />
      <h3 className="text-lg font-semibold">Materiál</h3>
      <p className="text-sm mt-1 max-w-md text-center">
        Sekcia v príprave — tracking materiálových objednávok per projekt
        a per TPV položku.
      </p>
    </div>
  );
}
