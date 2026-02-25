import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

// Global event bus so ProjectEditDialog can notify the table
const DOC_COUNT_EVENT = "doc-count-updated";

export function dispatchDocCountUpdate(projectId: string, delta: number) {
  window.dispatchEvent(new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId, delta } }));
}

export function useDocumentCounts(projectIds: string[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const fetchCounts = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("sharepoint-documents", {
        body: { action: "count", projectIds: ids },
      });
      if (!error && data?.counts) {
        setCounts(data.counts);
      }
    } catch (err) {
      console.error("Doc count fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (projectIds.length > 0 && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchCounts(projectIds);
    }
  }, [projectIds, fetchCounts]);

  // Reset when project list changes significantly
  useEffect(() => {
    fetchedRef.current = false;
  }, [projectIds.length]);

  // Listen for upload events from the edit dialog
  useEffect(() => {
    const handler = (e: Event) => {
      const { projectId, delta } = (e as CustomEvent).detail;
      setCounts((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] ?? 0) + delta,
      }));
    };
    window.addEventListener(DOC_COUNT_EVENT, handler);
    return () => window.removeEventListener(DOC_COUNT_EVENT, handler);
  }, []);

  return { counts, loading };
}
