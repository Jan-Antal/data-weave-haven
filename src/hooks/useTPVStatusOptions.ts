import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface TPVStatusOption {
  id: string;
  label: string;
  sort_order: number;
  created_at: string;
}

export function useTPVStatusOptions() {
  return useQuery({
    queryKey: ["tpv_status_options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tpv_status_options" as any)
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as unknown as TPVStatusOption[];
    },
  });
}

export function useAddTPVStatusOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ label, sort_order }: { label: string; sort_order: number }) => {
      const { error } = await supabase.from("tpv_status_options" as any).insert({ label, sort_order } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tpv_status_options"] });
      toast({ title: "Status přidán" });
    },
  });
}

export function useUpdateTPVStatusOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await supabase.from("tpv_status_options" as any).update({ label } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tpv_status_options"] });
    },
  });
}

export function useDeleteTPVStatusOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tpv_status_options" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tpv_status_options"] });
      toast({ title: "Status smazán" });
    },
  });
}
