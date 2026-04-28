import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";

export interface InboxItem {
  id: string;
  project_id: string;
  stage_id: string | null;
  item_name: string;
  item_code: string | null;
  estimated_hours: number;
  estimated_czk: number;
  sent_by: string;
  sent_at: string;
  status: string;
  adhoc_reason: string | null;
  split_part: number | null;
  split_total: number | null;
  split_group_id: string | null;
  pocet: number | null;
}

export interface InboxProject {
  project_id: string;
  project_name: string;
  items: InboxItem[];
  total_hours: number;
}

export function useProductionInbox() {
  return useQuery({
    queryKey: ["production-inbox"],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_inbox")
        .select("*, projects!production_inbox_project_id_fkey(project_name)")
        .eq("status", "pending")
        .order("sent_at", { ascending: true });
      if (error) throw error;

      // Fetch pocet from tpv_items for all (project_id, item_code) pairs in one batch
      const projectIds = Array.from(new Set((data || []).map((r: any) => r.project_id)));
      const pocetMap = new Map<string, number>();
      if (projectIds.length > 0) {
        const { data: tpvRows } = await supabase
          .from("tpv_items")
          .select("project_id, item_code, pocet")
          .in("project_id", projectIds)
          .is("deleted_at", null);
        for (const t of tpvRows || []) {
          if (t.item_code) pocetMap.set(`${t.project_id}||${t.item_code}`, Number(t.pocet) || 0);
        }
      }

      const grouped = new Map<string, InboxProject>();
      for (const row of data || []) {
        const pid = row.project_id;
        if (!grouped.has(pid)) {
          grouped.set(pid, {
            project_id: pid,
            project_name: (row as any).projects?.project_name || pid,
            items: [],
            total_hours: 0,
          });
        }
        const g = grouped.get(pid)!;
        g.items.push({
          id: row.id,
          project_id: row.project_id,
          stage_id: row.stage_id,
          item_name: row.item_name,
          item_code: row.item_code ?? null,
          estimated_hours: row.estimated_hours,
          estimated_czk: row.estimated_czk,
          sent_by: row.sent_by,
          sent_at: row.sent_at,
          status: row.status,
          adhoc_reason: row.adhoc_reason ?? null,
          split_part: row.split_part ?? null,
          split_total: row.split_total ?? null,
          split_group_id: row.split_group_id ?? null,
          pocet: row.item_code ? (pocetMap.get(`${row.project_id}||${row.item_code}`) ?? null) : null,
        });
        g.total_hours += row.estimated_hours;
      }
      return Array.from(grouped.values());
    },
  });
}

/** Auto-fill blocker (Rezerva) slots with new inbox items for the same project.
 *  Instead of deleting the reserve when items arrive, plan items INTO the reserve's week.
 *  - Items from inbox (status=pending) get inserted into production_schedule with the
 *    blocker's scheduled_week, is_blocker=false, and the blocker's bundle_label (so they
 *    visually merge with the reserve's bundle).
 *  - When the blocker hours are fully consumed, the blocker row is deleted.
 *  - When partially consumed, the blocker's scheduled_hours is reduced (showing the
 *    remaining hours-for-project as a smaller reserve).
 *  - Any inbox items beyond total reserve capacity stay pending in the inbox. */
export function useBlockerAutoReduce(inboxProjects: InboxProject[] | undefined) {
  const qc = useQueryClient();
  const prevProjectIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!inboxProjects || inboxProjects.length === 0) return;

    const currentIds = new Set(inboxProjects.map(p => p.project_id));
    const newProjects = inboxProjects.filter(p => !prevProjectIds.current.has(p.project_id));
    prevProjectIds.current = currentIds;

    if (newProjects.length === 0) return;

    (async () => {
      const projectIds = newProjects.map(p => p.project_id);

      // ONE batched query for all projects' blockers (oldest week first)
      const { data: allBlockers } = await supabase
        .from("production_schedule")
        .select("id, scheduled_hours, scheduled_week, project_id, stage_id, bundle_label, bundle_type, tpv_expected_date")
        .in("project_id", projectIds)
        .eq("is_blocker", true)
        .in("status", ["scheduled", "in_progress"])
        .order("scheduled_week", { ascending: true });

      if (!allBlockers || allBlockers.length === 0) return;

      // Group blockers by project_id
      const blockersByProject = new Map<string, typeof allBlockers>();
      for (const b of allBlockers) {
        const pid = b.project_id;
        if (!blockersByProject.has(pid)) blockersByProject.set(pid, []);
        blockersByProject.get(pid)!.push(b);
      }

      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;

      // Per-project: fill blocker slots with inbox items, delete blocker when consumed
      for (const project of newProjects) {
        const blockers = blockersByProject.get(project.project_id);
        if (!blockers || blockers.length === 0) continue;

        // Fetch this project's pending inbox items, oldest first
        const { data: inboxItems } = await supabase
          .from("production_inbox")
          .select("id, project_id, stage_id, item_name, item_code, estimated_hours, estimated_czk, split_group_id, split_part, split_total")
          .eq("project_id", project.project_id)
          .eq("status", "pending")
          .order("sent_at", { ascending: true });

        if (!inboxItems || inboxItems.length === 0) continue;

        const inserts: any[] = [];
        const inboxItemIdsScheduled: string[] = [];
        const blockerDeletes: string[] = [];
        const blockerUpdates: { id: string; hours: number }[] = [];

        let bIdx = 0;
        let remaining = Number(blockers[0].scheduled_hours) || 0;
        let firstFilledWeek: string | null = null;

        for (const item of inboxItems) {
          // Skip past fully-consumed blockers
          while (bIdx < blockers.length && remaining <= 0) {
            blockerDeletes.push(blockers[bIdx].id);
            bIdx++;
            remaining = bIdx < blockers.length ? Number(blockers[bIdx].scheduled_hours) || 0 : 0;
          }
          if (bIdx >= blockers.length) break; // no more reserve capacity

          const blocker = blockers[bIdx];
          if (!firstFilledWeek) firstFilledWeek = blocker.scheduled_week as unknown as string;

          inserts.push({
            project_id: item.project_id,
            stage_id: item.stage_id ?? blocker.stage_id ?? null,
            inbox_item_id: item.id,
            item_name: item.item_name,
            item_code: item.item_code,
            scheduled_week: blocker.scheduled_week,
            scheduled_hours: Number(item.estimated_hours) || 0,
            scheduled_czk: Number(item.estimated_czk) || 0,
            position: 999,
            status: "scheduled",
            created_by: userId,
            is_blocker: false,
            bundle_label: blocker.bundle_label ?? null,
            bundle_type: blocker.bundle_type ?? "full",
            split_group_id: item.split_group_id ?? null,
            split_part: item.split_part ?? null,
            split_total: item.split_total ?? null,
          });
          inboxItemIdsScheduled.push(item.id);
          remaining -= Number(item.estimated_hours) || 0;
        }

        // Finalize the current blocker (if we touched it at all)
        if (firstFilledWeek && bIdx < blockers.length) {
          if (remaining <= 0) {
            blockerDeletes.push(blockers[bIdx].id);
          } else {
            blockerUpdates.push({ id: blockers[bIdx].id, hours: remaining });
          }
        }

        // Execute DB ops for this project
        if (inserts.length > 0) {
          const { error: insErr } = await supabase.from("production_schedule").insert(inserts as any);
          if (insErr) { console.error("Auto-fill reserve insert failed", insErr); continue; }
        }
        if (inboxItemIdsScheduled.length > 0) {
          await supabase
            .from("production_inbox")
            .update({ status: "scheduled" } as any)
            .in("id", inboxItemIdsScheduled);
        }
        if (blockerDeletes.length > 0) {
          await supabase.from("production_schedule").delete().in("id", blockerDeletes);
        }
        for (const u of blockerUpdates) {
          await supabase.from("production_schedule").update({ scheduled_hours: u.hours } as any).eq("id", u.id);
        }

        if (inserts.length > 0 && firstFilledWeek) {
          // Compute T-week label for toast
          const d = new Date(firstFilledWeek);
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1);
          const monday = new Date(d);
          monday.setDate(diff);
          const weekNum = Math.ceil(((monday.getTime() - new Date(monday.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7);
          const allConsumed = blockerDeletes.length === blockers.length && blockerUpdates.length === 0;
          toast({
            title: allConsumed
              ? `${project.project_name}: Rezerva naplněna reálnými položkami`
              : `${project.project_name}: ${inserts.length} položek naplánováno do rezervy (T${weekNum})`,
          });
        }
      }

      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-inbox"] });

      // Auto-fill changed underlying schedule/inbox data → invalidate cached forecast
      // sessions so user doesn't see stale numbers (e.g. blocker hours that no longer exist).
      try {
        localStorage.removeItem("ami_forecast_session");
        localStorage.removeItem("ami_forecast_session_scratch");
        // Bump a tick so any active useForecastMode listeners can react if needed.
        localStorage.setItem("ami_forecast_invalidated_at", String(Date.now()));
      } catch { /* ignore */ }
    })();
  }, [inboxProjects, qc]);
}
