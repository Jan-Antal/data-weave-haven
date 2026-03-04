import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

export interface ProductionStatus {
  label: string;
  color: string;
  weekLabel?: string;
  splitPart?: number;
  splitTotal?: number;
}

/** For a given project, compute production status per TPV item_type (code) */
export function useProductionStatuses(projectId: string) {
  const query = useQuery({
    queryKey: ["production-statuses", projectId],
    queryFn: async () => {
      const [inboxRes, scheduleRes] = await Promise.all([
        supabase.from("production_inbox").select("item_name, item_code, status").eq("project_id", projectId),
        supabase.from("production_schedule").select("item_name, item_code, status, scheduled_week, split_part, split_total").eq("project_id", projectId),
      ]);
      if (inboxRes.error) throw inboxRes.error;
      if (scheduleRes.error) throw scheduleRes.error;
      return { inbox: inboxRes.data || [], schedule: scheduleRes.data || [] };
    },
    enabled: !!projectId,
  });

  const statusMap = useMemo(() => {
    const map = new Map<string, ProductionStatus[]>();
    if (!query.data) return map;

    const now = new Date();
    const monday = new Date(now);
    const day = monday.getDay();
    monday.setDate(monday.getDate() - day + (day === 0 ? -6 : 1));
    monday.setHours(0, 0, 0, 0);
    const currentWeekKey = monday.toISOString().split("T")[0];

    // Index inbox items by item_name (since TPV items don't have direct IDs in production)
    for (const row of query.data.inbox) {
      const key = row.item_code || row.item_name;
      if (!map.has(key)) map.set(key, []);
      if (row.status === "pending") {
        map.get(key)!.push({ label: "Čeká na plánování", color: "#6b7280" });
      }
    }

    for (const row of query.data.schedule) {
      const key = row.item_code || row.item_name;
      if (!map.has(key)) map.set(key, []);

      let status: ProductionStatus;
      if (row.status === "completed") {
        status = { label: "K expedici", color: "#3a8a36" };
      } else if (row.status === "paused") {
        status = { label: "⏸ Pozastaveno", color: "#d97706" };
      } else if (row.status === "cancelled") {
        status = { label: "✕ Zrušeno", color: "#6b7280" };
      } else {
        // Check week relative to current
        const weekKey = row.scheduled_week;
        const weekDate = new Date(weekKey);
        const dayNum = weekDate.getUTCDay() || 7;
        weekDate.setUTCDate(weekDate.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
        const weekNum = Math.ceil(((weekDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

        if (weekKey === currentWeekKey) {
          status = { label: "Ve výrobě", color: "#d97706" };
        } else if (weekKey > currentWeekKey) {
          status = { label: `Naplánováno T${weekNum}`, color: "#3b82f6", weekLabel: `T${weekNum}` };
        } else {
          status = { label: "⚠ Zpoždění", color: "#dc3545" };
        }
      }

      if (row.split_part && row.split_total) {
        status.splitPart = row.split_part;
        status.splitTotal = row.split_total;
      }
      map.get(key)!.push(status);
    }

    return map;
  }, [query.data]);

  return { ...query, statusMap };
}
