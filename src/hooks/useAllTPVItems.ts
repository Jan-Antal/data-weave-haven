import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TPVItem } from "./useTPVItems";
import { useMemo } from "react";

/** Fetch ALL non-deleted tpv_items in a single query, group by project_id */
export function useAllTPVItems() {
  const query = useQuery({
    queryKey: ["all_tpv_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tpv_items")
        .select("*")
        .is("deleted_at", null)
        .order("created_at");
      if (error) throw error;
      return data as TPVItem[];
    },
  });

  const itemsByProject = useMemo(() => {
    const map = new Map<string, TPVItem[]>();
    if (query.data) {
      for (const item of query.data) {
        const arr = map.get(item.project_id);
        if (arr) arr.push(item);
        else map.set(item.project_id, [item]);
      }
    }
    return map;
  }, [query.data]);

  return { ...query, itemsByProject };
}
