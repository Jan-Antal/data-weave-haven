import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import type { Tables } from "@/integrations/supabase/types";

export type TPVItem = Tables<"tpv_items"> & { konstrukter?: string | null; nazev_prvku?: string | null };

export function useTPVItems(projectId: string) {
  return useQuery({
    queryKey: ["tpv_items", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tpv_items")
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("created_at");
      if (error) throw error;
      return data as TPVItem[];
    },
    enabled: !!projectId,
  });
}

export function useUpdateTPVItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, field, value, oldValue }: { id: string; field: string; value: any; projectId: string; oldValue?: string }) => {
      const { error } = await supabase.from("tpv_items").update({ [field]: value } as any).eq("id", id);
      if (error) throw error;
      return { id, field, oldValue };
    },
    onSuccess: (result, { projectId }) => {
      qc.invalidateQueries({ queryKey: ["tpv_items", projectId] });
      const { id, field, oldValue } = result;

      if (oldValue !== undefined) {
        const { dismiss } = toast({
          title: "Uloženo",
          action: (
            <ToastAction altText="Zpět" onClick={() => {
              supabase.from("tpv_items").update({ [field]: oldValue } as any).eq("id", id).then(() => {
                qc.invalidateQueries({ queryKey: ["tpv_items", projectId] });
                toast({ title: "Vráceno zpět" });
              });
              dismiss();
            }}>
              Zpět
            </ToastAction>
          ),
        });
        setTimeout(() => dismiss(), 5000);
      } else {
        toast({ title: "Uloženo" });
      }
    },
    onError: () => {
      toast({ title: "Chyba", variant: "destructive" });
    },
  });
}

export function useAddTPVItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: { project_id: string; item_name: string; item_type?: string; status?: string; sent_date?: string; accepted_date?: string; notes?: string }) => {
      const { error } = await supabase.from("tpv_items").insert(item);
      if (error) throw error;
    },
    onSuccess: (_, { project_id }) => {
      qc.invalidateQueries({ queryKey: ["tpv_items", project_id] });
      toast({ title: "Položka přidána" });
    },
    onError: () => {
      toast({ title: "Chyba", variant: "destructive" });
    },
  });
}

export function useDeleteTPVItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, projectId }: { ids: string[]; projectId: string }) => {
      const { error } = await supabase.from("tpv_items").update({ deleted_at: new Date().toISOString() } as any).in("id", ids);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (projectId) => {
      qc.invalidateQueries({ queryKey: ["tpv_items", projectId] });
      toast({ title: "Smazáno" });
    },
  });
}

export function useBulkUpdateTPVStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, status, projectId }: { ids: string[]; status: string; projectId: string }) => {
      const { error } = await supabase.from("tpv_items").update({ status }).in("id", ids);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (projectId) => {
      qc.invalidateQueries({ queryKey: ["tpv_items", projectId] });
      toast({ title: "Status aktualizován" });
    },
  });
}

export function useBulkInsertTPVItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ items, projectId }: { items: { project_id: string; item_name: string; item_type?: string; status?: string; sent_date?: string; accepted_date?: string; notes?: string }[]; projectId: string }) => {
      const { error } = await supabase.from("tpv_items").insert(items);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (projectId) => {
      qc.invalidateQueries({ queryKey: ["tpv_items", projectId] });
      toast({ title: "Import dokončen" });
    },
  });
}
