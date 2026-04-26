import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Manual long-term absence helpers built on top of the existing `ami_absences` table.
 *
 * Strategy: every absence period (date_from → date_to) is stored as one row per day
 * with `source='manual'` and `absencia_kod` (DOV / NEM / RD / PN / OTHER).
 * Open-ended absences are filled 6 months ahead and can be extended.
 */

export interface AbsenceRow {
  id: string;
  employee_id: string | null;
  datum: string; // YYYY-MM-DD
  absencia_kod: string | null;
  source: string | null;
  mesiac: string;
}

export interface AbsencePeriod {
  employee_id: string;
  absencia_kod: string;
  date_from: string; // YYYY-MM-DD
  date_to: string;   // YYYY-MM-DD (inclusive)
  ids: string[];
  is_open_ended: boolean;
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function monthFirstDayStr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return toLocalDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Group consecutive daily rows for the same (employee, kod) into a period. */
function groupPeriods(rows: AbsenceRow[]): AbsencePeriod[] {
  const sorted = [...rows].sort((a, b) =>
    (a.employee_id ?? "").localeCompare(b.employee_id ?? "") ||
    (a.absencia_kod ?? "").localeCompare(b.absencia_kod ?? "") ||
    a.datum.localeCompare(b.datum)
  );

  const periods: AbsencePeriod[] = [];
  let current: AbsencePeriod | null = null;

  for (const r of sorted) {
    if (!r.employee_id || !r.absencia_kod) continue;
    const sameKey = current
      && current.employee_id === r.employee_id
      && current.absencia_kod === r.absencia_kod;

    const expectedNext = current ? toLocalDateStr(addDays(new Date(current.date_to + "T00:00:00"), 1)) : null;

    if (sameKey && (r.datum === current!.date_to || r.datum === expectedNext)) {
      current!.date_to = r.datum;
      current!.ids.push(r.id);
    } else {
      if (current) periods.push(current);
      current = {
        employee_id: r.employee_id,
        absencia_kod: r.absencia_kod,
        date_from: r.datum,
        date_to: r.datum,
        ids: [r.id],
        is_open_ended: false,
      };
    }
  }
  if (current) periods.push(current);
  return periods;
}

export function useManualAbsences() {
  return useQuery({
    queryKey: ["manual-absences"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ami_absences")
        .select("id, employee_id, datum, absencia_kod, source, mesiac")
        .eq("source", "manual")
        .order("datum", { ascending: true });
      if (error) throw error;
      return groupPeriods((data ?? []) as AbsenceRow[]);
    },
    staleTime: 60 * 1000,
  });
}

interface CreatePeriodArgs {
  employee_id: string;
  absencia_kod: string;
  date_from: string;
  date_to: string | null; // null = open-ended → fills 6 months
}

/** Fetch all holiday dates (Czech public + company) that overlap [from, to] as a Set of YYYY-MM-DD. */
async function fetchHolidayDates(fromYear: number, toYear: number): Promise<Set<string>> {
  const dates = new Set<string>();

  // Czech public holidays from nager.at (with hardcoded fallback for fixed dates).
  const FIXED: Array<[number, number]> = [
    [1, 1], [5, 1], [5, 8], [7, 5], [7, 6],
    [9, 28], [10, 28], [11, 17], [12, 24], [12, 25], [12, 26],
  ];
  for (let y = fromYear; y <= toYear; y++) {
    try {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/CZ`);
      if (res.ok) {
        const arr: Array<{ date: string }> = await res.json();
        for (const h of arr) dates.add(h.date);
        continue;
      }
    } catch { /* fall through */ }
    for (const [m, d] of FIXED) {
      dates.add(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }

  // Company holidays from DB.
  const { data } = await supabase
    .from("company_holidays")
    .select("start_date, end_date");
  for (const h of (data ?? []) as Array<{ start_date: string; end_date: string }>) {
    const s = new Date(h.start_date + "T00:00:00");
    const e = new Date(h.end_date + "T00:00:00");
    for (let d = new Date(s); d <= e; d = addDays(d, 1)) {
      dates.add(toLocalDateStr(d));
    }
  }
  return dates;
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function useCreateAbsencePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employee_id, absencia_kod, date_from, date_to }: CreatePeriodArgs) => {
      const start = new Date(date_from + "T00:00:00");
      const end = date_to
        ? new Date(date_to + "T00:00:00")
        : addDays(start, 6 * 30); // ~6 months
      if (end < start) throw new Error("Datum do nemůže být před datumem od");

      const holidayDates = await fetchHolidayDates(start.getFullYear(), end.getFullYear());

      const rows: Array<{ employee_id: string; datum: string; absencia_kod: string; source: string; mesiac: string }> = [];
      for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
        if (isWeekend(d)) continue;
        const datum = toLocalDateStr(d);
        if (holidayDates.has(datum)) continue;
        rows.push({
          employee_id,
          datum,
          absencia_kod,
          source: "manual",
          mesiac: monthFirstDayStr(datum),
        });
      }

      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await supabase.from("ami_absences").insert(rows.slice(i, i + CHUNK));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-absences"] });
      qc.invalidateQueries({ queryKey: ["absences-year"] });
      qc.invalidateQueries({ queryKey: ["weekly-capacity"] });
    },
  });
}

/** One-shot backfill: remove existing manual absence rows that fall on weekends or holidays. */
export function useCleanupNonWorkdayAbsences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("ami_absences")
        .select("id, datum")
        .eq("source", "manual");
      if (error) throw error;

      const rows = (data ?? []) as Array<{ id: string; datum: string }>;
      if (rows.length === 0) return { removed: 0 };

      const years = Array.from(new Set(rows.map(r => Number(r.datum.slice(0, 4)))));
      const minY = Math.min(...years);
      const maxY = Math.max(...years);
      const holidayDates = await fetchHolidayDates(minY, maxY);

      const idsToDelete: string[] = [];
      for (const r of rows) {
        const d = new Date(r.datum + "T00:00:00");
        if (isWeekend(d) || holidayDates.has(r.datum)) idsToDelete.push(r.id);
      }

      const CHUNK = 500;
      for (let i = 0; i < idsToDelete.length; i += CHUNK) {
        const { error: delErr } = await supabase
          .from("ami_absences")
          .delete()
          .in("id", idsToDelete.slice(i, i + CHUNK));
        if (delErr) throw delErr;
      }
      return { removed: idsToDelete.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-absences"] });
      qc.invalidateQueries({ queryKey: ["absences-year"] });
      qc.invalidateQueries({ queryKey: ["weekly-capacity"] });
    },
  });
}

export function useDeleteAbsencePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { error } = await supabase
          .from("ami_absences")
          .delete()
          .in("id", ids.slice(i, i + CHUNK));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-absences"] });
      qc.invalidateQueries({ queryKey: ["absences-year"] });
      qc.invalidateQueries({ queryKey: ["weekly-capacity"] });
    },
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { uvazok_hodiny?: number; pracovni_skupina?: string | null } }) => {
      const { error } = await supabase.from("ami_employees").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vyrobni-employees"] });
      qc.invalidateQueries({ queryKey: ["weekly-capacity"] });
    },
  });
}

/** Returns the period that overlaps "today" for each employee, if any. */
export function activePeriodForEmployee(periods: AbsencePeriod[], employeeId: string, refDate = new Date()): AbsencePeriod | null {
  const today = toLocalDateStr(refDate);
  const matches = periods.filter(p =>
    p.employee_id === employeeId &&
    p.date_from <= today &&
    p.date_to >= today
  );
  if (matches.length === 0) return null;
  // Return the one with latest end
  return matches.sort((a, b) => b.date_to.localeCompare(a.date_to))[0];
}
