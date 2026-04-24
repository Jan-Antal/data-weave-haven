import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type TpvHoursAllocationStav = "draft" | "submitted" | "approved" | "returned";

export interface TpvHoursAllocationRow {
  id: string;
  project_id: string;
  tpv_item_id: string;
  hodiny_navrh: number | null;
  stav: TpvHoursAllocationStav;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  return_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useTpvHoursAllocations(projectId: string | undefined) {
  return useQuery({
    queryKey: ["tpv_hours_allocation", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<TpvHoursAllocationRow[]> => {
      const { data, error } = await (supabase as any)
        .from("tpv_hours_allocation")
        .select("*")
        .eq("project_id", projectId);
      if (error) throw error;
      return (data ?? []) as TpvHoursAllocationRow[];
    },
  });
}

interface SubmitArgs {
  projectId: string;
  items: Array<{ tpv_item_id: string; hodiny_navrh: number }>;
  notes?: string;
}

export function useSubmitHoursAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, items, notes }: SubmitArgs) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;
      const now = new Date().toISOString();

      // Upsert per tpv_item_id (unique by project_id + tpv_item_id)
      const rows = items.map((it) => ({
        project_id: projectId,
        tpv_item_id: it.tpv_item_id,
        hodiny_navrh: it.hodiny_navrh,
        stav: "submitted" as const,
        submitted_by: userId,
        submitted_at: now,
        notes: notes ?? null,
      }));

      const { error } = await (supabase as any)
        .from("tpv_hours_allocation")
        .upsert(rows, { onConflict: "project_id,tpv_item_id" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["tpv_hours_allocation", vars.projectId] });
      toast({ title: "Návrh hodín odoslaný na schválenie" });
    },
    onError: (e: any) => {
      toast({ title: "Chyba pri odoslaní", description: e.message, variant: "destructive" });
    },
  });
}

export function useApproveHoursAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;
      const { error } = await (supabase as any)
        .from("tpv_hours_allocation")
        .update({
          stav: "approved",
          approved_by: userId,
          approved_at: new Date().toISOString(),
          return_reason: null,
        })
        .eq("project_id", projectId)
        .eq("stav", "submitted");
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["tpv_hours_allocation", vars.projectId] });
      toast({ title: "Hodiny schválené" });
    },
    onError: (e: any) => {
      toast({ title: "Chyba pri schválení", description: e.message, variant: "destructive" });
    },
  });
}

export function useReturnHoursAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, reason }: { projectId: string; reason: string }) => {
      const { error } = await (supabase as any)
        .from("tpv_hours_allocation")
        .update({
          stav: "returned",
          return_reason: reason,
        })
        .eq("project_id", projectId)
        .eq("stav", "submitted");
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["tpv_hours_allocation", vars.projectId] });
      toast({ title: "Vrátené k prepracovaniu" });
    },
    onError: (e: any) => {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    },
  });
}

/** Aggregate state for project: derived from row stavs. */
export function deriveProjectAllocationStav(rows: TpvHoursAllocationRow[]): TpvHoursAllocationStav {
  if (rows.length === 0) return "draft";
  if (rows.some((r) => r.stav === "returned")) return "returned";
  if (rows.every((r) => r.stav === "approved")) return "approved";
  if (rows.some((r) => r.stav === "submitted")) return "submitted";
  return "draft";
}
