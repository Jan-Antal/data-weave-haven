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
      const [tpvRes, inboxRes, scheduleRes, expediceRes] = await Promise.all([
        supabase.from("tpv_items").select("project_id, id, item_code, nazev").is("deleted_at", null),
        supabase.from("production_inbox").select("project_id, id, item_name, item_code, status"),
        supabase.from("production_schedule").select("project_id, id, inbox_item_id, item_name, item_code, status, scheduled_week, is_blocker, is_midflight, is_historical, completed_at, expediced_at, projects!production_schedule_project_id_fkey(project_name)").in("status", ["scheduled", "in_progress", "paused", "completed"]),
        supabase.from("production_expedice").select("project_id, id, source_schedule_id, item_name, item_code, is_midflight, projects!production_expedice_project_id_fkey(project_name)"),
      ]);

      if (tpvRes.error) throw tpvRes.error;
      if (inboxRes.error) throw inboxRes.error;
      if (scheduleRes.error) throw scheduleRes.error;
      if (expediceRes.error) throw expediceRes.error;

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
      const expediceScheduleIds = new Set<string>();

      for (const row of expediceRes.data || []) {
        if ((row as any).is_midflight) continue;
        const pid = row.project_id;
        const pName = (row as any).projects?.project_name;
        if (pName && !projectNames.has(pid)) projectNames.set(pid, pName);
        if (row.source_schedule_id) expediceScheduleIds.add(row.source_schedule_id);
        if (!row.item_code) continue;
        if (!completedByProject.has(pid)) completedByProject.set(pid, new Set());
        completedByProject.get(pid)!.add(itemKey(row));
      }

      for (const row of scheduleRes.data || []) {
        if ((row as any).is_midflight || (row as any).is_historical) continue;
        const pid = row.project_id;
        const pName = (row as any).projects?.project_name;
        if (pName && !projectNames.has(pid)) projectNames.set(pid, pName);
        const isBlocker = !!(row as any).is_blocker;
        if (isBlocker) {
          blockerCountByProject.set(pid, (blockerCountByProject.get(pid) || 0) + 1);
        } else {
          nonBlockerCountByProject.set(pid, (nonBlockerCountByProject.get(pid) || 0) + 1);
        }
        const key = itemKey(row);
        const isAlreadyManufactured = expediceScheduleIds.has(row.id) || completedByProject.get(pid)?.has(key);
        if (row.status === "completed" || isAlreadyManufactured) {
          if (!completedByProject.has(pid)) completedByProject.set(pid, new Set());
          completedByProject.get(pid)!.add(key);
        } else if (row.status === "paused") {
          if (!pausedByProject.has(pid)) pausedByProject.set(pid, new Set());
          pausedByProject.get(pid)!.add(key);
        } else {
          if (!scheduledByProject.has(pid)) scheduledByProject.set(pid, new Set());
          scheduledByProject.get(pid)!.add(key);
        }
        
        if (!scheduledItemsByProject.has(pid)) scheduledItemsByProject.set(pid, []);
        const weekDate = new Date(row.scheduled_week);
        const dayNum = weekDate.getUTCDay() || 7;
        weekDate.setUTCDate(weekDate.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
        const weekNum = Math.ceil(((weekDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
        const isManufactured = expediceScheduleIds.has(row.id) || row.status === "completed";

        scheduledItemsByProject.get(pid)!.push({
          id: row.id, item_name: row.item_name, item_code: row.item_code,
          week_label: `T${weekNum}`, status: isManufactured ? "completed" : row.status,
          _weekNum: weekNum, _dedupKey: row.item_code ? `code:${row.item_code}` : `name:${row.item_name}`,
        } as any);
      }

      // Deduplicate split items spanning multiple weeks: merge same-item rows into one entry
      // with combined week label (e.g. "T17, T18" or "T17-T19" if consecutive).
      for (const [pid, items] of scheduledItemsByProject) {
        const groups = new Map<string, any[]>();
        for (const it of items as any[]) {
          const k = it._dedupKey;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(it);
        }
        const merged: ProjectProgress["scheduled_items"] = [];
        for (const group of groups.values()) {
          if (group.length === 1) {
            const { _weekNum, _dedupKey, ...rest } = group[0];
            merged.push(rest);
            continue;
          }
          const weeks = Array.from(new Set(group.map(g => g._weekNum as number))).sort((a, b) => a - b);
          const runs: string[] = [];
          let runStart = weeks[0];
          let prev = weeks[0];
          for (let i = 1; i <= weeks.length; i++) {
            const w = weeks[i];
            if (w === prev + 1) { prev = w; continue; }
            runs.push(runStart === prev ? `T${runStart}` : `T${runStart}-T${prev}`);
            if (w !== undefined) { runStart = w; prev = w; }
          }
          const label = runs.join(", ");
          const allCompleted = group.every(g => g.status === "completed");
          const status = allCompleted ? "completed" : (group.find(g => g.status !== "completed")?.status ?? group[0].status);
          merged.push({
            id: group[0].id,
            item_name: group[0].item_name,
            item_code: group[0].item_code,
            week_label: label,
            status,
          });
        }
        scheduledItemsByProject.set(pid, merged);
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
        
        result.set(pid, {
          project_id: pid, project_name: projectNames.get(pid) || pid, total_tpv: totalTpv,
          in_inbox: inInbox, scheduled, completed, paused, missing,
          is_complete: missing === 0 && inInbox === 0 && scheduled === 0 && paused === 0 && completed > 0,
          is_blocker_only: isBlockerOnly,
          scheduled_items: scheduledItemsByProject.get(pid) || [],
        });
      }

      return result;
    },
  });
}
