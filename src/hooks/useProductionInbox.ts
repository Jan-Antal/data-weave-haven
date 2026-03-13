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
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("production-inbox-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "production_inbox" }, () => {
        qc.invalidateQueries({ queryKey: ["production-inbox"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

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
