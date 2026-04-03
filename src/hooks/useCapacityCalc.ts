import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CapacityCalcResult {
  capacity: number;
  dilna1: number;
  dilna2: number;
  dilna3: number;
  sklad: number;
  totalEmployees: number;
  absenceHours: number;
  bruttoHodiny: number;
  utilizationPct: number;
}

export interface EmployeeRow {
  id: string;
  usek: string;
  uvazok_hodiny: number | null;
  activated_at?: string | null;
  deactivated_at?: string | null;
}

type UsekKey = "dilna1" | "dilna2" | "dilna3" | "sklad";

/**
 * Normalize DB usek values (e.g. 'Dílna_1. skupina', 'Sklad') to short keys.
 */
export function normalizeUsek(usek: string): UsekKey | null {
  const u = usek ?? "";
  if (u.includes("Dílna_1") || u.toLowerCase().includes("dilna_1") || u.toLowerCase().includes("dilna1")) return "dilna1";
  if (u.includes("Dílna_2") || u.toLowerCase().includes("dilna_2") || u.toLowerCase().includes("dilna2")) return "dilna2";
  if (u.includes("Dílna_3") || u.toLowerCase().includes("dilna_3") || u.toLowerCase().includes("dilna3")) return "dilna3";
  if (u.toLowerCase().includes("sklad")) return "sklad";
  return null;
}

/**
 * Count how many working days an employee was active during a given week.
 * Handles mid-week activation/deactivation proportionally.
 */
export function getActiveWorkingDays(emp: EmployeeRow, weekStart: string, workingDays: number): number {
  const wStart = new Date(weekStart + "T00:00:00");
  const wEnd = new Date(wStart);
  wEnd.setDate(wStart.getDate() + 5); // Friday end (5 working days span)

  let effectiveStart = wStart;
  let effectiveEnd = wEnd;

  if (emp.activated_at) {
    const actDate = new Date(emp.activated_at);
    if (actDate >= wEnd) return 0; // not active yet
    if (actDate > wStart) effectiveStart = actDate;
  }

  if (emp.deactivated_at) {
    const deactDate = new Date(emp.deactivated_at);
    if (deactDate <= wStart) return 0; // already gone
    if (deactDate < wEnd) effectiveEnd = deactDate;
  }

  const daysActive = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000);
  return Math.max(0, Math.min(workingDays, daysActive));
}

/**
 * Check if employee was active during a given week (at least 1 day).
 */
export function isEmployeeActiveInWeek(emp: EmployeeRow, weekStart: string): boolean {
  return getActiveWorkingDays(emp, weekStart, 5) > 0;
}

/**
 * Compute live capacity for a single week based on employees, absences, holidays, and utilization.
 * uvazok_hodiny = daily contract hours (e.g. 8 = full time 8h/day).
 * weeklyHours = dailyHours × activeDays (accounts for holidays and mid-week joins/leaves).
 * absenceHours = total hours lost to absences (each absence day = that employee's uvazok_hodiny).
 */
export function computeWeekCapacity(
  employees: EmployeeRow[],
  absenceHours: number,
  workingDays: number,
  utilizationPct: number,
  weekStart: string,
): CapacityCalcResult {
  const byUsek: Record<UsekKey, number> = { dilna1: 0, dilna2: 0, dilna3: 0, sklad: 0 };
  let totalEmployees = 0;
  let bruttoHodiny = 0;

  for (const emp of employees) {
    const usekKey = normalizeUsek(emp.usek);
    if (!usekKey) continue;
    const activeDays = getActiveWorkingDays(emp, weekStart, workingDays);
    if (activeDays === 0) continue;
    const dailyHours = emp.uvazok_hodiny ?? 8;
    const weeklyHours = dailyHours * activeDays;
    byUsek[usekKey] += weeklyHours;
    bruttoHodiny += weeklyHours;
    totalEmployees++;
  }

  const nettoHours = bruttoHodiny - absenceHours;
  const capacity = Math.round(nettoHours * utilizationPct / 100);

  return {
    capacity: Math.max(0, capacity),
    dilna1: byUsek.dilna1,
    dilna2: byUsek.dilna2,
    dilna3: byUsek.dilna3,
    sklad: byUsek.sklad,
    totalEmployees,
    absenceHours,
    bruttoHodiny,
    utilizationPct,
  };
}

/**
 * Hook: fetch active výrobní employees (all active, filtered in JS by usek)
 */
export function useVyrobniEmployees() {
  return useQuery({
    queryKey: ["vyrobni-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ami_employees")
        .select("id, usek, uvazok_hodiny, activated_at, deactivated_at")
        .eq("aktivny", true);
      if (error) throw error;
      return ((data || []) as EmployeeRow[]).filter(e => normalizeUsek(e.usek) !== null);
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook: fetch absence hours for a date range (week).
 * Returns total absence hours (each absence day = employee's uvazok_hodiny).
 */
export function useWeekAbsences(weekStart: string | null, employees: EmployeeRow[]) {
  const employeeIds = employees.map(e => e.id);
  return useQuery({
    queryKey: ["week-absences", weekStart, employeeIds.length],
    queryFn: async () => {
      if (!weekStart || employeeIds.length === 0) return 0;
      const start = new Date(weekStart + "T00:00:00");
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      const endStr = end.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("ami_absences")
        .select("datum, employee_id")
        .gte("datum", weekStart)
        .lt("datum", endStr)
        .in("employee_id", employeeIds);
      if (error) throw error;

      const empMap = new Map(employees.map(e => [e.id, e]));
      let totalHours = 0;
      for (const row of (data || [])) {
        const emp = empMap.get(row.employee_id);
        totalHours += emp?.uvazok_hodiny ?? 8;
      }
      return totalHours;
    },
    enabled: !!weekStart && employeeIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch absences for a range of weeks in a single query (for bulk recalc).
 * Returns Map<weekStart, absenceHours> where absenceHours = SUM(employee uvazok_hodiny per absence day).
 */
export async function fetchAbsencesForYear(
  year: number,
  employees: EmployeeRow[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (employees.length === 0) return result;

  const employeeIds = employees.map(e => e.id);
  const empMap = new Map(employees.map(e => [e.id, e]));
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const { data, error } = await supabase
    .from("ami_absences")
    .select("datum, employee_id")
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
    const emp = empMap.get(row.employee_id);
    const hours = emp?.uvazok_hodiny ?? 8;
    result.set(key, (result.get(key) || 0) + hours);
  }

  return result;
}

/**
 * Get the ISO Monday date string for a given year and week number.
 */
export function getWeekStartFromNumber(year: number, weekNum: number): string {
  const jan4 = new Date(year, 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1);
  const result = new Date(startOfWeek1);
  result.setDate(startOfWeek1.getDate() + (weekNum - 1) * 7);
  return result.toISOString().split("T")[0];
}
