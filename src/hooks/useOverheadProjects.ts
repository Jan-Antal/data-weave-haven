import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OverheadProject {
  id: string;
  project_code: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useOverheadProjects() {
  return useQuery({
    queryKey: ["overhead-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("overhead_projects" as any)
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as OverheadProject[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertOverheadProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<OverheadProject> & { project_code: string; label: string }) => {
      const payload: any = {
        project_code: input.project_code.trim(),
        label: input.label.trim(),
        description: input.description ?? null,
        sort_order: input.sort_order ?? 0,
        is_active: input.is_active ?? true,
      };
      if (input.id) payload.id = input.id;
      const { error } = await (supabase.from("overhead_projects" as any) as any).upsert(payload, {
        onConflict: "id",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overhead-projects"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      toast.success("Uloženo");
    },
    onError: (e: any) => toast.error("Chyba: " + (e.message || "neznámá")),
  });
}

export function useDeleteOverheadProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("overhead_projects" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overhead-projects"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      toast.success("Smazáno");
    },
    onError: (e: any) => toast.error("Chyba: " + (e.message || "neznámá")),
  });
}
