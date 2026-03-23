import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { createNotification, getUserIdsByRole } from "@/lib/createNotification";

export interface QualityDefect {
  id: string;
  project_id: string;
  item_id: string;
  item_code: string | null;
  defect_type: string;
  description: string;
  severity: "minor" | "blocking";
  resolution_type: string | null;
  assigned_to: string | null;
  photo_url: string | null;
  reported_by: string;
  reported_at: string;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
}

type DefectInsert = Omit<QualityDefect, "id" | "reported_at" | "resolved" | "resolved_by" | "resolved_at" | "assigned_to">;

export function useQualityDefects(projectId: string) {
  const qc = useQueryClient();
  const { user, profile } = useAuth();

  const { data: defects = [] } = useQuery({
    queryKey: ["quality-defects", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("production_quality_defects" as any) as any)
        .select("*")
        .eq("project_id", projectId);
      if (error) throw error;
      return (data || []) as QualityDefect[];
    },
  });

  const addDefect = useMutation({
    mutationFn: async (defect: DefectInsert) => {
      const { error } = await (supabase.from("production_quality_defects" as any) as any).insert(defect);
      if (error) throw error;
    },
    onSuccess: (_data, defect) => {
      qc.invalidateQueries({ queryKey: ["quality-defects", projectId] });
      // Fire-and-forget notification for QC defect
      (async () => {
        try {
          const adminIds = await getUserIdsByRole(supabase, ["owner", "admin"]);
          // Get project name
          const { data: proj } = await supabase
            .from("projects")
            .select("project_name")
            .eq("project_id", projectId)
            .maybeSingle();
          await createNotification(supabase, {
            userIds: adminIds,
            type: "qc_defect",
            title: `⚠ QC vada: ${proj?.project_name || projectId}`,
            body: defect.description,
            projectId,
            actorName: profile?.full_name || "",
            excludeUserId: user?.id,
          });
        } catch {}
      })();
    },
  });

  const resolveDefect = useMutation({
    mutationFn: async ({ defectId, userId }: { defectId: string; userId: string }) => {
      const { error } = await (supabase.from("production_quality_defects" as any) as any)
        .update({ resolved: true, resolved_by: userId, resolved_at: new Date().toISOString() })
        .eq("id", defectId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quality-defects", projectId] }),
  });

  return { defects, addDefect, resolveDefect };
}
