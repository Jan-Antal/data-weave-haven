/**
 * Hook for the Dodávatelia tab supplier list.
 * Lives separately from hooks.ts to avoid cluttering the CRM hook file.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import type { TpvSupplierRow } from "../shared/types";

interface SuppliersListOptions {
  onlyActive?: boolean;
}

export function useSupabaseSuppliersList(opts: SuppliersListOptions = {}) {
  const { onlyActive = true } = opts;
  return useQuery({
    queryKey: ["tpv", "suppliers", "list", { onlyActive }],
    queryFn: async (): Promise<TpvSupplierRow[]> => {
      let q = supabase
        .from("tpv_supplier")
        .select("*")
        .order("nazov", { ascending: true });
      if (onlyActive) {
        q = q.eq("is_active", true);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TpvSupplierRow[];
    },
  });
}
