import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ProjectStatusOption {
  id: string;
  label: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export function useProjectStatusOptions() {
  return useQuery({
    queryKey: ["project_status_options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_status_options" as any)
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as unknown as ProjectStatusOption[];
    },
  });
}

export function useAddProjectStatusOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ label, color, sort_order }: { label: string; color: string; sort_order: number }) => {
      const { error } = await supabase.from("project_status_options" as any).insert({ label, color, sort_order } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_status_options"] });
      toast({ title: "Status přidán" });
    },
  });
}

export function useUpdateProjectStatusOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string; label?: string; color?: string; sort_order?: number }) => {
      const { error } = await supabase.from("project_status_options" as any).update(fields as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_status_options"] });
    },
  });
}

export function useDeleteProjectStatusOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_status_options" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_status_options"] });
      toast({ title: "Status smazán" });
    },
  });
}

export function useReorderProjectStatusOptions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: { id: string; sort_order: number }[]) => {
      for (const item of items) {
        await supabase.from("project_status_options" as any).update({ sort_order: item.sort_order } as any).eq("id", item.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_status_options"] });
    },
  });
}
