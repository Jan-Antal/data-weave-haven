import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * ISO week number for a given date.
 */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export interface CapacityCalcResult {
  capacity: number;
  /** Hodiny rozdelené podľa usek_nazov (Kompletace, Strojová dílna, Lakovna, Dyhárna, Balení & Expedice). */
  byUsek: Record<string, number>;
  totalEmployees: number;
  absenceHours: number;
  bruttoHodiny: number;
  utilizationPct: number;
}

export interface EmployeeRow {
  id: string;
  meno?: string;
  usek: string;
  usek_nazov?: string | null;
  stredisko?: string | null;
  uvazok_hodiny: number | null;
  activated_at?: string | null;
  deactivated_at?: string | null;
}

/** Stredisko pre výrobné členenie. Akceptujeme len Direct. */
const VYROBA_DIRECT = "Výroba Direct";

/** Vráti kanonický názov úseku (usek_nazov) iba pre zamestnancov v stredisku Výroba Direct.
 *  Pre Kompletace zlučujeme všetky dílny do jedného „Kompletace". */
export function normalizeUsek(emp: Pick<EmployeeRow, "stredisko" | "usek_nazov" | "usek">): string | null {
  // Backward-compat: ak voláme s legacy stringom, skús odhadnúť.
  if (typeof emp === "string") {
    return null;
  }
  if ((emp.stredisko ?? "") !== VYROBA_DIRECT) return null;
  const nazov = (emp.usek_nazov ?? "").trim();
  if (!nazov) return null;
  return nazov;
}

/** Legacy alias — niektoré miesta volajú normalizeUsek(string). */
export function normalizeUsekLegacy(_usek: string): null { return null; }

/**
 * Format a Date as YYYY-MM-DD using LOCAL time (not UTC).
 * This avoids the timezone shift that toISOString() causes.
 */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getActiveWorkingDays(emp: EmployeeRow, weekStart: string, workingDays: number): number {
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
  const byUsek: Record<string, number> = {};
  let totalEmployees = 0;
  let bruttoHodiny = 0;

  for (const emp of employees) {
    const usekKey = normalizeUsek(emp);
    if (!usekKey) continue;
    const activeDays = getActiveWorkingDays(emp, weekStart, workingDays);
    if (activeDays === 0) continue;
    const dailyHours = emp.uvazok_hodiny ?? 8;
    const weeklyHours = dailyHours * activeDays;
    byUsek[usekKey] = (byUsek[usekKey] ?? 0) + weeklyHours;
    bruttoHodiny += weeklyHours;
    totalEmployees++;
  }

  const nettoHours = bruttoHodiny - absenceHours;
  const capacity = Math.round(nettoHours * utilizationPct / 100);

  return {
    capacity: Math.max(0, capacity),
    byUsek,
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

/**
 * Get Monday of the week for a given date, as YYYY-MM-DD local string.
 */
function getMondayKey(datum: string): string {
  const d = new Date(datum + "T00:00:00");
  const dow = d.getDay() || 7; // Sunday=7, Mon=1..Sat=6
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow + 1);
  return toLocalDateStr(monday);
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
        const key = getMondayKey(row.datum);
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
    const key = getMondayKey(row.datum);
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
  return toLocalDateStr(result);
}

// =====================================================================
// Per-week employee composition snapshot (production_capacity_employees)
// =====================================================================

export interface WeekCompositionResult {
  /** Set of employee_ids that are explicitly EXCLUDED for this week. */
  excludedEmployeeIds: Set<string>;
  /** True if a snapshot exists in DB for this week. */
  hasSnapshot: boolean;
  /** True for past weeks — read-only. */
  isHistorical: boolean;
  /** True for current/future — editable. */
  isEditable: boolean;
}

/**
 * Hook returning the per-week composition snapshot.
 * For past weeks: only the DB snapshot is the source of truth (read-only).
 * For current/future: DB snapshot if present; otherwise empty exclusion set (all active employees included).
 */
export function useWeekComposition(year: number, weekNumber: number) {
  return useQuery<WeekCompositionResult>({
    queryKey: ["week-composition", year, weekNumber],
    queryFn: async () => {
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentWeek = getISOWeekNumber(today);
      const isHistorical = year < currentYear || (year === currentYear && weekNumber < currentWeek);

      const { data, error } = await supabase
        .from("production_capacity_employees" as any)
        .select("employee_id, is_included")
        .eq("week_year", year)
        .eq("week_number", weekNumber);

      if (error) throw error;

      const rows = ((data ?? []) as unknown) as Array<{ employee_id: string; is_included: boolean }>;
      const excluded = new Set<string>();
      for (const r of rows) {
        if (r.is_included === false) excluded.add(r.employee_id);
      }
      return {
        excludedEmployeeIds: excluded,
        hasSnapshot: rows.length > 0,
        isHistorical,
        isEditable: !isHistorical,
      };
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch all composition snapshots for a year. Returns Map<weekNumber, Set<excludedEmployeeId>>.
 */
export function useYearComposition(year: number) {
  return useQuery({
    queryKey: ["year-composition", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_capacity_employees" as any)
        .select("week_number, employee_id, is_included")
        .eq("week_year", year);
      if (error) throw error;
      const result = new Map<number, Set<string>>();
      for (const row of (((data ?? []) as unknown) as Array<{ week_number: number; employee_id: string; is_included: boolean }>)) {
        if (!result.has(row.week_number)) result.set(row.week_number, new Set());
        if (row.is_included === false) result.get(row.week_number)!.add(row.employee_id);
      }
      return result;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Toggle inclusion of one or more employees for a range of weeks in the given year.
 * Upserts rows in production_capacity_employees.
 */
export async function toggleEmployeeForWeekRange(
  year: number,
  fromWeek: number,
  toWeek: number,
  employeeIds: string[],
  isIncluded: boolean,
): Promise<void> {
  if (employeeIds.length === 0) return;
  const rows: Array<{ week_year: number; week_number: number; employee_id: string; is_included: boolean }> = [];
  for (let wn = fromWeek; wn <= toWeek; wn++) {
    for (const empId of employeeIds) {
      rows.push({ week_year: year, week_number: wn, employee_id: empId, is_included: isIncluded });
    }
  }
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("production_capacity_employees" as any)
      .upsert(chunk as any, { onConflict: "week_year,week_number,employee_id" });
    if (error) throw error;
  }
}

