import { Eye, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@/lib/permissionPresets";

/**
 * Sticky info bar that appears whenever an Owner is impersonating another role
 * via the "Zobrazit jako" simulator. Lets them quickly exit simulation.
 */
export function SimulatedRoleBar() {
  const { simulatedRole, realRole, setSimulatedRole } = useAuth();
  if (!simulatedRole || realRole !== "owner") return null;

  const label = ROLE_LABELS[simulatedRole] ?? simulatedRole;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-1.5 border-b border-amber-500/40 bg-amber-500/15 text-amber-900 dark:text-amber-100"
      style={{ position: "sticky", top: 0, zIndex: 250 }}
      role="status"
    >
      <div className="flex items-center gap-2 text-xs font-medium">
        <Eye className="h-3.5 w-3.5" />
        <span>
          Zobrazujete aplikáciu ako:{" "}
          <strong className="font-semibold">{label}</strong>
        </span>
      </div>
      <button
        type="button"
        onClick={() => setSimulatedRole(null)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border border-amber-500/60 hover:bg-amber-500/25 transition-colors"
      >
        <X className="h-3 w-3" />
        Ukončit simulaci
      </button>
    </div>
  );
}
