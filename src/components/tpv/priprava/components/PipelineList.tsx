/**
 * PipelineList — top-level Príprava view.
 *
 * For each project shows:
 *   - calc_status (Návrh / Kontrola / Uvoľnené)
 *   - 4 gates: Dokumentácia / Hodiny / Materiál / Subdodávky
 *   - readiness % (count of "ready" items / total)
 *   - "Uvoľniť do výroby" button (when can_release && calc_status='review')
 */

import { useMemo, useState } from "react";
import {
  ChevronRight,
  PackageCheck,
  Briefcase,
  ClipboardCheck,
  Clock,
  Search,
  Filter,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  useProjectsWithPreparation,
  useUpdateProjectPreparation,
} from "../hooks";
import {
  CALC_STATUS,
  CALC_STATUS_LABEL,
  type CalcStatus,
  type ProjectPreparationView,
  type PreparationFilters,
} from "../types";

interface PipelineListProps {
  onSelectProject: (projectId: string) => void;
  canEdit: boolean;
}

export function PipelineList({
  onSelectProject,
  canEdit,
}: PipelineListProps) {
  const [calcFilter, setCalcFilter] = useState<string>("ALL");
  const [readyOnly, setReadyOnly] = useState(false);
  const [search, setSearch] = useState("");

  const filters: PreparationFilters = useMemo(() => {
    const f: PreparationFilters = { active_only: true };
    if (calcFilter !== "ALL") f.calc_status = calcFilter as CalcStatus;
    if (readyOnly) f.ready_only = true;
    return f;
  }, [calcFilter, readyOnly]);

  const projectsQ = useProjectsWithPreparation(filters);
  const update = useUpdateProjectPreparation();

  const filtered = useMemo(() => {
    const all = projectsQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) =>
        (p.project?.project_name ?? "").toLowerCase().includes(q) ||
        (p.project?.klient ?? "").toLowerCase().includes(q) ||
        (p.project?.pm ?? "").toLowerCase().includes(q) ||
        p.project_id.toLowerCase().includes(q)
    );
  }, [projectsQ.data, search]);

  // KPIs
  const kpis = useMemo(() => {
    const all = projectsQ.data ?? [];
    return all.reduce(
      (acc, p) => {
        acc.total += 1;
        acc[p.calc_status] += 1;
        if (p.can_release) acc.canRelease += 1;
        return acc;
      },
      {
        total: 0,
        draft: 0,
        review: 0,
        released: 0,
        canRelease: 0,
      }
    );
  }, [projectsQ.data]);

  if (projectsQ.isLoading) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        Načítavam projekty...
      </div>
    );
  }
  if (projectsQ.isError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
        <div className="font-semibold text-destructive">
          Chyba pri načítaní
        </div>
        <div className="text-sm text-destructive/90 mt-1">
          {projectsQ.error instanceof Error
            ? projectsQ.error.message
            : "Neznáma chyba"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard
          tone="muted"
          label="návrh"
          value={kpis.draft}
        />
        <KpiCard
          tone="info"
          label="kontrola"
          value={kpis.review}
        />
        <KpiCard
          tone="ok"
          label="uvoľnené"
          value={kpis.released}
        />
        <KpiCard
          tone="primary"
          label="môžu sa uvoľniť"
          value={kpis.canRelease}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hľadať projekt, klienta, PM..."
            className="pl-8 h-9"
          />
        </div>
        <Select value={calcFilter} onValueChange={setCalcFilter}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Všetky stavy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Všetky stavy</SelectItem>
            {CALC_STATUS.map((s) => (
              <SelectItem key={s} value={s}>
                {CALC_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Toggle
          pressed={readyOnly}
          onPressedChange={setReadyOnly}
          variant="outline"
          size="sm"
          aria-label="Iba pripravené"
        >
          <Filter className="h-3.5 w-3.5 mr-1" />
          Iba pripravené
        </Toggle>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          Žiadne projekty.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((p) => (
            <ProjectCard
              key={p.project_id}
              project={p}
              canEdit={canEdit}
              onOpen={() => onSelectProject(p.project_id)}
              onChangeCalcStatus={(newStatus) =>
                update.mutate({
                  project_id: p.project_id,
                  calc_status: newStatus,
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// KPI Card
// ============================================================

interface KpiCardProps {
  tone: "muted" | "info" | "ok" | "primary";
  label: string;
  value: number;
}
function KpiCard({ tone, label, value }: KpiCardProps) {
  const cls =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "info"
        ? "border-sky-500/30 bg-sky-500/5"
        : tone === "primary"
          ? "border-primary/30 bg-primary/5"
          : "border-border/60 bg-card/40";
  return (
    <div className={cn("rounded-lg border p-3", cls)}>
      <div className="text-2xl font-mono font-semibold tabular-nums">
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-1">
        {label}
      </div>
    </div>
  );
}

// ============================================================
// Project Card with gates
// ============================================================

interface ProjectCardProps {
  project: ProjectPreparationView;
  canEdit: boolean;
  onOpen: () => void;
  onChangeCalcStatus: (s: CalcStatus) => void;
}

function ProjectCard({
  project,
  canEdit,
  onOpen,
  onChangeCalcStatus,
}: ProjectCardProps) {
  const p = project;

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
      <div className="flex items-start gap-3 p-3">
        {/* Title + meta */}
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 min-w-0 text-left hover:text-foreground"
        >
          <div className="flex items-center gap-2">
            <div className="font-semibold truncate">
              {p.project?.project_name ?? p.project_id}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-[11px] text-muted-foreground">
            {p.project?.klient ? `${p.project.klient} · ` : ""}
            {p.project?.pm ? `PM: ${p.project.pm} · ` : ""}
            {p.total_items} prvkov
          </div>
        </button>

        {/* calc_status select */}
        <div>
          {canEdit ? (
            <Select
              value={p.calc_status}
              onValueChange={(v) => onChangeCalcStatus(v as CalcStatus)}
            >
              <SelectTrigger className="h-7 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALC_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {CALC_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className="text-xs">
              {CALC_STATUS_LABEL[p.calc_status]}
            </Badge>
          )}
        </div>
      </div>

      {/* Gates row */}
      <div className="border-t border-border/40 px-3 py-2 flex flex-wrap items-center gap-3 text-xs">
        <Gate
          icon={ClipboardCheck}
          label="Dokumentácia"
          done={p.doc_ok_count}
          total={p.total_items}
        />
        <Gate
          icon={Clock}
          label="Hodiny"
          done={p.hodiny_approved_count}
          total={p.total_items}
        />
        <Gate
          icon={PackageCheck}
          label="Materiál"
          done={p.materials_delivered}
          total={p.materials_total}
        />
        <Gate
          icon={Briefcase}
          label="Subdodávky"
          done={p.subcontracts_delivered}
          total={p.subcontracts_total}
        />

        {/* Readiness % */}
        {p.total_items > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              ready
            </div>
            <div
              className={cn(
                "text-sm font-mono font-semibold",
                p.ready === p.total_items
                  ? "text-emerald-300"
                  : p.blokovane > 0
                    ? "text-red-300"
                    : "text-foreground"
              )}
            >
              {p.ready}/{p.total_items}
            </div>
          </div>
        )}

        {p.can_release && (
          <Badge
            variant="outline"
            className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          >
            Pripravené na výrobu
          </Badge>
        )}

        {p.calc_status === "review" && p.can_release && canEdit && (
          <Button
            size="sm"
            className="h-7 bg-emerald-600 hover:bg-emerald-500"
            onClick={() => onChangeCalcStatus("released")}
          >
            Uvoľniť
          </Button>
        )}
      </div>
    </div>
  );
}

interface GateProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  done: number;
  total: number;
}
function Gate({ icon: Icon, label, done, total }: GateProps) {
  const allDone = total > 0 && done === total;
  const noItems = total === 0;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1",
        noItems
          ? "border-border/40 bg-muted/20 text-muted-foreground"
          : allDone
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : "border-amber-500/40 bg-amber-500/10 text-amber-200"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="text-[10px] uppercase tracking-wide opacity-80">
        {label}
      </span>
      <span className="font-mono font-semibold">
        {done}/{total}
      </span>
    </div>
  );
}
