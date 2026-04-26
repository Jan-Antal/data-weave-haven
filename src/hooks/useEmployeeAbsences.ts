import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Manual long-term absence helpers built on top of the existing `ami_absences` table.
 *
 * Strategy: every absence period (date_from → date_to) is stored as one row per day
 * (including weekends and public holidays so the period stays continuous in the DB),
 * with `source='manual'` and a shared `period_id` that ties the rows together.
 *
 * Non-working days are filtered out at calculation time (capacity, analytics) — see
 * `src/hooks/useCapacityCalc.ts` and `src/components/analytics/AbsenceReport.tsx`.
 */

export interface AbsenceRow {
  id: string;
  employee_id: string | null;
  datum: string; // YYYY-MM-DD
  absencia_kod: string | null;
  source: string | null;
  mesiac: string;
  period_id?: string | null;
}

export interface AbsencePeriod {
  employee_id: string;
  absencia_kod: string;
  date_from: string; // YYYY-MM-DD
  date_to: string;   // YYYY-MM-DD (inclusive)
  ids: string[];
  is_open_ended: boolean;
  period_id: string | null;
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

/**
 * Group rows into periods.
 * Primary key: `period_id` (rows sharing it are always one continuous period).
 * Fallback for legacy rows without period_id: same (employee, kod) with gaps ≤4 days.
 */
function groupPeriods(rows: AbsenceRow[]): AbsencePeriod[] {
  const periods: AbsencePeriod[] = [];

  // 1) Group rows that have a period_id — these are always one continuous period.
  const byPeriodId = new Map<string, AbsenceRow[]>();
  const legacy: AbsenceRow[] = [];
  for (const r of rows) {
    if (!r.employee_id || !r.absencia_kod) continue;
    if (r.period_id) {
      const arr = byPeriodId.get(r.period_id) ?? [];
      arr.push(r);
      byPeriodId.set(r.period_id, arr);
    } else {
      legacy.push(r);
    }
  }

  for (const [pid, arr] of byPeriodId) {
    arr.sort((a, b) => a.datum.localeCompare(b.datum));
    periods.push({
      employee_id: arr[0].employee_id!,
      absencia_kod: arr[0].absencia_kod!,
      date_from: arr[0].datum,
      date_to: arr[arr.length - 1].datum,
      ids: arr.map(r => r.id),
      is_open_ended: false,
      period_id: pid,
    });
  }

  // 2) Legacy rows (no period_id): use the old gap-tolerant grouping (≤4 days).
  const sorted = legacy.sort((a, b) =>
    (a.employee_id ?? "").localeCompare(b.employee_id ?? "") ||
    (a.absencia_kod ?? "").localeCompare(b.absencia_kod ?? "") ||
    a.datum.localeCompare(b.datum)
  );
  const MAX_GAP_DAYS = 4;
  let current: AbsencePeriod | null = null;
  for (const r of sorted) {
    const sameKey = current
      && current.employee_id === r.employee_id
      && current.absencia_kod === r.absencia_kod;
    let withinGap = false;
    if (sameKey) {
      const prev = new Date(current!.date_to + "T00:00:00").getTime();
      const next = new Date(r.datum + "T00:00:00").getTime();
      const gapDays = Math.round((next - prev) / 86400000);
      withinGap = gapDays >= 0 && gapDays <= MAX_GAP_DAYS;
    }
    if (sameKey && withinGap) {
      if (r.datum > current!.date_to) current!.date_to = r.datum;
      current!.ids.push(r.id);
    } else {
      if (current) periods.push(current);
      current = {
        employee_id: r.employee_id!,
        absencia_kod: r.absencia_kod!,
        date_from: r.datum,
        date_to: r.datum,
        ids: [r.id],
        is_open_ended: false,
        period_id: null,
      };
    }
  }
  if (current) periods.push(current);

  return periods.sort((a, b) =>
    a.employee_id.localeCompare(b.employee_id) ||
    a.date_from.localeCompare(b.date_from)
  );
}

export function useManualAbsences() {
  return useQuery({
    queryKey: ["manual-absences"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ami_absences")
        .select("id, employee_id, datum, absencia_kod, source, mesiac, period_id")
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

export function useCreateAbsencePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employee_id, absencia_kod, date_from, date_to }: CreatePeriodArgs) => {
      const start = new Date(date_from + "T00:00:00");
      const end = date_to
        ? new Date(date_to + "T00:00:00")
        : addDays(start, 6 * 30); // ~6 months
      if (end < start) throw new Error("Datum do nemůže být před datumem od");

      // One UUID for the whole period — keeps it together in the UI even though
      // the rows include weekends/holidays. Generated client-side so all rows
      // share the same value before the insert call.
      const period_id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const rows: Array<{
        employee_id: string;
        datum: string;
        absencia_kod: string;
        source: string;
        mesiac: string;
        period_id: string;
      }> = [];
      for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
        const datum = toLocalDateStr(d);
        rows.push({
          employee_id,
          datum,
          absencia_kod,
          source: "manual",
          mesiac: monthFirstDayStr(datum),
          period_id,
        });
      }

      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await supabase
          .from("ami_absences")
          .insert(rows.slice(i, i + CHUNK) as any);
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
  return matches.sort((a, b) => b.date_to.localeCompare(a.date_to))[0];
}
