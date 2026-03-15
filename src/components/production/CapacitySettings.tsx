import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, Plus, RotateCcw, CalendarDays, CalendarIcon } from "lucide-react";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function CapacitySettings({ open, onOpenChange }: Props) {
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
  const VISIBLE_WEEKS = 12;
  const SCROLL_STEP = 4;
  const getDefaultViewStart = useCallback(() => {
    if (selectedYear === currentYear) return Math.max(1, currentWeek - Math.floor(VISIBLE_WEEKS / 2));
    return 1;
  }, [selectedYear, currentYear, currentWeek]);
  const [viewStart, setViewStart] = useState(() => getDefaultViewStart());

  const scrollLeft = () => setViewStart(v => Math.max(1, v - SCROLL_STEP));
  const scrollRight = () => setViewStart(v => Math.min(52 - VISIBLE_WEEKS + 1, v + SCROLL_STEP));
  const jumpToToday = () => {
    setSelectedYear(currentYear);
    setViewStart(Math.max(1, currentWeek - Math.floor(VISIBLE_WEEKS / 2)));
  };

  const CZECH_MONTHS = ["Leden","Únor","Březen","Duben","Květen","Červen","Červenec","Srpen","Září","Říjen","Listopad","Prosinec"];

  const { data: settings } = useProductionSettings();
  const updateSettings = useUpdateProductionSettings();
  const { weekMap, defaultCapacity, hoursPerDay } = useWeeklyCapacity(selectedYear);
  const { data: holidays = [] } = useCzechHolidays(selectedYear);
  const { data: companyHolidays = [] } = useCompanyHolidays();
  const addCompanyHoliday = useAddCompanyHoliday();
  const deleteCompanyHoliday = useDeleteCompanyHoliday();
  const upsertWeek = useUpsertWeekCapacity();
  const bulkUpdate = useBulkUpdateFutureCapacity();
  const queryClient = useQueryClient();

  const dbStandardCapacity = settings?.weekly_capacity_hours ?? 875;
  const [localStandardCapacity, setLocalStandardCapacity] = useState(dbStandardCapacity);
  const standardCapacity = localStandardCapacity;
  const [standardCapacityInput, setStandardCapacityInput] = useState<string>(String(dbStandardCapacity));
  const [capacityInputFocused, setCapacityInputFocused] = useState(false);

  // Pending local changes for week overrides/resets
  const [pendingWeekOverrides, setPendingWeekOverrides] = useState<Map<number, { cap: number; days: number }>>(new Map());
  const [pendingWeekResets, setPendingWeekResets] = useState<Set<number>>(new Set());
  const hasPendingChanges = localStandardCapacity !== dbStandardCapacity || pendingWeekOverrides.size > 0 || pendingWeekResets.size > 0;

  // Reset local state when dialog opens
  useEffect(() => {
    if (open) {
      setLocalStandardCapacity(dbStandardCapacity);
      setStandardCapacityInput(String(dbStandardCapacity));
      setPendingWeekOverrides(new Map());
      setPendingWeekResets(new Set());
    }
  }, [open, dbStandardCapacity]);

  // Safe math expression evaluator
  const safeEvalExpr = (expr: string): number | null => {
    try {
      if (!/^[\d\s+\-*/().]+$/.test(expr)) return null;
      const result = Function('"use strict"; return (' + expr + ')')();
      if (typeof result !== "number" || !isFinite(result) || isNaN(result)) return null;
      return Math.round(result);
    } catch { return null; }
  };

  const isExpr = /[*/()]/.test(standardCapacityInput);
  const exprPreview = isExpr ? safeEvalExpr(standardCapacityInput) : null;

  const commitCapacityInput = () => {
    const evaluated = safeEvalExpr(standardCapacityInput);
    if (evaluated !== null && evaluated > 0) {
      setLocalStandardCapacity(evaluated);
      setStandardCapacityInput(String(evaluated));
    } else {
      const v = parseInt(standardCapacityInput);
      if (v > 0) {
        setLocalStandardCapacity(v);
        setStandardCapacityInput(String(v));
      } else {
        setStandardCapacityInput(String(standardCapacity));
      }
    }
    setCapacityInputFocused(false);
  };
  const workingDaysPerWeek = 5;
  const calculatedHoursPerDay = workingDaysPerWeek > 0 ? Math.round(standardCapacity / workingDaysPerWeek) : 175;

  // Get month for a week number
  const getWeekMonth = useCallback((wn: number): number => {
    const week = weekMap.get(wn);
    if (!week) return 0;
    const d = new Date(week.week_start + "T00:00:00");
    d.setDate(d.getDate() + 3);
    return d.getMonth();
  }, [weekMap]);

  // Get type label for a week
  const getWeekTypeLabel = useCallback((week: WeekCapacity, past: boolean): string => {
    if (past) return "Minulý";
    if (week.company_holiday_name) return "Firemní dovolená";
    if (week.is_manual_override && Math.round(week.capacity_hours) !== Math.round(standardCapacity)) return "Ručně upraveno";
    if (week.holiday_name) return "Svátek";
    return "Standard";
  }, [standardCapacity]);

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
    let max = standardCapacity;
    for (const [, w] of weekMap) {
      if (w.capacity_hours > max) max = w.capacity_hours;
    }
    return max;
  }, [weekMap, standardCapacity]);

  // Visible window min/max for dynamic color scaling (excluding past weeks)
  const visibleRange = useMemo(() => {
    let min = standardCapacity;
    let max = standardCapacity;
    const end = Math.min(52, viewStart + VISIBLE_WEEKS - 1);
    for (let wn = viewStart; wn <= end; wn++) {
      const week = weekMap.get(wn);
      if (!week) continue;
      const past = selectedYear < currentYear || (selectedYear === currentYear && wn < currentWeek);
      if (past) continue;
      const cap = week.capacity_hours;
      if (cap < min) min = cap;
      if (cap > max) max = cap;
    }
    return { min, max };
  }, [weekMap, viewStart, selectedYear, currentYear, currentWeek, standardCapacity]);

  // Holiday impact summary
  const holidayImpacts = useMemo(() => {
    const impacts: Array<{ date: string; name: string; weekNum: number; reducedHours: number; workingDays: number }> = [];
    for (const h of holidays) {
      const d = new Date(h.date + "T00:00:00");
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      const wn = getISOWeekNumber(d);
      const week = weekMap.get(wn);
      impacts.push({
        date: `${d.getDate()}. ${d.getMonth() + 1}.`,
        name: h.localName,
        weekNum: wn,
        reducedHours: calculatedHoursPerDay,
        workingDays: week?.working_days ?? 4,
      });
    }
    return impacts;
  }, [holidays, weekMap, calculatedHoursPerDay]);

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

  // Save ALL pending changes to DB
  const handleSaveAll = async () => {
    try {
      // 1. Save standard capacity if changed
      if (localStandardCapacity !== dbStandardCapacity) {
        await updateSettings.mutateAsync({ weekly_capacity_hours: localStandardCapacity, monthly_capacity_hours: localStandardCapacity * 4 });
        const futureFromWeek = selectedYear < currentYear ? 53 : (selectedYear === currentYear ? currentWeek + 1 : 1);
        if (futureFromWeek <= 52) {
          await bulkUpdate.mutateAsync({ year: selectedYear, fromWeek: futureFromWeek, capacity: localStandardCapacity, workingDays: workingDaysPerWeek });
        }
      }

      // 2. Apply week overrides
      for (const [wn, { cap, days }] of pendingWeekOverrides) {
        const week = weekMap.get(wn);
        if (!week) continue;
        const isActuallyDifferent = cap !== localStandardCapacity || week.holiday_name;
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
    setLocalStandardCapacity(dbStandardCapacity);
    setStandardCapacityInput(String(dbStandardCapacity));
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
    if (e.ctrlKey || e.metaKey) {
      // Toggle individual week
      setSelectedWeeks(prev => {
        const next = new Set(prev);
        if (next.has(wn)) next.delete(wn); else next.add(wn);
        return next;
      });
      setLastClickedWeek(wn);
    } else if (e.shiftKey && lastClickedWeek !== null) {
      // Range select
      const from = Math.min(lastClickedWeek, wn);
      const to = Math.max(lastClickedWeek, wn);
      setSelectedWeeks(prev => {
        const next = new Set(prev);
        for (let i = from; i <= to; i++) next.add(i);
        return next;
      });
    } else {
      // Single select / toggle
      setSelectedWeeks(prev => prev.size === 1 && prev.has(wn) ? new Set() : new Set([wn]));
      setLastClickedWeek(wn);
    }
  }, [lastClickedWeek]);

  // First selected week data for editor
  const editingWeeks = Array.from(selectedWeeks).sort((a, b) => a - b);
  const firstEditingWeek = editingWeeks.length > 0 ? editingWeeks[0] : null;
  const firstEditingWeekData = firstEditingWeek !== null ? weekMap.get(firstEditingWeek) : null;
  const anyManualOverride = editingWeeks.some(wn => weekMap.get(wn)?.is_manual_override);

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

        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">

        {/* Standard Capacity */}
        <div className="border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Standardní kapacita</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Kapacita (h/týden)</label>
              <Input
                type="text"
                inputMode="numeric"
                value={capacityInputFocused ? standardCapacityInput : String(standardCapacity)}
                onFocus={() => {
                  setCapacityInputFocused(true);
                  setStandardCapacityInput(String(standardCapacity));
                }}
                onChange={e => setStandardCapacityInput(e.target.value)}
                onBlur={commitCapacityInput}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); commitCapacityInput(); (e.target as HTMLInputElement).blur(); }
                  if (e.key === "Escape") { setStandardCapacityInput(String(standardCapacity)); setCapacityInputFocused(false); (e.target as HTMLInputElement).blur(); }
                }}
                className="h-8 text-sm font-mono"
              />
              {capacityInputFocused && isExpr && exprPreview !== null && (
                <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">= {exprPreview}</div>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Pracovní dny</label>
              <Input type="number" value={workingDaysPerWeek} disabled className="h-8 text-sm font-mono bg-muted" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hodin za den</label>
              <Input type="number" value={calculatedHoursPerDay} disabled className="h-8 text-sm font-mono bg-muted" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">Změna kapacity ovlivní pouze týdny od dneška vpřed. Minulé týdny zůstanou nezměněny.</p>
        </div>

        {/* Year Bar Chart */}
        <div className="border border-border rounded-lg p-4 space-y-3">
          {/* Header: Year nav + month range + scroll controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-foreground">Kapacita</h3>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setSelectedYear(y => y - 1); setViewStart(1); }}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-bold text-foreground min-w-[50px] text-center">{selectedYear}</span>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setSelectedYear(y => y + 1); setViewStart(1); }}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">{visibleMonthRange}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={jumpToToday}>
                <CalendarDays className="h-3 w-3 mr-1" /> Dnes
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={scrollLeft} disabled={viewStart <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={scrollRight} disabled={viewStart >= 52 - VISIBLE_WEEKS + 1}>
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
                  top: `${Math.max(0, 140 - (standardCapacity / (maxCapacity * 1.1)) * 140)}px`,
                  borderColor: "hsl(var(--destructive) / 0.4)",
                }}
              />

              <div className="flex items-end gap-1 h-[140px]">
                {Array.from({ length: VISIBLE_WEEKS }, (_, i) => viewStart + i).filter(wn => wn >= 1 && wn <= 52).map(wn => {
                  const week = weekMap.get(wn);
                  if (!week) return null;
                  const cap = week.capacity_hours;
                  const barH = maxCapacity > 0 ? Math.max(4, (cap / (maxCapacity * 1.1)) * 140) : 4;
                  const past = isPastWeek(wn);
                  const isBarSelected = selectedWeeks.has(wn);
                  const typeLabel = getWeekTypeLabel(week, past);

                  const barColor = past ? PAST_WEEK_COLOR : getCapacityColorDynamic(cap, standardCapacity, visibleRange.min, visibleRange.max);

                  const weekStart = new Date(week.week_start + "T00:00:00");
                  const weekEnd = new Date(weekStart);
                  weekEnd.setDate(weekStart.getDate() + 4);
                  const fmtDate = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;

                  return (
                    <Tooltip key={wn}>
                      <TooltipTrigger asChild>
                        <button
                          className={`flex-1 rounded-t-sm transition-all hover:opacity-80 cursor-pointer ${isBarSelected ? "ring-2 ring-foreground" : ""}`}
                          style={{
                            height: barH,
                            backgroundColor: barColor,
                            minWidth: 0,
                          }}
                          onClick={e => handleBarClick(wn, e)}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs space-y-0.5 font-mono">
                        <div className="font-bold">T{wn}</div>
                        <div>{fmtDate(weekStart)} – {fmtDate(weekEnd)}{selectedYear}</div>
                        <div>{Math.round(cap)} h</div>
                        <div className="text-muted-foreground">{typeLabel}{week.holiday_name ? ` · ${week.holiday_name}` : ""}</div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

              {/* Week number labels */}
              <div className="flex gap-1 mt-1">
                {Array.from({ length: VISIBLE_WEEKS }, (_, i) => viewStart + i).filter(wn => wn >= 1 && wn <= 52).map(wn => (
                  <div key={wn} className="flex-1 text-center text-[10px] font-mono text-muted-foreground">
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
              standardCapacity={standardCapacity}
              hoursPerDay={calculatedHoursPerDay}
              onSave={(cap, days) => handleWeekCapacityUpdate(editingWeeks, cap, days)}
              onReset={() => handleResetWeeks(editingWeeks)}
              onClose={() => setSelectedWeeks(new Set())}
              hasManualOverride={anyManualOverride}
            />
          )}
        </div>

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
                      <td className="py-1 pr-2 font-mono">{h.date}</td>
                      <td className="py-1 pr-2">{h.name}</td>
                      <td className="py-1 pr-2 font-mono">T{h.weekNum}</td>
                      <td className="py-1 font-mono text-amber-600">-{h.reducedHours}h ({h.workingDays} dny)</td>
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
                    <span className="font-mono">{ch.start_date} – {ch.end_date}</span>
                    <span className="mx-2 text-muted-foreground">|</span>
                    <span className="font-medium">{ch.name}</span>
                    <span className="mx-2 text-muted-foreground">|</span>
                    <span className="font-mono text-amber-600">{ch.capacity_override}h</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => deleteCompanyHoliday.mutate(ch.id)}>
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
        </div>{/* end scrollable content */}

        {/* Sticky footer */}
        <div className="shrink-0" style={{ borderTop: "0.5px solid #e5e3df" }}>
          <div className="flex items-center justify-between px-6 py-2">
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
            >
              Zrušit změny
            </button>
            <span className="text-[10px] text-muted-foreground">
              {hasPendingChanges ? "Neuložené změny" : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSaveAll}
            className="w-full text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "#223937", height: 48, borderRadius: "0 0 12px 12px" }}
          >
            Uložit nastavení
          </button>
        </div>
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
  const step = hoursPerDay || 8;

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
            className="h-7 text-xs font-mono"
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
            className="h-7 text-xs font-mono"
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
