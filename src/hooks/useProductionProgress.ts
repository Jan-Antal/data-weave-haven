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
  paused: number;
  missing: number;
  is_complete: boolean;
  is_blocker_only: boolean;
  scheduled_items: { id: string; item_name: string; item_code: string | null; week_label: string; status: string }[];
}

export function useProductionProgress() {
  return useQuery({
    queryKey: ["production-progress"],
    queryFn: async () => {
      const [tpvRes, inboxRes, scheduleRes] = await Promise.all([
        supabase.from("tpv_items").select("project_id, id, item_name, item_type").is("deleted_at", null),
        supabase.from("production_inbox").select("project_id, id, item_name, item_code, status"),
        supabase.from("production_schedule").select("project_id, id, item_name, item_code, status, scheduled_week, is_blocker, projects!production_schedule_project_id_fkey(project_name)"),
      ]);

      if (tpvRes.error) throw tpvRes.error;
      if (inboxRes.error) throw inboxRes.error;
      if (scheduleRes.error) throw scheduleRes.error;

      const tpvByProject = new Map<string, number>();
      for (const row of tpvRes.data || []) {
        tpvByProject.set(row.project_id, (tpvByProject.get(row.project_id) || 0) + 1);
      }

      const inboxByProject = new Map<string, number>();
      for (const row of inboxRes.data || []) {
        if (row.status === "pending") {
          inboxByProject.set(row.project_id, (inboxByProject.get(row.project_id) || 0) + 1);
        }
      }

      const scheduledByProject = new Map<string, number>();
      const completedByProject = new Map<string, number>();
      const pausedByProject = new Map<string, number>();
      const blockerCountByProject = new Map<string, number>();
      const nonBlockerCountByProject = new Map<string, number>();
      const scheduledItemsByProject = new Map<string, ProjectProgress["scheduled_items"]>();
      const projectNames = new Map<string, string>();

      for (const row of scheduleRes.data || []) {
        const pid = row.project_id;
        const pName = (row as any).projects?.project_name;
        if (pName && !projectNames.has(pid)) projectNames.set(pid, pName);
        const isBlocker = !!(row as any).is_blocker;
        if (isBlocker) {
          blockerCountByProject.set(pid, (blockerCountByProject.get(pid) || 0) + 1);
        } else {
          nonBlockerCountByProject.set(pid, (nonBlockerCountByProject.get(pid) || 0) + 1);
        }
        if (row.status === "completed") {
          completedByProject.set(pid, (completedByProject.get(pid) || 0) + 1);
        } else if (row.status === "paused") {
          pausedByProject.set(pid, (pausedByProject.get(pid) || 0) + 1);
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
          id: row.id, item_name: row.item_name, item_code: row.item_code,
          week_label: `T${weekNum}`, status: row.status,
        });
      }

      const allProjectIds = new Set<string>();
      for (const pid of inboxByProject.keys()) allProjectIds.add(pid);
      for (const pid of scheduledByProject.keys()) allProjectIds.add(pid);
      for (const pid of completedByProject.keys()) allProjectIds.add(pid);
      for (const pid of pausedByProject.keys()) allProjectIds.add(pid);

      const result = new Map<string, ProjectProgress>();
      for (const pid of allProjectIds) {
        const totalTpv = tpvByProject.get(pid) || 0;
        const inInbox = inboxByProject.get(pid) || 0;
        const scheduled = scheduledByProject.get(pid) || 0;
        const completed = completedByProject.get(pid) || 0;
        const paused = pausedByProject.get(pid) || 0;
        const accountedFor = inInbox + scheduled + completed + paused;
        const missing = Math.max(0, totalTpv - accountedFor);
        
        const blockerCount = blockerCountByProject.get(pid) || 0;
        const nonBlockerCount = nonBlockerCountByProject.get(pid) || 0;
        const isBlockerOnly = blockerCount > 0 && nonBlockerCount === 0 && inInbox === 0;
        
        const hasScheduledOrCompleted = (scheduled + completed) > 0;
        result.set(pid, {
          project_id: pid, project_name: projectNames.get(pid) || pid, total_tpv: totalTpv,
          in_inbox: inInbox, scheduled, completed, paused, missing,
          is_complete: inInbox === 0 && paused === 0 && hasScheduledOrCompleted,
          is_blocker_only: isBlockerOnly,
          scheduled_items: scheduledItemsByProject.get(pid) || [],
        });
      }

      return result;
    },
  });
}
