import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const VYROBNE_USEKY = ["dilna1", "dilna2", "dilna3", "sklad"] as const;

export interface CapacityCalcResult {
  capacity: number;
  dilna1: number;
  dilna2: number;
  dilna3: number;
  sklad: number;
  totalEmployees: number;
  absenceDays: number;
  bruttoHodiny: number;
  utilizationPct: number;
}

interface EmployeeRow {
  id: string;
  usek: string;
  uvazok_hodiny: number | null;
}

/**
 * Compute live capacity for a single week based on employees, absences, holidays, and utilization.
 */
export function computeWeekCapacity(
  employees: EmployeeRow[],
  absenceDays: number,
  workingDays: number,
  utilizationPct: number,
): CapacityCalcResult {
  const byUsek: Record<string, number> = { dilna1: 0, dilna2: 0, dilna3: 0, sklad: 0 };
  let totalEmployees = 0;
  let bruttoHodiny = 0;

  for (const emp of employees) {
    const usek = emp.usek?.toLowerCase();
    if (!VYROBNE_USEKY.includes(usek as any)) continue;
    const hours = emp.uvazok_hodiny ?? 8;
    // Weekly hours = daily hours × 5 (standard work week)
    const weeklyHours = hours * 5;
    byUsek[usek] = (byUsek[usek] || 0) + weeklyHours;
    bruttoHodiny += weeklyHours;
    totalEmployees++;
  }

  const absenceHours = absenceDays * 8;
  const holidayFactor = workingDays / 5;
  const capacity = Math.round((bruttoHodiny - absenceHours) * holidayFactor * utilizationPct / 100);

  return {
    capacity: Math.max(0, capacity),
    dilna1: byUsek.dilna1,
    dilna2: byUsek.dilna2,
    dilna3: byUsek.dilna3,
    sklad: byUsek.sklad,
    totalEmployees,
    absenceDays,
    bruttoHodiny,
    utilizationPct,
  };
}

/**
 * Hook: fetch active výrobní employees
 */
export function useVyrobniEmployees() {
  return useQuery({
    queryKey: ["vyrobni-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ami_employees")
        .select("id, usek, uvazok_hodiny")
        .eq("aktivny", true)
        .in("usek", ["dilna1", "dilna2", "dilna3", "sklad"]);
      if (error) throw error;
      return (data || []) as EmployeeRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook: fetch absence count for a date range (week)
 */
export function useWeekAbsences(weekStart: string | null, employeeIds: string[]) {
  return useQuery({
    queryKey: ["week-absences", weekStart, employeeIds.length],
    queryFn: async () => {
      if (!weekStart || employeeIds.length === 0) return 0;
      const start = new Date(weekStart + "T00:00:00");
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      const endStr = end.toISOString().split("T")[0];

      const { count, error } = await supabase
        .from("ami_absences")
        .select("id", { count: "exact", head: true })
        .gte("datum", weekStart)
        .lt("datum", endStr)
        .in("employee_id", employeeIds);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!weekStart && employeeIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch absences for a range of weeks in a single query (for bulk recalc)
 */
export async function fetchAbsencesForYear(
  year: number,
  employeeIds: string[],
): Promise<Map<string, number>> {
  // Map: weekStart (YYYY-MM-DD, Monday) → absence day count
  const result = new Map<string, number>();
  if (employeeIds.length === 0) return result;

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const { data, error } = await supabase
    .from("ami_absences")
    .select("datum")
    .gte("datum", startDate)
    .lte("datum", endDate)
    .in("employee_id", employeeIds);

  if (error || !data) return result;

  for (const row of data) {
    const d = new Date(row.datum + "T00:00:00");
    // Get Monday of this week
    const day = d.getDay() || 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - day + 1);
    const key = monday.toISOString().split("T")[0];
    result.set(key, (result.get(key) || 0) + 1);
  }

  return result;
}
