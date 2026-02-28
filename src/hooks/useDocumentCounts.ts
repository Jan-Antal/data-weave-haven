import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

// Global event bus so ProjectEditDialog can notify the table
const DOC_COUNT_EVENT = "doc-count-updated";

// In-memory cache (Layer 2) — persists across component remounts within session
const memoryCache: Record<string, number> = {};
let memoryCacheLoaded = false;
let backgroundRefreshScheduled = false;

export function dispatchDocCountUpdate(projectId: string, delta: number) {
  memoryCache[projectId] = (memoryCache[projectId] ?? 0) + delta;
  // Also update Supabase cache in background
  updateSupabaseCacheForProject(projectId, delta);
  window.dispatchEvent(new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId, delta } }));
}

async function updateSupabaseCacheForProject(projectId: string, delta: number) {
  try {
    const { data } = await supabase
      .from("sharepoint_document_cache")
      .select("total_count")
      .eq("project_id", projectId)
      .maybeSingle();
    const newTotal = Math.max(0, (data?.total_count ?? 0) + delta);
    await supabase
      .from("sharepoint_document_cache")
      .upsert({ project_id: projectId, total_count: newTotal, updated_at: new Date().toISOString() }, { onConflict: "project_id" });
  } catch { /* ignore cache update errors */ }
}

export function useDocumentCounts(projectIds: string[]) {
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    // Initialize from memory cache
    const cached: Record<string, number> = {};
    for (const id of projectIds) {
      if (id in memoryCache) cached[id] = memoryCache[id];
    }
    return cached;
  });
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  // Step 1: Load from Supabase cache table (instant, persistent)
  const loadFromSupabaseCache = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const { data } = await supabase
        .from("sharepoint_document_cache")
        .select("project_id, total_count")
        .in("project_id", ids);
      if (data && data.length > 0) {
        const result: Record<string, number> = {};
        for (const row of data) {
          memoryCache[row.project_id] = row.total_count;
          result[row.project_id] = row.total_count;
        }
        if (mountedRef.current) {
          setCounts(prev => ({ ...prev, ...result }));
        }
      }
    } catch (err) {
      console.error("Failed to load doc cache from DB:", err);
    }
  }, []);

  // Step 2: Background refresh from SharePoint edge function
  const backgroundRefreshFromSharePoint = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const { data, error } = await supabase.functions.invoke("sharepoint-documents", {
        body: { action: "count", projectIds: ids },
      });
      if (error || !data?.counts) return;

      const newCounts = data.counts as Record<string, number>;
      const updates: Record<string, number> = {};
      const upsertRows: { project_id: string; total_count: number; updated_at: string }[] = [];

      for (const [pid, count] of Object.entries(newCounts)) {
        memoryCache[pid] = count;
        updates[pid] = count;
        upsertRows.push({
          project_id: pid,
          total_count: count,
          updated_at: new Date().toISOString(),
        });
      }

      if (mountedRef.current) {
        setCounts(prev => ({ ...prev, ...updates }));
      }

      // Persist to Supabase cache in batches
      if (upsertRows.length > 0) {
        await supabase
          .from("sharepoint_document_cache")
          .upsert(upsertRows, { onConflict: "project_id" });
      }
    } catch (err) {
      console.error("Background SharePoint refresh error:", err);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Main effect: load cache then schedule background refresh
  useEffect(() => {
    if (projectIds.length === 0) return;

    // Always sync from memory cache first
    const fromMemory: Record<string, number> = {};
    let hasAll = true;
    for (const id of projectIds) {
      if (id in memoryCache) {
        fromMemory[id] = memoryCache[id];
      } else {
        hasAll = false;
      }
    }
    if (Object.keys(fromMemory).length > 0) {
      setCounts(prev => ({ ...prev, ...fromMemory }));
    }

    // Load from Supabase cache if not all in memory yet
    if (!memoryCacheLoaded) {
      memoryCacheLoaded = true;
      setLoading(true);
      loadFromSupabaseCache(projectIds).finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    }

    // Schedule ONE background refresh from SharePoint (2s delay)
    if (!backgroundRefreshScheduled) {
      backgroundRefreshScheduled = true;
      const timer = setTimeout(() => {
        backgroundRefreshFromSharePoint(projectIds);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [projectIds, loadFromSupabaseCache, backgroundRefreshFromSharePoint]);

  // Listen for upload/delete events from the edit dialog
  useEffect(() => {
    const handler = (e: Event) => {
      const { projectId, delta } = (e as CustomEvent).detail;
      setCounts(prev => ({
        ...prev,
        [projectId]: Math.max(0, (prev[projectId] ?? 0) + delta),
      }));
    };
    window.addEventListener(DOC_COUNT_EVENT, handler);
    return () => window.removeEventListener(DOC_COUNT_EVENT, handler);
  }, []);

  return { counts, loading };
}
