import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CostBreakdownPreset {
  id: string;
  name: string;
  description: string | null;
  material_pct: number;
  overhead_pct: number;
  doprava_pct: number;
  production_pct: number;
  subcontractors_pct: number;
  montaz_pct: number;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export function useCostBreakdownPresets() {
  return useQuery({
    queryKey: ["cost-breakdown-presets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_breakdown_presets")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as CostBreakdownPreset[];
    },
  });
}

export function useUpsertPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (preset: Partial<CostBreakdownPreset> & { id?: string }) => {
      if (preset.id) {
        const { id, created_at, created_by, ...rest } = preset as any;
        const { error } = await supabase
          .from("cost_breakdown_presets")
          .update(rest)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { id, ...rest } = preset as any;
        const { error } = await supabase
          .from("cost_breakdown_presets")
          .insert(rest);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cost-breakdown-presets"] }),
  });
}

export function useDeletePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cost_breakdown_presets")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cost-breakdown-presets"] }),
  });
}

export function useSetDefaultPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Unset all defaults first
      await supabase
        .from("cost_breakdown_presets")
        .update({ is_default: false } as any)
        .neq("id", id);
      // Set the new default
      const { error } = await supabase
        .from("cost_breakdown_presets")
        .update({ is_default: true } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cost-breakdown-presets"] }),
  });
}
