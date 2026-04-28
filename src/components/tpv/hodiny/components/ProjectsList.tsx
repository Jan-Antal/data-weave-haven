/**
 * ProjectsList — top-level Hodiny view.
 *
 * Tabuľka projektov s rollup štatistikami:
 *   - počet TPV prvkov
 *   - rozdelenie podľa stavu (draft/submitted/approved/returned/missing)
 *   - sum hodín CN vs návrh vs schválené
 *
 * Klik na projekt otvorí ProjectDetailView.
 */

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  FileEdit,
  RotateCcw,
  Search,
  Send,
  Inbox,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { useProjectRollups } from "../hooks";
import type { HoursProjectRollup } from "../types";

interface ProjectsListProps {
  onSelectProject: (projectId: string) => void;
}

export function ProjectsList({ onSelectProject }: ProjectsListProps) {
  const rollupsQ = useProjectRollups();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const all = rollupsQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) =>
        (r.project_name ?? "").toLowerCase().includes(q) ||
        (r.klient ?? "").toLowerCase().includes(q) ||
        (r.pm ?? "").toLowerCase().includes(q) ||
        r.project_id.toLowerCase().includes(q)
    );
  }, [rollupsQ.data, search]);

  // Top-level KPIs — across all projects
  const kpis = useMemo(() => {
    const all = rollupsQ.data ?? [];
    return all.reduce(
      (acc, r) => {
        acc.projects += 1;
        acc.draft += r.draft;
        acc.submitted += r.submitted;
        acc.approved += r.approved;
        acc.returned += r.returned;
        acc.missing += r.missing;
        return acc;
      },
      {
        projects: 0,
        draft: 0,
        submitted: 0,
        approved: 0,
        returned: 0,
        missing: 0,
      }
    );
  }, [rollupsQ.data]);

  if (rollupsQ.isLoading) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        Načítavam projekty...
      </div>
    );
  }
  if (rollupsQ.isError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
        <div className="font-semibold text-destructive">
          Chyba pri načítaní
        </div>
        <div className="text-sm text-destructive/90 mt-1">
          {rollupsQ.error instanceof Error
            ? rollupsQ.error.message
            : "Neznáma chyba"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <KpiCard
          icon={Inbox}
          tone="muted"
          label="chýba alokácia"
          value={kpis.missing}
        />
        <KpiCard
          icon={FileEdit}
          tone="muted"
          label="rozpracované"
          value={kpis.draft}
        />
        <KpiCard
          icon={Send}
          tone="info"
          label="čaká na PM"
          value={kpis.submitted}
        />
        <KpiCard
          icon={RotateCcw}
          tone="bad"
          label="vrátené"
          value={kpis.returned}
        />
        <KpiCard
          icon={CheckCircle2}
          tone="ok"
          label="schválené"
          value={kpis.approved}
        />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Hľadať projekt, klienta, PM..."
          className="pl-8 h-9"
        />
      </div>

      {/* Project list */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          {(rollupsQ.data ?? []).length === 0
            ? "Žiadne projekty s TPV prvkami."
            : "Žiadny projekt nezodpovedá hľadaniu."}
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-[11px] uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Projekt</th>
                <th className="px-3 py-2 text-left">PM</th>
                <th className="px-3 py-2 text-right">Prvkov</th>
                <th className="px-3 py-2 text-left">Stav</th>
                <th className="px-3 py-2 text-right">Hodiny CN</th>
                <th className="px-3 py-2 text-right">Schválené</th>
                <th className="px-3 py-2 w-px" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <ProjectRow
                  key={r.project_id}
                  rollup={r}
                  onClick={() => onSelectProject(r.project_id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// KPI Card
// ============================================================

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  tone: "muted" | "info" | "ok" | "bad";
  label: string;
  value: number;
}
function KpiCard({ icon: Icon, tone, label, value }: KpiCardProps) {
  const cls =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "info"
        ? "border-sky-500/30 bg-sky-500/5"
        : tone === "bad"
          ? "border-red-500/30 bg-red-500/5"
          : "border-border/60 bg-card/40";
  const iconCls =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "info"
        ? "text-sky-300"
        : tone === "bad"
          ? "text-red-300"
          : "text-muted-foreground";
  return (
    <div className={cn("rounded-lg border p-3", cls)}>
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", iconCls)} />
        <div className="text-2xl font-mono font-semibold tabular-nums">
          {value}
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-1">
        {label}
      </div>
    </div>
  );
}

// ============================================================
// Project Row
// ============================================================

interface ProjectRowProps {
  rollup: HoursProjectRollup;
  onClick: () => void;
}
function ProjectRow({ rollup, onClick }: ProjectRowProps) {
  const r = rollup;
  return (
    <tr
      className="border-t border-border/40 hover:bg-accent/30 cursor-pointer"
      onClick={onClick}
    >
      <td className="px-3 py-2">
        <div className="font-medium">{r.project_name ?? r.project_id}</div>
        {r.klient && (
          <div className="text-[11px] text-muted-foreground">{r.klient}</div>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {r.pm ?? "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono">{r.total_items}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {r.missing > 0 && (
            <MiniChip tone="muted" label="chýba" count={r.missing} />
          )}
          {r.draft > 0 && (
            <MiniChip tone="muted" label="draft" count={r.draft} />
          )}
          {r.submitted > 0 && (
            <MiniChip tone="info" label="PM" count={r.submitted} />
          )}
          {r.returned > 0 && (
            <MiniChip tone="bad" label="vrátené" count={r.returned} />
          )}
          {r.approved > 0 && (
            <MiniChip tone="ok" label="ok" count={r.approved} />
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {r.sum_plan > 0 ? r.sum_plan : "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        <span
          className={
            r.sum_approved > 0 ? "text-emerald-300" : "text-muted-foreground"
          }
        >
          {r.sum_approved > 0 ? r.sum_approved : "—"}
        </span>
      </td>
      <td className="px-2">
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </td>
    </tr>
  );
}

interface MiniChipProps {
  tone: "muted" | "info" | "ok" | "bad";
  label: string;
  count: number;
}
function MiniChip({ tone, label, count }: MiniChipProps) {
  const cls =
    tone === "ok"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : tone === "info"
        ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
        : tone === "bad"
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : "border-muted-foreground/30 bg-muted/40 text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", cls)}>
      <span className="font-mono">{count}</span>
      <span className="text-[10px] uppercase tracking-wide opacity-80">
        {label}
      </span>
    </Badge>
  );
}
