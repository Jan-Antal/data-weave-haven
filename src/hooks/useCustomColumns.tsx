import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import React from "react";

export interface CustomColumnDef {
  id: string;
  table_name: string;
  group_key: string;
  column_key: string;
  label: string;
  data_type: string;
  select_options: string[];
  people_role: string | null;
  sort_order: number;
}

export function useCustomColumns(tableName?: string, groupKey?: string) {
  const qc = useQueryClient();

  const { data: columns = [] } = useQuery({
    queryKey: ["custom-columns", tableName, groupKey],
    queryFn: async () => {
      let query = (supabase.from("custom_column_definitions") as any).select("*");
      if (tableName) query = query.eq("table_name", tableName);
      if (groupKey) query = query.eq("group_key", groupKey);
      query = query.order("sort_order");
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CustomColumnDef[];
    },
  });

  const addColumn = useMutation({
    mutationFn: async (def: {
      table_name: string;
      group_key: string;
      column_key: string;
      label: string;
      data_type: string;
      select_options?: string[];
      people_role?: string;
    }) => {
      const { error } = await (supabase.from("custom_column_definitions") as any).insert({
        ...def,
        select_options: def.select_options || [],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-columns"] });
      toast({ title: "Sloupec přidán" });
    },
    onError: (e: any) => {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    },
  });

  const deleteColumn = useMutation({
    mutationFn: async (id: string) => {
      // Get column_key before deleting
      const { data: colDef } = await (supabase.from("custom_column_definitions") as any)
        .select("column_key")
        .eq("id", id)
        .single();
      const columnKey = colDef?.column_key;

      const { error } = await (supabase.from("custom_column_definitions") as any)
        .delete()
        .eq("id", id);
      if (error) throw error;

      // Clean up column_labels entries for this column
      if (columnKey) {
        await (supabase.from("column_labels") as any)
          .delete()
          .eq("column_key", columnKey);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-columns"] });
      qc.invalidateQueries({ queryKey: ["column-labels"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["tpv-items"] });
      toast({ title: "Sloupec smazán" });
    },
    onError: (e: any) => {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    },
  });

  return { columns, addColumn, deleteColumn };
}

/** All custom columns for a given table, regardless of group */
export function useAllCustomColumns(tableName: string) {
  return useCustomColumns(tableName);
}

/** Mutation to update a single custom field value on a row */
export function useUpdateCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      rowId,
      tableName,
      columnKey,
      value,
      oldValue,
    }: {
      rowId: string;
      tableName: "projects" | "tpv_items";
      columnKey: string;
      value: string;
      oldValue: string;
    }) => {
      const queryTable = tableName === "tpv_items" ? "tpv_items" : "projects";
      const { data: current } = await (supabase.from(queryTable) as any)
        .select("custom_fields")
        .eq("id", rowId)
        .single();
      const fields = { ...(current?.custom_fields || {}) };
      fields[columnKey] = value === "" ? null : value;
      const { error } = await (supabase.from(queryTable) as any)
        .update({ custom_fields: fields })
        .eq("id", rowId);
      if (error) throw error;
      return { rowId, tableName, columnKey, oldValue };
    },
    onSuccess: ({ rowId, tableName, columnKey, oldValue }) => {
      const queryKey = tableName === "tpv_items" ? "tpv-items" : "projects";
      qc.invalidateQueries({ queryKey: [queryKey] });
      toast({
        title: "Uloženo",
        description: "Klikněte pro vrácení změny",
        action: (
          <button
            className="text-xs underline px-2 py-1"
            onClick={async () => {
              const { data: current } = await (supabase.from(tableName) as any)
                .select("custom_fields")
                .eq("id", rowId)
                .single();
              const fields = { ...(current?.custom_fields || {}) };
              fields[columnKey] = oldValue === "" ? null : oldValue;
              await (supabase.from(tableName) as any)
                .update({ custom_fields: fields })
                .eq("id", rowId);
              qc.invalidateQueries({ queryKey: [queryKey] });
            }}
          >
            Undo
          </button>
        ) as any,
      });
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nepodařilo se uložit", variant: "destructive" });
    },
  });
}
