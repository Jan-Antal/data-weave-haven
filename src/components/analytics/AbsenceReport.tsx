import { useState, useMemo, useCallback, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Download,
  Calendar as CalendarIcon,
  Trash2,
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
  ReferenceArea,
} from "recharts";
import { useCzechHolidays, useCompanyHolidays } from "@/hooks/useWeeklyCapacity";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  MultiSelectFilter,
  CollapsibleSection,
  type SectionTone,
  toLocalDateStr,
  addDays,
  addMonths,
  formatHours,
} from "./_shared";

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return formatAppDate(new Date(s + "T00:00:00"));
}

type DateRange = "week" | "month" | "prev_week" | "prev_month" | "3months" | "year" | "custom";

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
  } else if (range === "year") {
    start = new Date(now.getFullYear() + offset, 0, 1);
    end = new Date(now.getFullYear() + offset, 11, 31);
  } else {
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

// Map kind → section tone (reuses Vykaz palette)
const KIND_TONE: Record<AbsenceKind, SectionTone> = {
  DOV: "projekty",      // green
  RD: "rezie",          // purple
  NEM: "nesparovane",   // amber (warning)
  OTHER: "neutral",
};

// Chart colors share Vykaz palette (semantic tokens, no custom colors)
const KIND_CHART_FILL: Record<AbsenceKind, string> = {
  DOV: "hsl(var(--primary))",
  RD: "hsl(var(--primary) / 0.55)",
  NEM: "hsl(var(--accent))",
  OTHER: "hsl(var(--primary) / 0.3)",
};

// 1 day → hours; "DOV/2" = half-day.
function hoursForRow(kod: string | null, uvazok: number | null): number {
  const base = uvazok && uvazok > 0 ? uvazok : 8;
  if (kod && kod.toUpperCase().endsWith("/2")) return base / 2;
  return base;
}

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
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [rangeOffset, setRangeOffset] = useState(0);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [bucketMode, setBucketMode] = useState<"auto" | "day" | "week">("auto");
  // Multi-select filters: null = "all"
  const [kindFilter, setKindFilter] = useState<Set<string> | null>(null);
  const [usekFilter, setUsekFilter] = useState<Set<string> | null>(null);
  const [strediskoFilter, setStrediskoFilter] = useState<Set<string> | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState<Set<string> | null>(null);

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
  // NOTE: non-working days (weekends + state/company holidays) are filtered out
  //       further down, after `holidayMap` is computed (see filteredAbsences below).
  const filteredAbsencesRaw = useMemo(() => {
    return absences.filter((r) => {
      if (kindFilter && !kindFilter.has(categorize(r.absencia_kod))) return false;
      const emp = r.employee_id ? empMap.get(r.employee_id) : undefined;
      if (usekFilter && !usekFilter.has(emp?.usek_nazov ?? emp?.usek ?? "—")) return false;
      if (strediskoFilter && !strediskoFilter.has(emp?.stredisko ?? "—")) return false;
      if (employeeFilter && !employeeFilter.has(r.employee_id ?? "—")) return false;
      return true;
    });
  }, [absences, kindFilter, usekFilter, strediskoFilter, employeeFilter, empMap]);

  // ── Filter options (always from raw, sorted by hours desc) ─────
  const availableKinds = useMemo(() => {
    const map = new Map<AbsenceKind, number>();
    for (const r of absences) {
      const emp = r.employee_id ? empMap.get(r.employee_id) : undefined;
      const h = hoursForRow(r.absencia_kod, emp?.uvazok_hodiny ?? null);
      const k = categorize(r.absencia_kod);
      map.set(k, (map.get(k) || 0) + h);
    }
    return (["DOV", "NEM", "RD", "OTHER"] as AbsenceKind[])
      .map((k) => ({ kod: k, label: KIND_LABEL[k], hodiny: map.get(k) || 0 }))
      .filter((x) => x.hodiny > 0)
      .sort((a, b) => b.hodiny - a.hodiny);
  }, [absences, empMap]);

  const availableUseky = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of absences) {
      const emp = r.employee_id ? empMap.get(r.employee_id) : undefined;
      const k = emp?.usek_nazov ?? emp?.usek ?? "—";
      const h = hoursForRow(r.absencia_kod, emp?.uvazok_hodiny ?? null);
      map.set(k, (map.get(k) || 0) + h);
    }
    return Array.from(map.entries())
      .map(([name, hodiny]) => ({ name, hodiny }))
      .sort((a, b) => b.hodiny - a.hodiny);
  }, [absences, empMap]);

  const availableStrediska = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of absences) {
      const emp = r.employee_id ? empMap.get(r.employee_id) : undefined;
      const k = emp?.stredisko ?? "—";
      const h = hoursForRow(r.absencia_kod, emp?.uvazok_hodiny ?? null);
      map.set(k, (map.get(k) || 0) + h);
    }
    return Array.from(map.entries())
      .map(([name, hodiny]) => ({ name, hodiny }))
      .sort((a, b) => b.hodiny - a.hodiny);
  }, [absences, empMap]);

  const availableEmployees = useMemo(() => {
    const map = new Map<string, { id: string; name: string; hodiny: number }>();
    for (const r of absences) {
      const id = r.employee_id ?? "—";
      const emp = id !== "—" ? empMap.get(id) : undefined;
      const name = emp?.meno ?? id;
      const h = hoursForRow(r.absencia_kod, emp?.uvazok_hodiny ?? null);
      let g = map.get(id);
      if (!g) { g = { id, name, hodiny: 0 }; map.set(id, g); }
      g.hodiny += h;
    }
    return Array.from(map.values()).sort((a, b) => b.hodiny - a.hodiny);
  }, [absences, empMap]);

  const hasActiveFilter =
    kindFilter !== null || usekFilter !== null || strediskoFilter !== null || employeeFilter !== null;
  const resetFilters = useCallback(() => {
    setKindFilter(null);
    setUsekFilter(null);
    setStrediskoFilter(null);
    setEmployeeFilter(null);
  }, []);

  // ── Per-employee aggregation, grouped by KIND into colored sections
  type EmpRow = {
    employee_id: string;
    meno: string;
    stredisko: string;
    usek: string;
    hours: number;
    days: number;
    lastDate: string;
    rows: AbsenceRow[];
  };

  const sections = useMemo(() => {
    const q = search ? normalizeSearch(search) : null;
    // Map: kind → employee_id → EmpRow
    const byKind = new Map<AbsenceKind, Map<string, EmpRow>>();
    for (const r of filteredAbsences) {
      if (!r.employee_id) continue;
      const emp = empMap.get(r.employee_id);
      if (!emp) continue;
      const kind = categorize(r.absencia_kod);
      let kMap = byKind.get(kind);
      if (!kMap) { kMap = new Map(); byKind.set(kind, kMap); }
      let g = kMap.get(r.employee_id);
      if (!g) {
        g = {
          employee_id: r.employee_id,
          meno: emp.meno,
          stredisko: emp.stredisko ?? "—",
          usek: emp.usek_nazov ?? emp.usek ?? "—",
          hours: 0, days: 0, lastDate: r.datum, rows: [],
        };
        kMap.set(r.employee_id, g);
      }
      g.hours += hoursForRow(r.absencia_kod, emp.uvazok_hodiny ?? null);
      g.days += 1;
      if (r.datum > g.lastDate) g.lastDate = r.datum;
      g.rows.push(r);
    }
    const order: AbsenceKind[] = ["DOV", "RD", "NEM", "OTHER"];
    return order
      .map((kind) => {
        const kMap = byKind.get(kind);
        if (!kMap) return null;
        let arr = Array.from(kMap.values());
        if (q) {
          arr = arr.filter(
            (g) =>
              normalizedIncludes(g.meno, q) ||
              normalizedIncludes(g.stredisko, q) ||
              normalizedIncludes(g.usek, q),
          );
        }
        arr.sort((a, b) => b.hours - a.hours);
        if (arr.length === 0) return null;
        return {
          kind,
          tone: KIND_TONE[kind],
          title: KIND_LABEL[kind],
          rows: arr,
          totalHours: arr.reduce((s, r) => s + r.hours, 0),
        };
      })
      .filter(Boolean) as Array<{
        kind: AbsenceKind;
        tone: SectionTone;
        title: string;
        rows: EmpRow[];
        totalHours: number;
      }>;
  }, [filteredAbsences, empMap, search]);

  const totalHours = useMemo(
    () => sections.reduce((s, sec) => s + sec.totalHours, 0),
    [sections],
  );

  // ── Summary stats ──────────────────────────────────────────────
  const summaryStats = useMemo(() => {
    let total = 0, planned = 0, unplanned = 0;
    const people = new Set<string>();
    for (const r of filteredAbsences) {
      const emp = r.employee_id ? empMap.get(r.employee_id) : undefined;
      const h = hoursForRow(r.absencia_kod, emp?.uvazok_hodiny ?? null);
      total += h;
      if (r.source === "manual") planned += h; else unplanned += h;
      if (r.employee_id) people.add(r.employee_id);
    }
    const fromD = new Date(from + "T00:00:00");
    const toD = new Date(to + "T00:00:00");
    const days = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1);
    return { total, planned, unplanned, peopleCount: people.size, days };
  }, [filteredAbsences, empMap, from, to]);

  // ── Holidays ───────────────────────────────────────────────────
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

  // ── Chart data ─────────────────────────────────────────────────
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
      DOV: number;
      NEM: number;
      RD: number;
      OTHER: number;
      isNonWorking: boolean;
      nonWorkingLabel?: string;
    };
    const buckets = new Map<string, Bucket>();

    if (eff === "day") {
      for (let i = 0; i < spanDays; i++) {
        const d = addDays(fromD, i);
        const key = toLocalDateStr(d);
        const label = `${d.getDate()}.${d.getMonth() + 1}.`;
        const dow = d.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const stateHoliday = holidayMap.get(key);
        const companyHol = findCompanyHoliday(key);
        const nonWorkingLabel = companyHol
          ? `Firemní volno: ${companyHol}`
          : stateHoliday ? stateHoliday : isWeekend ? "Víkend" : undefined;
        buckets.set(key, {
          label, sortKey: key,
          DOV: 0, NEM: 0, RD: 0, OTHER: 0,
          isNonWorking: !!nonWorkingLabel,
          nonWorkingLabel,
        });
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
            DOV: 0, NEM: 0, RD: 0, OTHER: 0,
            isNonWorking: false,
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

    const arr = Array.from(buckets.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    const round1 = (n: number) => Math.round(n * 10) / 10;
    return {
      chartData: arr.map((b) => ({
        label: b.label,
        Dovolená: round1(b.DOV),
        Nemoc: round1(b.NEM),
        Rodičovská: round1(b.RD),
        Ostatní: round1(b.OTHER),
        hodiny: round1(b.DOV + b.NEM + b.RD + b.OTHER),
        isNonWorking: b.isNonWorking,
        nonWorkingLabel: b.nonWorkingLabel,
      })),
      effectiveBucket: eff,
    };
  }, [from, to, filteredAbsences, empMap, bucketMode, holidayMap, findCompanyHoliday]);

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
    const header = ["Zaměstnanec", "Středisko", "Úsek", "Typ", "Kód", "Od", "Do", "Dní", "Hodin", "Zdroj"];
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
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `absence_${from}_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filteredAbsences, empMap, from, to]);

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
                    if (sameYear) return `${fd.getDate()}. ${fd.getMonth() + 1}. – ${formatAppDate(td)}`;
                    return `${formatAppDate(fd)} – ${formatAppDate(td)}`;
                  })()}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[99999]" align="start">
              <div className="flex">
                <div className="flex flex-col gap-0.5 p-2 border-r min-w-[170px]">
                  {([
                    { key: "week", label: "Tento týden" },
                    { key: "month", label: "Tento měsíc" },
                    { key: "prev_week", label: "Minulý týden" },
                    { key: "prev_month", label: "Minulý měsíc" },
                    { key: "3months", label: "Posledné 3 měsíce" },
                    { key: "year", label: "Tento rok" },
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
                    setDateRange("month");
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

        {/* Center: multi-select filters */}
        <div className="flex-1 flex justify-center items-center gap-2">
          <MultiSelectFilter
            label="Typ"
            options={availableKinds.map((k) => ({
              value: k.kod,
              label: k.label,
              hodiny: k.hodiny,
              searchTokens: [k.label, k.kod],
            }))}
            value={kindFilter}
            onChange={setKindFilter}
          />
          <MultiSelectFilter
            label="Úsek"
            options={availableUseky.map((u) => ({
              value: u.name,
              label: u.name,
              hodiny: u.hodiny,
              searchTokens: [u.name],
            }))}
            value={usekFilter}
            onChange={setUsekFilter}
          />
          <MultiSelectFilter
            label="Středisko"
            options={availableStrediska.map((s) => ({
              value: s.name,
              label: s.name,
              hodiny: s.hodiny,
              searchTokens: [s.name],
            }))}
            value={strediskoFilter}
            onChange={setStrediskoFilter}
          />
          <MultiSelectFilter
            label="Zaměstnanec"
            options={availableEmployees.map((e) => ({
              value: e.id,
              label: e.name,
              hodiny: e.hodiny,
              searchTokens: [e.name],
            }))}
            value={employeeFilter}
            onChange={setEmployeeFilter}
          />
          {hasActiveFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={resetFilters}
              title="Vyčistit filtry"
            >
              <X className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
        </div>

        {/* Right: search + export */}
        <div className="flex items-center gap-2">
          <TableSearchBar value={search} onChange={setSearch} placeholder="Hledat..." />
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs gap-1.5"
            onClick={exportCsv}
            disabled={isLoading || sections.length === 0}
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
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Celkem hodin absencí</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">
              {isLoading ? <Skeleton className="h-7 w-24" /> : formatHours(summaryStats.total)}
            </div>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Aktivní zaměstnanci</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">
              {isLoading ? <Skeleton className="h-7 w-12" /> : summaryStats.peopleCount}
            </div>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Plánované / Skutečné</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">
              {isLoading ? (
                <Skeleton className="h-7 w-32" />
              ) : (
                `${formatHours(summaryStats.planned)} / ${formatHours(summaryStats.unplanned)}`
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">manuál vs dochádzka</div>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Dní v období</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{summaryStats.days}</div>
          </Card>
        </div>

        {/* Chart: Hodiny v čase */}
        <div className="px-4 pt-2">
          <Card className="p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h3 className="text-sm font-semibold">Hodiny absencí v čase</h3>
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
                        const total =
                          (item.Dovolená || 0) + (item.Nemoc || 0) + (item.Rodičovská || 0) + (item.Ostatní || 0);
                        const rows = [
                          { key: "Dovolená", value: item.Dovolená || 0, color: KIND_CHART_FILL.DOV },
                          { key: "Rodičovská", value: item.Rodičovská || 0, color: KIND_CHART_FILL.RD },
                          { key: "Nemoc", value: item.Nemoc || 0, color: KIND_CHART_FILL.NEM },
                          { key: "Ostatní", value: item.Ostatní || 0, color: KIND_CHART_FILL.OTHER },
                        ];
                        return (
                          <div className="rounded-lg border bg-background px-2.5 py-1.5 shadow-md" style={{ fontSize: 12 }}>
                            <div className="font-medium text-foreground">{label}</div>
                            <div className="text-foreground tabular-nums font-medium mb-1">{formatHours(total)}</div>
                            <div className="space-y-0.5">
                              {rows.filter((r) => r.value > 0).map((r) => (
                                <div key={r.key} className="flex items-center gap-1.5 text-[11px]">
                                  <span className="inline-block w-2 h-2 rounded-sm" style={{ background: r.color }} />
                                  <span className="text-muted-foreground">{r.key}</span>
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
                    <Bar dataKey="Dovolená" stackId="h" fill={KIND_CHART_FILL.DOV} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Rodičovská" stackId="h" fill={KIND_CHART_FILL.RD} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Nemoc" stackId="h" fill={KIND_CHART_FILL.NEM} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Ostatní" stackId="h" fill={KIND_CHART_FILL.OTHER} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex items-center justify-center gap-4 mt-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: KIND_CHART_FILL.DOV }} />Dovolená</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: KIND_CHART_FILL.RD }} />Rodičovská</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: KIND_CHART_FILL.NEM }} />Nemoc</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: KIND_CHART_FILL.OTHER }} />Ostatní</span>
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
          ) : sections.length === 0 ? (
            <Card className="p-8 shadow-sm text-center text-sm text-muted-foreground">
              Žádné absence v zvoleném období
            </Card>
          ) : (
            sections.map((sec) => {
              const key = `kind:${sec.kind}`;
              const collapsed = collapsedSections.has(key);
              return (
                <CollapsibleSection
                  key={key}
                  tone={sec.tone}
                  title={sec.title}
                  count={sec.rows.length}
                  hours={sec.totalHours}
                  collapsed={collapsed}
                  onToggle={() => toggleSection(key)}
                  countLabel={(n) => (n === 1 ? "zaměstnanec" : n < 5 ? "zaměstnanci" : "zaměstnanců")}
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8" />
                        <TableHead>Zaměstnanec</TableHead>
                        <TableHead>Středisko</TableHead>
                        <TableHead>Úsek</TableHead>
                        <TableHead className="text-right">Dní</TableHead>
                        <TableHead className="text-right">Hodin</TableHead>
                        <TableHead>Posl. absence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sec.rows.map((g) => {
                        const expandKey = `${sec.kind}:${g.employee_id}`;
                        const isOpen = expanded.has(expandKey);
                        const periods = groupPeriods(g.rows, empMap);
                        return (
                          <Fragment key={expandKey}>
                            <TableRow
                              className="cursor-pointer hover:bg-accent/40"
                              onClick={() => toggleExpand(expandKey)}
                            >
                              <TableCell className="py-2">
                                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </TableCell>
                              <TableCell className="font-medium">{g.meno}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{g.stredisko}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{g.usek}</TableCell>
                              <TableCell className="text-right tabular-nums">{g.days}</TableCell>
                              <TableCell className="text-right tabular-nums font-bold">{formatHours(g.hours)}</TableCell>
                              <TableCell className="text-xs">{fmtDate(g.lastDate)}</TableCell>
                            </TableRow>
                            {isOpen && (
                              <TableRow>
                                <TableCell colSpan={7} className="bg-muted/30 p-0">
                                  <div className="px-4 py-2">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="border-b border-border/50">
                                          <TableHead className="h-7 text-[10px]">Kód</TableHead>
                                          <TableHead className="h-7 text-[10px]">Od</TableHead>
                                          <TableHead className="h-7 text-[10px]">Do</TableHead>
                                          <TableHead className="h-7 text-[10px] text-right">Dní</TableHead>
                                          <TableHead className="h-7 text-[10px] text-right">Hodin</TableHead>
                                          <TableHead className="h-7 text-[10px]">Zdroj</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {periods.map((p, i) => (
                                          <TableRow key={i} className="border-b-0">
                                            <TableCell className="py-1 text-xs font-mono">{p.kod}</TableCell>
                                            <TableCell className="py-1 text-xs">{fmtDate(p.date_from)}</TableCell>
                                            <TableCell className="py-1 text-xs">{fmtDate(p.date_to)}</TableCell>
                                            <TableCell className="py-1 text-xs text-right tabular-nums">{p.days}</TableCell>
                                            <TableCell className="py-1 text-xs text-right tabular-nums">{formatHours(p.hours)}</TableCell>
                                            <TableCell className="py-1">
                                              <Badge
                                                variant="outline"
                                                className={cn(
                                                  "text-[10px] px-1.5 py-0",
                                                  p.source === "manual"
                                                    ? "bg-primary/10 text-primary border-primary/30"
                                                    : "bg-muted text-muted-foreground",
                                                )}
                                              >
                                                {p.source === "manual" ? "Plánované" : "Dochádzka"}
                                              </Badge>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CollapsibleSection>
              );
            })
          )}

          {!isLoading && sections.length > 0 && (
            <Card className="px-4 py-2.5 shadow-sm bg-muted/40 flex items-center justify-between">
              <span className="text-[13px] font-semibold">Celkem</span>
              <span className="text-[14px] font-bold tabular-nums text-primary">{formatHours(totalHours)}</span>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
