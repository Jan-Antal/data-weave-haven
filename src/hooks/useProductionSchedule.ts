import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface ScheduleItem {
  id: string;
  project_id: string;
  project_name: string;
  stage_id: string | null;
  item_name: string;
  item_code: string | null;
  scheduled_week: string;
  scheduled_hours: number;
  scheduled_czk: number;
  position: number;
  status: string;
  completed_at: string | null;
  completed_by: string | null;
  expediced_at: string | null;
  split_group_id: string | null;
  split_part: number | null;
  split_total: number | null;
  pause_reason: string | null;
  pause_expected_date: string | null;
  adhoc_reason: string | null;
  cancel_reason: string | null;
}

export interface ScheduleBundle {
  project_id: string;
  project_name: string;
  items: ScheduleItem[];
  total_hours: number;
}

export interface WeekSilo {
  week_start: string;
  week_number: number;
  bundles: ScheduleBundle[];
  total_hours: number;
}

export function useProductionSchedule() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("production-schedule-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "production_schedule" }, () => {
        qc.invalidateQueries({ queryKey: ["production-schedule"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return useQuery({
    queryKey: ["production-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_schedule")
        .select("*, projects!production_schedule_project_id_fkey(project_name)")
        .in("status", ["scheduled", "in_progress", "completed", "paused"])
        .order("position", { ascending: true });
      if (error) throw error;

      const byWeek = new Map<string, Map<string, ScheduleBundle>>();

      for (const row of data || []) {
        const week = row.scheduled_week;
        const pid = row.project_id;
        if (!byWeek.has(week)) byWeek.set(week, new Map());
        const weekMap = byWeek.get(week)!;
        if (!weekMap.has(pid)) {
          weekMap.set(pid, {
            project_id: pid,
            project_name: (row as any).projects?.project_name || pid,
            items: [],
            total_hours: 0,
          });
        }
        const bundle = weekMap.get(pid)!;
        bundle.items.push({
          id: row.id,
          project_id: row.project_id,
          project_name: (row as any).projects?.project_name || pid,
          stage_id: row.stage_id,
          item_name: row.item_name,
          item_code: row.item_code ?? null,
          scheduled_week: row.scheduled_week,
          scheduled_hours: row.scheduled_hours,
          scheduled_czk: row.scheduled_czk,
          position: row.position,
          status: row.status,
          completed_at: row.completed_at,
          completed_by: row.completed_by,
          split_group_id: (row as any).split_group_id ?? null,
          split_part: (row as any).split_part ?? null,
          split_total: (row as any).split_total ?? null,
          pause_reason: (row as any).pause_reason ?? null,
          pause_expected_date: (row as any).pause_expected_date ?? null,
          adhoc_reason: (row as any).adhoc_reason ?? null,
          cancel_reason: (row as any).cancel_reason ?? null,
        });
        bundle.total_hours += row.scheduled_hours;
      }

      const result = new Map<string, WeekSilo>();
      for (const [week, weekMap] of byWeek) {
        const bundles = Array.from(weekMap.values());
        result.set(week, {
          week_start: week,
          week_number: getISOWeekNumber(new Date(week)),
          bundles,
          total_hours: bundles.reduce((s, b) => s + b.total_hours, 0),
        });
      }
      return result;
    },
  });
}

export function useProductionExpedice() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("production-expedice-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "production_schedule" }, () => {
        qc.invalidateQueries({ queryKey: ["production-expedice"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return useQuery({
    queryKey: ["production-expedice"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_schedule")
        .select("*, projects!production_schedule_project_id_fkey(project_name)")
        .eq("status", "completed")
        .order("completed_at", { ascending: false });
      if (error) throw error;

      const grouped = new Map<string, { project_id: string; project_name: string; items: ScheduleItem[]; count: number }>();
      for (const row of data || []) {
        const pid = row.project_id;
        if (!grouped.has(pid)) {
          grouped.set(pid, { project_id: pid, project_name: (row as any).projects?.project_name || pid, items: [], count: 0 });
        }
        const g = grouped.get(pid)!;
        g.items.push({
          id: row.id, project_id: row.project_id,
          project_name: (row as any).projects?.project_name || pid,
          stage_id: row.stage_id, item_name: row.item_name,
          item_code: row.item_code ?? null, scheduled_week: row.scheduled_week,
          scheduled_hours: row.scheduled_hours, scheduled_czk: row.scheduled_czk,
          position: row.position, status: row.status,
          completed_at: row.completed_at, completed_by: row.completed_by,
          split_group_id: (row as any).split_group_id ?? null,
          split_part: (row as any).split_part ?? null,
          split_total: (row as any).split_total ?? null,
          pause_reason: null, pause_expected_date: null,
          adhoc_reason: (row as any).adhoc_reason ?? null,
          cancel_reason: null,
        });
        g.count++;
      }
      return Array.from(grouped.values());
    },
  });
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export { getISOWeekNumber };
