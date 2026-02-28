import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback } from "react";

interface ColumnLabelRow {
  column_key: string;
  custom_label: string;
  width: number | null;
  sort_order: number;
  display_order: number | null;
  visible: boolean;
}

export function useColumnLabels(tab: string) {
  const qc = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ["column-labels", tab],
    queryFn: async () => {
      const { data, error } = await (supabase.from("column_labels") as any)
        .select("column_key, custom_label, width, sort_order, display_order, visible")
        .eq("tab", tab);
      if (error) throw error;
      return (data || []) as ColumnLabelRow[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — don't refetch on every mount/tab switch
    gcTime: 10 * 60 * 1000,
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
   * Used for within-group ordering in the side panel.
   */
  const getOrderedKeys = useCallback(
    (defaultKeys: string[]): string[] => {
      const orderMap = getOrderMap();
      if (Object.keys(orderMap).length === 0) return defaultKeys;

      return [...defaultKeys].sort((a, b) => {
        const oa = orderMap[a] ?? defaultKeys.indexOf(a) + 10000;
        const ob = orderMap[b] ?? defaultKeys.indexOf(b) + 10000;
        return oa - ob;
      });
    },
    [getOrderMap]
  );

  /** Returns a map of column_key → display_order for all columns that have one */
  const getDisplayOrderMap = useCallback((): Record<string, number> => {
    const map: Record<string, number> = {};
    for (const d of data) {
      if (d.display_order != null) map[d.column_key] = d.display_order;
    }
    return map;
  }, [data]);

  /**
   * Given an array of visible column keys, returns them sorted by persisted display_order.
   * Used for horizontal table rendering order.
   */
  const getDisplayOrderedKeys = useCallback(
    (defaultKeys: string[]): string[] => {
      const orderMap = getDisplayOrderMap();
      if (Object.keys(orderMap).length === 0) return defaultKeys;

      return [...defaultKeys].sort((a, b) => {
        const oa = orderMap[a] ?? defaultKeys.indexOf(a) + 10000;
        const ob = orderMap[b] ?? defaultKeys.indexOf(b) + 10000;
        return oa - ob;
      });
    },
    [getDisplayOrderMap]
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

  /** Persist the group sort order (sort_order column) */
  const updateOrder = useCallback(
    async (orderedKeys: string[]) => {
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

  /** Persist the display order (display_order column) for horizontal table layout */
  const updateDisplayOrder = useCallback(
    async (orderedKeys: string[]) => {
      const promises = orderedKeys.map((key, index) => {
        const existing = data.find((d) => d.column_key === key);
        if (existing) {
          return (supabase.from("column_labels") as any)
            .update({ display_order: index })
            .eq("tab", tab)
            .eq("column_key", key);
        } else {
          return (supabase.from("column_labels") as any).insert({
            tab,
            column_key: key,
            custom_label: "",
            display_order: index,
          });
        }
      });
      await Promise.all(promises);
      await qc.invalidateQueries({ queryKey: ["column-labels", tab] });
    },
    [data, tab, qc]
  );

  /** Returns a map of column_key → visible for all columns that have a DB entry */
  const getVisibilityMap = useCallback((): Record<string, boolean> => {
    const map: Record<string, boolean> = {};
    for (const d of data) {
      map[d.column_key] = d.visible;
    }
    return map;
  }, [data]);

  /** Persist visibility for a single column */
  const updateVisibility = useCallback(
    async (key: string, visible: boolean) => {
      const existing = data.find((d) => d.column_key === key);
      if (existing) {
        await (supabase.from("column_labels") as any)
          .update({ visible })
          .eq("tab", tab)
          .eq("column_key", key);
      } else {
        await (supabase.from("column_labels") as any).insert({
          tab,
          column_key: key,
          custom_label: "",
          visible,
        });
      }
      await qc.invalidateQueries({ queryKey: ["column-labels", tab] });
    },
    [data, tab, qc]
  );

  /** Persist visibility for multiple columns at once */
  const updateVisibilityBatch = useCallback(
    async (visMap: Record<string, boolean>) => {
      const promises = Object.entries(visMap).map(([key, visible]) => {
        const existing = data.find((d) => d.column_key === key);
        if (existing) {
          return (supabase.from("column_labels") as any)
            .update({ visible })
            .eq("tab", tab)
            .eq("column_key", key);
        } else {
          return (supabase.from("column_labels") as any).insert({
            tab,
            column_key: key,
            custom_label: "",
            visible,
          });
        }
      });
      await Promise.all(promises);
      await qc.invalidateQueries({ queryKey: ["column-labels", tab] });
    },
    [data, tab, qc]
  );

  return { getLabel, getWidth, isCustomLabel, updateLabel, updateWidth, getOrderedKeys, updateOrder, getOrderMap, getDisplayOrderedKeys, updateDisplayOrder, getVisibilityMap, updateVisibility, updateVisibilityBatch };
}
