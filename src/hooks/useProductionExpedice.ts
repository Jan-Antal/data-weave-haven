import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ExpediceItem {
  id: string;
  project_id: string;
  stage_id: string | null;
  item_name: string;
  item_code: string | null;
  source_schedule_id: string | null;
  manufactured_at: string;
  expediced_at: string | null;
  is_midflight: boolean;
  created_at: string;
}

export interface ExpediceProject {
  project_id: string;
  project_name: string;
  items: ExpediceItem[];
  count: number;
}

/** Fetch all production_expedice items grouped by project */
export function useProductionExpediceData() {
  return useQuery({
    queryKey: ["production-expedice"],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_expedice" as any)
        .select("*, projects!production_expedice_project_id_fkey(project_name)")
        .order("manufactured_at", { ascending: false });
      if (error) throw error;

      const grouped = new Map<string, ExpediceProject>();
      for (const row of data || []) {
        const pid = (row as any).project_id;
        if (!grouped.has(pid)) {
          grouped.set(pid, {
            project_id: pid,
            project_name: (row as any).projects?.project_name || pid,
            items: [],
            count: 0,
          });
        }
        const g = grouped.get(pid)!;
        g.items.push({
          id: (row as any).id,
          project_id: (row as any).project_id,
          stage_id: (row as any).stage_id ?? null,
          item_name: (row as any).item_name,
          item_code: (row as any).item_code ?? null,
          source_schedule_id: (row as any).source_schedule_id ?? null,
          manufactured_at: (row as any).manufactured_at,
          expediced_at: (row as any).expediced_at ?? null,
          is_midflight: (row as any).is_midflight ?? false,
          created_at: (row as any).created_at,
        });
        g.count++;
      }
      return Array.from(grouped.values());
    },
  });
}

/** Returns a Set of production_schedule IDs that have been completed (exist in production_expedice) */
export function useCompletedScheduleIds() {
  return useQuery({
    queryKey: ["production-expedice-schedule-ids"],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_expedice" as any)
        .select("source_schedule_id, expediced_at");
      if (error) throw error;
      // Map: schedule_id → { expediced: boolean }
      const map = new Map<string, boolean>();
      for (const row of data || []) {
        const sid = (row as any).source_schedule_id;
        if (sid) map.set(sid, !!(row as any).expediced_at);
      }
      return map;
    },
  });
}
