/**
 * TpvModule — top-level TPV container.
 *
 * Renders the tab switcher and routes to:
 *   - Príprava
 *   - Subdodávky
 *   - Materiál
 *   - Hodiny
 *   - Dodávatelia (CRM)
 *
 * Permissions are computed once at this level and passed down to each tab.
 *
 * Usage in app:
 *   <TpvModule role={userRole} initialTab="subdodavky" />
 */

import { useMemo, useState } from "react";
import {
  Briefcase,
  ListChecks,
  Package,
  Clock,
  Building2,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { AppRole, TpvPermissions } from "./shared/types";
import { computePermissions } from "./shared/helpers";

import { PripravaTab } from "./priprava";
import { SubdodavkyTab } from "./subdodavky";
import { MaterialTab } from "./material";
import { HodinyTab } from "./hodiny";
import { DodavateliaTab, SupplierCRMDialog } from "./dodavatelia";
import { subcontractPermissionsFromTpv } from "./subdodavky/types";

export type TpvTabKey =
  | "priprava"
  | "subdodavky"
  | "material"
  | "hodiny"
  | "dodavatelia";

const TABS: { key: TpvTabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "priprava", label: "Príprava", icon: ListChecks },
  { key: "subdodavky", label: "Subdodávky", icon: Briefcase },
  { key: "material", label: "Materiál", icon: Package },
  { key: "hodiny", label: "Hodiny", icon: Clock },
  { key: "dodavatelia", label: "Dodávatelia", icon: Building2 },
];

interface TpvModuleProps {
  /** User's effective role from auth context (single role, like useAuth().role). */
  role: AppRole | null;
  /**
   * Optional: pre-computed permissions from outside. If provided, they override
   * the permissions computed from `role`. Use this when the parent app has its own
   * permissions framework (like permissionPresets.ts) and wants to drive what
   * each TPV tab can do.
   */
  permissionsOverride?: Partial<TpvPermissions>;
  /** Default tab to open. Defaults to "subdodavky" (most-used tab). */
  initialTab?: TpvTabKey;
  /** Optional callback when tab changes — for URL sync. */
  onTabChange?: (tab: TpvTabKey) => void;
}

export function TpvModule({
  role,
  permissionsOverride,
  initialTab = "subdodavky",
  onTabChange,
}: TpvModuleProps) {
  const [activeTab, setActiveTab] = useState<TpvTabKey>(initialTab);
  const [openSupplierId, setOpenSupplierId] = useState<string | null>(null);

  const permissions = useMemo(() => {
    const roles: AppRole[] = role ? [role] : [];
    const computed = computePermissions(roles);
    return permissionsOverride
      ? ({ ...computed, ...permissionsOverride } as TpvPermissions)
      : computed;
  }, [role, permissionsOverride]);

  const subcontractPerms = useMemo(
    () => subcontractPermissionsFromTpv(permissions),
    [permissions]
  );

  const switchTab = (key: TpvTabKey) => {
    setActiveTab(key);
    onTabChange?.(key);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b bg-card sticky top-0 z-10">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => switchTab(key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium inline-flex items-center gap-2 border-b-2 transition-colors",
              activeTab === key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === "priprava" && <PripravaTab permissions={permissions} />}
        {activeTab === "subdodavky" && (
          <SubdodavkyTab
            permissions={subcontractPerms}
            onOpenSupplier={setOpenSupplierId}
          />
        )}
        {activeTab === "material" && <MaterialTab permissions={permissions} />}
        {activeTab === "hodiny" && <HodinyTab permissions={permissions} />}
        {activeTab === "dodavatelia" && (
          <DodavateliaTab permissions={permissions} />
        )}
      </div>

      {/* Supplier CRM modal — shared across tabs (Subdodávky opens it via
          callback, Dodávatelia opens it from card click). */}
      <SupplierCRMDialog
        supplierId={openSupplierId}
        permissions={subcontractPerms}
        open={openSupplierId !== null}
        onOpenChange={(o) => !o && setOpenSupplierId(null)}
      />
    </div>
  );
}
