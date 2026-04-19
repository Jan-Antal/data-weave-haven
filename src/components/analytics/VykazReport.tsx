import { useState, useMemo, useCallback, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ChevronLeft, Download, AlertTriangle, Calendar as CalendarIcon, Trash2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, ReferenceArea } from "recharts";
import { useCzechHolidays, useCompanyHolidays } from "@/hooks/useWeeklyCapacity";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TableSearchBar } from "@/components/TableSearchBar";
import { ProjectDetailDialog } from "@/components/ProjectDetailDialog";
import { useProjects } from "@/hooks/useProjects";
import { useOverheadProjects } from "@/hooks/useOverheadProjects";
import { cn } from "@/lib/utils";
import { normalizeSearch, normalizedIncludes } from "@/lib/statusFilter";
import { formatAppDate } from "@/lib/dateFormat";

type DateRange = "week" | "month" | "prev_week" | "prev_month" | "3months" | "custom";
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

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
}

function getRangeBounds(
  range: DateRange,
  customFrom: string,
  customTo: string,
  offset: number,
): { from: string; to: string } {
  const now = new Date();
  if (range === "custom") {
    const f = customFrom ? new Date(customFrom + "T00:00:00") : now;
    const t = customTo ? new Date(customTo + "T00:00:00") : now;
    const spanDays = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1);
    const shifted = offset * spanDays;
    return { from: toLocalDateStr(addDays(f, shifted)), to: toLocalDateStr(addDays(t, shifted)) };
  }
  let start: Date;
  let end: Date = now;
  if (range === "week" || range === "prev_week") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    end = addDays(start, 6);
    const baseOffset = range === "prev_week" ? -1 : 0;
    const total = baseOffset + offset;
    if (total !== 0) {
      start = addDays(start, total * 7);
      end = addDays(end, total * 7);
    }
  } else if (range === "month" || range === "prev_month") {
    const baseOffset = range === "prev_month" ? -1 : 0;
    const total = baseOffset + offset;
    start = new Date(now.getFullYear(), now.getMonth() + total, 1);
    end = new Date(now.getFullYear(), now.getMonth() + total + 1, 0);
  } else {
    start = new Date(now.getFullYear(), now.getMonth() - 3 + offset * 3, now.getDate());
    end = offset === 0 ? now : addMonths(start, 3);
  }
  return { from: toLocalDateStr(start), to: toLocalDateStr(end) };
}

export function VykazReport() {
  const [dateRange, setDateRangeRaw] = useState<DateRange>("month");
  const [customFrom, setCustomFrom] = useState<string>(() => toLocalDateStr(new Date()));
  const [customTo, setCustomTo] = useState<string>(() => toLocalDateStr(new Date()));
  const [groupBy, setGroupBy] = useState<GroupBy>("projekt");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [bucketMode, setBucketMode] = useState<"auto" | "day" | "week">("auto");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [rangeOffset, setRangeOffset] = useState(0);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const setDateRange = useCallback((r: DateRange) => {
    setDateRangeRaw(r);
    setRangeOffset(0);
  }, []);

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const { from, to } = useMemo(
    () => getRangeBounds(dateRange, customFrom, customTo, rangeOffset),
    [dateRange, customFrom, customTo, rangeOffset],
  );

  const { data: projectsList = [] } = useProjects();
  const projectsMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projectsList as any[]) m.set(p.project_id, p.project_name);
    return m;
  }, [projectsList]);

  const { data: overheadList = [] } = useOverheadProjects();
  const overheadMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of overheadList) if (o.is_active) m.set(o.project_code, o.label);
    return m;
  }, [overheadList]);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["vykaz-log", from, to],
    queryFn: async (): Promise<LogRow[]> => {
      const PAGE = 1000;
      let all: LogRow[] = [];
      let offset = 0;
      // Paginate to bypass Supabase's server-side row cap (~1000 rows/request).
      while (true) {
        const { data, error } = await supabase
          .from("production_hours_log")
          .select("ami_project_id,zamestnanec,cinnost_kod,cinnost_nazov,hodiny,datum_sync")
          .gte("datum_sync", from)
          .lte("datum_sync", to)
          .order("datum_sync", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as LogRow[];
        if (!batch.length) break;
        all = all.concat(batch);
        if (batch.length < PAGE) break;
        offset += PAGE;
      }
      return all.filter((r) => !r.cinnost_kod || !EXCLUDED_CINNOST.has(r.cinnost_kod));
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
        isOverhead: boolean;
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
          const overheadLabel = overheadMap.get(id);
          g = {
            key: id,
            projectId: id,
            projectName: matchedName ?? overheadLabel ?? id,
            matched: !!matchedName || !!overheadLabel,
            isOverhead: !!overheadLabel,
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
  }, [logs, groupBy, search, projectsMap, overheadMap]);

  const totalHours = useMemo(
    () => (grouped as any[]).reduce((s, g) => s + g.hodiny, 0),
    [grouped],
  );

  // ── Summary stats (reactive to date range + filters) ────────────
  const summaryStats = useMemo(() => {
    const distinctProjects = new Set<string>();
    const distinctWorkers = new Set<string>();
    let allHours = 0;
    let projektHours = 0;
    let rezijneHours = 0;
    let nesparovaneHours = 0;
    for (const r of logs) {
      const id = r.ami_project_id || "—";
      distinctProjects.add(id);
      if (r.zamestnanec) distinctWorkers.add(r.zamestnanec);
      const h = Number(r.hodiny) || 0;
      allHours += h;
      if (projectsMap.has(id)) projektHours += h;
      else if (overheadMap.has(id)) rezijneHours += h;
      else nesparovaneHours += h;
    }
    let matched = 0;
    let unmatched = 0;
    for (const id of distinctProjects) {
      if (projectsMap.has(id) || overheadMap.has(id)) matched++;
      else unmatched++;
    }
    const utilization = allHours > 0 ? ((allHours - rezijneHours) / allHours) * 100 : 0;
    return {
      totalHours: allHours,
      activeWorkers: distinctWorkers.size,
      matchedProjects: matched,
      unmatchedProjects: unmatched,
      projektHours,
      rezijneHours,
      nesparovaneHours,
      utilization,
    };
  }, [logs, projectsMap, overheadMap]);

  // ── Holidays for non-working highlight ──────────────────────────
  const fromYear = useMemo(() => new Date(from + "T00:00:00").getFullYear(), [from]);
  const toYear = useMemo(() => new Date(to + "T00:00:00").getFullYear(), [to]);
  const { data: holidaysY1 } = useCzechHolidays(fromYear);
  const { data: holidaysY2 } = useCzechHolidays(toYear);
  const { data: companyHolidays } = useCompanyHolidays();

  const holidayMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of holidaysY1 || []) m.set(h.date, h.localName);
    if (toYear !== fromYear) for (const h of holidaysY2 || []) m.set(h.date, h.localName);
    return m;
  }, [holidaysY1, holidaysY2, fromYear, toYear]);

  const findCompanyHoliday = useCallback(
    (dateStr: string): string | null => {
      if (!companyHolidays) return null;
      for (const ch of companyHolidays) {
        if (dateStr >= ch.start_date && dateStr <= ch.end_date) return ch.name;
      }
      return null;
    },
    [companyHolidays],
  );

  // ── Chart data (hours per day/week) ─────────────────────────────
  const { chartData, effectiveBucket } = useMemo(() => {
    const fromD = new Date(from + "T00:00:00");
    const toD = new Date(to + "T00:00:00");
    const spanDays = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1);
    const eff: "day" | "week" =
      bucketMode === "auto" ? (spanDays <= 31 ? "day" : "week") : bucketMode;

    const isoWeek = (d: Date): { year: number; week: number; monday: Date } => {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      const monday = new Date(d);
      const md = monday.getDay() || 7;
      monday.setDate(monday.getDate() + 1 - md);
      monday.setHours(0, 0, 0, 0);
      return { year: date.getUTCFullYear(), week, monday };
    };

    type Bucket = {
      label: string;
      sortKey: string;
      projekty: number;
      rezije: number;
      nesparovane: number;
      isNonWorking: boolean;
      nonWorkingLabel?: string;
    };
    const buckets = new Map<string, Bucket>();

    const categorize = (id: string): "projekty" | "rezije" | "nesparovane" => {
      if (projectsMap.has(id)) return "projekty";
      if (overheadMap.has(id)) return "rezije";
      return "nesparovane";
    };

    if (eff === "day") {
      for (let i = 0; i < spanDays; i++) {
        const d = new Date(fromD);
        d.setDate(fromD.getDate() + i);
        const key = toLocalDateStr(d);
        const label = `${d.getDate()}.${d.getMonth() + 1}.`;
        const dow = d.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const stateHoliday = holidayMap.get(key);
        const companyHol = findCompanyHoliday(key);
        const nonWorkingLabel = companyHol
          ? `Firemní volno: ${companyHol}`
          : stateHoliday
          ? stateHoliday
          : isWeekend
          ? "Víkend"
          : undefined;
        buckets.set(key, {
          label,
          sortKey: key,
          projekty: 0,
          rezije: 0,
          nesparovane: 0,
          isNonWorking: !!nonWorkingLabel,
          nonWorkingLabel,
        });
      }
      for (const r of logs) {
        const b = buckets.get(r.datum_sync);
        if (b) b[categorize(r.ami_project_id || "—")] += Number(r.hodiny) || 0;
      }
    } else {
      const cursor = new Date(fromD);
      while (cursor.getTime() <= toD.getTime()) {
        const { year, week, monday } = isoWeek(cursor);
        const key = `${year}-W${String(week).padStart(2, "0")}`;
        if (!buckets.has(key)) {
          buckets.set(key, {
            label: `T${week}`,
            sortKey: toLocalDateStr(monday),
            projekty: 0,
            rezije: 0,
            nesparovane: 0,
            isNonWorking: false,
          });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      for (const r of logs) {
        const d = new Date(r.datum_sync + "T00:00:00");
        const { year, week } = isoWeek(d);
        const key = `${year}-W${String(week).padStart(2, "0")}`;
        const b = buckets.get(key);
        if (b) b[categorize(r.ami_project_id || "—")] += Number(r.hodiny) || 0;
      }
    }

    const arr = Array.from(buckets.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    const round1 = (n: number) => Math.round(n * 10) / 10;
    return {
      chartData: arr.map(({ label, projekty, rezije, nesparovane, isNonWorking, nonWorkingLabel }) => ({
        label,
        projekty: round1(projekty),
        rezije: round1(rezije),
        nesparovane: round1(nesparovane),
        hodiny: round1(projekty + rezije + nesparovane),
        isNonWorking,
        nonWorkingLabel,
      })),
      effectiveBucket: eff,
    };
  }, [logs, from, to, bucketMode, holidayMap, findCompanyHoliday, projectsMap, overheadMap]);

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
      {/* Toolbar */}
      <div className="shrink-0 border-b bg-card px-4 py-2 flex items-center gap-3">
        {/* Left: date range */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setRangeOffset((o) => o - 1)}
            title="Předchozí období"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5 min-w-[200px] justify-start"
              >
                <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="tabular-nums">
                  {(() => {
                    const fd = new Date(from + "T00:00:00");
                    const td = new Date(to + "T00:00:00");
                    const sameYear = fd.getFullYear() === td.getFullYear();
                    const sameDay = from === to;
                    if (sameDay) return formatAppDate(fd);
                    if (sameYear) {
                      return `${fd.getDate()}. ${fd.getMonth() + 1}. – ${formatAppDate(td)}`;
                    }
                    return `${formatAppDate(fd)} – ${formatAppDate(td)}`;
                  })()}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[99999]" align="start">
              <div className="flex">
                {/* Preset list */}
                <div className="flex flex-col gap-0.5 p-2 border-r min-w-[170px]">
                  {([
                    { key: "week", label: "Tento týden" },
                    { key: "month", label: "Tento měsíc" },
                    { key: "prev_week", label: "Minulý týden" },
                    { key: "prev_month", label: "Minulý měsíc" },
                    { key: "3months", label: "Posledné 3 měsíce" },
                  ] as const).map((p) => (
                    <Button
                      key={p.key}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-8 justify-start text-xs font-normal",
                        dateRange === p.key && "bg-accent text-accent-foreground font-medium",
                      )}
                      onClick={() => setDateRange(p.key)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
                {/* Calendar */}
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  weekStartsOn={1}
                  showOutsideDays={false}
                  month={new Date(from + "T00:00:00")}
                  onMonthChange={() => { /* controlled by `from` */ }}
                  selected={{
                    from: new Date(from + "T00:00:00"),
                    to: new Date(to + "T00:00:00"),
                  }}
                  onSelect={(range: any) => {
                    setDateRangeRaw("custom");
                    setRangeOffset(0);
                    setCustomFrom(range?.from ? toLocalDateStr(range.from) : "");
                    setCustomTo(range?.to ? toLocalDateStr(range.to) : range?.from ? toLocalDateStr(range.from) : "");
                  }}
                  className="p-3 pointer-events-auto"
                />
              </div>
              <div className="flex items-center justify-between border-t p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1.5 text-muted-foreground"
                  onClick={() => {
                    setCustomFrom("");
                    setCustomTo("");
                    setDateRange("week");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Smazat
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setCalendarOpen(false)}
                >
                  Hotovo
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setRangeOffset((o) => o + 1)}
            title="Další období"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
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

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Summary cards */}
        <div className="px-4 pt-4 pb-2 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Celkem hodin</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{formatHours(summaryStats.totalHours)}</div>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Aktivní pracovníci</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{summaryStats.activeWorkers}</div>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Utilizace</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">
              {summaryStats.utilization.toFixed(1).replace(".", ",")} %
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              (celkem − režie) / celkem
            </div>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Nespárované projekty</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{summaryStats.unmatchedProjects}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              chybí v evidenci
            </div>
          </Card>
        </div>

        {/* Chart: Hodiny v čase */}
        <div className="px-4 pt-2">
          <Card className="p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h3 className="text-sm font-semibold">Hodiny v čase</h3>
                <span className="text-[11px] text-muted-foreground">
                  {effectiveBucket === "day" ? "per den" : "per týden"}
                </span>
                {effectiveBucket === "day" && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground ml-2">
                    <span className="inline-block w-3 h-2.5 rounded-sm bg-muted border border-border/60" />
                    Víkend / svátek
                  </span>
                )}
              </div>
              <div className="inline-flex items-center bg-muted rounded-lg p-0.5">
                {([
                  { key: "auto", label: "Auto" },
                  { key: "day", label: "Den" },
                  { key: "week", label: "Týden" },
                ] as const).map((opt) => {
                  const active = bucketMode === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setBucketMode(opt.key)}
                      className={cn(
                        "h-6 px-2.5 text-[11px] rounded-md transition-colors",
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
            {chartData.every((d) => d.hodiny === 0) ? (
              <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
                Žádné záznamy v období
              </div>
            ) : (
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
                    {effectiveBucket === "day" &&
                      (() => {
                        const spans: Array<{ start: number; end: number }> = [];
                        let curStart: number | null = null;
                        for (let i = 0; i < chartData.length; i++) {
                          if (chartData[i].isNonWorking) {
                            if (curStart === null) curStart = i;
                          } else if (curStart !== null) {
                            spans.push({ start: curStart, end: i - 1 });
                            curStart = null;
                          }
                        }
                        if (curStart !== null) spans.push({ start: curStart, end: chartData.length - 1 });
                        return spans.map((s, idx) => (
                          <ReferenceArea
                            key={`nw-${idx}`}
                            x1={chartData[s.start].label}
                            x2={chartData[s.end].label}
                            fill="hsl(var(--muted-foreground))"
                            fillOpacity={0.12}
                            stroke="none"
                            ifOverflow="extendDomain"
                          />
                        ));
                      })()}
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <RTooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload || !payload.length) return null;
                        const item = payload[0].payload;
                        const total = (item.projekty || 0) + (item.rezije || 0) + (item.nesparovane || 0);
                        const rows: Array<{ key: string; name: string; value: number; color: string }> = [
                          { key: "projekty", name: "Projekty", value: item.projekty || 0, color: "hsl(var(--primary))" },
                          { key: "rezije", name: "Režie", value: item.rezije || 0, color: "hsl(var(--primary) / 0.55)" },
                          { key: "nesparovane", name: "Nespárované", value: item.nesparovane || 0, color: "hsl(var(--accent))" },
                        ];
                        return (
                          <div className="rounded-lg border bg-background px-2.5 py-1.5 shadow-md" style={{ fontSize: 12 }}>
                            <div className="font-medium text-foreground">{label}</div>
                            <div className="text-foreground tabular-nums font-medium mb-1">{formatHours(total)}</div>
                            <div className="space-y-0.5">
                              {rows.filter((r) => r.value > 0).map((r) => (
                                <div key={r.key} className="flex items-center gap-1.5 text-[11px]">
                                  <span className="inline-block w-2 h-2 rounded-sm" style={{ background: r.color }} />
                                  <span className="text-muted-foreground">{r.name}</span>
                                  <span className="ml-auto tabular-nums text-foreground">{formatHours(r.value)}</span>
                                </div>
                              ))}
                            </div>
                            {item?.nonWorkingLabel && (
                              <div className="text-[11px] italic text-muted-foreground mt-1">
                                {item.nonWorkingLabel}
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="projekty" stackId="h" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="rezije" stackId="h" fill="hsl(var(--primary) / 0.55)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="nesparovane" stackId="h" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex items-center justify-center gap-4 mt-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary" />Projekty</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(var(--primary) / 0.55)" }} />Režie</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-accent" />Nespárované</span>
            </div>
          </Card>
        </div>

        {/* Tables / sections */}
        <div className="px-4 py-4 space-y-4">
          {isLoading ? (
            <Card className="p-4 shadow-sm space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </Card>
          ) : grouped.length === 0 ? (
            <Card className="p-8 shadow-sm text-center text-sm text-muted-foreground">
              Žádné záznamy v zvoleném období
            </Card>
          ) : groupBy === "projekt" ? (
            <ProjektSections
              grouped={grouped as any}
              expanded={expanded}
              toggleExpand={toggleExpand}
              onOpenDetail={setDetailProjectId}
              collapsedSections={collapsedSections}
              toggleSection={toggleSection}
            />
          ) : groupBy === "osoba" ? (
            <FlatSection title="Osoby" count={grouped.length} hours={totalHours} tone="neutral">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30 border-b">
                    <TableHead className="w-[60%] h-9 text-[11px] uppercase tracking-wide">Jméno</TableHead>
                    <TableHead className="text-right h-9 text-[11px] uppercase tracking-wide">Počet projektů</TableHead>
                    <TableHead className="text-right h-9 text-[11px] uppercase tracking-wide">Hodiny celkem</TableHead>
                    <TableHead className="w-8 h-9" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <OsobaRows
                    grouped={grouped as any}
                    expanded={expanded}
                    toggleExpand={toggleExpand}
                    projectsMap={projectsMap}
                    overheadMap={overheadMap}
                    onOpenDetail={setDetailProjectId}
                  />
                </TableBody>
              </Table>
            </FlatSection>
          ) : (
            <FlatSection title="Činnosti" count={grouped.length} hours={totalHours} tone="neutral">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30 border-b">
                    <TableHead className="w-[60%] h-9 text-[11px] uppercase tracking-wide">Název činnosti</TableHead>
                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Kód</TableHead>
                    <TableHead className="text-right h-9 text-[11px] uppercase tracking-wide">Hodiny</TableHead>
                    <TableHead className="w-8 h-9" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <CinnostRows
                    grouped={grouped as any}
                    expanded={expanded}
                    toggleExpand={toggleExpand}
                    projectsMap={projectsMap}
                    overheadMap={overheadMap}
                    onOpenDetail={setDetailProjectId}
                  />
                </TableBody>
              </Table>
            </FlatSection>
          )}

          {/* Celkem footer card */}
          {!isLoading && grouped.length > 0 && (
            <Card className="px-4 py-2.5 shadow-sm bg-muted/40 flex items-center justify-between">
              <span className="text-[13px] font-semibold">Celkem</span>
              <span className="text-[14px] font-bold tabular-nums text-primary">{formatHours(totalHours)}</span>
            </Card>
          )}
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

// ── Section helpers (Zaměstnanci-style cards) ───────────────────────
type SectionTone = "projekty" | "rezie" | "nesparovane" | "neutral";

function sectionStyle(tone: SectionTone): { card: string; header: string; badge: string; icon?: boolean } {
  switch (tone) {
    case "projekty":
      return { card: "border-green-200", header: "bg-green-50/80", badge: "bg-green-100 text-green-800 border-green-300" };
    case "rezie":
      return { card: "border-purple-200", header: "bg-purple-50/80", badge: "bg-purple-100 text-purple-800 border-purple-300" };
    case "nesparovane":
      return { card: "border-amber-300", header: "bg-amber-50/80", badge: "bg-amber-100 text-amber-800 border-amber-300", icon: true };
    default:
      return { card: "border-border", header: "bg-muted/40", badge: "bg-background text-foreground border-border" };
  }
}

function CollapsibleSection({
  tone, title, count, hours, collapsed, onToggle, children,
}: {
  tone: SectionTone; title: string; count: number; hours: number;
  collapsed: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const s = sectionStyle(tone);
  return (
    <section className={cn("rounded-lg border shadow-sm overflow-hidden bg-card", s.card)}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-3 py-2 border-b text-left transition-colors hover:brightness-95",
          s.header,
        )}
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2 min-w-0">
          {s.icon && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
          <Badge variant="outline" className={cn("text-[11px] font-semibold border px-2.5 py-0.5 shrink-0", s.badge)}>
            {title}
          </Badge>
          <span className="text-[12px] font-medium text-foreground/80">
            {count} {count === 1 ? "projekt" : count < 5 ? "projekty" : "projektů"}
          </span>
          <span className="text-[11px] text-muted-foreground">· {formatHours(hours)}</span>
        </div>
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", collapsed && "-rotate-90")}
        />
      </button>
      {!collapsed && <div className="overflow-x-auto">{children}</div>}
    </section>
  );
}

function FlatSection({
  title, count, hours, tone, children,
}: {
  title: string; count: number; hours: number; tone: SectionTone; children: React.ReactNode;
}) {
  const s = sectionStyle(tone);
  return (
    <section className={cn("rounded-lg border shadow-sm overflow-hidden bg-card", s.card)}>
      <div className={cn("flex items-center justify-between gap-3 px-3 py-2 border-b", s.header)}>
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="outline" className={cn("text-[11px] font-semibold border px-2.5 py-0.5", s.badge)}>
            {title}
          </Badge>
          <span className="text-[12px] font-medium text-foreground/80">{count}</span>
          <span className="text-[11px] text-muted-foreground">· {formatHours(hours)}</span>
        </div>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

// ── Projekt: 3 categorized sections ─────────────────────────────────
function ProjektSections({
  grouped, expanded, toggleExpand, onOpenDetail, collapsedSections, toggleSection,
}: {
  grouped: Array<{
    key: string; projectId: string; projectName: string; matched: boolean; isOverhead: boolean;
    hodiny: number; records: number; last: string; rows: LogRow[];
  }>;
  expanded: Set<string>;
  toggleExpand: (k: string) => void;
  onOpenDetail: (id: string) => void;
  collapsedSections: Set<string>;
  toggleSection: (k: string) => void;
}) {
  const realProjects = grouped.filter((g) => g.matched && !g.isOverhead);
  const overheadProjects = grouped.filter((g) => g.isOverhead);
  const unmatched = grouped.filter((g) => !g.matched);
  const sumHrs = (arr: typeof grouped) => arr.reduce((s, g) => s + g.hodiny, 0);

  const renderTable = (rows: typeof grouped) => (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/30 hover:bg-muted/30 border-b">
          <TableHead className="w-[40%] h-9 text-[11px] uppercase tracking-wide">Projekt</TableHead>
          <TableHead className="h-9 text-[11px] uppercase tracking-wide">Stav</TableHead>
          <TableHead className="text-right h-9 text-[11px] uppercase tracking-wide">Hodiny</TableHead>
          <TableHead className="text-right h-9 text-[11px] uppercase tracking-wide">Záznamů</TableHead>
          <TableHead className="h-9 text-[11px] uppercase tracking-wide">Poslední záznam</TableHead>
          <TableHead className="w-8 h-9" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((g) => (
          <ProjektRow
            key={g.key}
            g={g}
            expanded={expanded.has(g.key)}
            onToggle={() => toggleExpand(g.key)}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </TableBody>
    </Table>
  );

  return (
    <>
      {realProjects.length > 0 && (
        <CollapsibleSection
          tone="projekty"
          title="Projekty"
          count={realProjects.length}
          hours={sumHrs(realProjects)}
          collapsed={collapsedSections.has("projekty")}
          onToggle={() => toggleSection("projekty")}
        >
          {renderTable(realProjects)}
        </CollapsibleSection>
      )}
      {overheadProjects.length > 0 && (
        <CollapsibleSection
          tone="rezie"
          title="Režie"
          count={overheadProjects.length}
          hours={sumHrs(overheadProjects)}
          collapsed={collapsedSections.has("rezie")}
          onToggle={() => toggleSection("rezie")}
        >
          {renderTable(overheadProjects)}
        </CollapsibleSection>
      )}
      {unmatched.length > 0 && (
        <CollapsibleSection
          tone="nesparovane"
          title="Nespárované"
          count={unmatched.length}
          hours={sumHrs(unmatched)}
          collapsed={collapsedSections.has("nesparovane")}
          onToggle={() => toggleSection("nesparovane")}
        >
          {renderTable(unmatched)}
        </CollapsibleSection>
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
          !g.matched && "text-muted-foreground",
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
                className="text-xs text-primary hover:underline font-semibold"
              >
                {g.projectId}
              </button>
            ) : (
              <span className="text-xs font-semibold">{g.projectId}</span>
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
  grouped, expanded, toggleExpand, projectsMap, overheadMap, onOpenDetail,
}: {
  grouped: Array<{ key: string; zamestnanec: string; hodiny: number; projects: Set<string>; rows: LogRow[] }>;
  expanded: Set<string>;
  toggleExpand: (k: string) => void;
  projectsMap: Map<string, string>;
  overheadMap: Map<string, string>;
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
            <SubByProject rows={g.rows} colSpan={4} projectsMap={projectsMap} overheadMap={overheadMap} onOpenDetail={onOpenDetail} />
          )}
        </Fragment>
      ))}
    </>
  );
}

// ── Cinnost rows ────────────────────────────────────────────────────
function CinnostRows({
  grouped, expanded, toggleExpand, projectsMap, overheadMap, onOpenDetail,
}: {
  grouped: Array<{ key: string; cinnost_kod: string; cinnost_nazov: string; hodiny: number; rows: LogRow[] }>;
  expanded: Set<string>;
  toggleExpand: (k: string) => void;
  projectsMap: Map<string, string>;
  overheadMap: Map<string, string>;
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
            <TableCell className="text-xs text-muted-foreground">{g.cinnost_kod}</TableCell>
            <TableCell className="text-right text-xs tabular-nums font-medium">{formatHours(g.hodiny)}</TableCell>
            <TableCell />
          </TableRow>
          {expanded.has(g.key) && (
            <SubByProject rows={g.rows} colSpan={4} projectsMap={projectsMap} overheadMap={overheadMap} onOpenDetail={onOpenDetail} />
          )}
        </Fragment>
      ))}
    </>
  );
}

function SubByProject({
  rows, colSpan, projectsMap, overheadMap, onOpenDetail,
}: {
  rows: LogRow[];
  colSpan: number;
  projectsMap: Map<string, string>;
  overheadMap: Map<string, string>;
  onOpenDetail: (id: string) => void;
}) {
  const byProject = useMemo(() => {
    const map = new Map<string, { hodiny: number; matched: boolean; isOverhead: boolean }>();
    for (const r of rows) {
      const k = r.ami_project_id || "—";
      let g = map.get(k);
      if (!g) {
        const isOverhead = overheadMap.has(k);
        g = { hodiny: 0, matched: projectsMap.has(k) || isOverhead, isOverhead };
        map.set(k, g);
      }
      g.hodiny += Number(r.hodiny) || 0;
    }
    return Array.from(map.entries())
      .map(([id, g]) => ({ id, ...g, name: projectsMap.get(id) ?? overheadMap.get(id) ?? id }))
      .sort((a, b) => b.hodiny - a.hodiny);
  }, [rows, projectsMap, overheadMap]);

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="p-0">
        <div className="bg-muted/30 border-l-2 border-border pl-10 pr-4 py-2 space-y-1">
          {byProject.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              {p.matched ? (
                <button
                  onClick={() => onOpenDetail(p.id)}
                  className="text-[13px] text-primary hover:underline"
                >
                  {p.id}
                </button>
              ) : (
                <span className="text-[13px] text-muted-foreground">{p.id}</span>
              )}
              <span className="flex-1 truncate text-[13px]" title={p.name}>{p.name}</span>
              <span className="tabular-nums font-medium w-20 text-right text-[13px]">{formatHours(p.hodiny)}</span>
            </div>
          ))}
        </div>
      </TableCell>
    </TableRow>
  );
}
