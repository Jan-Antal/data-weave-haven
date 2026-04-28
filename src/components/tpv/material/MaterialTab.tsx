/**
 * MaterialTab — hlavný tab modulu Materiál.
 *
 * Layout:
 *   header: Title + Per projekt/Per materiál toggle + Import + Export + Nový
 *   filters: project select, stav, search, overdue toggle
 *   body: PerProjectView | PerMaterialView
 *
 * Permissions:
 *   canEditMaterial → write actions (new/edit/delete/import/bulk)
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Download,
  LayoutGrid,
  ListFilter,
  Plus,
  Search,
  Upload,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";

import type { TpvPermissions } from "../shared/types";
import { useMaterials } from "./hooks";
import { exportMaterialsToXlsx } from "./api/excel";
import type { MaterialFilters, MaterialStav } from "./types";
import { MATERIAL_STAV, STAV_LABEL } from "./types";

import { PerProjectView } from "./components/PerProjectView";
import { PerMaterialView } from "./components/PerMaterialView";
import { NewMaterialDialog } from "./components/NewMaterialDialog";
import { MaterialImportDialog } from "./components/MaterialImportDialog";

interface MaterialTabProps {
  permissions: TpvPermissions;
}

interface ProjectOption {
  project_id: string;
  project_name: string | null;
  klient: string | null;
}

type ViewMode = "per_project" | "per_material";

export function MaterialTab({ permissions }: MaterialTabProps) {
  const canWrite = permissions.canEditMaterial;

  const [viewMode, setViewMode] = useState<ViewMode>("per_project");
  const [projectFilter, setProjectFilter] = useState<string>("ALL");
  const [stavFilter, setStavFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const filters: MaterialFilters = useMemo(() => {
    const f: MaterialFilters = { active_only: true };
    if (projectFilter !== "ALL") f.project_id = projectFilter;
    if (stavFilter !== "ALL") f.stav = stavFilter as MaterialStav;
    if (search.trim()) f.search = search.trim();
    if (overdueOnly) f.overdue_only = true;
    return f;
  }, [projectFilter, stavFilter, search, overdueOnly]);

  const materialsQ = useMaterials(filters);

  // projects for filter dropdown
  const projectsQ = useQuery({
    queryKey: ["tpv", "material", "projects-active"],
    queryFn: async (): Promise<ProjectOption[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select("project_id, project_name, klient, is_active")
        .eq("is_active", true)
        .order("project_name");
      if (error) throw error;
      return ((data as ProjectOption[]) ?? []).map((p) => ({
        project_id: p.project_id,
        project_name: p.project_name,
        klient: p.klient,
      }));
    },
    staleTime: 60_000,
  });

  const rows = materialsQ.data ?? [];

  // ----- aggregate stats for header chips -----
  const totals = useMemo(() => {
    const acc: Record<MaterialStav, number> & { all: number; overdue: number } =
      {
        nezadany: 0,
        objednane: 0,
        caka: 0,
        dodane: 0,
        all: 0,
        overdue: 0,
      };
    const FOURTEEN_D = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const r of rows) {
      acc.all += 1;
      acc[r.stav] += 1;
      if (
        r.objednane_dat &&
        !r.dodane_dat &&
        r.stav !== "dodane" &&
        now - new Date(r.objednane_dat).getTime() > FOURTEEN_D
      ) {
        acc.overdue += 1;
      }
    }
    return acc;
  }, [rows]);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Materiál</h2>
          <div className="text-xs text-muted-foreground">
            {totals.all} položiek
            {totals.overdue > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-red-300">
                <AlertTriangle className="h-3 w-3" />
                {totals.overdue} po termíne
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {canWrite && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Import
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportMaterialsToXlsx(rows)}
                disabled={rows.length === 0}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export
              </Button>
              <Button size="sm" onClick={() => setNewOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Nová položka
              </Button>
            </>
          )}
        </div>
      </div>

      {/* FILTERS */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-64 h-9">
            <SelectValue placeholder="Všetky projekty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Všetky projekty</SelectItem>
            {projectsQ.data?.map((p) => (
              <SelectItem key={p.project_id} value={p.project_id}>
                {p.project_name ?? p.project_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={stavFilter} onValueChange={setStavFilter}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Všetky stavy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Všetky stavy</SelectItem>
            {MATERIAL_STAV.map((s) => (
              <SelectItem key={s} value={s}>
                {STAV_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hľadať materiál, dodávateľa, poznámku..."
            className="pl-8 h-9"
          />
        </div>

        <Toggle
          pressed={overdueOnly}
          onPressedChange={setOverdueOnly}
          variant="outline"
          size="sm"
          aria-label="Iba po termíne"
          className="gap-1.5"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Po termíne
        </Toggle>
      </div>

      {/* BODY */}
      {materialsQ.isLoading ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          Načítavam...
        </div>
      ) : materialsQ.isError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <div className="font-semibold text-destructive">
            Chyba pri načítaní materiálov
          </div>
          <div className="text-sm text-destructive/90 mt-1">
            {materialsQ.error instanceof Error
              ? materialsQ.error.message
              : "Neznáma chyba"}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => materialsQ.refetch()}
          >
            Skúsiť znova
          </Button>
        </div>
      ) : viewMode === "per_project" ? (
        <PerProjectView
          rows={rows}
          canWrite={canWrite}
          onEdit={setEditingId}
        />
      ) : (
        <PerMaterialView
          rows={rows}
          canWrite={canWrite}
          onEdit={setEditingId}
        />
      )}

      {/* DIALOGS */}
      <NewMaterialDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        initialProjectId={
          projectFilter !== "ALL" ? projectFilter : undefined
        }
      />
      <NewMaterialDialog
        open={!!editingId}
        materialId={editingId}
        onClose={() => setEditingId(null)}
      />
      <MaterialImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        initialProjectId={
          projectFilter !== "ALL" ? projectFilter : undefined
        }
      />
    </div>
  );
}

// ============================================================
// View toggle
// ============================================================

interface ViewToggleProps {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}

function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-md border border-border/60 p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange("per_project")}
        className={`px-2 py-1 rounded ${
          value === "per_project"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5 inline mr-1" />
        Per projekt
      </button>
      <button
        type="button"
        onClick={() => onChange("per_material")}
        className={`px-2 py-1 rounded ${
          value === "per_material"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <ListFilter className="h-3.5 w-3.5 inline mr-1" />
        Per materiál
      </button>
    </div>
  );
}
