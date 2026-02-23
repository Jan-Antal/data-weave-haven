import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useProjectIdCheck(excludeId?: string) {
  const [idExists, setIdExists] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkProjectId = useCallback(async (projectId: string) => {
    if (!projectId.trim()) {
      setIdExists(false);
      return;
    }
    setChecking(true);
    const query = supabase
      .from("projects")
      .select("id")
      .eq("project_id", projectId.trim())
      .is("deleted_at", null)
      .limit(1);

    const { data } = await query;
    const exists = (data ?? []).filter(row => !excludeId || row.id !== excludeId).length > 0;
    setIdExists(exists);
    setChecking(false);
  }, [excludeId]);

  const reset = useCallback(() => setIdExists(false), []);

  return { idExists, checking, checkProjectId, reset };
}
