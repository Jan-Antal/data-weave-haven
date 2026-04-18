import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, Plus, RotateCcw, CalendarDays, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, parse, isValid } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useProductionSettings, useUpdateProductionSettings } from "@/hooks/useProductionSettings";
import {
  useWeeklyCapacity,
  useCzechHolidays,
  useCompanyHolidays,
  useAddCompanyHoliday,
  useDeleteCompanyHoliday,
  useUpsertWeekCapacity,
  useBulkUpdateFutureCapacity,
  type WeekCapacity,
} from "@/hooks/useWeeklyCapacity";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useVyrobniEmployees, useAbsencesForYear, computeWeekCapacity, getWeekStartFromNumber, normalizeUsek, getActiveWorkingDays, useWeekComposition, useYearComposition, toggleEmployeeForWeekRange } from "@/hooks/useCapacityCalc";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmployeeManagement } from "./EmployeeManagement";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, render content inline (no Dialog wrapper). */
  inline?: boolean;
}

// --- Capacity color interpolation ---
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
}
function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

// Below-standard stops (t: 0→1 maps min→standard)
const BELOW_STOPS = ["#b45309", "#d97706", "#f5a742", "#fde8cc", "#9ca3af"];
// Above-standard stops (t: 0→1 maps standard→max)
const ABOVE_STOPS = ["#9ca3af", "#a3c9a8", "#5a9e6f", "#2d6a4f"];

function interpolateStops(stops: string[], t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const segment = clamped * (stops.length - 1);
  const i = Math.min(Math.floor(segment), stops.length - 2);
  return lerpColor(stops[i], stops[i + 1], segment - i);
}

function getCapacityColorDynamic(hours: number, standard: number, visMin: number, visMax: number): string {
  if (hours <= standard) {
    const range = standard - visMin;
    const t = range > 0 ? (hours - visMin) / range : 1;
    return interpolateStops(BELOW_STOPS, t);
  } else {
    const range = visMax - standard;
    const t = range > 0 ? (hours - standard) / range : 0;
    return interpolateStops(ABOVE_STOPS, t);
  }
}

const PAST_WEEK_COLOR = "#d1d5db";

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function CapacitySettings({ open, onOpenChange, inline = false }: Props) {
  const currentYear = new Date().getFullYear();
  const currentWeek = getISOWeekNumber(new Date());
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedWeeks, setSelectedWeeks] = useState<Set<number>>(new Set());
  const [lastClickedWeek, setLastClickedWeek] = useState<number | null>(null);
  const [newHolidayName, setNewHolidayName] = useState("");
  const [newHolidayStart, setNewHolidayStart] = useState("");
  const [newHolidayEnd, setNewHolidayEnd] = useState("");
  const [newHolidayCap, setNewHolidayCap] = useState("0");
  const [autoApplyHolidays, setAutoApplyHolidays] = useState(true);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [expandedUsek, setExpandedUsek] = useState<string | null>(null);
  // Composition week (for the "Složení kapacity výroby" section).
  // Defaults to current week, changes when user clicks a bar.
  const [compositionWeekNumber, setCompositionWeekNumber] = useState<number>(currentWeek);
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "owner";
  const VISIBLE_WEEKS = 12;
  const SCROLL_STEP = 4;
  const MIN_YEAR = 2026;
  // Default view: 2 past weeks + current + 9 future weeks visible (12 total)
  const getDefaultViewStart = useCallback(() => {
    if (selectedYear === currentYear) return Math.max(1, currentWeek - 2);
    return 1;
  }, [selectedYear, currentYear, currentWeek]);
  const [viewStart, setViewStart] = useState(() => getDefaultViewStart());

  // At minimum boundary (first week of MIN_YEAR)?
  const atMinBoundary = selectedYear <= MIN_YEAR && viewStart <= 1;

  const scrollLeft = () => {
    if (atMinBoundary) return;
    let nextStart = viewStart - SCROLL_STEP;
    let nextYear = selectedYear;
    if (nextStart < 1) {
      if (nextYear - 1 < MIN_YEAR) {
        // Clamp to first week of MIN_YEAR
        setSelectedYear(MIN_YEAR);
        setViewStart(1);
        return;
      }
      nextYear -= 1;
      nextStart = Math.max(1, 52 + nextStart);
    }
    setSelectedYear(nextYear);
    setViewStart(nextStart);
  };
  const scrollRight = () => {
    let nextStart = viewStart + SCROLL_STEP;
    let nextYear = selectedYear;
    const maxStart = 52 - VISIBLE_WEEKS + 1;
    if (nextStart > maxStart) {
      nextYear += 1;
      nextStart = nextStart - 52;
      if (nextStart < 1) nextStart = 1;
    }
    setSelectedYear(nextYear);
    setViewStart(nextStart);
  };
  const canJumpToToday = currentYear > MIN_YEAR || (currentYear === MIN_YEAR && currentWeek >= 1);
  const jumpToToday = () => {
    if (!canJumpToToday) return;
    setSelectedYear(currentYear);
    setViewStart(Math.max(1, currentWeek - 2));
  };

  const CZECH_MONTHS = ["Leden","Únor","Březen","Duben","Květen","Červen","Červenec","Srpen","Září","Říjen","Listopad","Prosinec"];

  const { data: settings } = useProductionSettings();
  const updateSettings = useUpdateProductionSettings();
  const { data: holidays = [] } = useCzechHolidays(selectedYear);
  const { data: companyHolidays = [] } = useCompanyHolidays();
  const addCompanyHoliday = useAddCompanyHoliday();
  const deleteCompanyHoliday = useDeleteCompanyHoliday();
  const upsertWeek = useUpsertWeekCapacity();
  const bulkUpdate = useBulkUpdateFutureCapacity();
  const queryClient = useQueryClient();
  const { data: vyrobniEmployees = [] } = useVyrobniEmployees();

  // Per-week composition snapshot (DB-persisted exclusion set)
  const { data: composition } = useWeekComposition(selectedYear, compositionWeekNumber);
  const { data: yearComposition } = useYearComposition(selectedYear);
  const compositionIsHistorical = composition?.isHistorical ?? false;
  const compositionIsEditable = composition?.isEditable ?? true;
  const excludedForCompositionWeek = useMemo(
    () => composition?.excludedEmployeeIds ?? new Set<string>(),
    [composition?.excludedEmployeeIds],
  );

  // Derive disabledUseky for the displayed composition week (all employees of úsek excluded → úsek is "off")
  // Úseky sú teraz dynamické (usek_nazov v rámci Výroba Direct).
  const disabledUseky = useMemo(() => {
    const result = new Set<string>();
    const usekEmployees: Record<string, string[]> = {};
    for (const emp of vyrobniEmployees) {
      const key = normalizeUsek(emp);
      if (key) (usekEmployees[key] ??= []).push(emp.id);
    }
    for (const [key, ids] of Object.entries(usekEmployees)) {
      if (ids.length > 0 && ids.every(id => excludedForCompositionWeek.has(id))) result.add(key);
    }
    return result;
  }, [vyrobniEmployees, excludedForCompositionWeek]);
  const disabledEmployees = excludedForCompositionWeek;

  // Persist toggle for current composition week and all forward weeks (..52)
  // For past weeks (read-only) this is a no-op.
  const handleToggleEmployees = useCallback(async (employeeIds: string[], shouldInclude: boolean) => {
    if (!compositionIsEditable || employeeIds.length === 0) return;
    try {
      await toggleEmployeeForWeekRange(selectedYear, compositionWeekNumber, 52, employeeIds, shouldInclude);
      await queryClient.invalidateQueries({ queryKey: ["week-composition", selectedYear] });
      await queryClient.invalidateQueries({ queryKey: ["year-composition", selectedYear] });
      // Trigger capacity recalc (debounced via existing effect for filteredEmployees changes)
      setTimeout(() => triggerAutoRecalcRef.current?.(), 100);
    } catch (e: any) {
      toast({ title: "Chyba při ukládání složení", description: e.message, variant: "destructive" });
    }
  }, [compositionIsEditable, selectedYear, compositionWeekNumber, queryClient]);
  const triggerAutoRecalcRef = useRef<(() => Promise<void>) | null>(null);

  const totalBruttoDaily = useMemo(() =>
    vyrobniEmployees.reduce((s, e) => s + (e.uvazok_hodiny ?? 8), 0),
    [vyrobniEmployees]);

  const { weekMap, defaultCapacity, hoursPerDay } = useWeeklyCapacity(
    selectedYear,
    totalBruttoDaily > 0 ? totalBruttoDaily : undefined
  );

  const dbUtilizationPct = settings?.utilization_pct ?? 83;
  const [localUtilizationPct, setLocalUtilizationPct] = useState(dbUtilizationPct);

  const totalBruttoWeekly = useMemo(() => totalBruttoDaily * 5, [totalBruttoDaily]);

  // Pending local changes for week overrides/resets
  const [pendingWeekOverrides, setPendingWeekOverrides] = useState<Map<number, { cap: number; days: number }>>(new Map());
  const [pendingWeekResets, setPendingWeekResets] = useState<Set<number>>(new Set());
  const hasPendingChanges = localUtilizationPct !== dbUtilizationPct || pendingWeekOverrides.size > 0 || pendingWeekResets.size > 0;

  // Reset local state when dialog opens
  useEffect(() => {
    if (open) {
      setLocalUtilizationPct(dbUtilizationPct);
      setPendingWeekOverrides(new Map());
      setPendingWeekResets(new Set());
    }
  }, [open, dbUtilizationPct]);

  // Filtered employees based on toggle state
  const filteredEmployees = useMemo(() => {
    return vyrobniEmployees.filter(emp => {
      if (disabledEmployees.has(emp.id)) return false;
      const key = normalizeUsek(emp);
      if (key && disabledUseky.has(key)) return false;
      return true;
    });
  }, [vyrobniEmployees, disabledEmployees, disabledUseky]);

  // Working days helper respecting autoApplyHolidays toggle
  const getWorkingDaysForWeek = useCallback((wn: number): number => {
    if (!autoApplyHolidays) return 5;
    const week = weekMap.get(wn);
    if (week?.working_days != null) return week.working_days;
    return 5;
  }, [autoApplyHolidays, weekMap]);

  // Absences loaded independently via React Query
  const absencesQuery = useAbsencesForYear(selectedYear, vyrobniEmployees);
  const EMPTY_ABS_MAP = useMemo(() => new Map<string, number>(), []);
  const absMap = absencesQuery.data ?? EMPTY_ABS_MAP;


  const triggerAutoRecalc = useCallback(async () => {
    if (vyrobniEmployees.length === 0) return;
    try {
      const recalcAbsMap = absMap;
      const upserts: Array<Record<string, any>> = [];
      for (let wn = 1; wn <= 52; wn++) {
        const week = weekMap.get(wn);
        if (week?.is_manual_override) continue;
        const weekStart = week?.week_start ?? getWeekStartFromNumber(selectedYear, wn);
        const workingDays = getWorkingDaysForWeek(wn);
        const absHours = recalcAbsMap.get(weekStart) ?? 0;
        const calc = computeWeekCapacity(filteredEmployees, absHours, workingDays, localUtilizationPct, weekStart);
        const dbAbsenceDays = (week as any)?.absence_days ?? 0;
        const calcAbsenceDays = Math.round(calc.absenceHours / 8);
        const shouldUpsert = !week 
          || Math.round(calc.capacity) !== Math.round(week.capacity_hours)
          || calcAbsenceDays !== dbAbsenceDays;
        if (shouldUpsert) {
          upserts.push({
            week_year: selectedYear,
            week_number: wn,
            week_start: weekStart,
            capacity_hours: calc.capacity,
            working_days: workingDays,
            is_manual_override: false,
            holiday_name: week?.holiday_name ?? null,
            company_holiday_name: week?.company_holiday_name ?? null,
            utilization_pct: localUtilizationPct,
            usek_breakdown: calc.byUsek,
            total_employees: calc.totalEmployees,
            absence_days: Math.round(calc.absenceHours / 8),
          });
        }
      }
      if (upserts.length === 0) return;
      await supabase.from("production_capacity" as any).upsert(upserts as any, { onConflict: "week_year,week_number" });
      queryClient.invalidateQueries({ queryKey: ["production-capacity", selectedYear] });
    } catch { /* silent */ }
  }, [vyrobniEmployees, filteredEmployees, weekMap, selectedYear, localUtilizationPct, queryClient, getWorkingDaysForWeek, absMap]);

  // Expose triggerAutoRecalc through ref so handleToggleEmployees can call it without circular deps
  useEffect(() => { triggerAutoRecalcRef.current = triggerAutoRecalc; }, [triggerAutoRecalc]);

  // Auto-recalc once per year per session. Reset when dialog closes.
  const hasAutoRecalcedYears = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!open) {
      hasAutoRecalcedYears.current = new Set();
      return;
    }
    if (hasAutoRecalcedYears.current.has(selectedYear)) return;
    if (vyrobniEmployees.length === 0 || weekMap.size === 0) return;

    hasAutoRecalcedYears.current.add(selectedYear);
    // Delay to ensure data is fully loaded
    const t = setTimeout(() => {
      console.log('[auto-recalc] firing for year', selectedYear, 'with', vyrobniEmployees.length, 'employees');
      handleRecalculateAll(true);
    }, 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedYear, vyrobniEmployees.length, weekMap.size]);

  // CHANGE 3: Trigger recalc when utilization changes
  const utilizationRef = useRef(localUtilizationPct);
  useEffect(() => {
    if (!open || filteredEmployees.length === 0 || weekMap.size === 0) return;
    if (utilizationRef.current === localUtilizationPct) return;
    utilizationRef.current = localUtilizationPct;
    const timer = setTimeout(() => triggerAutoRecalc(), 800);
    return () => clearTimeout(timer);
  }, [localUtilizationPct, open, filteredEmployees.length, weekMap.size, triggerAutoRecalc]);

  // BUG 3+4: Trigger recalc when disabled toggles or autoApplyHolidays change
  const disabledRef = useRef({ useky: disabledUseky.size, emps: disabledEmployees.size, holidays: autoApplyHolidays });
  useEffect(() => {
    if (!open || vyrobniEmployees.length === 0 || weekMap.size === 0) return;
    const prev = disabledRef.current;
    if (prev.useky === disabledUseky.size && prev.emps === disabledEmployees.size && prev.holidays === autoApplyHolidays) return;
    disabledRef.current = { useky: disabledUseky.size, emps: disabledEmployees.size, holidays: autoApplyHolidays };
    const timer = setTimeout(() => triggerAutoRecalc(), 500);
    return () => clearTimeout(timer);
  }, [disabledUseky.size, disabledEmployees.size, autoApplyHolidays, open, vyrobniEmployees.length, weekMap.size, triggerAutoRecalc]);

  const nettoCapacity = Math.round(totalBruttoWeekly * localUtilizationPct / 100);

  // Selected employees (respecting enabledUseky checkboxes) for reactive metrics
  const selectedEmployees = useMemo(() =>
    vyrobniEmployees.filter(e => {
      const key = normalizeUsek(e);
      return key !== null && !disabledUseky.has(key) && !disabledEmployees.has(e.id);
    }),
    [vyrobniEmployees, disabledUseky, disabledEmployees]);

  const totalBruttoSelectedWeekly = useMemo(() =>
    selectedEmployees.reduce((s, e) => s + (e.uvazok_hodiny ?? 8), 0) * 5,
    [selectedEmployees]);

  const netStandardCapacity = useMemo(() =>
    Math.round(totalBruttoSelectedWeekly * localUtilizationPct / 100),
    [totalBruttoSelectedWeekly, localUtilizationPct]);

  // ====== PER-WEEK (composition week) calculation ======
  // Employees active that specific week (activated_at/deactivated_at), their hours after absences,
  // and resulting capacity per úsek for the selected composition week.
  const compositionWeekStart = useMemo(
    () => getWeekStartFromNumber(selectedYear, compositionWeekNumber),
    [selectedYear, compositionWeekNumber],
  );

  const compositionWorkingDays = useMemo(() => {
    if (!autoApplyHolidays) return 5;
    const ws = new Date(compositionWeekStart + "T00:00:00");
    const we = new Date(ws); we.setDate(ws.getDate() + 5);
    const hCount = (holidays ?? []).filter(h => {
      const d = new Date(h.date + "T00:00:00");
      return d >= ws && d < we && d.getDay() !== 0 && d.getDay() !== 6;
    }).length;
    let days = Math.max(0, 5 - hCount);
    for (const ch of (companyHolidays ?? [])) {
      const cs = new Date(ch.start_date + "T00:00:00");
      const ce = new Date(ch.end_date + "T00:00:00");
      if (ws <= ce && we > cs) {
        let overlap = 0;
        const cur = new Date(ws);
        for (let d = 0; d < 5; d++) {
          if (cur.getDay() !== 0 && cur.getDay() !== 6 && cur >= cs && cur <= ce) overlap++;
          cur.setDate(cur.getDate() + 1);
        }
        days = Math.max(0, days - overlap);
      }
    }
    return days;
  }, [compositionWeekStart, holidays, companyHolidays, autoApplyHolidays]);

  const compositionAbsenceHours = useMemo(
    () => absMap.get(compositionWeekStart) ?? 0,
    [absMap, compositionWeekStart],
  );

  /** Hours worked per employee that week (uvazok × activeDays). */
  const compositionEmpHours = useMemo(() => {
    const map = new Map<string, number>();
    for (const emp of vyrobniEmployees) {
      const activeDays = getActiveWorkingDays(emp, compositionWeekStart, compositionWorkingDays);
      map.set(emp.id, (emp.uvazok_hodiny ?? 8) * activeDays);
    }
    return map;
  }, [vyrobniEmployees, compositionWeekStart, compositionWorkingDays]);

  /** Employees actually contributing in the composition week (active that week + included). */
  const compositionActiveEmployees = useMemo(
    () => selectedEmployees.filter(e => (compositionEmpHours.get(e.id) ?? 0) > 0),
    [selectedEmployees, compositionEmpHours],
  );

  const compositionBruttoWeekly = useMemo(
    () => compositionActiveEmployees.reduce((s, e) => s + (compositionEmpHours.get(e.id) ?? 0), 0),
    [compositionActiveEmployees, compositionEmpHours],
  );

  const compositionNettoCapacity = useMemo(
    () => Math.max(0, Math.round((compositionBruttoWeekly - compositionAbsenceHours) * localUtilizationPct / 100)),
    [compositionBruttoWeekly, compositionAbsenceHours, localUtilizationPct],
  );


  // Fully reactive liveWeekMap computed from local state
  const liveWeekMap = useMemo(() => {
    if (vyrobniEmployees.length === 0) return weekMap;
    const map = new Map<number, any>();

    for (let wn = 1; wn <= 52; wn++) {
      const dbWeek = weekMap.get(wn);

      if (dbWeek?.is_manual_override) {
        map.set(wn, dbWeek);
        continue;
      }

      // Fallback: when auto-holidays toggle is OFF but DB has a recalculated value
      // (with holidays/absences applied), trust the DB row instead of flattening to 5d.
      if (!autoApplyHolidays && dbWeek && dbWeek.capacity_hours != null) {
        map.set(wn, dbWeek);
        continue;
      }

      const weekStart = dbWeek?.week_start ?? getWeekStartFromNumber(selectedYear, wn);

      // Working days: start from base 5
      let workingDays = 5;
      const weekStartDate = new Date(weekStart + 'T00:00:00');

      // Subtract Czech holidays only if autoApplyHolidays is on
      if (autoApplyHolidays) {
        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setDate(weekStartDate.getDate() + 5);
        const holidayCount = (holidays ?? []).filter(h => {
          const d = new Date(h.date + 'T00:00:00');
          return d >= weekStartDate && d < weekEndDate && d.getDay() !== 0 && d.getDay() !== 6;
        }).length;
        workingDays = Math.max(0, 5 - holidayCount);
      }

      // Apply company holidays if autoApplyHolidays is checked
      let effectiveWorkingDays = workingDays;
      let companyHolidayName: string | null = null;
      const safeCompanyHolidays = companyHolidays ?? [];
      if (autoApplyHolidays) {
        for (const ch of safeCompanyHolidays) {
          const chStart = new Date(ch.start_date + 'T00:00:00');
          const chEnd = new Date(ch.end_date + 'T00:00:00');
          const wEnd = new Date(weekStartDate);
          wEnd.setDate(weekStartDate.getDate() + 5);
          if (weekStartDate <= chEnd && wEnd > chStart) {
            let overlap = 0;
            const cur = new Date(weekStartDate);
            for (let d = 0; d < 5; d++) {
              if (cur.getDay() !== 0 && cur.getDay() !== 6 && cur >= chStart && cur <= chEnd) overlap++;
              cur.setDate(cur.getDate() + 1);
            }
            effectiveWorkingDays = Math.max(0, effectiveWorkingDays - overlap);
            companyHolidayName = ch.name;
          }
        }
      }

      // Compute brutto from selected employees only (respects enabledUseky)
      const brutto = selectedEmployees.reduce((s, e) => {
        const activeDays = getActiveWorkingDays(e, weekStart, effectiveWorkingDays);
        return s + (e.uvazok_hodiny ?? 8) * activeDays;
      }, 0);

      const absHours = absMap.get(weekStart) ?? 0;
      const capacity = Math.max(0, Math.round((brutto - absHours) * localUtilizationPct / 100));

      map.set(wn, {
        ...(dbWeek ?? {}),
        week_year: selectedYear,
        week_number: wn,
        week_start: weekStart,
        capacity_hours: capacity,
        working_days: effectiveWorkingDays,
        is_manual_override: false,
        holiday_name: dbWeek?.holiday_name ?? null,
        company_holiday_name: companyHolidayName,
      });
    }
    return map;
  }, [vyrobniEmployees, selectedEmployees, weekMap, selectedYear, localUtilizationPct, holidays, companyHolidays, autoApplyHolidays, absMap]);

  // Get month for a week number
  const getWeekMonth = useCallback((wn: number): number => {
    const week = liveWeekMap.get(wn);
    if (!week) return 0;
    const d = new Date(week.week_start + "T00:00:00");
    d.setDate(d.getDate() + 3);
    return d.getMonth();
  }, [liveWeekMap]);

  // Get type label for a week
  const getWeekTypeLabel = useCallback((week: WeekCapacity, past: boolean): string => {
    if (past) return "Minulý";
    if (week.company_holiday_name) return "Firemní dovolená";
    if (week.is_manual_override && Math.round(week.capacity_hours) !== Math.round(netStandardCapacity)) return "Ručně upraveno";
    if (week.holiday_name) return "Svátek";
    return "Standard";
  }, [netStandardCapacity]);

  // Visible month range label
  const visibleMonthRange = useMemo(() => {
    const firstMonth = getWeekMonth(viewStart);
    const lastMonth = getWeekMonth(Math.min(52, viewStart + VISIBLE_WEEKS - 1));
    if (firstMonth === lastMonth) return `${CZECH_MONTHS[firstMonth]} ${selectedYear}`;
    return `${CZECH_MONTHS[firstMonth]} – ${CZECH_MONTHS[lastMonth]} ${selectedYear}`;
  }, [viewStart, selectedYear, getWeekMonth]);

  // Month groups for visible weeks
  const monthGroups = useMemo(() => {
    const groups: Array<{ month: number; name: string; count: number }> = [];
    const end = Math.min(52, viewStart + VISIBLE_WEEKS - 1);
    for (let wn = viewStart; wn <= end; wn++) {
      const m = getWeekMonth(wn);
      if (groups.length > 0 && groups[groups.length - 1].month === m) {
        groups[groups.length - 1].count++;
      } else {
        groups.push({ month: m, name: CZECH_MONTHS[m], count: 1 });
      }
    }
    return groups;
  }, [viewStart, getWeekMonth]);

  const maxCapacity = useMemo(() => {
    let max = netStandardCapacity;
    for (const [, w] of liveWeekMap) {
      if (w.capacity_hours > max) max = w.capacity_hours;
    }
    return max;
  }, [liveWeekMap, netStandardCapacity]);

  // Visible window min/max for dynamic color scaling (excluding past weeks)
  const visibleRange = useMemo(() => {
    let min = netStandardCapacity;
    let max = netStandardCapacity;
    const end = Math.min(52, viewStart + VISIBLE_WEEKS - 1);
    for (let wn = viewStart; wn <= end; wn++) {
      const week = liveWeekMap.get(wn);
      if (!week) continue;
      const past = selectedYear < currentYear || (selectedYear === currentYear && wn < currentWeek);
      if (past) continue;
      const cap = week.capacity_hours;
      if (cap < min) min = cap;
      if (cap > max) max = cap;
    }
    // Visual contrast padding: drop min by ~15% of standard so holiday weeks
    // render in clearly amber/orange tones instead of near-grey.
    const padded = Math.max(0, min - Math.round(netStandardCapacity * 0.15));
    return { min: padded, max };
  }, [liveWeekMap, viewStart, selectedYear, currentYear, currentWeek, netStandardCapacity]);

  // Selected (filtered) daily hours for holiday impact — respects disabled úseky/employees
  const totalBruttoSelectedDaily = useMemo(() => {
    return selectedEmployees.reduce((s, e) => s + (e.uvazok_hodiny ?? 8), 0);
  }, [selectedEmployees]);

  // Holiday impact summary
  const holidayImpacts = useMemo(() => {
    const impacts: Array<{ date: string; name: string; weekNum: number; reducedHours: number; workingDays: number }> = [];
    for (const h of holidays) {
      const d = new Date(h.date + "T00:00:00");
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      const wn = getISOWeekNumber(d);
      const week = liveWeekMap.get(wn);
      impacts.push({
        date: `${d.getDate()}. ${d.getMonth() + 1}.`,
        name: h.localName,
        weekNum: wn,
        reducedHours: totalBruttoSelectedDaily,
        workingDays: week?.working_days ?? 4,
      });
    }
    return impacts;
  }, [holidays, liveWeekMap, totalBruttoSelectedDaily]);

  // Buffer week capacity changes locally
  const handleWeekCapacityUpdate = (weeks: number[], capacity: number, workingDays: number) => {
    setPendingWeekOverrides(prev => {
      const next = new Map(prev);
      for (const wn of weeks) next.set(wn, { cap: capacity, days: workingDays });
      return next;
    });
    // Remove from resets if previously marked for reset
    setPendingWeekResets(prev => {
      const next = new Set(prev);
      for (const wn of weeks) next.delete(wn);
      return next;
    });
  };

  // Buffer week resets locally
  const handleResetWeeks = (weeks: number[]) => {
    setPendingWeekResets(prev => {
      const next = new Set(prev);
      for (const wn of weeks) next.add(wn);
      return next;
    });
    // Remove from overrides if previously overridden
    setPendingWeekOverrides(prev => {
      const next = new Map(prev);
      for (const wn of weeks) next.delete(wn);
      return next;
    });
    setSelectedWeeks(new Set());
  };

  // Recalculate all non-override weeks
  const handleRecalculateAll = async (silent = false) => {
    if (vyrobniEmployees.length === 0) return;
    setIsRecalculating(true);
    console.log("[recalc] start — employees:", filteredEmployees.length, "weeks:", weekMap.size);
    try {
      // Use absences from React Query (already loaded)
      const recalcAbsMap = absMap;
      const upserts: Array<Record<string, any>> = [];
      for (let wn = 1; wn <= 52; wn++) {
        const week = weekMap.get(wn);
        if (week?.is_manual_override) continue;
        const weekStart = week?.week_start ?? getWeekStartFromNumber(selectedYear, wn);
        const workingDays = getWorkingDaysForWeek(wn);
        const absHours = recalcAbsMap.get(weekStart) ?? 0;
        const calc = computeWeekCapacity(filteredEmployees, absHours, workingDays, localUtilizationPct, weekStart);

        const dbCap = week?.capacity_hours ?? -1;
        const dbAbsDays = (week as any)?.absence_days ?? -1;
        const calcAbsDays = Math.round(calc.absenceHours / 8);
        const changed = !weekMap.has(wn)
          || Math.round(calc.capacity) !== Math.round(dbCap)
          || calcAbsDays !== dbAbsDays;

        if (changed) {
          upserts.push({
            week_year: selectedYear,
            week_number: wn,
            week_start: weekStart,
            capacity_hours: calc.capacity,
            working_days: workingDays,
            is_manual_override: false,
            holiday_name: week?.holiday_name ?? null,
            company_holiday_name: week?.company_holiday_name ?? null,
            utilization_pct: localUtilizationPct,
            usek_breakdown: calc.byUsek,
            total_employees: calc.totalEmployees,
            absence_days: calcAbsDays,
          });
        }
      }
      console.log("[recalc] upserts:", upserts.length, 
        upserts.filter(u=>u.absence_days>0).map(u=>`T${u.week_number}:abs${u.absence_days}d`).join(","));
      if (upserts.length > 0) {
        await supabase.from("production_capacity" as any).upsert(upserts as any, { onConflict: "week_year,week_number" });
      }
      await queryClient.invalidateQueries({ queryKey: ["production-capacity", selectedYear] });
      if (!silent) {
        toast({
          title: `✓ Přepočteno ${upserts.length} týdnů`,
          description: upserts.filter(u => u.absence_days > 0)
            .map(u => `T${u.week_number}: ${u.absence_days} dní absence`)
            .slice(0, 5).join(" · ") || undefined,
        });
      }
    } catch (e: any) {
      toast({ title: "Chyba při přepočtu", description: e.message, variant: "destructive" });
    } finally {
      setIsRecalculating(false);
    }
  };

  // Save ALL pending changes to DB
  const handleSaveAll = async () => {
    try {
      // 1. Save utilization if changed
      if (localUtilizationPct !== dbUtilizationPct) {
        await updateSettings.mutateAsync({ utilization_pct: localUtilizationPct } as any);
      }

      // 2. Apply week overrides
      for (const [wn, { cap, days }] of pendingWeekOverrides) {
        const week = weekMap.get(wn);
        if (!week) continue;
        const isActuallyDifferent = cap !== nettoCapacity || week.holiday_name;
        await upsertWeek.mutateAsync({
          week_year: selectedYear,
          week_number: wn,
          week_start: week.week_start,
          capacity_hours: cap,
          working_days: days,
          is_manual_override: isActuallyDifferent ? true : false,
          holiday_name: week.holiday_name,
        });
      }

      // 3. Apply week resets
      if (pendingWeekResets.size > 0) {
        const { supabase } = await import("@/integrations/supabase/client");
        for (const wn of pendingWeekResets) {
          await supabase
            .from("production_capacity")
            .delete()
            .eq("week_year", selectedYear)
            .eq("week_number", wn);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["production-capacity", selectedYear] });
      toast({ title: "✓ Nastavení kapacity uloženo" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Chyba při ukládání", description: e.message, variant: "destructive" });
    }
  };

  const handleCancel = () => {
    setLocalUtilizationPct(dbUtilizationPct);
    setPendingWeekOverrides(new Map());
    setPendingWeekResets(new Set());
    onOpenChange(false);
  };

  const handleAddCompanyHoliday = async () => {
    if (!newHolidayName || !newHolidayStart || !newHolidayEnd) return;
    try {
      await addCompanyHoliday.mutateAsync({
        name: newHolidayName,
        start_date: newHolidayStart,
        end_date: newHolidayEnd,
        capacity_override: parseFloat(newHolidayCap) || 0,
      });
      setNewHolidayName("");
      setNewHolidayStart("");
      setNewHolidayEnd("");
      setNewHolidayCap("0");
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
  };

  const isPastWeek = (wn: number) => selectedYear < currentYear || (selectedYear === currentYear && wn < currentWeek);

  const handleBarClick = useCallback((wn: number, e: React.MouseEvent) => {
    // Always update the composition week so "Složení" reflects the clicked week
    setCompositionWeekNumber(wn);
    if (e.ctrlKey || e.metaKey) {
      setSelectedWeeks(prev => {
        const next = new Set(prev);
        if (next.has(wn)) next.delete(wn); else next.add(wn);
        return next;
      });
      setLastClickedWeek(wn);
    } else if (e.shiftKey && lastClickedWeek !== null) {
      const from = Math.min(lastClickedWeek, wn);
      const to = Math.max(lastClickedWeek, wn);
      setSelectedWeeks(prev => {
        const next = new Set(prev);
        for (let i = from; i <= to; i++) next.add(i);
        return next;
      });
    } else {
      setSelectedWeeks(prev => prev.size === 1 && prev.has(wn) ? new Set() : new Set([wn]));
      setLastClickedWeek(wn);
    }
  }, [lastClickedWeek]);

  // First selected week data for editor
  const editingWeeks = Array.from(selectedWeeks).sort((a, b) => a - b);
  const firstEditingWeek = editingWeeks.length > 0 ? editingWeeks[0] : null;
  const firstEditingWeekData = firstEditingWeek !== null ? liveWeekMap.get(firstEditingWeek) : null;
  const anyManualOverride = editingWeeks.some(wn => liveWeekMap.get(wn)?.is_manual_override);

  const innerContent = (
    <>
      <div className={cn("flex-1 overflow-y-auto pb-4 pt-4", inline ? "px-6" : "px-6")}>
        <div className="space-y-6">

        {/* Standard Capacity — dashboard-style tile cards (reflect SELECTED week) */}
        <div className="grid grid-cols-4 gap-3">
          {/* Tile 1 — Zaměstnanci */}
          <div className="rounded-lg border bg-card p-4 flex flex-col justify-center min-h-[110px]">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Výrobní zaměstnanci</p>
            <p className="font-serif font-bold text-3xl mt-1 tabular-nums">
              {compositionActiveEmployees.length}
              <span className="text-base font-normal text-muted-foreground"> / {vyrobniEmployees.length}</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">aktivní v T{compositionWeekNumber}</p>
          </div>

          {/* Tile 2 — Brutto fond (week-specific) */}
          <div className="rounded-lg border bg-card p-4 flex flex-col justify-center min-h-[110px]">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Brutto fond</p>
            <p className="font-serif font-bold text-3xl mt-1 tabular-nums">
              {Math.round(compositionBruttoWeekly)}
              <span className="text-base font-normal text-muted-foreground"> h/týden</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {compositionWorkingDays} prac. dní · absence {Math.round(compositionAbsenceHours)} h
            </p>
          </div>

          {/* Tile 3 — Využití (editable) */}
          <div className="rounded-lg border bg-card p-4 flex flex-col justify-center min-h-[110px]">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Využití kapacity</p>
            <div className="flex items-baseline gap-1 mt-1">
              <Input
                type="number"
                min={1}
                max={100}
                value={localUtilizationPct}
                onChange={e => setLocalUtilizationPct(Math.max(1, Math.min(100, Number(e.target.value) || 83)))}
                className="h-9 w-20 text-2xl font-serif font-bold tabular-nums px-2"
              />
              <span className="text-base text-muted-foreground">%</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Výchozí: 83 %
              {localUtilizationPct !== dbUtilizationPct && (
                <span className="ml-2 text-amber-500">● neuloženo</span>
              )}
            </p>
          </div>

          {/* Tile 4 — Čistá kapacita (week-specific) */}
          <div className="rounded-lg border bg-card p-4 flex flex-col justify-center min-h-[110px]">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Čistá kapacita</p>
            <p className="font-serif font-bold text-3xl mt-1 tabular-nums text-amber-600">
              {compositionNettoCapacity}
              <span className="text-base font-normal"> h/týden</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">T{compositionWeekNumber} · standard {netStandardCapacity} h</p>
          </div>
        </div>


        {/* Úseky breakdown panel (Výroba Direct) — per-week (compositionWeekNumber) */}
        {vyrobniEmployees.length > 0 && (() => {
          // Build dynamic groups from usek_nazov (Kompletace, Strojová dílna, …).
          // Hours are PER-WEEK (uvazok × activeDays for the composition week).
          const groups: Record<string, {count: number, weeklyHours: number, employees: typeof vyrobniEmployees}> = {};
          for (const emp of vyrobniEmployees) {
            const usekKey = normalizeUsek(emp);
            if (!usekKey) continue;
            if (!groups[usekKey]) groups[usekKey] = { count: 0, weeklyHours: 0, employees: [] };
            groups[usekKey].count++;
            groups[usekKey].weeklyHours += compositionEmpHours.get(emp.id) ?? 0;
            groups[usekKey].employees.push(emp);
          }
          // Filtered (included + active that week) groups
          const filteredGroups: Record<string, {count: number, weeklyHours: number}> = {};
          for (const key of Object.keys(groups)) filteredGroups[key] = { count: 0, weeklyHours: 0 };
          for (const emp of compositionActiveEmployees) {
            const usekKey = normalizeUsek(emp);
            if (!usekKey || !filteredGroups[usekKey]) continue;
            filteredGroups[usekKey].count++;
            filteredGroups[usekKey].weeklyHours += compositionEmpHours.get(emp.id) ?? 0;
          }
          const orderedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b, "cs"));
          const totalCount = Object.values(filteredGroups).reduce((s, g) => s + g.count, 0);
          const totalWeekly = Object.values(filteredGroups).reduce((s, g) => s + g.weeklyHours, 0);
          const totalNetto = compositionNettoCapacity;
          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  Složení výrobní kapacity
                  <span className="text-xs font-normal text-muted-foreground">· Týden T{compositionWeekNumber} {selectedYear} · Výroba Direct</span>
                  {compositionIsHistorical && (
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      historický snapshot — read-only
                    </Badge>
                  )}
                  {!compositionIsHistorical && composition && !composition.hasSnapshot && (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      výchozí stav
                    </Badge>
                  )}
                </h3>
                {!compositionIsHistorical && (
                  <span className="text-[10px] text-muted-foreground italic">
                    Změna se uloží pro T{compositionWeekNumber}–T52
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                📊 Aktivní v T{compositionWeekNumber}: {totalCount} zam. · Brutto fond: {Math.round(totalWeekly)} h · Absence: {Math.round(compositionAbsenceHours)} h · Prac. dní: {compositionWorkingDays}
              </p>
              <div className="overflow-hidden rounded border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-5"></th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Úsek</th>
                      <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Aktivní zam.</th>
                      <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">H/týden (T{compositionWeekNumber})</th>
                      <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Čistá kapacita (h/týden)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedKeys.map(key => {
                      const g = groups[key];
                      const fg = filteredGroups[key] ?? { count: 0, weeklyHours: 0 };
                      const isExpanded = expandedUsek === key;
                      const isUsekDisabled = disabledUseky.has(key);
                      const netto = Math.round(fg.weeklyHours * localUtilizationPct / 100);
                      const threeMonthsAgo = new Date();
                      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
                      return (
                        <React.Fragment key={key}>
                          <tr
                            className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => setExpandedUsek(isExpanded ? null : key)}
                          >
                            <td className="px-1 py-1">
                              <input
                                type="checkbox"
                                checked={!isUsekDisabled}
                                disabled={!compositionIsEditable}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  if (!compositionIsEditable) return;
                                  const empIds = g.employees.map(emp => emp.id);
                                  const shouldInclude = isUsekDisabled;
                                  handleToggleEmployees(empIds, shouldInclude);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className={cn("rounded", !compositionIsEditable && "cursor-not-allowed opacity-50")}
                                title={!compositionIsEditable ? "Minulý týden — historický snapshot, nelze upravit" : undefined}
                              />
                            </td>
                            <td className={cn("px-3 py-1 flex items-center gap-1", isUsekDisabled && "text-muted-foreground line-through")}>
                              {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                              {key}
                            </td>
                            <td className={cn("px-3 py-1 text-right font-sans", isUsekDisabled ? "text-muted-foreground" : "text-foreground")}>{fg.count}<span className="text-muted-foreground">/{g.count}</span></td>
                            <td className={cn("px-3 py-1 text-right font-sans", isUsekDisabled ? "text-muted-foreground" : "text-foreground")}>{Math.round(fg.weeklyHours)} h</td>
                            <td className={cn("px-3 py-1 text-right font-sans", isUsekDisabled ? "text-muted-foreground" : "text-accent")}>{netto} h</td>
                          </tr>
                          {isExpanded && g.employees.length > 0 && g.employees.map(emp => {
                            const isEmpDisabled = disabledEmployees.has(emp.id) || isUsekDisabled;
                            const isRecent = emp.activated_at && new Date(emp.activated_at) > threeMonthsAgo;
                            const empWeekHours = compositionEmpHours.get(emp.id) ?? 0;
                            const isInactiveThisWeek = empWeekHours === 0;
                            return (
                              <tr key={emp.id} className={cn("bg-muted/20 border-b border-border/30", isInactiveThisWeek && "opacity-60")}>
                                <td className="px-1 py-0.5">
                                  <input
                                    type="checkbox"
                                    checked={!disabledEmployees.has(emp.id) && !isUsekDisabled}
                                    disabled={isUsekDisabled || !compositionIsEditable}
                                    onChange={() => {
                                      if (!compositionIsEditable) return;
                                      const isCurrentlyExcluded = disabledEmployees.has(emp.id);
                                      handleToggleEmployees([emp.id], isCurrentlyExcluded);
                                    }}
                                    className={cn("rounded", !compositionIsEditable && "cursor-not-allowed opacity-50")}
                                    title={!compositionIsEditable ? "Minulý týden — historický snapshot, nelze upravit" : undefined}
                                  />
                                </td>
                                <td className={cn("pl-8 pr-3 py-0.5", isEmpDisabled ? "text-muted-foreground line-through" : "text-muted-foreground")}>
                                  {emp.meno || emp.id.slice(0, 8)}
                                  {isRecent && (
                                    <span className="ml-1.5 text-[10px] text-emerald-600">od {emp.activated_at?.split("T")[0]}</span>
                                  )}
                                  {isInactiveThisWeek && !isEmpDisabled && (
                                    <span className="ml-1.5 text-[10px] text-muted-foreground italic">(neaktivní v T{compositionWeekNumber})</span>
                                  )}
                                </td>
                                <td className="px-3 py-0.5 text-right font-sans text-muted-foreground"></td>
                                <td className="px-3 py-0.5 text-right font-sans text-muted-foreground">{(emp.uvazok_hodiny ?? 8)} h/den</td>
                                <td className="px-3 py-0.5 text-right font-sans text-muted-foreground">{Math.round(empWeekHours)} h/týd</td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                    <tr className="bg-muted/30 font-semibold">
                      <td className="px-1 py-1.5"></td>
                      <td className="px-3 py-1.5 text-foreground">Celkem</td>
                      <td className="px-3 py-1.5 text-right font-sans text-foreground">{totalCount}</td>
                      <td className="px-3 py-1.5 text-right font-sans text-foreground">{Math.round(totalWeekly)} h</td>
                      <td className="px-3 py-1.5 text-right font-sans text-accent font-bold">{totalNetto} h</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Skutečná kapacita T{compositionWeekNumber} = {totalNetto} h/týden · (brutto {Math.round(totalWeekly)}h − absence {Math.round(compositionAbsenceHours)}h) × využití {localUtilizationPct}%
              </p>
            </div>
          );
        })()}


        {/* Year Bar Chart */}
        <div className="border border-border/60 rounded-lg p-4 space-y-3 bg-card">
          {/* Header: Year nav + month range + scroll controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-foreground">Kapacita</h3>
              <span className="text-sm font-bold text-foreground min-w-[50px]">{selectedYear}</span>
              <span className="text-xs text-muted-foreground">{visibleMonthRange}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={jumpToToday} disabled={!canJumpToToday}>
                <CalendarDays className="h-3 w-3 mr-1" /> Dnes
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={scrollLeft} disabled={atMinBoundary}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={scrollRight}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">Klikni na bar pro editaci · Ctrl+klik pro výběr více · Shift+klik pro rozsah</p>

          {/* Month labels */}
          <div className="flex">
            {monthGroups.map((mg, i) => (
              <div
                key={`${mg.month}-${i}`}
                className="text-center text-[10px] font-medium text-muted-foreground"
                style={{
                  flex: mg.count,
                  borderRight: i < monthGroups.length - 1 ? "1px solid hsl(var(--border))" : "none",
                }}
              >
                {mg.name}
              </div>
            ))}
          </div>

          {/* Bar chart — 12 visible weeks */}
          <TooltipProvider delayDuration={100}>
            <div className="relative" style={{ height: 160 }}>
              {/* Reference line */}
              <div
                className="absolute left-0 right-0 border-t-2 border-dashed z-10 pointer-events-none"
                style={{
                  top: `${Math.max(0, 140 - (netStandardCapacity / (maxCapacity * 1.1)) * 140)}px`,
                  borderColor: "hsl(var(--destructive) / 0.4)",
                }}
              />

              <div className="flex items-end gap-1 h-[140px]">
                {Array.from({ length: VISIBLE_WEEKS }, (_, i) => viewStart + i).filter(wn => wn >= 1 && wn <= 52).map(wn => {
                  const week = liveWeekMap.get(wn);
                  if (!week) return null;
                  const cap = week.capacity_hours;
                  const barH = maxCapacity > 0 ? Math.max(4, (cap / (maxCapacity * 1.1)) * 140) : 4;
                  const past = isPastWeek(wn);
                  const isBarSelected = selectedWeeks.has(wn);
                  const typeLabel = getWeekTypeLabel(week, past);

                  const barColor = past ? PAST_WEEK_COLOR : getCapacityColorDynamic(cap, netStandardCapacity, visibleRange.min, visibleRange.max);

                  const weekStart = new Date(week.week_start + "T00:00:00");
                  const weekEnd = new Date(weekStart);
                  weekEnd.setDate(weekStart.getDate() + 4);
                  const fmtDate = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;

                  // Read live calc columns (cast to any since types may not be regenerated yet)
                  const wAny = week as any;
                  const hasDilna = wAny.total_employees > 0;

                  const isCompositionBar = wn === compositionWeekNumber;
                  return (
                    <Tooltip key={wn}>
                      <TooltipTrigger asChild>
                        <button
                          className={cn(
                            "flex-1 rounded-t-sm transition-all hover:opacity-80 cursor-pointer",
                            isBarSelected && "ring-2 ring-foreground",
                            isCompositionBar && !isBarSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                          )}
                          style={{
                            height: barH,
                            backgroundColor: barColor,
                            minWidth: 0,
                            ...(selectedYear === currentYear && wn === currentWeek
                              ? { border: "1.5px solid #0a2e28" }
                              : {}),
                          }}
                          onClick={e => handleBarClick(wn, e)}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs space-y-0.5 font-sans">
                        <div className="font-bold">T{wn}</div>
                        <div>{fmtDate(weekStart)} – {fmtDate(weekEnd)}{selectedYear}</div>
                        <div>{Math.round(cap)} h {!week.is_manual_override && <span className="text-muted-foreground text-[10px] ml-1">Auto</span>}</div>
                        <div className="text-muted-foreground">{typeLabel}{week.holiday_name ? ` · ${week.holiday_name}` : ""}</div>
                        {hasDilna && (
                          <div className="border-t border-border/50 pt-0.5 mt-0.5 space-y-0">
                            {(() => {
                              const breakdown = (wAny.usek_breakdown ?? {}) as Record<string, number>;
                              const entries = Object.entries(breakdown).sort(([a], [b]) => a.localeCompare(b, "cs"));
                              return entries.length > 0
                                ? entries.map(([usek, h]) => <div key={usek}>{usek}: {Math.round(h)}h</div>)
                                : null;
                            })()}
                            <div>Zaměstnanci: {wAny.total_employees} · Absence: {Math.round((absMap.get(wAny.week_start) ?? 0) / 8)} dní</div>
                            <div>Využití: {wAny.utilization_pct ?? 83}%</div>
                          </div>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

              {/* Week number labels */}
              <div className="flex gap-1 mt-1">
                {Array.from({ length: VISIBLE_WEEKS }, (_, i) => viewStart + i).filter(wn => wn >= 1 && wn <= 52).map(wn => (
                  <div key={wn} className="flex-1 text-center text-[10px] font-sans text-muted-foreground">
                    T{wn}
                  </div>
                ))}
              </div>
            </div>
          </TooltipProvider>

          {/* Legend — gradient strip */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-2.5 flex-1 rounded-sm" style={{ background: "linear-gradient(to right, #b45309, #d97706, #f5a742, #fde8cc, #9ca3af, #a3c9a8, #5a9e6f, #2d6a4f)" }} />
              <div className="w-4 h-2.5 rounded-sm" style={{ backgroundColor: PAST_WEEK_COLOR }} />
            </div>
            <div className="flex text-[9px] text-muted-foreground">
              <span className="flex-1 text-left">Nízká kapacita</span>
              <span className="flex-1 text-center">Standard</span>
              <span className="flex-1 text-right mr-6">Vysoká kapacita</span>
              <span className="w-4 text-center">Min.</span>
            </div>
          </div>

          {/* Inline Week Editor */}
          {firstEditingWeekData && firstEditingWeek !== null && (
            <WeekEditor
              key={`${editingWeeks.join("-")}`}
              week={firstEditingWeekData}
              weekNum={firstEditingWeek}
              selectedCount={editingWeeks.length}
              isPast={isPastWeek(firstEditingWeek)}
              standardCapacity={netStandardCapacity}
              hoursPerDay={8}
              onSave={(cap, days) => handleWeekCapacityUpdate(editingWeeks, cap, days)}
              onReset={() => handleResetWeeks(editingWeeks)}
              onClose={() => setSelectedWeeks(new Set())}
              hasManualOverride={anyManualOverride}
            />
          )}
        </div>

        {/* Manual edit section — collapsed by default */}
        <Collapsible>
          <CollapsibleTrigger className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-2 border-t border-border/40 group">
            <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
            <span className="underline-offset-2 group-hover:underline">Upravit manuálně (svátky &amp; firemní dovolená)</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-6 pt-4">
            {/* Holiday Summary */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">🇨🇿 České státní svátky {selectedYear}</h3>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoApplyHolidays}
                    onChange={e => setAutoApplyHolidays(e.target.checked)}
                    className="rounded"
                  />
                  Automaticky aplikovat na kapacitu
                </label>
              </div>
              {holidayImpacts.length > 0 ? (
                <div className="overflow-auto max-h-[200px]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-1 pr-2">Datum</th>
                        <th className="text-left py-1 pr-2">Svátek</th>
                        <th className="text-left py-1 pr-2">Týden</th>
                        <th className="text-left py-1">Dopad na kapacitu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holidayImpacts.map((h, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-1 pr-2 font-sans">{h.date}</td>
                          <td className="py-1 pr-2">{h.name}</td>
                          <td className="py-1 pr-2 font-sans">T{h.weekNum}</td>
                          <td className="py-1 font-sans text-amber-600">-{h.reducedHours}h · kapacita týdne: {Math.round((totalBruttoSelectedDaily * h.workingDays) * localUtilizationPct / 100)}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Žádné svátky nenalezeny</p>
              )}
            </div>

            {/* Company Holidays */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">🏖 Firemní dovolená</h3>

              {companyHolidays.length > 0 && (
                <div className="space-y-2">
                  {companyHolidays.map(ch => (
                    <div key={ch.id} className="flex items-center justify-between border border-border/50 rounded-md px-3 py-2">
                      <div className="text-xs">
                        <span className="font-sans">{ch.start_date} – {ch.end_date}</span>
                        <span className="mx-2 text-muted-foreground">|</span>
                        <span className="font-medium">{ch.name}</span>
                        <span className="mx-2 text-muted-foreground">|</span>
                        <span className="font-sans text-amber-600">{ch.capacity_override}h</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={async () => {
                        await deleteCompanyHoliday.mutateAsync(ch.id);
                        if (vyrobniEmployees.length > 0) {
                          await queryClient.invalidateQueries({ queryKey: ["company-holidays"] });
                          setTimeout(() => triggerAutoRecalc(), 200);
                        }
                      }}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-5 gap-2 items-end">
                <div>
                  <label className="text-[10px] text-muted-foreground">Název</label>
                  <Input value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)} className="h-7 text-xs" placeholder="Vánoční zavírka" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Od</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("h-7 w-full justify-start text-left font-normal text-xs", !newHolidayStart && "text-muted-foreground")}>
                        <CalendarIcon className="mr-1.5 h-3 w-3" />
                        {newHolidayStart ? format(parse(newHolidayStart, "yyyy-MM-dd", new Date()), "d. M. yyyy") : "—"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[99999]" align="start">
                      <Calendar
                        mode="single"
                        selected={newHolidayStart ? parse(newHolidayStart, "yyyy-MM-dd", new Date()) : undefined}
                        defaultMonth={newHolidayStart ? parse(newHolidayStart, "yyyy-MM-dd", new Date()) : new Date()}
                        onSelect={(d) => { if (d) setNewHolidayStart(format(d, "yyyy-MM-dd")); }}
                        weekStartsOn={1}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Do</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("h-7 w-full justify-start text-left font-normal text-xs", !newHolidayEnd && "text-muted-foreground")}>
                        <CalendarIcon className="mr-1.5 h-3 w-3" />
                        {newHolidayEnd ? format(parse(newHolidayEnd, "yyyy-MM-dd", new Date()), "d. M. yyyy") : "—"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[99999]" align="start">
                      <Calendar
                        mode="single"
                        selected={newHolidayEnd ? parse(newHolidayEnd, "yyyy-MM-dd", new Date()) : undefined}
                        defaultMonth={newHolidayEnd ? parse(newHolidayEnd, "yyyy-MM-dd", new Date()) : (newHolidayStart ? parse(newHolidayStart, "yyyy-MM-dd", new Date()) : new Date())}
                        onSelect={(d) => { if (d) setNewHolidayEnd(format(d, "yyyy-MM-dd")); }}
                        weekStartsOn={1}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Kapacita (h)</label>
                  <Input type="number" value={newHolidayCap} onChange={e => setNewHolidayCap(e.target.value)} className="h-7 text-xs" />
                </div>
                <Button size="sm" className="h-7" onClick={handleAddCompanyHoliday} disabled={!newHolidayName || !newHolidayStart || !newHolidayEnd}>
                  <Plus className="h-3 w-3 mr-1" /> Přidat
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
        </div>
        </div>{/* end scrollable content */}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border shrink-0">
          <div></div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleCancel}>Zrušit změny</Button>
            <Button onClick={handleSaveAll}>Uložit změny</Button>
          </div>
        </div>

        <ConfirmDialog
          open={cleanupConfirmOpen}
          onCancel={() => setCleanupConfirmOpen(false)}
          title="Vyčistit testovací data"
          description="Smaže osiřelé záznamy z výrobních tabulek (production_schedule, inbox, logy, QC). Živé projekty NEBUDOU dotčeny."
          confirmLabel="Vyčistit"
          onConfirm={async () => {
            setIsCleaningUp(true);
            try {
              const { data, error } = await supabase.rpc("clean_test_production_data" as any);
              if (error) throw error;
              const result = data as Record<string, number>;
              const parts = Object.entries(result)
                .filter(([, count]) => count > 0)
                .map(([table, count]) => `${count} z ${table}`);
              if (parts.length > 0) {
                toast({ title: "Testovací data vyčištěna", description: `Smazáno: ${parts.join(", ")}` });
              } else {
                toast({ title: "Žádná testovací data k vyčištění" });
              }
              queryClient.invalidateQueries({ queryKey: ["production-schedule"] });
              queryClient.invalidateQueries({ queryKey: ["production-inbox"] });
            } catch (err: any) {
              toast({ title: "Chyba", description: err.message, variant: "destructive" });
            } finally {
              setIsCleaningUp(false);
              setCleanupConfirmOpen(false);
            }
          }}
        />
    </>
  );

  if (inline) {
    return <div className="flex flex-col h-full overflow-hidden bg-card">{innerContent}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={(val) => {
        if (!val && hasPendingChanges) {
          const confirmed = window.confirm("Máte neuložené změny. Opravdu chcete odejít bez uložení?");
          if (!confirmed) return;
        }
        onOpenChange(val);
      }}>
      <DialogContent className="max-w-[900px] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              📊 Kapacita výroby
            </DialogTitle>
          </DialogHeader>
        </div>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}

function WeekEditor({ week, weekNum, selectedCount, isPast, standardCapacity, hoursPerDay, onSave, onReset, onClose, hasManualOverride }: {
  week: WeekCapacity;
  weekNum: number;
  selectedCount: number;
  isPast: boolean;
  standardCapacity: number;
  hoursPerDay: number;
  onSave: (cap: number, days: number) => void;
  onReset: () => void;
  onClose: () => void;
  hasManualOverride: boolean;
}) {
  const [cap, setCap] = useState(String(Math.round(week.capacity_hours)));
  const [days, setDays] = useState(String(week.working_days));

  const weekStart = new Date(week.week_start + "T00:00:00");
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const formatDate = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  const step = 8;

  const save = () => {
    const v = parseInt(cap);
    const d = parseInt(days);
    if (v >= 0 && d >= 0) onSave(v, d);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCap(v => String(Math.max(0, parseInt(v || "0") + step)));
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCap(v => String(Math.max(0, parseInt(v || "0") - step)));
    }
  };

  const title = selectedCount > 1
    ? `${selectedCount} týdnů vybráno (T${weekNum} + ${selectedCount - 1} dalších)`
    : `T${weekNum} · ${formatDate(weekStart)} – ${formatDate(weekEnd)}`;

  return (
    <div className="border border-border rounded-md p-3 bg-muted/30 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-foreground">{title}</div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      {isPast && selectedCount === 1 && (
        <div className="text-[10px] text-amber-600 font-medium">⚠ Minulý týden</div>
      )}
      {week.holiday_name && selectedCount === 1 && (
        <div className="text-[10px] text-amber-600">🇨🇿 {week.holiday_name}</div>
      )}
      {week.company_holiday_name && selectedCount === 1 && (
        <div className="text-[10px] text-amber-600">🏖 {week.company_holiday_name}</div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground">Kapacita (h) · ↑↓ ±{step}h</label>
          <Input
            type="number"
            value={cap}
            onChange={e => setCap(e.target.value)}
            onKeyDown={handleKeyDown}
            step={step}
            className="h-7 text-xs font-sans"
            autoFocus
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground">Prac. dní</label>
          <Input
            type="number"
            value={days}
            onChange={e => setDays(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-7 text-xs font-sans"
          />
        </div>
        <Button size="sm" className="h-7 text-xs" onClick={save}>
          Uložit
        </Button>
        {hasManualOverride && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { onReset(); }}>
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
        )}
      </div>
    </div>
  );
}
