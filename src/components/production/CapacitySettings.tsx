import { useState, useMemo, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, Plus, RotateCcw, CalendarDays } from "lucide-react";
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

  const standardCapacity = settings?.weekly_capacity_hours ?? 875;
  const [standardCapacityInput, setStandardCapacityInput] = useState<string>("");
  const workingDaysPerWeek = 5;
  const calculatedHoursPerDay = workingDaysPerWeek > 0 ? Math.round(standardCapacity / workingDaysPerWeek) : 175;

  const maxCapacity = useMemo(() => {
    let max = standardCapacity;
    for (const [, w] of weekMap) {
      if (w.capacity_hours > max) max = w.capacity_hours;
    }
    return max;
  }, [weekMap, standardCapacity]);

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

  const handleStandardCapacityChange = async (value: number) => {
    if (value <= 0 || isNaN(value)) return;
    try {
      await updateSettings.mutateAsync({ weekly_capacity_hours: value, monthly_capacity_hours: value * 4 });
      // Only clear non-manual FUTURE weeks (current week + 1 onward)
      const futureFromWeek = selectedYear < currentYear ? 53 : (selectedYear === currentYear ? currentWeek + 1 : 1);
      if (futureFromWeek <= 52) {
        await bulkUpdate.mutateAsync({ year: selectedYear, fromWeek: futureFromWeek, capacity: value, workingDays: workingDaysPerWeek });
      }
      toast({ title: "✓ Kapacita aktualizována" });
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
  };

  const handleWeekCapacityUpdate = async (weeks: number[], capacity: number, workingDays: number) => {
    try {
      for (const wn of weeks) {
        const week = weekMap.get(wn);
        if (!week) continue;
        // Only save as manual override if capacity differs from what it would be without override
        const isActuallyDifferent = capacity !== standardCapacity || week.holiday_name;
        await upsertWeek.mutateAsync({
          week_year: selectedYear,
          week_number: wn,
          week_start: week.week_start,
          capacity_hours: capacity,
          working_days: workingDays,
          is_manual_override: isActuallyDifferent ? true : false,
          holiday_name: week.holiday_name,
        });
      }
      toast({ title: `✓ ${weeks.length > 1 ? `${weeks.length} týdnů` : `T${weeks[0]}`} aktualizován` });
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
  };

  const handleResetWeeks = async (weeks: number[]) => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      for (const wn of weeks) {
        const { error } = await supabase
          .from("production_capacity")
          .delete()
          .eq("week_year", selectedYear)
          .eq("week_number", wn);
        if (error) throw error;
      }
      await queryClient.invalidateQueries({ queryKey: ["production-capacity", selectedYear] });
      toast({ title: `✓ ${weeks.length > 1 ? `${weeks.length} týdnů` : `T${weeks[0]}`} obnoveno na standard` });
      setSelectedWeeks(new Set());
    } catch {
      toast({ title: "Chyba při resetování", variant: "destructive" });
    }
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
      toast({ title: "✓ Firemní dovolená přidána" });
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[900px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📊 Kapacita výroby
          </DialogTitle>
        </DialogHeader>

        {/* Standard Capacity */}
        <div className="border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Standardní kapacita</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Kapacita (h/týden)</label>
              <Input
                type="number"
                value={standardCapacityInput || String(standardCapacity)}
                onChange={e => setStandardCapacityInput(e.target.value)}
                onBlur={() => {
                  const v = parseInt(standardCapacityInput);
                  if (v > 0) handleStandardCapacityChange(v);
                  setStandardCapacityInput("");
                }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const v = parseInt(standardCapacityInput);
                    if (v > 0) handleStandardCapacityChange(v);
                    setStandardCapacityInput("");
                  }
                }}
                className="h-8 text-sm font-mono"
              />
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
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Roční přehled kapacity</h3>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedYear(y => y - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-bold text-foreground min-w-[50px] text-center">{selectedYear}</span>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedYear(y => y + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">Klikni na bar pro editaci · Ctrl+klik pro výběr více · Shift+klik pro rozsah</p>

          {/* Bar chart */}
          <div className="overflow-x-auto">
            <div className="relative" style={{ minWidth: 52 * 16, height: 140 }}>
              {/* Reference line */}
              <div
                className="absolute left-0 right-0 border-t-2 border-dashed"
                style={{
                  top: `${Math.max(0, 120 - (standardCapacity / (maxCapacity * 1.1)) * 120)}px`,
                  borderColor: "hsl(var(--destructive) / 0.4)",
                }}
              />

              <div className="flex items-end gap-[2px] h-[120px] mt-[10px]">
                {Array.from({ length: 52 }, (_, i) => i + 1).map(wn => {
                  const week = weekMap.get(wn);
                  if (!week) return null;
                  const cap = week.capacity_hours;
                  const barH = maxCapacity > 0 ? Math.max(2, (cap / (maxCapacity * 1.1)) * 120) : 2;
                  const past = isPastWeek(wn);
                  const isManual = week.is_manual_override && Math.round(week.capacity_hours) !== Math.round(standardCapacity);
                  const hasHoliday = !!week.holiday_name;
                  const hasCompanyHol = !!week.company_holiday_name;
                  const _isCurrent = selectedYear === currentYear && wn === currentWeek;
                  const isBarSelected = selectedWeeks.has(wn);

                  const barColor = past ? "hsl(var(--muted-foreground) / 0.3)"
                    : hasCompanyHol ? "#f59e0b"
                    : isManual ? "#2d6a4f"
                    : hasHoliday ? "#d97706"
                    : "hsl(var(--primary) / 0.6)";

                  return (
                    <button
                      key={wn}
                      className={`flex-1 min-w-[12px] rounded-t-sm transition-all hover:opacity-80 relative ${isBarSelected ? "ring-2 ring-foreground" : ""}`}
                      style={{
                        height: barH,
                        backgroundColor: barColor,
                      }}
                      title={`T${wn}: ${Math.round(cap)}h · ${week.working_days} dní${week.holiday_name ? ` · ${week.holiday_name}` : ""}${week.company_holiday_name ? ` · ${week.company_holiday_name}` : ""}`}
                      onClick={e => handleBarClick(wn, e)}
                    />
                  );
                })}
              </div>

              {/* Week labels */}
              <div className="flex gap-[2px] mt-0.5">
                {Array.from({ length: 52 }, (_, i) => i + 1).map(wn => (
                  <div key={wn} className="flex-1 min-w-[12px] text-center text-[6px] font-mono text-muted-foreground">
                    {wn % 4 === 1 ? `T${wn}` : ""}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "hsl(var(--primary) / 0.6)" }} />Standard</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#d97706" }} />Svátek</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#2d6a4f" }} />Ručně upraveno</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "hsl(var(--muted-foreground) / 0.3)" }} />Minulé</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#f59e0b" }} />Firemní dovolená</span>
            
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
              <Input type="date" value={newHolidayStart} onChange={e => setNewHolidayStart(e.target.value)} className="h-7 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Do</label>
              <Input type="date" value={newHolidayEnd} onChange={e => setNewHolidayEnd(e.target.value)} className="h-7 text-xs" />
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
