import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

export type ProjectStage = Tables<"project_stages">;

export function useProjectStages(projectId: string) {
  return useQuery({
    queryKey: ["project_stages", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_stages")
        .select("*")
        .eq("project_id", projectId)
        .order("stage_order");
      if (error) throw error;
      return data as ProjectStage[];
    },
    enabled: !!projectId,
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: any; projectId: string }) => {
      const { error } = await supabase.from("project_stages").update({ [field]: value } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ["project_stages", projectId] });
      toast({ title: "Uloženo" });
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nepodařilo se uložit", variant: "destructive" });
    },
  });
}

export function useAddStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stage: { project_id: string; stage_name: string; stage_order: number; status?: string; start_date?: string; end_date?: string; notes?: string }) => {
      const { error } = await supabase.from("project_stages").insert(stage);
      if (error) throw error;
    },
    onSuccess: (_, { project_id }) => {
      qc.invalidateQueries({ queryKey: ["project_stages", project_id] });
      toast({ title: "Etapa přidána" });
    },
    onError: () => {
      toast({ title: "Chyba", variant: "destructive" });
    },
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      const { error } = await supabase.from("project_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ["project_stages", projectId] });
      toast({ title: "Etapa smazána" });
    },
  });
}

export function useReorderStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stages, projectId }: { stages: { id: string; stage_order: number }[]; projectId: string }) => {
      for (const s of stages) {
        await supabase.from("project_stages").update({ stage_order: s.stage_order }).eq("id", s.id);
      }
      return projectId;
    },
    onSuccess: (projectId) => {
      qc.invalidateQueries({ queryKey: ["project_stages", projectId] });
    },
  });
}
