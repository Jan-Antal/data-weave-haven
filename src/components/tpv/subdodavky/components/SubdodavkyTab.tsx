/**
 * SubdodavkyTab — main entry point for the Subdodávky tab.
 *
 * Public API: <SubdodavkyTab />
 *
 * Integrates:
 *   - Header with view toggle (Per projekt / Per dodávateľ) + "Nová subdodávka"
 *   - Filter bar (project, stav, search)
 *   - Active view (PerProjectView | PerSupplierView)
 *   - Modals: NewSubcontractDialog, SubcontractDetailDialog
 *
 * Receives `permissions` and `onOpenSupplier` from parent (TPV module),
 * because Supplier CRM modal lives in the Dodávatelia tab and is shared.
 */

import { useState, useMemo } from "react";
import { Plus, Search, X, Loader2, Download, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { PerProjectView } from "./PerProjectView";
import { PerSupplierView } from "./PerSupplierView";
import { NewSubcontractDialog } from "./NewSubcontractDialog";
import { SubcontractDetailDialog } from "./SubcontractDetailDialog";
import { ImportDialog } from "./ImportDialog";

import {
  useSubcontracts,
  useUpdateSubcontract,
  useActiveProjects,
} from "../hooks";
import { exportSubcontractsToXlsx } from "../api/excel";
import type {
  SubcontractView,
  SubcontractFilters,
  SubcontractPermissions,
  SubcontractStav,
} from "../types";
import { SUBCONTRACT_STAV } from "../types";

// ============================================================
// PROPS
// ============================================================

export interface SubdodavkyTabProps {
  /** Permissions for the current user (from useAuth in parent). */
  permissions: SubcontractPermissions;
  /** Open Supplier CRM modal — owned by parent (Dodávatelia tab). */
  onOpenSupplier: (supplierId: string) => void;
  /**
   * If set, the tab is scoped to one project (used when embedded
   * inside Project Info). Hides project filter, defaults new subs.
   */
  scopedProjectId?: string;
}

// ============================================================
// COMPONENT
// ============================================================

export function SubdodavkyTab({
  permissions,
  onOpenSupplier,
  scopedProjectId,
}: SubdodavkyTabProps) {
  const [viewMode, setViewMode] = useState<"project" | "supplier">("project");
  const [filterProject, setFilterProject] = useState<string>(
    scopedProjectId ?? "__all__"
  );
  const [filterStav, setFilterStav] = useState<SubcontractStav | "__all__">(
    "__all__"
  );
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [openDetail, setOpenDetail] = useState<SubcontractView | null>(null);

  const filters = useMemo<SubcontractFilters>(() => {
    const f: SubcontractFilters = {};
    if (scopedProjectId) {
      f.project_id = scopedProjectId;
    } else if (filterProject !== "__all__") {
      f.project_id = filterProject;
    }
    if (filterStav !== "__all__") f.stav = filterStav;
    if (search.trim()) f.search = search.trim();
    return f;
  }, [scopedProjectId, filterProject, filterStav, search]);

  const {
    data: subcontracts = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useSubcontracts(filters);

  const { data: projects = [] } = useActiveProjects();
  const updateSub = useUpdateSubcontract();

  const clearFilters = () => {
    if (!scopedProjectId) setFilterProject("__all__");
    setFilterStav("__all__");
    setSearch("");
  };

  const hasActiveFilters =
    (!scopedProjectId && filterProject !== "__all__") ||
    filterStav !== "__all__" ||
    search.trim().length > 0;

  // Refresh after detail/new dialog actions — covered by query invalidation,
  // but a manual refetch on close is a useful safety net.
  const handleDetailClose = (subId?: string) => {
    setOpenDetail(null);
    if (subId) refetch();
  };

  // Quick action handlers
  const handleSendRFQ = (sub: SubcontractView) => {
    setOpenDetail(sub); // RFQ flow happens inside detail dialog
  };
  const handleMarkOrdered = (sub: SubcontractView) => {
    updateSub.mutate({
      id: sub.id,
      patch: {
        stav: SUBCONTRACT_STAV.OBJEDNANE,
        objednane_dat: new Date().toISOString().slice(0, 10),
      },
    });
  };
  const handleMarkDelivered = (sub: SubcontractView) => {
    updateSub.mutate({
      id: sub.id,
      patch: {
        stav: SUBCONTRACT_STAV.DODANE,
        dodane_dat: new Date().toISOString().slice(0, 10),
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Page top — title + view toggle + new button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Subdodávky</h2>
          <p className="text-sm text-muted-foreground">
            {subcontracts.length}{" "}
            {subcontracts.length === 1 ? "operácia" : "operácií"}
            {scopedProjectId && (
              <>
                {" "}
                · projekt{" "}
                <span className="font-mono">{scopedProjectId}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as typeof viewMode)}
            size="sm"
            variant="outline"
          >
            <ToggleGroupItem value="project" aria-label="Per projekt">
              Per projekt
            </ToggleGroupItem>
            <ToggleGroupItem value="supplier" aria-label="Per dodávateľ">
              Per dodávateľ
            </ToggleGroupItem>
          </ToggleGroup>

          {permissions.canCreate && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImport(true)}
              title="Bulk import zo .xlsx"
            >
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportSubcontractsToXlsx(subcontracts)
            }
            disabled={subcontracts.length === 0}
            title="Export aktuálneho výberu do .xlsx"
          >
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>

          {permissions.canCreate && (
            <Button onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Nová subdodávka
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {!scopedProjectId && (
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-[260px] h-9">
              <SelectValue placeholder="Všetky projekty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Všetky projekty</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.project_id} value={p.project_id}>
                  {p.project_id}
                  {p.project_name && ` — ${p.project_name}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filterStav}
          onValueChange={(v) => setFilterStav(v as typeof filterStav)}
        >
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Stav" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Všetky stavy</SelectItem>
            <SelectItem value={SUBCONTRACT_STAV.NAVRH}>Draft</SelectItem>
            <SelectItem value={SUBCONTRACT_STAV.RFQ}>
              Dopyt rozposlaný
            </SelectItem>
            <SelectItem value={SUBCONTRACT_STAV.PONUKA}>
              Vybraný dodávateľ
            </SelectItem>
            <SelectItem value={SUBCONTRACT_STAV.OBJEDNANE}>Objednané</SelectItem>
            <SelectItem value={SUBCONTRACT_STAV.DODANE}>Dodané</SelectItem>
            <SelectItem value={SUBCONTRACT_STAV.ZRUSENO}>Zrušené</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[240px] max-w-[400px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hľadať operáciu, popis…"
            className="pl-8 h-9"
          />
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-3.5 w-3.5 mr-1" />
            Zrušiť filtre
          </Button>
        )}
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Načítavam subdodávky…
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-900">
            Chyba pri načítaní subdodávok
          </p>
          <p className="text-sm text-red-700 mt-1">
            {(error as Error)?.message ?? "Neznáma chyba"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="mt-3"
          >
            Skúsiť znova
          </Button>
        </div>
      ) : viewMode === "project" ? (
        <PerProjectView
          subcontracts={subcontracts}
          permissions={permissions}
          onOpenSubcontract={setOpenDetail}
          onOpenSupplier={onOpenSupplier}
          onSendRFQ={handleSendRFQ}
          onMarkOrdered={handleMarkOrdered}
          onMarkDelivered={handleMarkDelivered}
        />
      ) : (
        <PerSupplierView
          subcontracts={subcontracts}
          onOpenSubcontract={setOpenDetail}
          onOpenSupplier={onOpenSupplier}
        />
      )}

      {/* Modals */}
      {showNew && (
        <NewSubcontractDialog
          open={showNew}
          onOpenChange={setShowNew}
          defaultProjectId={scopedProjectId}
          onCreated={() => refetch()}
        />
      )}

      {showImport && (
        <ImportDialog open={showImport} onOpenChange={setShowImport} />
      )}

      {openDetail && (
        <SubcontractDetailDialog
          subcontract={openDetail}
          permissions={permissions}
          open={!!openDetail}
          onOpenChange={(o) => !o && handleDetailClose(openDetail.id)}
          onOpenSupplier={onOpenSupplier}
        />
      )}
    </div>
  );
}
