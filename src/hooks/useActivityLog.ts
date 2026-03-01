import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ActivityLogEntry {
  id: string;
  project_id: string;
  user_id: string;
  user_email: string;
  action_type: string;
  old_value: string | null;
  new_value: string | null;
  detail: string | null;
  created_at: string;
}

const PAGE_SIZE = 30;

interface Filters {
  category: "all" | "status" | "terminy" | "documents" | "projects";
  projectId: string | null;
  userEmail: string | null;
}

function getActionTypes(category: Filters["category"]): string[] | null {
  switch (category) {
    case "status": return ["status_change", "konstrukter_change", "stage_status_change", "stage_konstrukter_change"];
    case "terminy": return ["datum_smluvni_change", "stage_datum_smluvni_change"];
    case "documents": return ["document_uploaded", "document_deleted", "stage_document_uploaded", "stage_document_deleted"];
    case "projects": return ["project_created", "project_deleted", "project_restored", "stage_created", "stage_deleted"];
    default: return null;
  }
}

export function useActivityLog(filters: Filters) {
  return useInfiniteQuery({
    queryKey: ["activity-log", filters],
    queryFn: async ({ pageParam = 0 }) => {
      let q = (supabase.from("data_log") as any)
        .select("*")
        .order("created_at", { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      const types = getActionTypes(filters.category);
      if (types) q = q.in("action_type", types);
      if (filters.projectId) q = q.eq("project_id", filters.projectId);
      if (filters.userEmail) q = q.eq("user_email", filters.userEmail);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ActivityLogEntry[];
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.flat().length;
    },
    initialPageParam: 0,
  });
}
