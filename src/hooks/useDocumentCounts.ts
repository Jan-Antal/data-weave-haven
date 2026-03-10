import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

// Global event bus so ProjectDetailDialog can notify the table
const DOC_COUNT_EVENT = "doc-count-updated";

// In-memory cache (Layer 2) — persists across component remounts within session
const memoryCache: Record<string, number> = {};
let memoryCacheLoaded = false;
let backgroundRefreshScheduled = false;

// Stage pattern: ends with -A, -B, etc. (single uppercase letter after last dash)
const STAGE_SUFFIX_PATTERN = /-[A-Z]$/;

export function isStage(projectId: string): boolean {
  return STAGE_SUFFIX_PATTERN.test(projectId);
}

export function dispatchDocCountUpdate(projectId: string, delta: number) {
  memoryCache[projectId] = (memoryCache[projectId] ?? 0) + delta;
  // Also update DB cache in background
  updateSupabaseCacheForProject(projectId, delta);
  window.dispatchEvent(new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId, delta } }));
}

/** Set an absolute count (e.g. after loading all categories from SharePoint) */
export function setDocCountAbsolute(projectId: string, count: number) {
  memoryCache[projectId] = count;
  // Persist to DB cache
  setSupabaseCacheAbsolute(projectId, count);
  window.dispatchEvent(new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId, delta: 0, absolute: count } }));
}

async function setSupabaseCacheAbsolute(projectId: string, count: number) {
  try {
    await supabase
      .from("sharepoint_document_cache")
      .upsert({ project_id: projectId, total_count: count, updated_at: new Date().toISOString() } as any, { onConflict: "project_id" });
  } catch { /* ignore */ }
}

/** Migrate doc count cache when project ID is renamed */
export async function migrateDocCountCache(oldProjectId: string, newProjectId: string) {
  const count = memoryCache[oldProjectId] ?? 0;
  delete memoryCache[oldProjectId];
  memoryCache[newProjectId] = count;
  // Update DB cache: update old row's project_id to new one
  try {
    await supabase.from("sharepoint_document_cache")
      .update({ project_id: newProjectId, updated_at: new Date().toISOString() } as any)
      .eq("project_id", oldProjectId);
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId: newProjectId, delta: 0 } }));
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
      .upsert({ project_id: projectId, total_count: newTotal, updated_at: new Date().toISOString() } as any, { onConflict: "project_id" });
  } catch { /* ignore cache update errors */ }
}

export function useDocumentCounts(projectIds: string[], projectStatuses?: Record<string, string | null>) {
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const cached: Record<string, number> = {};
    for (const id of projectIds) {
      if (id in memoryCache) cached[id] = memoryCache[id];
    }
    return cached;
  });
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  // Filter out stages — only main projects get doc counts
  const mainProjectIds = projectIds.filter(id => !isStage(id));

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
    
    // Skip Dokončeno projects for background refresh
    let idsToRefresh = ids;
    if (projectStatuses) {
      idsToRefresh = ids.filter(id => projectStatuses[id] !== "Dokončeno");
    }
    if (idsToRefresh.length === 0) return;

    try {
      // Add 10s timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const { data, error } = await supabase.functions.invoke("sharepoint-documents", {
        body: { action: "count", projectIds: idsToRefresh },
      });
      clearTimeout(timeoutId);
      
      if (error || !data?.counts) {
        console.warn("Background SharePoint refresh failed (using cached data):", error);
        return;
      }

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

      // Persist to DB cache in batches
      if (upsertRows.length > 0) {
        await supabase
          .from("sharepoint_document_cache")
          .upsert(upsertRows as any, { onConflict: "project_id" });
      }
    } catch (err) {
      console.warn("Background SharePoint refresh error (cached data still valid):", err);
    }
  }, [projectStatuses]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Main effect: load cache then schedule background refresh
  useEffect(() => {
    if (mainProjectIds.length === 0) return;

    // Always sync from memory cache first
    const fromMemory: Record<string, number> = {};
    for (const id of mainProjectIds) {
      if (id in memoryCache) {
        fromMemory[id] = memoryCache[id];
      }
    }
    if (Object.keys(fromMemory).length > 0) {
      setCounts(prev => ({ ...prev, ...fromMemory }));
    }

    // Load from Supabase cache if not loaded yet
    if (!memoryCacheLoaded) {
      memoryCacheLoaded = true;
      setLoading(true);
      loadFromSupabaseCache(mainProjectIds).finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    }

    // Schedule ONE background refresh from SharePoint (3s delay)
    if (!backgroundRefreshScheduled) {
      backgroundRefreshScheduled = true;
      const timer = setTimeout(() => {
        backgroundRefreshFromSharePoint(mainProjectIds);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [mainProjectIds.join(","), loadFromSupabaseCache, backgroundRefreshFromSharePoint]);

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
