import { useState, useMemo } from "react";
import { AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { StatusBadge } from "@/components/StatusBadge";
import { useAnalytics, type Balik, type AnalyticsRow } from "@/hooks/useAnalytics";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useProjects } from "@/hooks/useProjects";
import { ProjectDetailDialog } from "@/components/ProjectDetailDialog";
import { cn } from "@/lib/utils";
import { normalizeSearch, normalizedIncludes } from "@/lib/statusFilter";

function formatHours(n: number | null): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("cs-CZ").replace(/,/g, " ") + " h";
}

function formatDate(d: string | null): string {
  if (!d) return "";
  const [, m, day] = d.split("-");
  return `${day}.${m}`;
}

type SortKey = "project_id" | "project_name" | "pm" | "status" | "hodiny_plan" | "hodiny_skutocne" | "pct" | "zostatok";
type SortDir = "asc" | "desc";

function SortIcon({ column, sortCol, sortDir }: { column: SortKey; sortCol: SortKey | null; sortDir: SortDir }) {
  if (sortCol !== column) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />;
  return sortDir === "asc"
    ? <ArrowUp className="h-3 w-3 text-primary" />
    : <ArrowDown className="h-3 w-3 text-primary" />;
}

export default function Analytics() {
  const { data, isLoading } = useAnalytics();
  const { data: projects = [] } = useProjects();
  const [filter, setFilter] = useState<Balik | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortKey | null>("pct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);

  const toggleSort = (col: SortKey) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const detailProject = useMemo(() => {
    if (!detailProjectId) return null;
    return projects.find((p: any) => p.project_id === detailProjectId) || null;
  }, [detailProjectId, projects]);

  const rows = useMemo(() => {
    if (!data) return [];
    let filtered = data.rows;
    if (filter !== "ALL") filtered = filtered.filter((r) => r.balik === filter);
    if (search) {
      const q = normalizeSearch(search);
      filtered = filtered.filter(
        (r) =>
          normalizedIncludes(r.project_id, q) ||
          normalizedIncludes(r.project_name, q) ||
          normalizedIncludes(r.pm, q)
      );
    }
    const sorted = [...filtered];
    if (sortCol) {
      sorted.sort((a, b) => {
        let cmp = 0;
        switch (sortCol) {
          case "project_id":
            cmp = a.project_id.localeCompare(b.project_id, "cs");
            break;
          case "project_name":
            cmp = a.project_name.localeCompare(b.project_name, "cs");
            break;
          case "pm":
            cmp = (a.pm || "").localeCompare(b.pm || "", "cs");
            break;
          case "status":
            cmp = (a.status || "").localeCompare(b.status || "", "cs");
            break;
          case "hodiny_plan":
            cmp = (a.hodiny_plan ?? -1) - (b.hodiny_plan ?? -1);
            break;
          case "hodiny_skutocne":
            cmp = a.hodiny_skutocne - b.hodiny_skutocne;
            break;
          case "pct":
            cmp = (a.pct ?? -1) - (b.pct ?? -1);
            break;
          case "zostatok":
            cmp = (a.zostatok ?? -1) - (b.zostatok ?? -1);
            break;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return sorted;
  }, [data, filter, search, sortCol, sortDir]);

  // Summary computed from filtered rows
  const summary = useMemo(() => {
    const src = rows;
    const totalPlan = src.reduce((s, r) => s + (r.hodiny_plan || 0), 0);
    const totalSkutocne = src.reduce((s, r) => s + r.hodiny_skutocne, 0);
    const withPlan = src.filter((r) => r.pct != null);
    const avgPct = withPlan.length
      ? Math.round((withPlan.reduce((s, r) => s + r.pct!, 0) / withPlan.length) * 10) / 10
      : null;
    return { totalPlan, totalSkutocne, avgPct, count: src.length };
  }, [rows]);

  const headerCols: { key: SortKey | null; label: string; className?: string }[] = [
    { key: "project_id", label: "ID", className: "w-28" },
    { key: "project_name", label: "Název projektu" },
    { key: "pm", label: "PM", className: "w-24" },
    { key: "status", label: "Status", className: "w-28" },
    { key: null, label: "Balík", className: "w-20" },
    { key: "hodiny_plan", label: "Plán h", className: "w-20 text-right" },
    { key: "hodiny_skutocne", label: "Odprac. h", className: "w-24 text-right" },
    { key: "pct", label: "% čerpání", className: "w-40" },
    { key: "zostatok", label: "Zostatok h", className: "w-24 text-right" },
    { key: null, label: "Tracking", className: "w-28" },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Filter row */}
      <div className="shrink-0 px-4 py-2 flex items-center gap-3 border-b">
        <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as typeof filter)}>
          <ToggleGroupItem value="ALL" className="text-xs h-7 px-2.5">Všechny</ToggleGroupItem>
          <ToggleGroupItem value="IN_PROGRESS" className="text-xs h-7 px-2.5">🔄 Výroba</ToggleGroupItem>
          <ToggleGroupItem value="DONE" className="text-xs h-7 px-2.5">✅ Hotovo</ToggleGroupItem>
          <ToggleGroupItem value="OVER" className="text-xs h-7 px-2.5">⚠ Přesčas</ToggleGroupItem>
        </ToggleGroup>
        <div className="ml-auto">
          <Input
            placeholder="Hledat projekt..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-48 text-xs"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="shrink-0 px-4 py-2 grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-3 pb-2 px-3">
            <p className="text-[10px] text-muted-foreground mb-0.5">Projekty</p>
            <p className="text-lg font-bold tabular-nums">{isLoading ? <Skeleton className="h-6 w-12" /> : summary.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 px-3">
            <p className="text-[10px] text-muted-foreground mb-0.5">Plán hodin</p>
            <p className="text-lg font-bold tabular-nums">{isLoading ? <Skeleton className="h-6 w-16" /> : formatHours(summary.totalPlan)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 px-3">
            <p className="text-[10px] text-muted-foreground mb-0.5">Odpracováno</p>
            <p className="text-lg font-bold tabular-nums">{isLoading ? <Skeleton className="h-6 w-16" /> : formatHours(summary.totalSkutocne)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 px-3">
            <p className="text-[10px] text-muted-foreground mb-0.5">Průměrné čerpání</p>
            <p className={cn(
              "text-lg font-bold tabular-nums",
              summary.avgPct != null && summary.avgPct <= 80 && "text-green-600",
              summary.avgPct != null && summary.avgPct > 80 && summary.avgPct <= 100 && "text-orange-500",
              summary.avgPct != null && summary.avgPct > 100 && "text-red-500",
            )}>
              {isLoading ? <Skeleton className="h-6 w-12" /> : summary.avgPct != null ? `${summary.avgPct} %` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {headerCols.map((col, i) => (
                  <TableHead key={i} className={cn("text-xs", col.className)}>
                    {col.key ? (
                      <button
                        onClick={() => toggleSort(col.key!)}
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                      >
                        {col.label}
                        <SortIcon column={col.key} sortCol={sortCol} sortDir={sortDir} />
                      </button>
                    ) : (
                      col.label
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    Žádné projekty
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <AnalyticsTableRow
                    key={r.project_id}
                    row={r}
                    onOpenDetail={setDetailProjectId}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ProjectDetailDialog
        project={detailProject}
        open={!!detailProjectId}
        onOpenChange={(open) => { if (!open) setDetailProjectId(null); }}
      />
    </div>
  );
}

// ── Row component ────────────────────────────────────────────────────

function AnalyticsTableRow({ row: r, onOpenDetail }: { row: AnalyticsRow; onOpenDetail: (id: string) => void }) {
  return (
    <TableRow
      className={cn(
        "hover:bg-muted/50 transition-colors h-9",
        r.balik === "OVER" && "bg-red-50 dark:bg-red-950/20",
        r.balik === "DONE" && "opacity-60"
      )}
    >
      <TableCell>
        <button
          onClick={() => onOpenDetail(r.project_id)}
          className="whitespace-nowrap font-mono text-xs text-primary hover:underline cursor-pointer font-semibold"
        >
          {r.project_id}
        </button>
      </TableCell>
      <TableCell style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.project_name}>
        <span
          className="font-semibold text-xs cursor-pointer hover:underline hover:text-primary transition-colors truncate"
          onClick={() => onOpenDetail(r.project_id)}
        >
          {r.project_name}
        </span>
      </TableCell>
      <TableCell className="text-xs">{r.pm || "—"}</TableCell>
      <TableCell>{r.status ? <StatusBadge status={r.status} /> : "—"}</TableCell>
      <TableCell><BalikBadge balik={r.balik} /></TableCell>
      <TableCell className="text-right text-xs tabular-nums">
        <div className="flex items-center justify-end gap-1">
          {r.hodiny_plan != null ? Math.round(r.hodiny_plan) : "—"}
          {r.plan_source && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn(
                    "text-[9px] font-medium px-1 rounded",
                    r.plan_source === "TPV" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  )}>
                    {r.plan_source === "TPV" ? "T" : "P"}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {r.plan_source === "TPV" ? "Počítáno z TPV položek" : "Počítáno z prodejní ceny projektu"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums font-medium">
        {Math.round(r.hodiny_skutocne)}
      </TableCell>
      <TableCell><PctBar pct={r.pct} /></TableCell>
      <TableCell className={cn(
        "text-right text-xs tabular-nums",
        r.zostatok != null && r.zostatok > 0 && "text-green-600",
        r.zostatok != null && r.zostatok === 0 && "text-muted-foreground",
      )}>
        {r.zostatok != null ? Math.round(r.zostatok) : "—"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {r.tracking_od && r.tracking_do
          ? `${formatDate(r.tracking_od)}–${formatDate(r.tracking_do)}`
          : "—"}
      </TableCell>
    </TableRow>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function BalikBadge({ balik }: { balik: Balik }) {
  switch (balik) {
    case "DONE":
      return <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">Hotovo</Badge>;
    case "OVER":
      return <Badge variant="outline" className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">⚠ Přesčas</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px] bg-green-500/15 text-green-700 border-green-500/30">Výroba</Badge>;
  }
}

function PctBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  const width = Math.min(pct, 100);
  const barColor = pct <= 80 ? "bg-green-500" : pct <= 100 ? "bg-orange-400" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${width}%` }} />
      </div>
      <span className={cn("text-xs tabular-nums font-medium whitespace-nowrap", pct > 100 && "text-red-500")}>
        {pct > 100 && <AlertTriangle className="inline h-3 w-3 mr-0.5 -mt-0.5" />}
        {pct} %
      </span>
    </div>
  );
}
