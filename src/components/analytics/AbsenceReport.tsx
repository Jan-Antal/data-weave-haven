import { useState, useMemo, useCallback, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Download,
  Calendar as CalendarIcon,
  X,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TableSearchBar } from "@/components/TableSearchBar";
import { cn } from "@/lib/utils";
import { normalizeSearch, normalizedIncludes } from "@/lib/statusFilter";
import { formatAppDate } from "@/lib/dateFormat";

type DateRange = "week" | "month" | "prev_month" | "3months" | "year" | "custom";

interface AbsenceRow {
  id: string;
  employee_id: string | null;
  datum: string;
  absencia_kod: string | null;
  source: string | null;
}

interface EmployeeRow {
  id: string;
  meno: string;
  stredisko: string | null;
  usek_nazov: string | null;
  usek: string | null;
  uvazok_hodiny: number | null;
  aktivny: boolean | null;
  deactivated_date: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────
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

function formatHours(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString("cs-CZ") + " h";
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
    return {
      from: toLocalDateStr(addDays(f, shifted)),
      to: toLocalDateStr(addDays(t, shifted)),
    };
  }
  let start: Date;
  let end: Date = now;
  if (range === "week") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    end = addDays(start, 6);
    if (offset !== 0) {
      start = addDays(start, offset * 7);
      end = addDays(end, offset * 7);
    }
  } else if (range === "month" || range === "prev_month") {
    const baseOffset = range === "prev_month" ? -1 : 0;
    const total = baseOffset + offset;
    start = new Date(now.getFullYear(), now.getMonth() + total, 1);
    end = new Date(now.getFullYear(), now.getMonth() + total + 1, 0);
  } else if (range === "year") {
    start = new Date(now.getFullYear() + offset, 0, 1);
    end = new Date(now.getFullYear() + offset, 11, 31);
  } else {
    // 3months
    start = new Date(now.getFullYear(), now.getMonth() - 3 + offset * 3, now.getDate());
    end = offset === 0 ? now : addMonths(start, 3);
  }
  return { from: toLocalDateStr(start), to: toLocalDateStr(end) };
}

// Map raw kod → category
type AbsenceKind = "DOV" | "NEM" | "RD" | "OTHER";
function categorize(kod: string | null): AbsenceKind {
  if (!kod) return "OTHER";
  const k = kod.toUpperCase();
  if (k.startsWith("DOV")) return "DOV";
  if (k === "NEM" || k === "PN") return "NEM";
  if (k === "RD") return "RD";
  return "OTHER";
}

const KIND_LABEL: Record<AbsenceKind, string> = {
  DOV: "Dovolená",
  NEM: "Nemoc",
  RD: "Rodičovská",
  OTHER: "Ostatní",
};

const KIND_COLOR: Record<AbsenceKind, string> = {
  DOV: "hsl(38, 92%, 50%)", // amber
  NEM: "hsl(0, 72%, 51%)", // red
  RD: "hsl(262, 83%, 58%)", // violet
  OTHER: "hsl(215, 20%, 65%)", // slate
};

const KIND_BADGE_VARIANT: Record<AbsenceKind, "default" | "secondary" | "destructive" | "outline"> = {
  DOV: "secondary",
  NEM: "destructive",
  RD: "default",
  OTHER: "outline",
};

// 1 day → hours; "DOV/2" = half-day.
function hoursForRow(kod: string | null, uvazok: number | null): number {
  const base = uvazok && uvazok > 0 ? uvazok : 8;
  if (kod && kod.toUpperCase().endsWith("/2")) return base / 2;
  return base;
}

// Group consecutive days for the same employee + kod into periods.
interface AbsencePeriod {
  employee_id: string;
  kod: string;
  date_from: string;
  date_to: string;
  days: number;
  hours: number;
  source: string | null;
}

function groupPeriods(rows: AbsenceRow[], empMap: Map<string, EmployeeRow>): AbsencePeriod[] {
  const sorted = [...rows].sort(
    (a, b) =>
      (a.employee_id ?? "").localeCompare(b.employee_id ?? "") ||
      (a.absencia_kod ?? "").localeCompare(b.absencia_kod ?? "") ||
      a.datum.localeCompare(b.datum),
  );
  const periods: AbsencePeriod[] = [];
  let cur: AbsencePeriod | null = null;
  for (const r of sorted) {
    if (!r.employee_id || !r.absencia_kod) continue;
    const emp = empMap.get(r.employee_id);
    const h = hoursForRow(r.absencia_kod, emp?.uvazok_hodiny ?? null);
    const expectedNext = cur
      ? toLocalDateStr(addDays(new Date(cur.date_to + "T00:00:00"), 1))
      : null;
    const sameKey =
      cur && cur.employee_id === r.employee_id && cur.kod === r.absencia_kod;
    if (sameKey && (r.datum === cur!.date_to || r.datum === expectedNext)) {
      cur!.date_to = r.datum;
      cur!.days += 1;
      cur!.hours += h;
    } else {
      if (cur) periods.push(cur);
      cur = {
        employee_id: r.employee_id,
        kod: r.absencia_kod,
        date_from: r.datum,
        date_to: r.datum,
        days: 1,
        hours: h,
        source: r.source,
      };
    }
  }
  if (cur) periods.push(cur);
  return periods;
}

// ── Component ────────────────────────────────────────────────────
export function AbsenceReport() {
  const [dateRange, setDateRangeRaw] = useState<DateRange>("month");
  const [customFrom, setCustomFrom] = useState<string>(() => toLocalDateStr(new Date()));
  const [customTo, setCustomTo] = useState<string>(() => toLocalDateStr(new Date()));
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rangeOffset, setRangeOffset] = useState(0);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [kindFilter, setKindFilter] = useState<Set<AbsenceKind> | null>(null);
  const [usekFilter, setUsekFilter] = useState<Set<string> | null>(null);
  const [bucketMode, setBucketMode] = useState<"auto" | "day" | "week">("auto");

  const setDateRange = useCallback((r: DateRange) => {
    setDateRangeRaw(r);
    setRangeOffset(0);
  }, []);

  const { from, to } = useMemo(
    () => getRangeBounds(dateRange, customFrom, customTo, rangeOffset),
    [dateRange, customFrom, customTo, rangeOffset],
  );

  // ── Queries ────────────────────────────────────────────────────
  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ["absence-employees"],
    queryFn: async (): Promise<EmployeeRow[]> => {
      const { data, error } = await supabase
        .from("ami_employees")
        .select("id, meno, stredisko, usek_nazov, usek, uvazok_hodiny, aktivny, deactivated_date")
        .order("meno", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EmployeeRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const empMap = useMemo(() => {
    const m = new Map<string, EmployeeRow>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  const { data: absences = [], isLoading: absLoading } = useQuery({
    queryKey: ["absence-report", from, to],
    queryFn: async (): Promise<AbsenceRow[]> => {
      const PAGE = 1000;
      let all: AbsenceRow[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from("ami_absences")
          .select("id, employee_id, datum, absencia_kod, source")
          .gte("datum", from)
          .lte("datum", to)
          .order("datum", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as AbsenceRow[];
        if (!batch.length) break;
        all = all.concat(batch);
        if (batch.length < PAGE) break;
        offset += PAGE;
      }
      return all;
    },
  });

  const isLoading = empLoading || absLoading;

  // ── Filtered rows ──────────────────────────────────────────────
  const filteredAbsences = useMemo(() => {
    return absences.filter((r) => {
      if (kindFilter && !kindFilter.has(categorize(r.absencia_kod))) return false;
      if (usekFilter) {
        const emp = r.employee_id ? empMap.get(r.employee_id) : undefined;
        const usek = emp?.usek_nazov ?? emp?.usek ?? "—";
        if (!usekFilter.has(usek)) return false;
      }
      return true;
    });
  }, [absences, kindFilter, usekFilter, empMap]);

  // ── Available filter options ───────────────────────────────────
  const availableUseky = useMemo(() => {
    const s = new Set<string>();
    for (const r of absences) {
      const emp = r.employee_id ? empMap.get(r.employee_id) : undefined;
      s.add(emp?.usek_nazov ?? emp?.usek ?? "—");
    }
    return Array.from(s).sort();
  }, [absences, empMap]);

  const hasActiveFilter = kindFilter !== null || usekFilter !== null;
  const resetFilters = useCallback(() => {
    setKindFilter(null);
    setUsekFilter(null);
  }, []);

  // ── Dashboard summary ──────────────────────────────────────────
  const summary = useMemo(() => {
    let totalH = 0;
    let dovH = 0;
    let nemH = 0;
    let rdH = 0;
    let otherH = 0;
    let plannedH = 0;
    let unplannedH = 0;
    const peopleSet = new Set<string>();
    for (const r of filteredAbsences) {
      const emp = r.employee_id ? empMap.get(r.employee_id) : undefined;
      const h = hoursForRow(r.absencia_kod, emp?.uvazok_hodiny ?? null);
      totalH += h;
      const kind = categorize(r.absencia_kod);
      if (kind === "DOV") dovH += h;
      else if (kind === "NEM") nemH += h;
      else if (kind === "RD") rdH += h;
      else otherH += h;
      // "manual" = planned long-term entries; "alveno_xlsx" = imported actuals (treated as
      // unplanned for sickness, but conceptually "skutečné z dochádzky")
      if (r.source === "manual") plannedH += h;
      else unplannedH += h;
      if (r.employee_id) peopleSet.add(r.employee_id);
    }
    return {
      totalH,
      dovH,
      nemH,
      rdH,
      otherH,
      plannedH,
      unplannedH,
      peopleCount: peopleSet.size,
    };
  }, [filteredAbsences, empMap]);

  // ── Per-employee aggregation (table) ───────────────────────────
  const grouped = useMemo(() => {
    const q = search ? normalizeSearch(search) : null;
    type Row = {
      employee_id: string;
      meno: string;
      stredisko: string;
      usek: string;
      dovH: number;
      nemH: number;
      rdH: number;
      otherH: number;
      totalH: number;
      lastDate: string;
      rows: AbsenceRow[];
    };
    const map = new Map<string, Row>();
    for (const r of filteredAbsences) {
      if (!r.employee_id) continue;
      const emp = empMap.get(r.employee_id);
      if (!emp) continue;
      let g = map.get(r.employee_id);
      if (!g) {
        g = {
          employee_id: r.employee_id,
          meno: emp.meno,
          stredisko: emp.stredisko ?? "—",
          usek: emp.usek_nazov ?? emp.usek ?? "—",
          dovH: 0,
          nemH: 0,
          rdH: 0,
          otherH: 0,
          totalH: 0,
          lastDate: r.datum,
          rows: [],
        };
        map.set(r.employee_id, g);
      }
      const h = hoursForRow(r.absencia_kod, emp.uvazok_hodiny ?? null);
      const kind = categorize(r.absencia_kod);
      if (kind === "DOV") g.dovH += h;
      else if (kind === "NEM") g.nemH += h;
      else if (kind === "RD") g.rdH += h;
      else g.otherH += h;
      g.totalH += h;
      if (r.datum > g.lastDate) g.lastDate = r.datum;
      g.rows.push(r);
    }
    let arr = Array.from(map.values());
    if (q) {
      arr = arr.filter(
        (g) =>
          normalizedIncludes(g.meno, q) ||
          normalizedIncludes(g.stredisko, q) ||
          normalizedIncludes(g.usek, q),
      );
    }
    arr.sort((a, b) => b.totalH - a.totalH);
    return arr;
  }, [filteredAbsences, empMap, search]);

  // ── Chart data (stacked by kind) ───────────────────────────────
  const { chartData, effectiveBucket } = useMemo(() => {
    const fromD = new Date(from + "T00:00:00");
    const toD = new Date(to + "T00:00:00");
    const spanDays = Math.max(
      1,
      Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1,
    );
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
      DOV: number;
      NEM: number;
      RD: number;
      OTHER: number;
    };
    const buckets = new Map<string, Bucket>();

    if (eff === "day") {
      for (let i = 0; i < spanDays; i++) {
        const d = addDays(fromD, i);
        const key = toLocalDateStr(d);
        const label = `${d.getDate()}.${d.getMonth() + 1}.`;
        buckets.set(key, { label, sortKey: key, DOV: 0, NEM: 0, RD: 0, OTHER: 0 });
      }
      for (const r of filteredAbsences) {
        const b = buckets.get(r.datum);
        if (!b) continue;
        const emp = r.employee_id ? empMap.get(r.employee_id) : undefined;
        const h = hoursForRow(r.absencia_kod, emp?.uvazok_hodiny ?? null);
        b[categorize(r.absencia_kod)] += h;
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
            DOV: 0,
            NEM: 0,
            RD: 0,
            OTHER: 0,
          });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      for (const r of filteredAbsences) {
        const d = new Date(r.datum + "T00:00:00");
        const { year, week } = isoWeek(d);
        const key = `${year}-W${String(week).padStart(2, "0")}`;
        const b = buckets.get(key);
        if (!b) continue;
        const emp = r.employee_id ? empMap.get(r.employee_id) : undefined;
        const h = hoursForRow(r.absencia_kod, emp?.uvazok_hodiny ?? null);
        b[categorize(r.absencia_kod)] += h;
      }
    }
    const arr = Array.from(buckets.values()).sort((a, b) =>
      a.sortKey.localeCompare(b.sortKey),
    );
    const round1 = (n: number) => Math.round(n * 10) / 10;
    return {
      chartData: arr.map((b) => ({
        label: b.label,
        Dovolená: round1(b.DOV),
        Nemoc: round1(b.NEM),
        Rodičovská: round1(b.RD),
        Ostatní: round1(b.OTHER),
      })),
      effectiveBucket: eff,
    };
  }, [from, to, filteredAbsences, empMap, bucketMode]);

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── CSV export ─────────────────────────────────────────────────
  const exportCsv = useCallback(() => {
    const periods = groupPeriods(filteredAbsences, empMap);
    const header = [
      "Zaměstnanec",
      "Středisko",
      "Úsek",
      "Typ",
      "Kód",
      "Od",
      "Do",
      "Dní",
      "Hodin",
      "Zdroj",
    ];
    const lines = [header.join(";")];
    for (const p of periods) {
      const emp = empMap.get(p.employee_id);
      lines.push(
        [
          emp?.meno ?? "—",
          emp?.stredisko ?? "—",
          emp?.usek_nazov ?? emp?.usek ?? "—",
          KIND_LABEL[categorize(p.kod)],
          p.kod,
          p.date_from,
          p.date_to,
          String(p.days),
          String(Math.round(p.hours * 10) / 10).replace(".", ","),
          p.source === "manual" ? "Plánované" : "Dochádzka",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(";"),
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `absence_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredAbsences, empMap, from, to]);

  const rangeLabel = useMemo(() => {
    if (dateRange === "custom") return `${formatAppDate(from)} – ${formatAppDate(to)}`;
    return `${formatAppDate(from)} – ${formatAppDate(to)}`;
  }, [dateRange, from, to]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-card">
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-2 flex flex-wrap items-center gap-2 border-b bg-card">
        <div className="flex items-center gap-1">
          {(
            [
              ["week", "Týden"],
              ["month", "Měsíc"],
              ["prev_month", "Předch. měsíc"],
              ["3months", "3 měsíce"],
              ["year", "Rok"],
            ] as const
          ).map(([k, l]) => (
            <Button
              key={k}
              size="sm"
              variant={dateRange === k ? "default" : "outline"}
              onClick={() => setDateRange(k)}
              className="h-8 text-xs"
            >
              {l}
            </Button>
          ))}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant={dateRange === "custom" ? "default" : "outline"}
                className="h-8 text-xs gap-1"
              >
                <CalendarIcon className="h-3 w-3" /> Vlastní
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Od</p>
                    <Calendar
                      mode="single"
                      selected={customFrom ? new Date(customFrom + "T00:00:00") : undefined}
                      onSelect={(d) => d && setCustomFrom(toLocalDateStr(d))}
                      initialFocus
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Do</p>
                    <Calendar
                      mode="single"
                      selected={customTo ? new Date(customTo + "T00:00:00") : undefined}
                      onSelect={(d) => d && setCustomTo(toLocalDateStr(d))}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setDateRange("custom");
                    setCalendarOpen(false);
                  }}
                >
                  Použít
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Range navigation */}
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setRangeOffset((o) => o - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[140px] text-center">
            {rangeLabel}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setRangeOffset((o) => o + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {rangeOffset !== 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => setRangeOffset(0)}
            >
              Dnes
            </Button>
          )}
        </div>

        {/* Kind filter (multi) */}
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 text-xs">
              Typ {kindFilter ? `(${kindFilter.size})` : "(vše)"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="space-y-1">
              {(["DOV", "NEM", "RD", "OTHER"] as AbsenceKind[]).map((k) => {
                const checked = !kindFilter || kindFilter.has(k);
                return (
                  <label
                    key={k}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = new Set(
                          kindFilter ?? (["DOV", "NEM", "RD", "OTHER"] as AbsenceKind[]),
                        );
                        if (v) next.add(k);
                        else next.delete(k);
                        setKindFilter(next.size === 4 ? null : next);
                      }}
                    />
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ background: KIND_COLOR[k] }}
                    />
                    {KIND_LABEL[k]}
                  </label>
                );
              })}
              {kindFilter && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full h-7 text-xs mt-1"
                  onClick={() => setKindFilter(null)}
                >
                  Vše
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Úsek filter */}
        {availableUseky.length > 1 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs">
                Úsek {usekFilter ? `(${usekFilter.size})` : "(vše)"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {availableUseky.map((u) => {
                  const checked = !usekFilter || usekFilter.has(u);
                  return (
                    <label
                      key={u}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = new Set(usekFilter ?? availableUseky);
                          if (v) next.add(u);
                          else next.delete(u);
                          setUsekFilter(next.size === availableUseky.length ? null : next);
                        }}
                      />
                      {u}
                    </label>
                  );
                })}
                {usekFilter && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full h-7 text-xs mt-1"
                    onClick={() => setUsekFilter(null)}
                  >
                    Vše
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {hasActiveFilter && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1"
            onClick={resetFilters}
          >
            <X className="h-3 w-3" /> Zrušit filtry
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <TableSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Hledat zaměstnance..."
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1"
            onClick={exportCsv}
          >
            <Download className="h-3 w-3" /> CSV
          </Button>
        </div>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {/* Dashboard cards */}
        <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-3">
            <p className="text-[10px] text-muted-foreground mb-0.5">Celkem absence</p>
            <p className="text-lg font-bold tabular-nums">
              {isLoading ? <Skeleton className="h-6 w-20" /> : formatHours(summary.totalH)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {summary.peopleCount} zaměstnanců
            </p>
          </Card>
          <Card className="p-3 border-l-4" style={{ borderLeftColor: KIND_COLOR.DOV }}>
            <p className="text-[10px] text-muted-foreground mb-0.5">🏖️ Dovolená</p>
            <p className="text-lg font-bold tabular-nums">
              {isLoading ? <Skeleton className="h-6 w-20" /> : formatHours(summary.dovH)}
            </p>
          </Card>
          <Card className="p-3 border-l-4" style={{ borderLeftColor: KIND_COLOR.RD }}>
            <p className="text-[10px] text-muted-foreground mb-0.5">👶 Rodičovská</p>
            <p className="text-lg font-bold tabular-nums">
              {isLoading ? <Skeleton className="h-6 w-20" /> : formatHours(summary.rdH)}
            </p>
          </Card>
          <Card className="p-3 border-l-4" style={{ borderLeftColor: KIND_COLOR.NEM }}>
            <p className="text-[10px] text-muted-foreground mb-0.5">🤒 Nemoc</p>
            <p className="text-lg font-bold tabular-nums">
              {isLoading ? <Skeleton className="h-6 w-20" /> : formatHours(summary.nemH)}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] text-muted-foreground mb-0.5">Plánované / Skutečné</p>
            <p className="text-lg font-bold tabular-nums">
              {isLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                `${formatHours(summary.plannedH)} / ${formatHours(summary.unplannedH)}`
              )}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Manuál vs dochádzka
            </p>
          </Card>
        </div>

        {/* Chart */}
        <div className="px-4 pb-3">
          <Card className="p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium">
                Časová osa absencí ({effectiveBucket === "day" ? "po dnech" : "po týdnech"})
              </p>
              <div className="flex gap-1">
                {(["auto", "day", "week"] as const).map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={bucketMode === m ? "default" : "outline"}
                    className="h-6 text-[10px] px-2"
                    onClick={() => setBucketMode(m)}
                  >
                    {m === "auto" ? "Auto" : m === "day" ? "Dny" : "Týdny"}
                  </Button>
                ))}
              </div>
            </div>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RTooltip
                    formatter={(v: any) => `${v} h`}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Dovolená" stackId="a" fill={KIND_COLOR.DOV} />
                  <Bar dataKey="Nemoc" stackId="a" fill={KIND_COLOR.NEM} />
                  <Bar dataKey="Rodičovská" stackId="a" fill={KIND_COLOR.RD} />
                  <Bar dataKey="Ostatní" stackId="a" fill={KIND_COLOR.OTHER} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Per-employee table */}
        <div className="px-4 pb-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Zaměstnanec</TableHead>
                  <TableHead>Středisko</TableHead>
                  <TableHead>Úsek</TableHead>
                  <TableHead className="text-right">Dovolená</TableHead>
                  <TableHead className="text-right">Rodič.</TableHead>
                  <TableHead className="text-right">Nemoc</TableHead>
                  <TableHead className="text-right">Ostatní</TableHead>
                  <TableHead className="text-right font-bold">Celkem</TableHead>
                  <TableHead>Posl. absence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <Skeleton className="h-20 w-full" />
                    </TableCell>
                  </TableRow>
                ) : grouped.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">
                      Žiadne absencie v zvolenom období.
                    </TableCell>
                  </TableRow>
                ) : (
                  grouped.map((g) => {
                    const isOpen = expanded.has(g.employee_id);
                    const periods = groupPeriods(g.rows, empMap);
                    return (
                      <Fragment key={g.employee_id}>
                        <TableRow
                          className="cursor-pointer hover:bg-accent/40"
                          onClick={() => toggleExpand(g.employee_id)}
                        >
                          <TableCell>
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{g.meno}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {g.stredisko}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {g.usek}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {g.dovH > 0 ? formatHours(g.dovH) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {g.rdH > 0 ? formatHours(g.rdH) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {g.nemH > 0 ? formatHours(g.nemH) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {g.otherH > 0 ? formatHours(g.otherH) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-bold">
                            {formatHours(g.totalH)}
                          </TableCell>
                          <TableCell className="text-xs">{formatAppDate(g.lastDate)}</TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow>
                            <TableCell colSpan={10} className="bg-muted/30 p-0">
                              <div className="px-4 py-2">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="border-b border-border/50">
                                      <TableHead className="h-7 text-[10px]">Typ</TableHead>
                                      <TableHead className="h-7 text-[10px]">Kód</TableHead>
                                      <TableHead className="h-7 text-[10px]">Od</TableHead>
                                      <TableHead className="h-7 text-[10px]">Do</TableHead>
                                      <TableHead className="h-7 text-[10px] text-right">Dní</TableHead>
                                      <TableHead className="h-7 text-[10px] text-right">Hodin</TableHead>
                                      <TableHead className="h-7 text-[10px]">Zdroj</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {periods.map((p, i) => {
                                      const kind = categorize(p.kod);
                                      return (
                                        <TableRow key={i} className="border-b-0">
                                          <TableCell className="py-1">
                                            <Badge
                                              variant={KIND_BADGE_VARIANT[kind]}
                                              className="text-[10px]"
                                            >
                                              {KIND_LABEL[kind]}
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="py-1 text-xs font-mono">
                                            {p.kod}
                                          </TableCell>
                                          <TableCell className="py-1 text-xs">
                                            {formatAppDate(p.date_from)}
                                          </TableCell>
                                          <TableCell className="py-1 text-xs">
                                            {formatAppDate(p.date_to)}
                                          </TableCell>
                                          <TableCell className="py-1 text-xs text-right tabular-nums">
                                            {p.days}
                                          </TableCell>
                                          <TableCell className="py-1 text-xs text-right tabular-nums">
                                            {formatHours(p.hours)}
                                          </TableCell>
                                          <TableCell className="py-1">
                                            <span
                                              className={cn(
                                                "text-[10px] px-1.5 py-0.5 rounded",
                                                p.source === "manual"
                                                  ? "bg-primary/10 text-primary"
                                                  : "bg-muted text-muted-foreground",
                                              )}
                                            >
                                              {p.source === "manual" ? "Plánované" : "Dochádzka"}
                                            </span>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>
    </div>
  );
}
