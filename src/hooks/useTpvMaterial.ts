import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

export type TpvMaterial = Tables<"tpv_material">;

export function useTpvMaterialAll() {
  return useQuery({
    queryKey: ["tpv_material_all"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("tpv_material").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as TpvMaterial[];
    },
  });
}

export function useTpvMaterialForProject(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ["tpv_material", projectId],
    enabled: !!projectId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tpv_material")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as TpvMaterial[];
    },
  });
}

export function useInsertTpvMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tpv_item_id: string;
      project_id: string;
      nazov: string;
      mnozstvo?: number | null;
      jednotka?: string | null;
      dodavatel?: string | null;
      stav?: TpvMaterial["stav"];
    }) => {
      const { data, error } = await supabase.from("tpv_material").insert(input).select().single();
      if (error) throw error;
      return data as TpvMaterial;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tpv_material", v.project_id] });
      qc.invalidateQueries({ queryKey: ["tpv_material_all"] });
    },
    onError: (err: Error) => {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateTpvMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; project_id: string; patch: Partial<TpvMaterial> }) => {
      const { error } = await supabase.from("tpv_material").update(input.patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tpv_material", v.project_id] });
      qc.invalidateQueries({ queryKey: ["tpv_material_all"] });
    },
    onError: (err: Error) => {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteTpvMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; project_id: string }) => {
      const { error } = await supabase.from("tpv_material").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tpv_material", v.project_id] });
      qc.invalidateQueries({ queryKey: ["tpv_material_all"] });
    },
  });
}
