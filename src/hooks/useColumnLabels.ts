import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback } from "react";

interface ColumnLabelRow {
  column_key: string;
  custom_label: string;
  width: number | null;
  sort_order: number;
}

export function useColumnLabels(tab: string) {
  const qc = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ["column-labels", tab],
    queryFn: async () => {
      const { data, error } = await (supabase.from("column_labels") as any)
        .select("column_key, custom_label, width, sort_order")
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

  /** Returns a map of column_key → sort_order for all columns that have a saved order */
  const getOrderMap = useCallback((): Record<string, number> => {
    const map: Record<string, number> = {};
    for (const d of data) {
      if (d.sort_order != null) map[d.column_key] = d.sort_order;
    }
    return map;
  }, [data]);

  /**
   * Given the default column key array, returns it sorted by the persisted sort_order.
   * Columns without a saved order keep their original relative position.
   */
  const getOrderedKeys = useCallback(
    (defaultKeys: string[]): string[] => {
      const orderMap = getOrderMap();
      if (Object.keys(orderMap).length === 0) return defaultKeys;

      // Assign each key a sort value: saved order, or its default index + 10000 to keep it at the end
      return [...defaultKeys].sort((a, b) => {
        const oa = orderMap[a] ?? defaultKeys.indexOf(a) + 10000;
        const ob = orderMap[b] ?? defaultKeys.indexOf(b) + 10000;
        return oa - ob;
      });
    },
    [getOrderMap]
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

  /** Persist the column order for an array of keys (0-based index = sort_order) */
  const updateOrder = useCallback(
    async (orderedKeys: string[]) => {
      // Upsert each key with its sort_order
      const promises = orderedKeys.map((key, index) => {
        const existing = data.find((d) => d.column_key === key);
        if (existing) {
          return (supabase.from("column_labels") as any)
            .update({ sort_order: index })
            .eq("tab", tab)
            .eq("column_key", key);
        } else {
          return (supabase.from("column_labels") as any).insert({
            tab,
            column_key: key,
            custom_label: "",
            sort_order: index,
          });
        }
      });
      await Promise.all(promises);
      await qc.invalidateQueries({ queryKey: ["column-labels", tab] });
    },
    [data, tab, qc]
  );

  return { getLabel, getWidth, isCustomLabel, updateLabel, updateWidth, getOrderedKeys, updateOrder, getOrderMap };
}
