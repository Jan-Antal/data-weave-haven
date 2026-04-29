/**
 * MaterialTab — main tab for the new material model (PR #6).
 *
 * Layout:
 *   header — title, KPIs
 *   filters — project / prefix / kategoria / stav / search / flags
 *   grid — material cards grouped by project (collapsible)
 *
 * Click on a material card → opens MaterialDetailDialog (3 panes:
 * detail / links / samples).
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Filter as FilterIcon,
  Plus,
  Search,
  Sparkles,
  Star,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { TpvPermissions } from "../shared/types";
import { useMaterials } from "./hooks";
import {
  MATERIAL_STAV,
  STAV_LABEL,
  KATEGORIA_OPTIONS,
  KATEGORIA_LABEL,
  PREFIX_OPTIONS,
  type MaterialFilters,
  type MaterialPrefix,
  type MaterialStav,
  type MaterialView,
} from "./types";
import { MaterialStatusBadge } from "./components/MaterialStatusBadge";
import { NewMaterialDialog } from "./components/NewMaterialDialog";
import { MaterialDetailDialog } from "./components/MaterialDetailDialog";

interface MaterialTabProps {
  permissions: TpvPermissions;
}

export function MaterialTab({ permissions }: MaterialTabProps) {
  const canWrite = permissions.canEditMaterial;

  // --- filters ---
  const [projectFilter, setProjectFilter] = useState("ALL");
  const [prefixFilter, setPrefixFilter] = useState("ALL");
  const [kategoriaFilter, setKategoriaFilter] = useState("ALL");
  const [stavFilter, setStavFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [aiOnly, setAiOnly] = useState(false);
  const [vzorovatOnly, setVzorovatOnly] = useState(false);
  const [arkheOnly, setArkheOnly] = useState(false);

  // --- dialogs ---
  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // --- query ---
  const filters: MaterialFilters = useMemo(() => {
    const f: MaterialFilters = { active_only: true };
    if (projectFilter !== "ALL") f.project_id = projectFilter;
    if (prefixFilter !== "ALL") f.prefix = prefixFilter as MaterialPrefix;
    if (kategoriaFilter !== "ALL") f.kategoria = kategoriaFilter;
    if (stavFilter !== "ALL") f.stav = stavFilter as MaterialStav;
    if (search.trim()) f.search = search.trim();
    if (aiOnly) f.ai_extracted = true;
    if (vzorovatOnly) f.nutno_vzorovat = true;
    if (arkheOnly) f.dodava_arkhe = true;
    return f;
  }, [
    projectFilter,
    prefixFilter,
    kategoriaFilter,
    stavFilter,
    search,
    aiOnly,
    vzorovatOnly,
    arkheOnly,
  ]);

  const materialsQ = useMaterials(filters);
  const rows = materialsQ.data ?? [];

  // --- projects for filter dropdown ---
  const projectsQ = useQuery({
    queryKey: ["projects-active-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("project_id, project_name")
        .eq("is_active", true)
        .order("project_name");
      if (error) throw error;
      return (data as Array<{
        project_id: string;
        project_name: string | null;
      }>) ?? [];
    },
    staleTime: 60_000,
  });

  // --- KPIs ---
  const kpis = useMemo(() => {
    const acc = {
      total: rows.length,
      ai: 0,
      vzorovat: 0,
      arkhe: 0,
      delivered: 0,
    };
    for (const r of rows) {
      if (r.ai_extracted) acc.ai += 1;
      if (r.nutno_vzorovat && r.stav !== "delivered") acc.vzorovat += 1;
      if (r.dodava_arkhe) acc.arkhe += 1;
      if (r.stav === "delivered") acc.delivered += 1;
    }
    return acc;
  }, [rows]);

  // --- grouping ---
  const grouped = useMemo(() => {
    const map = new Map<string, MaterialView[]>();
    for (const r of rows) {
      const arr = map.get(r.project_id) ?? [];
      arr.push(r);
      map.set(r.project_id, arr);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) =>
      (a[0]?.project?.project_name ?? "").localeCompare(
        b[0]?.project?.project_name ?? "",
        "cs"
      )
    );
  }, [rows]);

  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(
    new Set()
  );
  function toggleProject(pid: string) {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Materiál</h2>
          <div className="text-xs text-muted-foreground">
            {kpis.total} položiek
            {kpis.ai > 0 && (
              <span className="ml-2 text-cyan-300">
                <Sparkles className="h-3 w-3 inline mr-0.5" />
                {kpis.ai} z AI
              </span>
            )}
            {kpis.vzorovat > 0 && (
              <span className="ml-2 text-amber-300">
                <Star className="h-3 w-3 inline mr-0.5" />
                {kpis.vzorovat} čaká vzorovanie
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Nový materiál
            </Button>
          )}
        </div>
      </div>

      {/* FILTERS */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-56 h-9">
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

        <Select value={prefixFilter} onValueChange={setPrefixFilter}>
          <SelectTrigger className="w-32 h-9">
            <SelectValue placeholder="Prefix" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">M+U</SelectItem>
            {PREFIX_OPTIONS.map((p) => (
              <SelectItem key={p} value={p}>
                {p === "M" ? "M — materiál" : "U — úchytka"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={kategoriaFilter} onValueChange={setKategoriaFilter}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="Kategória" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Všetky kategórie</SelectItem>
            {KATEGORIA_OPTIONS.map((k) => (
              <SelectItem key={k} value={k}>
                {KATEGORIA_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={stavFilter} onValueChange={setStavFilter}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Stav" />
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
            placeholder="Hľadať kód, názov, špecifikáciu, produkt..."
            className="pl-8 h-9"
          />
        </div>

        <Toggle
          pressed={aiOnly}
          onPressedChange={setAiOnly}
          variant="outline"
          size="sm"
          className="gap-1"
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI
        </Toggle>
        <Toggle
          pressed={vzorovatOnly}
          onPressedChange={setVzorovatOnly}
          variant="outline"
          size="sm"
          className="gap-1"
        >
          <Star className="h-3.5 w-3.5" />
          Vzorovať
        </Toggle>
        <Toggle
          pressed={arkheOnly}
          onPressedChange={setArkheOnly}
          variant="outline"
          size="sm"
        >
          ARKHE
        </Toggle>
      </div>

      {/* BODY */}
      {materialsQ.isLoading ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          Načítavam...
        </div>
      ) : materialsQ.isError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <div className="font-semibold text-destructive flex items-center justify-center gap-2">
            <AlertCircle className="h-4 w-4" /> Chyba pri načítaní
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
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          Žiadne materiály.
          {canWrite &&
            " Pridaj prvý cez tlačidlo Nový materiál alebo použi AI auto-import (čoskoro)."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {grouped.map(([pid, list]) => (
            <ProjectGroup
              key={pid}
              projectName={list[0]?.project?.project_name ?? pid}
              klient={list[0]?.project?.klient ?? null}
              materials={list}
              isCollapsed={collapsedProjects.has(pid)}
              onToggle={() => toggleProject(pid)}
              onOpenDetail={(id) => setDetailId(id)}
            />
          ))}
        </div>
      )}

      {/* DIALOGS */}
      <NewMaterialDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        initialProjectId={
          projectFilter !== "ALL" ? projectFilter : undefined
        }
        onCreated={(id) => setDetailId(id)}
      />
      <MaterialDetailDialog
        open={!!detailId}
        materialId={detailId}
        onClose={() => setDetailId(null)}
        canWrite={canWrite}
      />
    </div>
  );
}

// ============================================================
// Project group
// ============================================================

interface ProjectGroupProps {
  projectName: string;
  klient: string | null;
  materials: MaterialView[];
  isCollapsed: boolean;
  onToggle: () => void;
  onOpenDetail: (id: string) => void;
}

function ProjectGroup({
  projectName,
  klient,
  materials,
  isCollapsed,
  onToggle,
  onOpenDetail,
}: ProjectGroupProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/30"
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{projectName}</div>
          {klient && (
            <div className="text-[11px] text-muted-foreground truncate">
              {klient}
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {materials.length} položiek
        </div>
      </button>

      {!isCollapsed && (
        <div className="border-t border-border/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-2">
            {materials.map((m) => (
              <MaterialCard
                key={m.id}
                material={m}
                onClick={() => onOpenDetail(m.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Material card
// ============================================================

interface MaterialCardProps {
  material: MaterialView;
  onClick: () => void;
}

function MaterialCard({ material, onClick }: MaterialCardProps) {
  const m = material;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-md border border-border/60 bg-card/60 p-3",
        "hover:border-primary/50 hover:bg-accent/30 transition-colors",
        "flex flex-col gap-2"
      )}
    >
      <div className="flex items-start gap-2">
        {m.internal_code && (
          <Badge variant="outline" className="font-mono text-[10px]">
            {m.internal_code}
          </Badge>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm leading-tight">{m.nazov}</div>
          {m.specifikacia && (
            <div className="text-[11px] text-muted-foreground line-clamp-2">
              {m.specifikacia}
            </div>
          )}
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <MaterialStatusBadge stav={m.stav} size="sm" />
        {m.kategoria && (
          <Badge variant="outline" className="text-[10px]">
            {(KATEGORIA_LABEL as Record<string, string>)[m.kategoria] ??
              m.kategoria}
          </Badge>
        )}
        {m.dodava_arkhe && (
          <Badge
            variant="outline"
            className="text-[10px] border-violet-500/40 bg-violet-500/10 text-violet-300"
          >
            ARKHE
          </Badge>
        )}
        {m.nutno_vzorovat && m.stav !== "delivered" && (
          <Badge
            variant="outline"
            className="text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-200 gap-0.5"
          >
            <Star className="h-2.5 w-2.5" />
            vzorovať
          </Badge>
        )}
        {m.ai_extracted && (
          <Badge
            variant="outline"
            className="text-[10px] border-cyan-500/40 bg-cyan-500/10 text-cyan-300 gap-0.5"
          >
            <Sparkles className="h-2.5 w-2.5" />
            AI
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/40 pt-2 mt-auto">
        <span>
          {m.links.length} prvkov
          {m.mnozstvo_kumulovane != null
            ? ` · ${m.mnozstvo_kumulovane}${m.jednotka ? " " + m.jednotka : ""}`
            : ""}
        </span>
        {m.cena_celkova ? (
          <span className="font-mono">
            {m.cena_celkova.toLocaleString("sk-SK")} {m.mena}
          </span>
        ) : null}
      </div>
    </button>
  );
}
