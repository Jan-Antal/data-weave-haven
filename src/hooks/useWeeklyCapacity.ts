import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProductionSettings } from "./useProductionSettings";
import { useMemo, useCallback } from "react";

export interface WeekCapacity {
  id?: string;
  week_year: number;
  week_number: number;
  week_start: string;
  capacity_hours: number;
  working_days: number;
  is_manual_override: boolean;
  holiday_name: string | null;
  company_holiday_name: string | null;
}

export interface CzechHoliday {
  date: string;
  localName: string;
  name: string;
}

// Hardcoded fallback for Czech fixed holidays
const CZECH_FIXED_HOLIDAYS: Array<{ month: number; day: number; name: string }> = [
  { month: 1, day: 1, name: "Nový rok" },
  { month: 5, day: 1, name: "Svátek práce" },
  { month: 5, day: 8, name: "Den vítězství" },
  { month: 7, day: 5, name: "Den slovanských věrozvěstů" },
  { month: 7, day: 6, name: "Den upálení mistra Jana Husa" },
  { month: 9, day: 28, name: "Den české státnosti" },
  { month: 10, day: 28, name: "Den vzniku ČSR" },
  { month: 11, day: 17, name: "Den boje za svobodu" },
  { month: 12, day: 24, name: "Štědrý den" },
  { month: 12, day: 25, name: "1. svátek vánoční" },
  { month: 12, day: 26, name: "2. svátek vánoční" },
];

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getMondayOfWeek(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday;
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

// Fetch Czech holidays with 24h localStorage cache
async function fetchCzechHolidays(year: number): Promise<CzechHoliday[]> {
  const cacheKey = `czech_holidays_${year}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) return data;
    } catch { /* ignore */ }
  }

  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/CZ`);
    if (!res.ok) throw new Error("API failed");
    const data: CzechHoliday[] = await res.json();
    localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
    return data;
  } catch {
    // Fallback to hardcoded
    return CZECH_FIXED_HOLIDAYS.map(h => ({
      date: `${year}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`,
      localName: h.name,
      name: h.name,
    }));
  }
}

export function useCzechHolidays(year: number) {
  return useQuery({
    queryKey: ["czech-holidays", year],
    queryFn: () => fetchCzechHolidays(year),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useCompanyHolidays() {
  return useQuery({
    queryKey: ["company-holidays"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_holidays" as any)
        .select("*")
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        name: string;
        start_date: string;
        end_date: string;
        capacity_override: number;
      }>;
    },
  });
}

export function useAddCompanyHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (holiday: { name: string; start_date: string; end_date: string; capacity_override: number }) => {
      const { error } = await supabase.from("company_holidays" as any).insert(holiday as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-holidays"] }),
  });
}

export function useDeleteCompanyHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_holidays" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-holidays"] }),
  });
}

export function useWeeklyCapacity(year: number) {
  const { data: settings } = useProductionSettings();
  const { data: holidays } = useCzechHolidays(year);
  const { data: companyHolidays } = useCompanyHolidays();
  const defaultCapacity = settings?.weekly_capacity_hours ?? 875;
  const defaultDays = 5;
  const hoursPerDay = defaultDays > 0 ? defaultCapacity / defaultDays : 175;

  const dbQuery = useQuery({
    queryKey: ["production-capacity", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_capacity" as any)
        .select("*")
        .eq("week_year", year)
        .order("week_number", { ascending: true });
      if (error) throw error;
      return (data || []) as WeekCapacity[];
    },
  });

  // Build the full 52-week map, merging DB overrides + holiday adjustments
  const weekMap = useMemo(() => {
    const map = new Map<number, WeekCapacity>();
    const dbMap = new Map<number, WeekCapacity>();
    for (const row of dbQuery.data || []) {
      dbMap.set(row.week_number, row);
    }

    // Holiday map: week_number → { names, reducedDays }
    const holidayMap = new Map<number, { names: string[]; reducedDays: number }>();
    if (holidays) {
      for (const h of holidays) {
        const d = new Date(h.date + "T00:00:00");
        if (isWeekday(d)) {
          const wn = getISOWeekNumber(d);
          const existing = holidayMap.get(wn) || { names: [], reducedDays: 0 };
          existing.names.push(h.localName);
          existing.reducedDays++;
          holidayMap.set(wn, existing);
        }
      }
    }

    for (let wn = 1; wn <= 52; wn++) {
      const monday = getMondayOfWeek(year, wn);
      const weekStart = monday.toISOString().split("T")[0];
      const dbRow = dbMap.get(wn);

      if (dbRow) {
        map.set(wn, dbRow);
      } else {
        const hol = holidayMap.get(wn);
        const workDays = Math.max(0, defaultDays - (hol?.reducedDays ?? 0));
        const cap = Math.round(workDays * hoursPerDay);
        map.set(wn, {
          week_year: year,
          week_number: wn,
          week_start: weekStart,
          capacity_hours: cap,
          working_days: workDays,
          is_manual_override: false,
          holiday_name: hol?.names.join(", ") ?? null,
          company_holiday_name: null,
        });
      }
    }

    // Apply company holidays
    if (companyHolidays) {
      for (const ch of companyHolidays) {
        const start = new Date(ch.start_date + "T00:00:00");
        const end = new Date(ch.end_date + "T00:00:00");
        // Find all weeks that overlap
        for (let wn = 1; wn <= 52; wn++) {
          const entry = map.get(wn);
          if (!entry) continue;
          const weekMon = new Date(entry.week_start + "T00:00:00");
          const weekSun = new Date(weekMon);
          weekSun.setDate(weekMon.getDate() + 6);
          // Check overlap
          if (weekMon <= end && weekSun >= start) {
            // If not manually overridden in DB
            if (!entry.is_manual_override) {
              entry.capacity_hours = ch.capacity_override;
              entry.company_holiday_name = ch.name;
            }
          }
        }
      }
    }

    return map;
  }, [dbQuery.data, holidays, companyHolidays, year, defaultCapacity, defaultDays, hoursPerDay]);

  return { weekMap, isLoading: dbQuery.isLoading, defaultCapacity, hoursPerDay };
}

// Hook for Kanban/Tabulka views: returns capacity for a given week key (YYYY-MM-DD)
export function useWeekCapacityLookup() {
  const currentYear = new Date().getFullYear();
  const { weekMap: currentYearMap, defaultCapacity } = useWeeklyCapacity(currentYear);
  const { weekMap: nextYearMap } = useWeeklyCapacity(currentYear + 1);
  const { weekMap: prevYearMap } = useWeeklyCapacity(currentYear - 1);

  return useCallback((weekKey: string): number => {
    const d = new Date(weekKey + "T00:00:00");
    const wn = getISOWeekNumber(d);
    const y = d.getFullYear();

    let map: Map<number, WeekCapacity>;
    if (y === currentYear) map = currentYearMap;
    else if (y === currentYear + 1) map = nextYearMap;
    else if (y === currentYear - 1) map = prevYearMap;
    else return defaultCapacity;

    return map.get(wn)?.capacity_hours ?? defaultCapacity;
  }, [currentYearMap, nextYearMap, prevYearMap, currentYear, defaultCapacity]);
}

export function useUpsertWeekCapacity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { week_year: number; week_number: number; week_start: string; capacity_hours: number; working_days: number; is_manual_override: boolean; holiday_name?: string | null }) => {
      const { error } = await supabase
        .from("production_capacity" as any)
        .upsert(data as any, { onConflict: "week_year,week_number" });
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["production-capacity", vars.week_year] }),
  });
}

export function useBulkUpdateFutureCapacity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ year, fromWeek, capacity, workingDays }: { year: number; fromWeek: number; capacity: number; workingDays: number }) => {
      // Delete non-manual rows from fromWeek onward, they'll be recalculated
      const { error } = await supabase
        .from("production_capacity" as any)
        .delete()
        .eq("week_year", year)
        .gte("week_number", fromWeek)
        .eq("is_manual_override", false);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["production-capacity", vars.year] });
      qc.invalidateQueries({ queryKey: ["production-settings"] });
    },
  });
}
