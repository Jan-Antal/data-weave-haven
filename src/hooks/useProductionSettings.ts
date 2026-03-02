import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProductionSettings {
  id: string;
  weekly_capacity_hours: number;
  monthly_capacity_hours: number;
  hourly_rate: number;
  updated_at: string;
  updated_by: string | null;
}

export function useProductionSettings() {
  return useQuery({
    queryKey: ["production-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_settings")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data as ProductionSettings;
    },
  });
}

export function useUpdateProductionSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<Pick<ProductionSettings, "weekly_capacity_hours" | "monthly_capacity_hours" | "hourly_rate">>) => {
      const { data: settings } = await supabase
        .from("production_settings")
        .select("id")
        .limit(1)
        .single();
      if (!settings) throw new Error("No production settings found");
      const { error } = await supabase
        .from("production_settings")
        .update(updates as any)
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production-settings"] }),
  });
}
