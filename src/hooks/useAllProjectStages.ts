import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProjectStage } from "./useProjectStages";

export function useAllProjectStages() {
  return useQuery({
    queryKey: ["all_project_stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_stages")
        .select("*")
        .is("deleted_at", null)
        .order("stage_order");
      if (error) throw error;
      return data as ProjectStage[];
    },
  });
}

/** Group stages by project_id for quick lookup — memoized */
export function useStagesByProject() {
  const query = useAllProjectStages();

  const stagesByProject = useMemo(() => {
    const map = new Map<string, ProjectStage[]>();
    if (query.data) {
      for (const s of query.data) {
        const arr = map.get(s.project_id);
        if (arr) {
          arr.push(s);
        } else {
          map.set(s.project_id, [s]);
        }
      }
    }
    return map;
  }, [query.data]);

  return { ...query, stagesByProject };
}
