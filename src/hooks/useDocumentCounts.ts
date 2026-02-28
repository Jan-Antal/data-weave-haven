import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

// Global event bus so ProjectEditDialog can notify the table
const DOC_COUNT_EVENT = "doc-count-updated";

// Global cache — persists across component remounts
const globalCountCache: Record<string, number> = {};
let globalFetchPromise: Promise<void> | null = null;

export function dispatchDocCountUpdate(projectId: string, delta: number) {
  // Update global cache too
  globalCountCache[projectId] = (globalCountCache[projectId] ?? 0) + delta;
  window.dispatchEvent(new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId, delta } }));
}

export function useDocumentCounts(projectIds: string[]) {
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    // Initialize from global cache
    const cached: Record<string, number> = {};
    for (const id of projectIds) {
      if (id in globalCountCache) cached[id] = globalCountCache[id];
    }
    return cached;
  });
  const [loading, setLoading] = useState(false);
  const lastFetchedIdsRef = useRef<string>("");

  const fetchCounts = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    
    // Deduplicate: skip if we already have all ids cached
    const uncachedIds = ids.filter((id) => !(id in globalCountCache));
    if (uncachedIds.length === 0) {
      // All cached, just update state
      const cached: Record<string, number> = {};
      for (const id of ids) cached[id] = globalCountCache[id] ?? 0;
      setCounts(cached);
      return;
    }

    setLoading(true);
    try {
      // Use a shared promise to avoid duplicate parallel fetches
      if (!globalFetchPromise) {
        globalFetchPromise = (async () => {
          const { data, error } = await supabase.functions.invoke("sharepoint-documents", {
            body: { action: "count", projectIds: ids },
          });
          if (!error && data?.counts) {
            Object.assign(globalCountCache, data.counts);
          }
        })();
      }
      await globalFetchPromise;
      globalFetchPromise = null;

      const result: Record<string, number> = {};
      for (const id of ids) result[id] = globalCountCache[id] ?? 0;
      setCounts(result);
    } catch (err) {
      console.error("Doc count fetch error:", err);
      globalFetchPromise = null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const idsKey = projectIds.slice().sort().join(",");
    if (idsKey === lastFetchedIdsRef.current || projectIds.length === 0) return;
    lastFetchedIdsRef.current = idsKey;
    fetchCounts(projectIds);
  }, [projectIds, fetchCounts]);

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
