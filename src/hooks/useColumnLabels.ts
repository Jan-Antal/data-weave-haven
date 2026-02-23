import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ColumnLabel {
  id: string;
  tab: string;
  column_key: string;
  custom_label: string;
}

export function useColumnLabels(tab: string) {
  const qc = useQueryClient();

  const { data: labels = [] } = useQuery<ColumnLabel[]>({
    queryKey: ["column_labels", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("column_labels" as any)
        .select("*")
        .eq("tab", tab);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const labelMap = new Map(labels.map((l) => [l.column_key, l.custom_label]));

  const getLabel = (columnKey: string, defaultLabel: string): string => {
    return labelMap.get(columnKey) || defaultLabel;
  };

  const isCustom = (columnKey: string): boolean => {
    return labelMap.has(columnKey);
  };

  const updateLabel = useMutation({
    mutationFn: async ({ columnKey, label }: { columnKey: string; label: string }) => {
      const { error } = await supabase
        .from("column_labels" as any)
        .upsert(
          { tab, column_key: columnKey, custom_label: label, updated_at: new Date().toISOString() },
          { onConflict: "tab,column_key" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["column_labels", tab] });
      toast({ title: "Sloupec přejmenován" });
    },
    onError: (e: any) => {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    },
  });

  const resetLabel = useMutation({
    mutationFn: async ({ columnKey }: { columnKey: string }) => {
      const { error } = await supabase
        .from("column_labels" as any)
        .delete()
        .eq("tab", tab)
        .eq("column_key", columnKey);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["column_labels", tab] });
      toast({ title: "Název obnoven" });
    },
    onError: (e: any) => {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    },
  });

  return { getLabel, isCustom, updateLabel, resetLabel };
}
