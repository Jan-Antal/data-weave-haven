import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";

export type Project = Tables<"projects">;

export function useProjects() {
  const { role } = useAuth();
  const isTester = role === "tester";

  return useQuery({
    queryKey: ["projects", isTester],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("projects")
        .select("*")
        .is("deleted_at", null)
        .order("project_id");
      if (isTester) {
        query = query.eq("is_test", true);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as Project[];
    },
  });
}
