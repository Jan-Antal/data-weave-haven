import { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, RefreshCw, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { PageTabsShell, type ShellTabDef } from "@/components/shell/PageTabsShell";
import { AnalyticsBreakdownRow } from "@/components/AnalyticsBreakdownRow";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { useAnalytics, type Balik, type AnalyticsRow } from "@/hooks/useAnalytics";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useProjects } from "@/hooks/useProjects";
import { ProjectDetailDialog } from "@/components/ProjectDetailDialog";
import { ColumnVisibilityToggle } from "@/components/ColumnVisibilityToggle";
import { useColumnVisibility, type ColumnDef } from "@/hooks/useColumnVisibility";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { useAuth } from "@/hooks/useAuth";
import { SortableHeader } from "@/components/SortableHeader";
import { TableSearchBar } from "@/components/TableSearchBar";
import { cn } from "@/lib/utils";
import { normalizeSearch, normalizedIncludes } from "@/lib/statusFilter";
import { supabase } from "@/integrations/supabase/client";
import { recalculateProductionHours } from "@/lib/recalculateProductionHours";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RecalculateDialog } from "@/components/RecalculateDialog";
import { DilnaDashboard, getISOWeekForOffset } from "@/components/DilnaDashboard";

function formatHours(n: number | null): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("cs-CZ").replace(/,/g, " ") + " h";
}

function formatDate(d: string | null): string {
  if (!d) return "";
  const [, m, day] = d.split("-");
  return `${day}.${m}`;
}

type SortKey = "project_id" | "project_name" | "pm" | "status" | "balik" | "hodiny_plan" | "hodiny_skutocne" | "pct" | "zostatok" | "tracking" | "preset_label";
type SortDir = "asc" | "desc";

const ANALYTICS_COLUMNS: ColumnDef[] = [
  { key: "project_id", label: "ID", locked: true },
  { key: "project_name", label: "Název projektu", locked: true },
  { key: "pm", label: "PM" },
  { key: "status", label: "Status" },
  { key: "balik", label: "Balík" },
  { key: "preset_label", label: "Preset" },
  { key: "hodiny_plan", label: "Plán h" },
  { key: "hodiny_skutocne", label: "Odprac. h" },
  { key: "pct", label: "% čerpání" },
  { key: "zostatok", label: "Zostatok h" },
  { key: "tracking", label: "Tracking" },
];

const ANALYTICS_DEFAULT_HIDDEN: string[] = [];
const ANALYTICS_LABEL_MAP: Record<string, string> = Object.fromEntries(ANALYTICS_COLUMNS.map((c) => [c.key, c.label]));

export default function Analytics() {
  const { data, isLoading } = useAnalytics();
  const { data: projects = [] } = useProjects();
  type TimeRange = "week" | "month" | "3months" | "year" | "all";
  const [timeRange, setTimeRange] = useState<TimeRange>("3months");
  const [statusFilters, setStatusFilters] = useState<Set<"vyroba" | "done" | "rezie">>(new Set(["vyroba", "done"]));
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortKey | null>("project_id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const [recalculating, setRecalculating] = useState(false);
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "projekty";
  const dilnaMode = activeTab === "dilna";
  const rezieMode = activeTab === "rezie";
  const [dilnaWeekOffset, setDilnaWeekOffset] = useState(0);
  const { canEditColumns } = useAuth();
  const { getLabel, getWidth, updateLabel, updateWidth } = useColumnLabels("analytics");

  const { isVisible, toggleColumn } = useColumnVisibility(
    "analytics-columns",
    ANALYTICS_COLUMNS,
    ANALYTICS_DEFAULT_HIDDEN
  );

  const handleToggleEditMode = useCallback(() => {
    setEditMode((prev) => !prev);
  }, []);

  const handleCancelEditMode = useCallback(() => {
    setEditMode(false);
  }, []);

  const [recalcDialogOpen, setRecalcDialogOpen] = useState(false);

  const doRecalculate = useCallback(async (recalculateAll: boolean) => {
    setRecalcDialogOpen(false);
    setRecalculating(true);
    try {
      const updated = await recalculateProductionHours(supabase, "all", undefined, recalculateAll);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
        queryClient.invalidateQueries({ queryKey: ["production-schedule"] }),
        queryClient.invalidateQueries({ queryKey: ["production-inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["project-plan-hours"] }),
      ]);
      toast.success(`Hodiny přepočítány (${updated} položek)`);
    } catch (e: any) {
      toast.error("Chyba při přepočtu: " + (e.message || "neznámá chyba"));
    } finally {
      setRecalculating(false);
    }
  }, [queryClient]);

  const handleToggleForceProject = useCallback(async (projectId: string, current: boolean) => {
    const newValue = !current;
    await supabase.from("projects").update({ plan_use_project_price: newValue } as any).eq("project_id", projectId);
    await recalculateProductionHours(supabase, [projectId]);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      queryClient.invalidateQueries({ queryKey: ["project-plan-hours"] }),
    ]);
    toast.success(newValue ? "Přepnuto na cenu projektu" : "Přepnuto na automatický výpočet");
  }, [queryClient]);

  const toggleSort = useCallback((col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col as SortKey);
      setSortDir("desc");
    }
  }, [sortCol]);

  const detailProject = useMemo(() => {
    if (!detailProjectId) return null;
    return projects.find((p: any) => p.project_id === detailProjectId) || null;
  }, [detailProjectId, projects]);

  const getTimeRangeStart = useCallback((range: string): string | null => {
    if (range === "all") return null;
    const now = new Date();
    let start: Date;
    switch (range) {
      case "week": {
        const day = now.getDay();
        const diff = day === 0 ? 6 : day - 1;
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
        break;
      }
      case "month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "3months":
        start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case "year":
        start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      default:
        return null;
    }
    return start.toISOString().slice(0, 10);
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    let filtered = data.rows;

    // Time range filter — project is "active" if hours or schedule overlap
    const rangeStart = getTimeRangeStart(timeRange);
    if (rangeStart) {
      filtered = filtered.filter((r) => {
        const hoursOverlap = r.tracking_do && r.tracking_do >= rangeStart;
        const schedOverlap = r.schedule_do && r.schedule_do >= rangeStart;
        return hoursOverlap || schedOverlap;
      });
    }

    // Category filter:
    //  - "vyroba" / "done"  → projects only (category === "project")
    //  - "rezie"            → overhead rows (category === "rezie")
    //  - unmatched rows visible only when "vyroba" selected (kept as before)
    const wantVyroba = statusFilters.has("vyroba");
    const wantDone = statusFilters.has("done");
    const wantRezie = statusFilters.has("rezie");
    filtered = filtered.filter((r) => {
      if (r.category === "rezie") return wantRezie;
      if (r.category === "unmatched") return wantVyroba;
      // category === "project"
      if (wantVyroba && (r.balik === "IN_PROGRESS" || r.balik === "OVER")) return true;
      if (wantDone && r.balik === "DONE") return true;
      return false;
    });

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
          case "preset_label":
            cmp = a.preset_label.localeCompare(b.preset_label, "cs");
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
  }, [data, timeRange, statusFilters, search, sortCol, sortDir, getTimeRangeStart]);

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

  const visibleCols = useMemo(
    () => ANALYTICS_COLUMNS.filter((c) => isVisible(c.key)),
    [isVisible]
  );

  const allCurrentLabels = useMemo(() => {
    return visibleCols.map((c) => getLabel(c.key, ANALYTICS_LABEL_MAP[c.key] || c.label));
  }, [visibleCols, getLabel]);

  const tabs: ShellTabDef[] = [
    { key: "projekty", label: "Projekty" },
    { key: "rezie", label: "Režije" },
    { key: "dilna", label: "Dílna" },
  ];

  return (
    <PageTabsShell tabs={tabs} defaultTab="projekty" paramName="tab">
      {() => (
    <div className="h-full flex flex-col overflow-hidden bg-card">
      {/* Per-tab toolbar */}
      <div className="shrink-0 px-4 py-2 flex items-center justify-between border-b bg-card">

        {!dilnaMode && (
          <div className="flex items-center gap-2">
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)}>
              <SelectTrigger className="h-7 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week" className="text-xs">Tento týden</SelectItem>
                <SelectItem value="month" className="text-xs">Tento měsíc</SelectItem>
                <SelectItem value="3months" className="text-xs">Poslední 3 měsíce</SelectItem>
                <SelectItem value="year" className="text-xs">Poslední rok</SelectItem>
                <SelectItem value="all" className="text-xs">Vše</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1 ml-2">
              {([
                { key: "vyroba" as const, label: "🔄 Výroba", activeClass: "bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400" },
                { key: "done" as const, label: "✅ Dokončeno", activeClass: "bg-muted text-muted-foreground" },
                { key: "rezie" as const, label: "🏭 Režije", activeClass: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400" },
              ]).map((chip) => {
                const active = statusFilters.has(chip.key);
                return (
                  <button
                    key={chip.key}
                    onClick={() => {
                      setStatusFilters((prev) => {
                        const isActive = prev.has(chip.key);
                        // Režije is exclusive — clicking it isolates overhead view
                        if (chip.key === "rezie") {
                          if (isActive) {
                            // toggling off → restore default project view
                            return new Set(["vyroba", "done"]);
                          }
                          return new Set(["rezie"]);
                        }
                        // Clicking a non-režie chip while režie is active → switch to project view
                        if (prev.has("rezie")) {
                          return new Set([chip.key]);
                        }
                        const next = new Set(prev);
                        if (isActive) next.delete(chip.key);
                        else next.add(chip.key);
                        return next;
                      });
                    }}
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer",
                      active ? chip.activeClass : "border-dashed border-muted-foreground/30 text-muted-foreground/50"
                    )}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {dilnaMode && (
          (() => {
            const wi = getISOWeekForOffset(dilnaWeekOffset);
            const isCurrentWeek = dilnaWeekOffset === 0;
            return (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDilnaWeekOffset(o => o - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <button
                  className={cn(
                    "text-sm font-bold tabular-nums px-1.5 py-0.5 rounded hover:bg-muted transition-colors",
                    !isCurrentWeek && "text-primary underline underline-offset-2 cursor-pointer"
                  )}
                  onClick={() => setDilnaWeekOffset(0)}
                  title="Zpět na aktuální týden"
                >
                  T{wi.week}
                </button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDilnaWeekOffset(o => o + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground ml-1">
                  {wi.monday.getDate()}.{wi.monday.getMonth() + 1}. – {wi.friday.getDate()}.{wi.friday.getMonth() + 1}.
                </span>
                {!isCurrentWeek && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px] ml-2"
                    onClick={() => setDilnaWeekOffset(0)}
                  >
                    Dnes
                  </Button>
                )}
              </div>
            );
          })()
        )}
        <div className="ml-auto flex items-center gap-2">
          {!dilnaMode && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      disabled={recalculating}
                      onClick={() => setRecalcDialogOpen(true)}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", recalculating && "animate-spin")} />
                      Přepočítat
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Přepočítá hodiny výroby a inboxu podle aktuálních TPV dat</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TableSearchBar
                value={search}
                onChange={setSearch}
                placeholder="Hledat projekt..."
              />
            </>
          )}
        </div>
      </div>

      {dilnaMode ? (
        <DilnaDashboard weekOffset={dilnaWeekOffset} />
      ) : (
        <>
          {/* Summary cards */}
          <div className="shrink-0 px-4 py-2 grid grid-cols-5 gap-3">
            {(() => { const onlyRezie = statusFilters.has("rezie") && statusFilters.size === 1; return (<>
            <Card>
              <CardContent className="pt-3 pb-2 px-3">
                <p className="text-[10px] text-muted-foreground mb-0.5">{onlyRezie ? "Režijní položky" : "Projekty"}</p>
                <p className="text-lg font-bold tabular-nums">{isLoading ? <Skeleton className="h-6 w-12" /> : summary.count}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-2 px-3">
                <p className="text-[10px] text-muted-foreground mb-0.5">Plán hodin</p>
                <p className="text-lg font-bold tabular-nums">{isLoading ? <Skeleton className="h-6 w-16" /> : (onlyRezie ? "—" : formatHours(summary.totalPlan))}</p>
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
                  !onlyRezie && summary.avgPct != null && summary.avgPct <= 80 && "text-green-600",
                  !onlyRezie && summary.avgPct != null && summary.avgPct > 80 && summary.avgPct <= 100 && "text-orange-500",
                  !onlyRezie && summary.avgPct != null && summary.avgPct > 100 && "text-red-500",
                )}>
                  {isLoading ? <Skeleton className="h-6 w-12" /> : (onlyRezie ? "—" : (summary.avgPct != null ? `${summary.avgPct} %` : "—"))}
                </p>
              </CardContent>
            </Card>
            </>); })()}
            <UtilizationCard
              isLoading={isLoading}
              utilization30d={data?.summary.utilization30d ?? null}
              utilizationMedian3m={data?.summary.utilizationMedian3m ?? null}
              utilizationTrend={data?.summary.utilizationTrend ?? null}
              utilizationTarget={data?.summary.utilizationTarget ?? 83}
              productionProjectHours30d={data?.summary.productionProjectHours30d ?? 0}
              productionRezieHours30d={data?.summary.productionRezieHours30d ?? 0}
              rezieRows={data?.rows.filter((r) => r.category === "rezie") ?? []}
              rezieByCode={data?.summary.rezieByCode ?? {}}
            />
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 px-4 pb-4">
            {editMode && (
              <div className="bg-accent/10 border border-accent/30 text-accent text-xs font-medium px-3 py-1.5 rounded-t-lg shrink-0">
                Režim úpravy sloupců
              </div>
            )}
            <div className={cn("rounded-lg border bg-card flex flex-col h-full", editMode && "rounded-t-none border-t-0")}>
              <div className="flex-1 overflow-auto always-scrollbar rounded-t-lg">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="bg-primary/5">
                      {visibleCols.map((col) => (
                        <SortableHeader
                          key={col.key}
                          label={getLabel(col.key, ANALYTICS_LABEL_MAP[col.key] || col.label)}
                          column={col.key}
                          sortCol={sortCol}
                          sortDir={sortDir}
                          onSort={toggleSort}
                          editMode={editMode}
                          customLabel={getLabel(col.key, ANALYTICS_LABEL_MAP[col.key] || col.label)}
                          onLabelChange={(newLabel) => updateLabel(col.key, newLabel)}
                          onWidthChange={(newWidth) => updateWidth(col.key, newWidth)}
                          existingLabels={allCurrentLabels}
                          style={getWidth(col.key) ? { width: getWidth(col.key)! } : undefined}
                        />
                      ))}
                      <ColumnVisibilityToggle
                        standalone
                        columns={ANALYTICS_COLUMNS.filter((c) => !c.locked)}
                        groupLabel="Analytics"
                        labelTab="analytics"
                        isVisible={isVisible}
                        toggleColumn={toggleColumn}
                        editMode={editMode}
                        onToggleEditMode={canEditColumns ? handleToggleEditMode : undefined}
                        onCancelEditMode={canEditColumns ? handleCancelEditMode : undefined}
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          {visibleCols.map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                          <TableCell />
                        </TableRow>
                      ))
                    ) : rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={visibleCols.length + 1} className="text-center py-8 text-muted-foreground text-sm">
                          Žádné projekty
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((r) => (
                        <Fragment key={r.project_id}>
                          <AnalyticsTableRow
                            row={r}
                            onOpenDetail={setDetailProjectId}
                            isVisible={isVisible}
                            onToggleForceProject={handleToggleForceProject}
                            expanded={expandedRows.has(r.project_id)}
                            onToggleExpand={toggleExpand}
                          />
                          {expandedRows.has(r.project_id) && (
                            <AnalyticsBreakdownRow
                              projectId={r.project_id}
                              colSpan={visibleCols.length + 1}
                              timeRange={timeRange}
                            />
                          )}
                        </Fragment>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </>
      )}

      <ProjectDetailDialog
        project={detailProject}
        open={!!detailProjectId}
        onOpenChange={(open) => { if (!open) setDetailProjectId(null); }}
      />
      <RecalculateDialog
        open={recalcDialogOpen}
        onClose={() => setRecalcDialogOpen(false)}
        onFutureOnly={() => doRecalculate(false)}
        onAll={() => doRecalculate(true)}
      />
    </div>
      )}
    </PageTabsShell>
  );
}

// ── Row component ────────────────────────────────────────────────────

function AnalyticsTableRow({
  row: r,
  onOpenDetail,
  isVisible,
  onToggleForceProject,
  expanded,
  onToggleExpand,
}: {
  row: AnalyticsRow;
  onOpenDetail: (id: string) => void;
  isVisible: (key: string) => boolean;
  onToggleForceProject?: (projectId: string, current: boolean) => void;
  expanded?: boolean;
  onToggleExpand?: (id: string) => void;
}) {
  const isRezie = r.category === "rezie";
  const muted = <span className="text-xs text-muted-foreground">—</span>;
  return (
    <TableRow
      className={cn(
        "hover:bg-muted/50 transition-colors h-9",
        r.balik === "OVER" && "bg-red-50 dark:bg-red-950/20",
        r.balik === "DONE" && "opacity-60",
        r.unmatched && "bg-amber-50/40 dark:bg-amber-950/10 italic"
      )}
    >
      {isVisible("project_id") && (
        <TableCell>
          <div className="flex items-center gap-1">
            {onToggleExpand && (
              <button
                onClick={() => onToggleExpand(r.project_id)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label={expanded ? "Sbalit" : "Rozbalit"}
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            )}
            {r.unmatched || isRezie ? (
              <span className="whitespace-nowrap font-mono text-xs text-muted-foreground font-semibold">
                {r.project_id}
              </span>
            ) : (
              <button
                onClick={() => onOpenDetail(r.project_id)}
                className="whitespace-nowrap font-mono text-xs text-primary hover:underline cursor-pointer font-semibold"
              >
                {r.project_id}
              </button>
            )}
          </div>
        </TableCell>
      )}
      {isVisible("project_name") && (
        <TableCell style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.unmatched ? "Hodiny v Alvenu, ale projekt nie je v databáze" : r.project_name}>
          {r.unmatched ? (
            <span className="text-xs text-muted-foreground truncate inline-flex items-center gap-1">
              <span className="text-[9px] font-medium px-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">⚠</span>
              {r.project_name}
            </span>
          ) : isRezie ? (
            <span className="text-xs truncate">{r.project_name}</span>
          ) : (
            <span
              className="font-semibold text-xs cursor-pointer hover:underline hover:text-primary transition-colors truncate"
              onClick={() => onOpenDetail(r.project_id)}
            >
              {r.project_name}
            </span>
          )}
        </TableCell>
      )}
      {isVisible("pm") && <TableCell className="text-xs">{isRezie ? muted : (r.pm || "—")}</TableCell>}
      {isVisible("status") && <TableCell>{isRezie ? muted : (r.status ? <StatusBadge status={r.status} /> : "—")}</TableCell>}
      {isVisible("balik") && <TableCell>{isRezie || r.unmatched ? muted : <BalikBadge balik={r.balik} />}</TableCell>}
      {isVisible("preset_label") && (
        <TableCell className="text-xs">
          {isRezie ? muted : (
            <span className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-medium",
              r.preset_label === "Custom" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-muted text-muted-foreground"
            )}>
              {r.preset_label}
            </span>
          )}
        </TableCell>
      )}
      {isVisible("hodiny_plan") && (
        <TableCell className="text-right text-xs tabular-nums">
          {isRezie ? muted : (
            <div className="flex items-center justify-end gap-1">
              {r.hodiny_plan != null ? Math.round(r.hodiny_plan) : "—"}
              {r.plan_source && r.plan_source !== "None" && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={cn(
                        "text-[9px] font-medium px-1 rounded cursor-default",
                        r.plan_source === "TPV"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      )}>
                        {r.force_project_price ? "P*" : r.plan_source === "TPV" ? "T" : "P"}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {r.force_project_price
                        ? "Manuálně přepnuto na cenu projektu"
                        : r.plan_source === "TPV"
                          ? "Počítáno z TPV položek"
                          : "Počítáno z prodejní ceny projektu"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {r.warning_low_tpv && !r.force_project_price && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent>TPV pokrývá méně než 60 % ceny projektu</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {onToggleForceProject && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onToggleForceProject(r.project_id, r.force_project_price)}
                        className="ml-0.5 text-muted-foreground hover:text-primary transition-colors"
                      >
                        {r.force_project_price
                          ? <ToggleRight className="h-3 w-3 text-blue-500" />
                          : <ToggleLeft className="h-3 w-3" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {r.force_project_price
                        ? "Přepnout zpět na automatický výpočet"
                        : "Vynutit výpočet z ceny projektu"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          )}
        </TableCell>
      )}
      {isVisible("hodiny_skutocne") && (
        <TableCell className="text-right text-xs tabular-nums font-medium">
          {Math.round(r.hodiny_skutocne)}
        </TableCell>
      )}
      {isVisible("pct") && <TableCell>{isRezie ? muted : <PctBar pct={r.pct} />}</TableCell>}
      {isVisible("zostatok") && (
        <TableCell className={cn(
          "text-right text-xs tabular-nums",
          !isRezie && r.zostatok != null && r.zostatok > 0 && "text-green-600",
          !isRezie && r.zostatok != null && r.zostatok === 0 && "text-muted-foreground",
        )}>
          {isRezie ? muted : (r.zostatok != null ? Math.round(r.zostatok) : "—")}
        </TableCell>
      )}
      {isVisible("tracking") && (
        <TableCell className="text-xs text-muted-foreground">
          {r.tracking_od && r.tracking_do
            ? `${formatDate(r.tracking_od)}–${formatDate(r.tracking_do)}`
            : "—"}
        </TableCell>
      )}
      {/* Empty cell for column toggle header */}
      <TableCell className="w-0 p-0" />
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

function UtilizationCard({
  isLoading,
  utilization30d,
  utilizationMedian3m,
  utilizationTrend,
  utilizationTarget,
  productionProjectHours30d,
  productionRezieHours30d,
  rezieRows,
  rezieByCode,
}: {
  isLoading: boolean;
  utilization30d: number | null;
  utilizationMedian3m: number | null;
  utilizationTrend: "up" | "down" | "flat" | null;
  utilizationTarget: number;
  productionProjectHours30d: number;
  productionRezieHours30d: number;
  rezieRows: AnalyticsRow[];
  rezieByCode: Record<string, number>;
}) {
  const isBelow = utilization30d != null && utilization30d < utilizationTarget;
  const trendIcon = utilizationTrend === "up" ? "↑" : utilizationTrend === "down" ? "↓" : utilizationTrend === "flat" ? "→" : "";
  const trendClass =
    utilizationTrend === "up"
      ? "text-green-600 dark:text-green-500"
      : utilizationTrend === "down"
      ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground";
  const trendLabel =
    utilizationTrend === "up" ? "stoupá" : utilizationTrend === "down" ? "klesá" : utilizationTrend === "flat" ? "stabilní" : "—";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className={cn(
            "cursor-help transition-colors",
            isBelow && "border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10"
          )}>
            <CardContent className="pt-3 pb-2 px-3">
              <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
                🏭 Utilizace výroby
              </p>
              <div className="flex items-baseline gap-2">
                <p className={cn(
                  "text-lg font-bold tabular-nums",
                  isBelow ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-500"
                )}>
                  {isLoading ? <Skeleton className="h-6 w-12" /> : utilization30d != null ? `${utilization30d} %` : "—"}
                </p>
                {trendIcon && (
                  <span className={cn("text-sm font-bold", trendClass)} title={`Trend: ${trendLabel}`}>
                    {trendIcon}
                  </span>
                )}
              </div>
              <p className="text-[9px] text-muted-foreground tabular-nums mt-0.5">
                30 dní • medián 3m: {utilizationMedian3m != null ? `${utilizationMedian3m} %` : "—"} • cíl ≥ {utilizationTarget} %
              </p>
            </CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <div className="space-y-1.5">
            <p className="font-semibold text-xs">Utilizace výroby</p>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Podíl projektových hodin na celkových hodinách výrobních pracovníků (Dílna 1/2/3 + Sklad).
              Hodiny PM/Eng/Admin se nezapočítávají.
            </p>
            <div className="border-t pt-1 space-y-0.5 text-[10px] tabular-nums">
              <div className="flex justify-between gap-3">
                <span>Posledních 30 dní:</span>
                <span>{formatHours(productionProjectHours30d)} proj. / {formatHours(productionRezieHours30d)} režie</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Medián 3 měsíců:</span>
                <span>{utilizationMedian3m != null ? `${utilizationMedian3m} %` : "—"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Trend:</span>
                <span className={trendClass}>{trendIcon} {trendLabel}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Cíl:</span>
                <span>≥ {utilizationTarget} %</span>
              </div>
            </div>
            {rezieRows.length > 0 && (
              <div className="border-t pt-1 mt-1 space-y-0.5">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5">Režie celkem (lifetime)</p>
                {rezieRows.map((r) => (
                  <div key={r.project_id} className="flex justify-between gap-3 text-[10px] tabular-nums">
                    <span className="font-mono">{r.project_id}</span>
                    <span className="text-muted-foreground truncate flex-1 text-left">{r.project_name}</span>
                    <span>{formatHours(rezieByCode[r.project_id] || 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
