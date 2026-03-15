import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";

export type Project = Tables<"projects">;

export function useProjects() {
  const { isTester } = useAuth();
  return useQuery({
    queryKey: ["projects", isTester],
    queryFn: async () => {
      let query = supabase
        .from("projects")
        .select("*")
        .is("deleted_at", null);
      if (isTester) {
        query = query.eq("is_test", true);
      }
      const { data, error } = await query.order("project_id");
      if (error) throw error;
      return data as Project[];
    },
  });
}
