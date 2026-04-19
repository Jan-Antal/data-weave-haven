import { useState, useMemo, useCallback, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSearchBar } from "@/components/TableSearchBar";
import { ProjectDetailDialog } from "@/components/ProjectDetailDialog";
import { useProjects } from "@/hooks/useProjects";
import { cn } from "@/lib/utils";
import { normalizeSearch, normalizedIncludes } from "@/lib/statusFilter";

type DateRange = "week" | "month" | "3months" | "custom";
type GroupBy = "projekt" | "osoba" | "cinnost";

const EXCLUDED_CINNOST = new Set(["TPV", "ENG", "PRO"]);

interface LogRow {
  ami_project_id: string;
  zamestnanec: string;
  cinnost_kod: string | null;
  cinnost_nazov: string | null;
  hodiny: number;
  datum_sync: string;
}

function formatHours(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString("cs-CZ") + " h";
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y.slice(2)}`;
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getRangeBounds(range: DateRange, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  if (range === "custom") {
    return { from: customFrom || toLocalDateStr(now), to: customTo || toLocalDateStr(now) };
  }
  let start: Date;
  if (range === "week") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
  } else if (range === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
  }
  return { from: toLocalDateStr(start), to: toLocalDateStr(now) };
}

export function VykazReport() {
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [customFrom, setCustomFrom] = useState<string>(() => toLocalDateStr(new Date()));
  const [customTo, setCustomTo] = useState<string>(() => toLocalDateStr(new Date()));
  const [groupBy, setGroupBy] = useState<GroupBy>("projekt");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);

  const { from, to } = useMemo(
    () => getRangeBounds(dateRange, customFrom, customTo),
    [dateRange, customFrom, customTo],
  );

  const { data: projectsList = [] } = useProjects();
  const projectsMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projectsList as any[]) m.set(p.project_id, p.project_name);
    return m;
  }, [projectsList]);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["vykaz-log", from, to],
    queryFn: async (): Promise<LogRow[]> => {
      const { data, error } = await supabase
        .from("production_hours_log")
        .select("ami_project_id,zamestnanec,cinnost_kod,cinnost_nazov,hodiny,datum_sync")
        .gte("datum_sync", from)
        .lte("datum_sync", to)
        .range(0, 99999);
      if (error) throw error;
      return ((data ?? []) as LogRow[]).filter(
        (r) => !r.cinnost_kod || !EXCLUDED_CINNOST.has(r.cinnost_kod),
      );
    },
  });

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const detailProject = useMemo(() => {
    if (!detailProjectId) return null;
    return (projectsList as any[]).find((p) => p.project_id === detailProjectId) || null;
  }, [detailProjectId, projectsList]);

  // ── Aggregation ─────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const q = search ? normalizeSearch(search) : null;

    if (groupBy === "projekt") {
      const map = new Map<string, {
        key: string;
        projectId: string;
        projectName: string;
        matched: boolean;
        hodiny: number;
        records: number;
        last: string;
        rows: LogRow[];
      }>();
      for (const r of logs) {
        const id = r.ami_project_id || "—";
        let g = map.get(id);
        if (!g) {
          const matchedName = projectsMap.get(id);
          g = {
            key: id,
            projectId: id,
            projectName: matchedName ?? id,
            matched: !!matchedName,
            hodiny: 0,
            records: 0,
            last: r.datum_sync,
            rows: [],
          };
          map.set(id, g);
        }
        g.hodiny += Number(r.hodiny) || 0;
        g.records += 1;
        if (r.datum_sync > g.last) g.last = r.datum_sync;
        g.rows.push(r);
      }
      let arr = Array.from(map.values());
      if (q) {
        arr = arr.filter(
          (g) => normalizedIncludes(g.projectId, q) || normalizedIncludes(g.projectName, q),
        );
      }
      arr.sort((a, b) => b.hodiny - a.hodiny);
      return arr;
    }

    if (groupBy === "osoba") {
      const map = new Map<string, {
        key: string;
        zamestnanec: string;
        hodiny: number;
        projects: Set<string>;
        rows: LogRow[];
      }>();
      for (const r of logs) {
        const k = r.zamestnanec || "—";
        let g = map.get(k);
        if (!g) {
          g = { key: k, zamestnanec: k, hodiny: 0, projects: new Set(), rows: [] };
          map.set(k, g);
        }
        g.hodiny += Number(r.hodiny) || 0;
        g.projects.add(r.ami_project_id);
        g.rows.push(r);
      }
      let arr = Array.from(map.values());
      if (q) arr = arr.filter((g) => normalizedIncludes(g.zamestnanec, q));
      arr.sort((a, b) => b.hodiny - a.hodiny);
      return arr;
    }

    // cinnost
    const map = new Map<string, {
      key: string;
      cinnost_kod: string;
      cinnost_nazov: string;
      hodiny: number;
      rows: LogRow[];
    }>();
    for (const r of logs) {
      const k = r.cinnost_kod || "—";
      let g = map.get(k);
      if (!g) {
        g = {
          key: k,
          cinnost_kod: k,
          cinnost_nazov: r.cinnost_nazov ?? "—",
          hodiny: 0,
          rows: [],
        };
        map.set(k, g);
      }
      g.hodiny += Number(r.hodiny) || 0;
      g.rows.push(r);
    }
    let arr = Array.from(map.values());
    if (q) {
      arr = arr.filter(
        (g) => normalizedIncludes(g.cinnost_nazov, q) || normalizedIncludes(g.cinnost_kod, q),
      );
    }
    arr.sort((a, b) => b.hodiny - a.hodiny);
    return arr;
  }, [logs, groupBy, search, projectsMap]);

  const totalHours = useMemo(
    () => (grouped as any[]).reduce((s, g) => s + g.hodiny, 0),
    [grouped],
  );

  // ── Summary stats (reactive to date range + filters) ────────────
  const summaryStats = useMemo(() => {
    const distinctProjects = new Set<string>();
    const distinctWorkers = new Set<string>();
    let allHours = 0;
    for (const r of logs) {
      distinctProjects.add(r.ami_project_id || "—");
      if (r.zamestnanec) distinctWorkers.add(r.zamestnanec);
      allHours += Number(r.hodiny) || 0;
    }
    let matched = 0;
    let unmatched = 0;
    for (const id of distinctProjects) {
      if (projectsMap.has(id)) matched++;
      else unmatched++;
    }
    return {
      totalHours: allHours,
      activeWorkers: distinctWorkers.size,
      matchedProjects: matched,
      unmatchedProjects: unmatched,
    };
  }, [logs, projectsMap]);

  // ── CSV Export ──────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const lines: string[] = [];
    if (groupBy === "projekt") {
      lines.push("Projekt ID;Název;Stav;Hodiny;Záznamů;Poslední záznam");
      for (const g of grouped as any[]) {
        lines.push([
          g.projectId,
          `"${g.projectName.replace(/"/g, '""')}"`,
          g.matched ? "Spárováno" : "Nespárováno",
          (Math.round(g.hodiny * 10) / 10).toString().replace(".", ","),
          g.records,
          g.last,
        ].join(";"));
      }
    } else if (groupBy === "osoba") {
      lines.push("Jméno;Počet projektů;Hodiny celkem");
      for (const g of grouped as any[]) {
        lines.push([
          `"${g.zamestnanec.replace(/"/g, '""')}"`,
          g.projects.size,
          (Math.round(g.hodiny * 10) / 10).toString().replace(".", ","),
        ].join(";"));
      }
    } else {
      lines.push("Název činnosti;Kód;Hodiny");
      for (const g of grouped as any[]) {
        lines.push([
          `"${g.cinnost_nazov.replace(/"/g, '""')}"`,
          g.cinnost_kod,
          (Math.round(g.hodiny * 10) / 10).toString().replace(".", ","),
        ].join(";"));
      }
    }
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vykaz_${from}_${to}_${groupBy}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [grouped, groupBy, from, to]);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden bg-card">
      {/* Summary cards */}
      <div className="shrink-0 px-4 pt-4 pb-2 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Celkem hodin</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">{formatHours(summaryStats.totalHours)}</div>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Aktivní pracovníci</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">{summaryStats.activeWorkers}</div>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Spárované projekty</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">{summaryStats.matchedProjects}</div>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Nespárováno</div>
          <div
            className={cn(
              "text-2xl font-bold mt-1 tabular-nums",
              summaryStats.unmatchedProjects > 0 ? "" : "text-muted-foreground",
            )}
            style={summaryStats.unmatchedProjects > 0 ? { color: "#854F0B" } : undefined}
          >
            {summaryStats.unmatchedProjects}
          </div>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="shrink-0 border-b bg-card px-4 py-2 flex items-center gap-3">
        {/* Left: date range */}
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week" className="text-xs">Tento týden</SelectItem>
              <SelectItem value="month" className="text-xs">Tento měsíc</SelectItem>
              <SelectItem value="3months" className="text-xs">Poslední 3 měsíce</SelectItem>
              <SelectItem value="custom" className="text-xs">Vlastní</SelectItem>
            </SelectContent>
          </Select>
          {dateRange === "custom" && (
            <>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 w-[140px] text-xs"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 w-[140px] text-xs"
              />
            </>
          )}
        </div>

        {/* Center: segmented control */}
        <div className="flex-1 flex justify-center">
          <div className="inline-flex items-center bg-muted rounded-lg p-0.5">
            {([
              { key: "projekt", label: "Projekt" },
              { key: "osoba", label: "Osoba" },
              { key: "cinnost", label: "Činnosť" },
            ] as const).map((opt) => {
              const active = groupBy === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setGroupBy(opt.key)}
                  className={cn(
                    "h-7 px-3 text-xs rounded-md transition-colors",
                    active
                      ? "bg-background shadow-sm font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: search + export */}
        <div className="flex items-center gap-2">
          <TableSearchBar value={search} onChange={setSearch} placeholder="Hledat..." />
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs gap-1.5"
            onClick={handleExport}
            disabled={isLoading || grouped.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 px-4 py-4">
        <div className="rounded-lg border bg-card flex flex-col h-full">
          <div className="flex-1 overflow-auto always-scrollbar rounded-lg">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/50">
                {groupBy === "projekt" && (
                  <TableRow className="hover:bg-transparent border-b">
                    <TableHead className="w-[40%] text-[11px] uppercase tracking-wide text-muted-foreground font-medium h-9">Projekt</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium h-9">Stav</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground font-medium h-9">Hodiny</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground font-medium h-9">Záznamů</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium h-9">Posledný záznam</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                )}
                {groupBy === "osoba" && (
                  <TableRow className="hover:bg-transparent border-b">
                    <TableHead className="w-[60%] text-[11px] uppercase tracking-wide text-muted-foreground font-medium h-9">Jméno</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground font-medium h-9">Počet projektů</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground font-medium h-9">Hodiny celkem</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                )}
                {groupBy === "cinnost" && (
                  <TableRow className="hover:bg-transparent border-b">
                    <TableHead className="w-[60%] text-[11px] uppercase tracking-wide text-muted-foreground font-medium h-9">Název činnosti</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium h-9">Kód</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground font-medium h-9">Hodiny</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : grouped.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                      Žádné záznamy v zvoleném období
                    </TableCell>
                  </TableRow>
                ) : groupBy === "projekt" ? (
                  <ProjektRows
                    grouped={grouped as any}
                    expanded={expanded}
                    toggleExpand={toggleExpand}
                    onOpenDetail={setDetailProjectId}
                  />
                ) : groupBy === "osoba" ? (
                  <OsobaRows
                    grouped={grouped as any}
                    expanded={expanded}
                    toggleExpand={toggleExpand}
                    projectsMap={projectsMap}
                    onOpenDetail={setDetailProjectId}
                  />
                ) : (
                  <CinnostRows
                    grouped={grouped as any}
                    expanded={expanded}
                    toggleExpand={toggleExpand}
                    projectsMap={projectsMap}
                    onOpenDetail={setDetailProjectId}
                  />
                )}
              </TableBody>
              {grouped.length > 0 && (
                <tfoot className="bg-muted/50 sticky bottom-0 border-t border-border">
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="text-[13px] font-semibold">Celkem</TableCell>
                    {groupBy === "projekt" && (
                      <>
                        <TableCell />
                        <TableCell className="text-right text-[14px] font-bold tabular-nums" style={{ color: "#0a2e28" }}>{formatHours(totalHours)}</TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell />
                      </>
                    )}
                    {groupBy === "osoba" && (
                      <>
                        <TableCell />
                        <TableCell className="text-right text-[14px] font-bold tabular-nums" style={{ color: "#0a2e28" }}>{formatHours(totalHours)}</TableCell>
                        <TableCell />
                      </>
                    )}
                    {groupBy === "cinnost" && (
                      <>
                        <TableCell />
                        <TableCell className="text-right text-[14px] font-bold tabular-nums" style={{ color: "#0a2e28" }}>{formatHours(totalHours)}</TableCell>
                        <TableCell />
                      </>
                    )}
                  </TableRow>
                </tfoot>
              )}
            </Table>
          </div>
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

// ── Projekt rows (matched first, then unmatched separator) ─────────
function ProjektRows({
  grouped,
  expanded,
  toggleExpand,
  onOpenDetail,
}: {
  grouped: Array<{
    key: string; projectId: string; projectName: string; matched: boolean;
    hodiny: number; records: number; last: string; rows: LogRow[];
  }>;
  expanded: Set<string>;
  toggleExpand: (k: string) => void;
  onOpenDetail: (id: string) => void;
}) {
  const matched = grouped.filter((g) => g.matched);
  const unmatched = grouped.filter((g) => !g.matched);

  return (
    <>
      {matched.map((g) => (
        <ProjektRow
          key={g.key}
          g={g}
          expanded={expanded.has(g.key)}
          onToggle={() => toggleExpand(g.key)}
          onOpenDetail={onOpenDetail}
        />
      ))}
      {unmatched.length > 0 && (
        <>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={6} className="p-0">
              <div className="bg-[#FEF3C7] border-l-[3px] border-l-[#F59E0B] px-4 py-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[#F59E0B]" />
                <span className="font-semibold text-[12px] text-[#92400E]">
                  Nespárované záznamy z Alvena · {unmatched.length} {unmatched.length === 1 ? "projekt" : "projektů"}
                </span>
              </div>
            </TableCell>
          </TableRow>
          {unmatched.map((g) => (
            <ProjektRow
              key={g.key}
              g={g}
              expanded={expanded.has(g.key)}
              onToggle={() => toggleExpand(g.key)}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </>
      )}
    </>
  );
}

function ProjektRow({
  g, expanded, onToggle, onOpenDetail,
}: {
  g: { key: string; projectId: string; projectName: string; matched: boolean;
    hodiny: number; records: number; last: string; rows: LogRow[]; };
  expanded: boolean;
  onToggle: () => void;
  onOpenDetail: (id: string) => void;
}) {
  return (
    <Fragment>
      <TableRow
        className={cn(
          "hover:bg-muted/50 cursor-pointer",
          !g.matched && "border-l-[3px] border-l-amber-500 text-muted-foreground",
        )}
        onClick={onToggle}
      >
        <TableCell>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            {g.matched ? (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenDetail(g.projectId); }}
                className="font-mono text-xs text-primary hover:underline font-semibold"
              >
                {g.projectId}
              </button>
            ) : (
              <span className="font-mono text-xs font-semibold">{g.projectId}</span>
            )}
            <span className="text-xs ml-2 truncate" title={g.projectName}>{g.projectName}</span>
          </div>
        </TableCell>
        <TableCell>
          {g.matched ? (
            <Badge variant="outline" className="text-[10px] bg-green-500/15 text-green-700 border-green-500/30">
              Spárováno
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-700 border-amber-500/30">
              Nespárováno
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-right text-xs tabular-nums font-medium">{formatHours(g.hodiny)}</TableCell>
        <TableCell className="text-right text-xs tabular-nums">{g.records}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{formatDate(g.last)}</TableCell>
        <TableCell />
      </TableRow>
      {expanded && <ProjektExpanded rows={g.rows} />}
    </Fragment>
  );
}

function ProjektExpanded({ rows }: { rows: LogRow[] }) {
  // Group by zamestnanec
  const byPerson = useMemo(() => {
    const map = new Map<string, { hodiny: number; cinnosti: Set<string>; min: string; max: string }>();
    for (const r of rows) {
      const k = r.zamestnanec || "—";
      let g = map.get(k);
      if (!g) {
        g = { hodiny: 0, cinnosti: new Set(), min: r.datum_sync, max: r.datum_sync };
        map.set(k, g);
      }
      g.hodiny += Number(r.hodiny) || 0;
      if (r.cinnost_nazov) g.cinnosti.add(r.cinnost_nazov);
      if (r.datum_sync < g.min) g.min = r.datum_sync;
      if (r.datum_sync > g.max) g.max = r.datum_sync;
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => b.hodiny - a.hodiny);
  }, [rows]);

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={6} className="p-0">
        <div className="bg-muted/30 border-l-2 border-border pl-10 pr-4 py-2 space-y-1">
          {byPerson.map(([name, g]) => (
            <div key={name} className="flex items-center gap-3">
              <span className="font-medium w-40 truncate text-[13px]">{name}</span>
              <div className="flex-1 flex flex-wrap gap-1">
                {Array.from(g.cinnosti).map((c) => (
                  <span key={c} className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-[11px]">
                    {c}
                  </span>
                ))}
              </div>
              <span className="tabular-nums font-medium w-20 text-right text-[13px]">{formatHours(g.hodiny)}</span>
              <span className="text-muted-foreground tabular-nums w-[130px] text-right text-[11px]">
                {formatDate(g.min)}–{formatDate(g.max)}
              </span>
            </div>
          ))}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ── Osoba rows ─────────────────────────────────────────────────────
function OsobaRows({
  grouped, expanded, toggleExpand, projectsMap, onOpenDetail,
}: {
  grouped: Array<{ key: string; zamestnanec: string; hodiny: number; projects: Set<string>; rows: LogRow[] }>;
  expanded: Set<string>;
  toggleExpand: (k: string) => void;
  projectsMap: Map<string, string>;
  onOpenDetail: (id: string) => void;
}) {
  return (
    <>
      {grouped.map((g) => (
        <Fragment key={g.key}>
          <TableRow className="hover:bg-muted/50 cursor-pointer" onClick={() => toggleExpand(g.key)}>
            <TableCell>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleExpand(g.key); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {expanded.has(g.key) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <span className="text-xs font-medium">{g.zamestnanec}</span>
              </div>
            </TableCell>
            <TableCell className="text-right text-xs tabular-nums">{g.projects.size}</TableCell>
            <TableCell className="text-right text-xs tabular-nums font-medium">{formatHours(g.hodiny)}</TableCell>
            <TableCell />
          </TableRow>
          {expanded.has(g.key) && (
            <SubByProject rows={g.rows} colSpan={4} projectsMap={projectsMap} onOpenDetail={onOpenDetail} />
          )}
        </Fragment>
      ))}
    </>
  );
}

// ── Cinnost rows ────────────────────────────────────────────────────
function CinnostRows({
  grouped, expanded, toggleExpand, projectsMap, onOpenDetail,
}: {
  grouped: Array<{ key: string; cinnost_kod: string; cinnost_nazov: string; hodiny: number; rows: LogRow[] }>;
  expanded: Set<string>;
  toggleExpand: (k: string) => void;
  projectsMap: Map<string, string>;
  onOpenDetail: (id: string) => void;
}) {
  return (
    <>
      {grouped.map((g) => (
        <Fragment key={g.key}>
          <TableRow className="hover:bg-muted/50 cursor-pointer" onClick={() => toggleExpand(g.key)}>
            <TableCell>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleExpand(g.key); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {expanded.has(g.key) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <span className="text-xs font-medium">{g.cinnost_nazov}</span>
              </div>
            </TableCell>
            <TableCell className="text-xs font-mono text-muted-foreground">{g.cinnost_kod}</TableCell>
            <TableCell className="text-right text-xs tabular-nums font-medium">{formatHours(g.hodiny)}</TableCell>
            <TableCell />
          </TableRow>
          {expanded.has(g.key) && (
            <SubByProject rows={g.rows} colSpan={4} projectsMap={projectsMap} onOpenDetail={onOpenDetail} />
          )}
        </Fragment>
      ))}
    </>
  );
}

function SubByProject({
  rows, colSpan, projectsMap, onOpenDetail,
}: {
  rows: LogRow[];
  colSpan: number;
  projectsMap: Map<string, string>;
  onOpenDetail: (id: string) => void;
}) {
  const byProject = useMemo(() => {
    const map = new Map<string, { hodiny: number; matched: boolean }>();
    for (const r of rows) {
      const k = r.ami_project_id || "—";
      let g = map.get(k);
      if (!g) { g = { hodiny: 0, matched: projectsMap.has(k) }; map.set(k, g); }
      g.hodiny += Number(r.hodiny) || 0;
    }
    return Array.from(map.entries())
      .map(([id, g]) => ({ id, ...g, name: projectsMap.get(id) ?? id }))
      .sort((a, b) => b.hodiny - a.hodiny);
  }, [rows, projectsMap]);

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={colSpan} className="p-0">
        <div className="pl-8 pr-4 py-2 space-y-1">
          {byProject.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-xs">
              {p.matched ? (
                <button
                  onClick={() => onOpenDetail(p.id)}
                  className="font-mono text-xs text-primary hover:underline"
                >
                  {p.id}
                </button>
              ) : (
                <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
              )}
              <span className="flex-1 truncate" title={p.name}>{p.name}</span>
              <span className="tabular-nums font-medium w-20 text-right">{formatHours(p.hodiny)}</span>
            </div>
          ))}
        </div>
      </TableCell>
    </TableRow>
  );
}
