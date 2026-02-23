import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback } from "react";

interface ColumnLabelRow {
  column_key: string;
  custom_label: string;
  width: number | null;
}

export function useColumnLabels(tab: string) {
  const qc = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ["column-labels", tab],
    queryFn: async () => {
      const { data, error } = await (supabase.from("column_labels") as any)
        .select("column_key, custom_label, width")
        .eq("tab", tab);
      if (error) throw error;
      return (data || []) as ColumnLabelRow[];
    },
  });

  const getLabel = useCallback(
    (key: string, defaultLabel: string) => {
      const found = data.find((d) => d.column_key === key);
      return found?.custom_label || defaultLabel;
    },
    [data]
  );

  const getWidth = useCallback(
    (key: string): number | null => {
      const found = data.find((d) => d.column_key === key);
      return found?.width ?? null;
    },
    [data]
  );

  const isCustomLabel = useCallback(
    (key: string) => {
      const found = data.find((d) => d.column_key === key);
      return !!(found?.custom_label);
    },
    [data]
  );

  const updateLabel = useCallback(
    async (key: string, label: string) => {
      const existing = data.find((d) => d.column_key === key);
      if (existing) {
        await (supabase.from("column_labels") as any)
          .update({ custom_label: label })
          .eq("tab", tab)
          .eq("column_key", key);
      } else {
        await (supabase.from("column_labels") as any).insert({
          tab,
          column_key: key,
          custom_label: label,
        });
      }
      qc.invalidateQueries({ queryKey: ["column-labels", tab] });
    },
    [data, tab, qc]
  );

  const updateWidth = useCallback(
    async (key: string, width: number) => {
      const existing = data.find((d) => d.column_key === key);
      if (existing) {
        await (supabase.from("column_labels") as any)
          .update({ width })
          .eq("tab", tab)
          .eq("column_key", key);
      } else {
        await (supabase.from("column_labels") as any).insert({
          tab,
          column_key: key,
          custom_label: "",
          width,
        });
      }
      qc.invalidateQueries({ queryKey: ["column-labels", tab] });
    },
    [data, tab, qc]
  );

  return { getLabel, getWidth, isCustomLabel, updateLabel, updateWidth };
}
