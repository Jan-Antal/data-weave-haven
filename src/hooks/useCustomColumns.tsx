import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUndoRedo } from "@/hooks/useUndoRedo";
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
      sort_order?: number;
    }) => {
      const { sort_order, ...rest } = def;
      const { error } = await (supabase.from("custom_column_definitions") as any).insert({
        ...rest,
        select_options: rest.select_options || [],
        sort_order: sort_order ?? 0,
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
      const { data: colDef } = await (supabase.from("custom_column_definitions") as any)
        .select("column_key")
        .eq("id", id)
        .single();
      const columnKey = colDef?.column_key;

      const { error } = await (supabase.from("custom_column_definitions") as any)
        .delete()
        .eq("id", id);
      if (error) throw error;

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
  const { pushUndo } = useUndoRedo();

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
      return { rowId, tableName, columnKey, value, oldValue };
    },
    onSuccess: ({ rowId, tableName, columnKey, value, oldValue }) => {
      const queryKey = tableName === "tpv_items" ? "tpv-items" : "projects";
      qc.invalidateQueries({ queryKey: [queryKey] });
      // Also invalidate the query key format used by tpv_items hook
      if (tableName === "tpv_items") {
        qc.invalidateQueries({ queryKey: ["tpv_items"] });
      }

      const page = tableName === "tpv_items" ? "tpv-list" : "project-table";
      pushUndo({
        page: page as any,
        actionType: "custom_field_edit",
        description: `Úprava vlastního pole`,
        undo: async () => {
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
          if (tableName === "tpv_items") qc.invalidateQueries({ queryKey: ["tpv_items"] });
        },
        redo: async () => {
          const { data: current } = await (supabase.from(tableName) as any)
            .select("custom_fields")
            .eq("id", rowId)
            .single();
          const fields = { ...(current?.custom_fields || {}) };
          fields[columnKey] = value === "" ? null : value;
          await (supabase.from(tableName) as any)
            .update({ custom_fields: fields })
            .eq("id", rowId);
          qc.invalidateQueries({ queryKey: [queryKey] });
          if (tableName === "tpv_items") qc.invalidateQueries({ queryKey: ["tpv_items"] });
        },
      });

      toast({ title: "Uloženo", duration: 2000 });
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nepodařilo se uložit", variant: "destructive" });
    },
  });
}
