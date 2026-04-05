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
  meno?: string;
  usek: string;
  uvazok_hodiny: number | null;
  activated_at?: string | null;
  deactivated_at?: string | null;
}

type UsekKey = "dilna1" | "dilna2" | "dilna3" | "sklad";

export function normalizeUsek(usek: string): UsekKey | null {
  const u = usek ?? "";
  if (u.includes("Dílna_1") || u.toLowerCase().includes("dilna_1") || u.toLowerCase().includes("dilna1")) return "dilna1";
  if (u.includes("Dílna_2") || u.toLowerCase().includes("dilna_2") || u.toLowerCase().includes("dilna2")) return "dilna2";
  if (u.includes("Dílna_3") || u.toLowerCase().includes("dilna_3") || u.toLowerCase().includes("dilna3")) return "dilna3";
  if (u.toLowerCase().includes("sklad")) return "sklad";
  return null;
}

export function getActiveWorkingDays(emp: EmployeeRow, weekStart: string, workingDays: number): number {
  // activated_at = import date only, not hire date — treat all past weeks as active
  if (!emp.deactivated_at) return workingDays;
  const wStart = new Date(weekStart + "T00:00:00");
  const deactDate = new Date(emp.deactivated_at);
  if (deactDate <= wStart) return 0;
  const wEnd = new Date(wStart);
  wEnd.setDate(wStart.getDate() + workingDays);
  if (deactDate >= wEnd) return workingDays;
  const daysActive = Math.ceil((deactDate.getTime() - wStart.getTime()) / 86400000);
  return Math.max(0, Math.min(workingDays, daysActive));
}

export function isEmployeeActiveInWeek(emp: EmployeeRow, weekStart: string): boolean {
  if (!emp.deactivated_at) return true;
  return new Date(emp.deactivated_at) > new Date(weekStart + "T00:00:00");
}

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

export function useVyrobniEmployees() {
  return useQuery({
    queryKey: ["vyrobni-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ami_employees")
        .select("id, meno, usek, uvazok_hodiny, activated_at, deactivated_at")
        .eq("aktivny", true);
      if (error) throw error;
      return ((data || []) as EmployeeRow[]).filter(e => normalizeUsek(e.usek) !== null);
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useAbsencesForYear(year: number, employees: EmployeeRow[]) {
  return useQuery({
    queryKey: ["absences-year", year, employees.length],
    queryFn: async () => {
      if (employees.length === 0) return new Map<string, number>();
      const employeeIds = employees.map(e => e.id);
      const empMap = new Map(employees.map(e => [e.id, e]));
      const { data, error } = await supabase
        .from("ami_absences")
        .select("datum, employee_id")
        .gte("datum", `${year}-01-01`)
        .lte("datum", `${year}-12-31`)
        .in("employee_id", employeeIds);
      if (error) throw error;
      const result = new Map<string, number>();
      for (const row of (data || [])) {
        const d = new Date(row.datum + "T00:00:00");
        const day = d.getDay() || 7;
        const monday = new Date(d);
        monday.setDate(d.getDate() - day + 1);
        const key = monday.toISOString().split("T")[0];
        const emp = empMap.get(row.employee_id);
        const hours = emp?.uvazok_hodiny ?? 8;
        result.set(key, (result.get(key) || 0) + hours);
      }
      return result;
    },
    enabled: employees.length > 0,
    staleTime: 2 * 60 * 1000,
  });
}

export async function fetchAbsencesForYear(
  year: number,
  employees: EmployeeRow[],
): Promise<Map<string, number>> {
  if (employees.length === 0) return new Map();
  const employeeIds = employees.map(e => e.id);
  const empMap = new Map(employees.map(e => [e.id, e]));
  const { data, error } = await supabase
    .from("ami_absences")
    .select("datum, employee_id")
    .gte("datum", `${year}-01-01`)
    .lte("datum", `${year}-12-31`)
    .in("employee_id", employeeIds);
  if (error || !data) return new Map();
  const result = new Map<string, number>();
  for (const row of data) {
    const d = new Date(row.datum + "T00:00:00");
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

export function getWeekStartFromNumber(year: number, weekNum: number): string {
  const jan4 = new Date(year, 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1);
  const result = new Date(startOfWeek1);
  result.setDate(startOfWeek1.getDate() + (weekNum - 1) * 7);
  return result.toISOString().split("T")[0];
}
