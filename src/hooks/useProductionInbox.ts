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
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_inbox")
        .select("*, projects!production_inbox_project_id_fkey(project_name)")
        .eq("status", "pending")
        .order("sent_at", { ascending: true });
      if (error) throw error;

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
        });
        g.total_hours += row.estimated_hours;
      }
      return Array.from(grouped.values());
    },
  });
}

/** Auto-reduce blocker rows when new inbox items arrive for the same project.
 *  Uses ONE batched query for all project blockers instead of N individual queries. */
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

      // ONE batched query for all projects' blockers
      const { data: allBlockers } = await supabase
        .from("production_schedule")
        .select("id, scheduled_hours, scheduled_week, project_id")
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

      // Collect all IDs to delete and updates to make in batch
      const idsToDelete: string[] = [];
      const updates: { id: string; hours: number }[] = [];

      for (const project of newProjects) {
        const blockers = blockersByProject.get(project.project_id);
        if (!blockers || blockers.length === 0) continue;

        const totalBlockerHours = blockers.reduce((s, b) => s + Number(b.scheduled_hours), 0);
        const inboxHours = project.total_hours;

        if (inboxHours >= totalBlockerHours) {
          // Delete all blocker rows for this project
          idsToDelete.push(...blockers.map(b => b.id));
          toast({ title: `${project.project_name}: Rezerva nahrazena reálnými položkami` });
        } else {
          // Reduce lowest-week blocker
          const lowest = blockers[0];
          const newHours = Number(lowest.scheduled_hours) - inboxHours;
          if (newHours <= 0) {
            idsToDelete.push(lowest.id);
          } else {
            updates.push({ id: lowest.id, hours: newHours });
          }
          toast({ title: `${project.project_name}: Rezerva snížena na ${Math.round(newHours > 0 ? newHours : totalBlockerHours - inboxHours)}h` });
        }
      }

      // Execute batched deletes
      if (idsToDelete.length > 0) {
        await supabase.from("production_schedule").delete().in("id", idsToDelete);
      }

      // Execute updates (can't batch different values, but typically only 1-2)
      for (const u of updates) {
        await supabase.from("production_schedule").update({ scheduled_hours: u.hours } as any).eq("id", u.id);
      }

      qc.invalidateQueries({ queryKey: ["production-schedule"] });
    })();
  }, [inboxProjects, qc]);
}
