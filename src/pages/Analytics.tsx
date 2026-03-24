import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { useAnalytics, type Balik } from "@/hooks/useAnalytics";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useProjects } from "@/hooks/useProjects";
import { ProjectDetailDialog } from "@/components/ProjectDetailDialog";
import { cn } from "@/lib/utils";
import { normalizeSearch, normalizedIncludes } from "@/lib/statusFilter";
import { recalculateProductionHours } from "@/lib/recalculateProductionHours";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

function formatHours(n: number | null): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("cs-CZ").replace(/,/g, " ") + " h";
}

function formatDate(d: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}.${m}`;
}

type SortKey = "pct_desc" | "pct_asc" | "name" | "pm";

export default function Analytics() {
  const navigate = useNavigate();
  const { data, isLoading } = useAnalytics();
  const { data: projects = [] } = useProjects();
  const [filter, setFilter] = useState<Balik | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("pct_desc");
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const queryClient = useQueryClient();

  const handleRecalculate = useCallback(async () => {
    setRecalculating(true);
    try {
      const updated = await recalculateProductionHours(supabase as any, "all");
      await queryClient.invalidateQueries({ queryKey: ["analytics"] });
      toast.success(`Přepočet dokončen — ${updated} položek aktualizováno`);
    } catch (e: any) {
      toast.error("Chyba při přepočtu: " + (e.message || "neznámá chyba"));
    } finally {
      setRecalculating(false);
    }
  }, [queryClient]);

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
    switch (sort) {
      case "pct_desc":
        sorted.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
        break;
      case "pct_asc":
        sorted.sort((a, b) => (a.pct ?? 999) - (b.pct ?? 999));
        break;
      case "name":
        sorted.sort((a, b) => a.project_name.localeCompare(b.project_name, "cs"));
        break;
      case "pm":
        sorted.sort((a, b) => (a.pm || "").localeCompare(b.pm || "", "cs"));
        break;
    }
    return sorted;
  }, [data, filter, search, sort]);

  const summary = data?.summary;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <BarChart3 className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Analytics — Výroba</h1>
        </div>
        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRecalculate}
                disabled={recalculating}
                className="gap-1.5"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", recalculating && "animate-spin")} />
                Přepočítat hodiny
              </Button>
            </TooltipTrigger>
            <TooltipContent>Přepočítá hodiny ve výrobě a inboxu podle aktuálních TPV dat</TooltipContent>
          </Tooltip>
          {summary?.lastSync && (
            <span className="text-xs text-muted-foreground">
              Poslední data: {formatDate(summary.lastSync)}
            </span>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="shrink-0 px-6 py-4 grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">Sledované projekty</p>
            <p className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-16" /> : data?.rows.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">Plán hodin</p>
            <p className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-20" /> : formatHours(summary?.totalPlan ?? null)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">Odpracováno</p>
            <p className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-20" /> : formatHours(summary?.totalSkutocne ?? null)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">Průměrné čerpání</p>
            <p className={cn(
              "text-2xl font-bold",
              summary?.avgPct != null && summary.avgPct <= 80 && "text-green-600",
              summary?.avgPct != null && summary.avgPct > 80 && summary.avgPct <= 100 && "text-orange-500",
              summary?.avgPct != null && summary.avgPct > 100 && "text-red-500",
            )}>
              {isLoading ? <Skeleton className="h-8 w-16" /> : summary?.avgPct != null ? `${summary.avgPct} %` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter row */}
      <div className="shrink-0 px-6 pb-3 flex items-center gap-4 flex-wrap">
        <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as typeof filter)}>
          <ToggleGroupItem value="ALL" className="text-xs h-8 px-3">Všechny</ToggleGroupItem>
          <ToggleGroupItem value="IN_PROGRESS" className="text-xs h-8 px-3">🔄 Výroba</ToggleGroupItem>
          <ToggleGroupItem value="DONE" className="text-xs h-8 px-3">✅ Hotovo</ToggleGroupItem>
          <ToggleGroupItem value="OVER" className="text-xs h-8 px-3">⚠ Přesčas</ToggleGroupItem>
        </ToggleGroup>
        <Input
          placeholder="Hledat projekt..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-56 text-sm"
        />
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pct_desc">% čerpání ↓</SelectItem>
            <SelectItem value="pct_asc">% čerpání ↑</SelectItem>
            <SelectItem value="name">Název</SelectItem>
            <SelectItem value="pm">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">ID</TableHead>
                <TableHead>Název projektu</TableHead>
                <TableHead className="w-28">PM</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-24">Balík</TableHead>
                <TableHead className="w-20 text-right">Plán h</TableHead>
                <TableHead className="w-24 text-right">Odprac. h</TableHead>
                <TableHead className="w-44">% čerpání</TableHead>
                <TableHead className="w-24 text-right">Zostatok h</TableHead>
                <TableHead className="w-32">Tracking</TableHead>
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
                  <TableRow
                    key={r.project_id}
                    className={cn(
                      r.balik === "OVER" && "bg-red-50 dark:bg-red-950/20",
                      r.balik === "DONE" && "opacity-60"
                    )}
                  >
                    <TableCell>
                      <button
                        onClick={() => setDetailProjectId(r.project_id)}
                        className="font-mono text-xs text-primary hover:underline cursor-pointer"
                      >
                        {r.project_id}
                      </button>
                    </TableCell>
                    <TableCell className="font-medium text-xs max-w-[200px] truncate">{r.project_name}</TableCell>
                    <TableCell className="text-xs">{r.pm || "—"}</TableCell>
                    <TableCell>{r.status ? <StatusBadge status={r.status} /> : "—"}</TableCell>
                    <TableCell>
                      <BalikBadge balik={r.balik} />
                    </TableCell>
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
                    <TableCell>
                      <PctBar pct={r.pct} />
                    </TableCell>
                    <TableCell className={cn(
                      "text-right text-xs tabular-nums",
                      r.zostatok != null && r.zostatok > 0 && "text-green-600",
                      r.zostatok != null && r.zostatok === 0 && "text-muted-foreground",
                    )}>
                      {r.zostatok != null ? Math.round(r.zostatok) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.tracking_od && r.tracking_do
                        ? `od ${formatDate(r.tracking_od)} do ${formatDate(r.tracking_do)}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Project Detail Dialog */}
      <ProjectDetailDialog
        project={detailProject}
        open={!!detailProjectId}
        onOpenChange={(open) => { if (!open) setDetailProjectId(null); }}
      />
    </div>
  );
}

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
      <div className="h-2 w-20 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${width}%` }} />
      </div>
      <span className={cn("text-xs tabular-nums font-medium whitespace-nowrap", pct > 100 && "text-red-500")}>
        {pct > 100 && <AlertTriangle className="inline h-3 w-3 mr-0.5 -mt-0.5" />}
        {pct} %
      </span>
    </div>
  );
}
