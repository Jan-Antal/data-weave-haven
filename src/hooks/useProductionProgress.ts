import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
        supabase.from("tpv_items").select("project_id, id, item_code, nazev").is("deleted_at", null),
        supabase.from("production_inbox").select("project_id, id, item_name, item_code, status"),
        supabase.from("production_schedule").select("project_id, id, inbox_item_id, item_name, item_code, status, scheduled_week, is_blocker, projects!production_schedule_project_id_fkey(project_name)").in("status", ["scheduled", "in_progress", "paused", "completed"]),
      ]);

      if (tpvRes.error) throw tpvRes.error;
      if (inboxRes.error) throw inboxRes.error;
      if (scheduleRes.error) throw scheduleRes.error;

      const itemKey = (row: { id: string; item_code: string | null; item_name?: string | null; inbox_item_id?: string | null }) =>
        row.item_code ? `code:${row.item_code}` : row.inbox_item_id ? `inbox:${row.inbox_item_id}` : `id:${row.id}`;

      const tpvByProject = new Map<string, Set<string>>();
      for (const row of tpvRes.data || []) {
        if (!tpvByProject.has(row.project_id)) tpvByProject.set(row.project_id, new Set());
        tpvByProject.get(row.project_id)!.add(itemKey(row));
      }

      const inboxByProject = new Map<string, Set<string>>();
      for (const row of inboxRes.data || []) {
        if (row.status === "pending") {
          if (!inboxByProject.has(row.project_id)) inboxByProject.set(row.project_id, new Set());
          inboxByProject.get(row.project_id)!.add(itemKey(row));
        }
      }

      const scheduledByProject = new Map<string, Set<string>>();
      const completedByProject = new Map<string, Set<string>>();
      const pausedByProject = new Map<string, Set<string>>();
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
          if (!completedByProject.has(pid)) completedByProject.set(pid, new Set());
          completedByProject.get(pid)!.add(itemKey(row));
        } else if (row.status === "paused") {
          if (!pausedByProject.has(pid)) pausedByProject.set(pid, new Set());
          pausedByProject.get(pid)!.add(itemKey(row));
        } else {
          if (!scheduledByProject.has(pid)) scheduledByProject.set(pid, new Set());
          scheduledByProject.get(pid)!.add(itemKey(row));
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
        const totalTpv = tpvByProject.get(pid)?.size || 0;
        const inInbox = inboxByProject.get(pid)?.size || 0;
        const scheduled = scheduledByProject.get(pid)?.size || 0;
        const completed = completedByProject.get(pid)?.size || 0;
        const paused = pausedByProject.get(pid)?.size || 0;
        const accountedFor = inInbox + scheduled + completed + paused;
        const missing = Math.max(0, totalTpv - accountedFor);
        
        const blockerCount = blockerCountByProject.get(pid) || 0;
        const nonBlockerCount = nonBlockerCountByProject.get(pid) || 0;
        const isBlockerOnly = blockerCount > 0 && nonBlockerCount === 0 && inInbox === 0;
        
        const hasScheduledOrCompleted = (scheduled + completed) > 0;
        result.set(pid, {
          project_id: pid, project_name: projectNames.get(pid) || pid, total_tpv: totalTpv,
          in_inbox: inInbox, scheduled, completed, paused, missing,
          is_complete: missing === 0 && inInbox === 0 && paused === 0 && hasScheduledOrCompleted,
          is_blocker_only: isBlockerOnly,
          scheduled_items: scheduledItemsByProject.get(pid) || [],
        });
      }

      return result;
    },
  });
}
