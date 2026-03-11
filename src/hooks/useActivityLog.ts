import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
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

export type DateRange = "today" | "yesterday" | "7d" | "30d" | "all";

interface Filters {
  category: "all" | "status" | "terminy" | "documents" | "projects" | "users" | "vyroba";
  projectId: string | null;
  userEmail: string | null;
  dateRange?: DateRange;
  enabled?: boolean;
}

function getActionTypes(category: Filters["category"]): string[] | null {
  switch (category) {
    case "status": return ["status_change", "konstrukter_change", "stage_status_change", "stage_konstrukter_change"];
    case "terminy": return ["datum_smluvni_change", "stage_datum_smluvni_change"];
    case "documents": return ["document_uploaded", "document_deleted", "stage_document_uploaded", "stage_document_deleted"];
    case "projects": return ["project_created", "project_deleted", "project_restored", "stage_created", "stage_deleted"];
    case "users": return ["user_login", "session_end"];
    case "vyroba": return ["item_scheduled", "item_moved", "item_completed", "item_paused", "item_cancelled", "item_returned_to_inbox", "item_split"];
    default: return null;
  }
}

function getDateCutoff(range: DateRange | undefined): string | null {
  if (!range || range === "all") return null;
  const now = new Date();
  switch (range) {
    case "today": {
      const d = new Date(now); d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case "yesterday": {
      const d = new Date(now); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case "7d": {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    case "30d": {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      return d.toISOString();
    }
    default: return null;
  }
}

export function useActivityLog(filters: Filters) {
  return useInfiniteQuery({
    queryKey: ["activity-log", filters.category, filters.projectId, filters.userEmail, filters.dateRange],
    queryFn: async ({ pageParam = 0 }) => {
      let q = (supabase.from("data_log") as any)
        .select("*")
        .order("created_at", { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      const types = getActionTypes(filters.category);
      if (types) q = q.in("action_type", types);
      else q = q.neq("action_type", "user_session");
      if (filters.projectId) q = q.eq("project_id", filters.projectId);
      if (filters.userEmail) q = q.eq("user_email", filters.userEmail);

      const cutoff = getDateCutoff(filters.dateRange);
      if (cutoff) q = q.gte("created_at", cutoff);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ActivityLogEntry[];
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.flat().length;
    },
    initialPageParam: 0,
    enabled: filters.enabled !== false,
  });
}

/** Fetch distinct user emails from data_log for filter dropdown */
export function useActivityLogUsers() {
  return useQuery({
    queryKey: ["activity-log-users"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("data_log") as any)
        .select("user_email")
        .neq("action_type", "user_session")
        .neq("user_email", "")
        .order("user_email");
      if (error) throw error;
      const unique = [...new Set((data as { user_email: string }[]).map(r => r.user_email))].sort();
      return unique;
    },
    staleTime: 5 * 60 * 1000,
  });
}
