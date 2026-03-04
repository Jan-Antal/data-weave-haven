import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

export interface ProjectProgress {
  project_id: string;
  project_name: string;
  total_tpv: number;
  in_inbox: number;
  scheduled: number;
  completed: number;
  missing: number;
  is_complete: boolean;
  /** Items that have been scheduled or completed (shown as muted in inbox) */
  scheduled_items: { id: string; item_name: string; item_code: string | null; week_label: string; status: string }[];
}

export function useProductionProgress() {
  return useQuery({
    queryKey: ["production-progress"],
    queryFn: async () => {
      // Fetch all three sources in parallel
      const [tpvRes, inboxRes, scheduleRes] = await Promise.all([
        supabase.from("tpv_items").select("project_id, id, item_name, item_type").is("deleted_at", null),
        supabase.from("production_inbox").select("project_id, id, item_name, item_code, status"),
        supabase.from("production_schedule").select("project_id, id, item_name, item_code, status, scheduled_week, projects!production_schedule_project_id_fkey(project_name)"),
      ]);

      if (tpvRes.error) throw tpvRes.error;
      if (inboxRes.error) throw inboxRes.error;
      if (scheduleRes.error) throw scheduleRes.error;

      // Count TPV items per project
      const tpvByProject = new Map<string, number>();
      for (const row of tpvRes.data || []) {
        tpvByProject.set(row.project_id, (tpvByProject.get(row.project_id) || 0) + 1);
      }

      // Count inbox items per project (pending only)
      const inboxByProject = new Map<string, number>();
      for (const row of inboxRes.data || []) {
        if (row.status === "pending") {
          inboxByProject.set(row.project_id, (inboxByProject.get(row.project_id) || 0) + 1);
        }
      }

      // Count schedule items per project
      const scheduledByProject = new Map<string, number>();
      const completedByProject = new Map<string, number>();
      const scheduledItemsByProject = new Map<string, ProjectProgress["scheduled_items"]>();

      for (const row of scheduleRes.data || []) {
        const pid = row.project_id;
        if (row.status === "completed") {
          completedByProject.set(pid, (completedByProject.get(pid) || 0) + 1);
        } else {
          scheduledByProject.set(pid, (scheduledByProject.get(pid) || 0) + 1);
        }
        
        if (!scheduledItemsByProject.has(pid)) scheduledItemsByProject.set(pid, []);
        const weekDate = new Date(row.scheduled_week);
        const dayNum = weekDate.getUTCDay() || 7;
        weekDate.setUTCDate(weekDate.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
        const weekNum = Math.ceil(((weekDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
        
        scheduledItemsByProject.get(pid)!.push({
          id: row.id,
          item_name: row.item_name,
          item_code: row.item_code,
          week_label: `T${weekNum}`,
          status: row.status,
        });
      }

      // Build progress for all projects that have any production presence
      const allProjectIds = new Set<string>();
      for (const pid of inboxByProject.keys()) allProjectIds.add(pid);
      for (const pid of scheduledByProject.keys()) allProjectIds.add(pid);
      for (const pid of completedByProject.keys()) allProjectIds.add(pid);

      const result = new Map<string, ProjectProgress>();
      for (const pid of allProjectIds) {
        const totalTpv = tpvByProject.get(pid) || 0;
        const inInbox = inboxByProject.get(pid) || 0;
        const scheduled = scheduledByProject.get(pid) || 0;
        const completed = completedByProject.get(pid) || 0;
        const accountedFor = inInbox + scheduled + completed;
        const missing = Math.max(0, totalTpv - accountedFor);
        
        result.set(pid, {
          project_id: pid,
          project_name: pid,
          total_tpv: totalTpv,
          in_inbox: inInbox,
          scheduled,
          completed,
          missing,
          is_complete: missing === 0 && inInbox === 0 && (scheduled + completed) > 0,
          scheduled_items: scheduledItemsByProject.get(pid) || [],
        });
      }

      return result;
    },
  });
}
