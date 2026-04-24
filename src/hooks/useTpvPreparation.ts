import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

export type TpvPreparation = Tables<"tpv_preparation">;

export function useTpvPreparationAll() {
  return useQuery({
    queryKey: ["tpv_preparation_all"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("tpv_preparation").select("*");
      if (error) throw error;
      return (data ?? []) as TpvPreparation[];
    },
  });
}

export function useTpvPreparationForProject(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ["tpv_preparation", projectId],
    enabled: !!projectId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tpv_preparation")
        .select("*")
        .eq("project_id", projectId!);
      if (error) throw error;
      return (data ?? []) as TpvPreparation[];
    },
  });
}

export function useUpsertTpvPreparation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tpv_item_id: string;
      project_id: string;
      patch: Partial<Omit<TpvPreparation, "id" | "tpv_item_id" | "project_id" | "created_at" | "updated_at">>;
    }) => {
      const { data, error } = await supabase
        .from("tpv_preparation")
        .upsert(
          { tpv_item_id: input.tpv_item_id, project_id: input.project_id, ...input.patch },
          { onConflict: "tpv_item_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data as TpvPreparation;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["tpv_preparation", vars.project_id] });
      qc.invalidateQueries({ queryKey: ["tpv_preparation_all"] });
    },
    onError: (err: Error) => {
      toast({ title: "Chyba ukladania", description: err.message, variant: "destructive" });
    },
  });
}

export function useApproveAllHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, items }: { projectId: string; items: { tpv_item_id: string }[] }) => {
      // Upsert one row per item with hodiny_schvalene = true
      const rows = items.map((i) => ({
        tpv_item_id: i.tpv_item_id,
        project_id: projectId,
        hodiny_schvalene: true,
      }));
      const { error } = await supabase.from("tpv_preparation").upsert(rows, { onConflict: "tpv_item_id" });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tpv_preparation", v.projectId] });
      qc.invalidateQueries({ queryKey: ["tpv_preparation_all"] });
      toast({ title: "Hodiny schválené" });
    },
  });
}
