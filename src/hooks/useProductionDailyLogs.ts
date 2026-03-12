import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface DailyLog {
  id: string;
  bundle_id: string;
  week_key: string;
  day_index: number;
  phase: string | null;
  percent: number;
  logged_by: string | null;
  logged_at: string;
}

export function useProductionDailyLogs(weekKey: string) {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`daily-logs-${weekKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "production_daily_logs" }, () => {
        qc.invalidateQueries({ queryKey: ["production-daily-logs", weekKey] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, weekKey]);

  return useQuery({
    queryKey: ["production-daily-logs", weekKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_daily_logs" as any)
        .select("*")
        .eq("week_key", weekKey)
        .order("day_index", { ascending: true });
      if (error) throw error;

      const map = new Map<string, DailyLog[]>();
      for (const row of (data || []) as any[]) {
        const logs = map.get(row.bundle_id) || [];
        logs.push(row as DailyLog);
        map.set(row.bundle_id, logs);
      }
      return map;
    },
  });
}

export async function saveDailyLog(
  bundleId: string,
  weekKey: string,
  dayIndex: number,
  phase: string | null,
  percent: number
) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await (supabase.from("production_daily_logs" as any) as any)
    .upsert(
      {
        bundle_id: bundleId,
        week_key: weekKey,
        day_index: dayIndex,
        phase,
        percent,
        logged_by: user?.id || null,
        logged_at: new Date().toISOString(),
      },
      { onConflict: "bundle_id,week_key,day_index" }
    );
  if (error) throw error;
}
