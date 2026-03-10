import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Global event bus so ProjectDetailDialog can notify the table
const DOC_COUNT_EVENT = "doc-count-updated";

// Stage pattern: ends with -A, -B, etc. (single uppercase letter after last dash)
const STAGE_SUFFIX_PATTERN = /-[A-Z]$/;

export function isStage(projectId: string): boolean {
  return STAGE_SUFFIX_PATTERN.test(projectId);
}

// ── Queue-based SharePoint fetcher (max 3 concurrent) ──────────────
const MAX_CONCURRENT = 3;
const BATCH_DELAY_MS = 500;
const RETRY_DELAY_MS = 8000;

let fetchQueue: string[] = [];
let activeCount = 0;
let queueRunning = false;
const fetchedThisSession = new Set<string>();
const retryCount: Record<string, number> = {};

async function processQueue() {
  if (queueRunning) return;
  queueRunning = true;

  while (fetchQueue.length > 0) {
    while (activeCount < MAX_CONCURRENT && fetchQueue.length > 0) {
      const projectId = fetchQueue.shift()!;
      if (fetchedThisSession.has(projectId)) continue;
      activeCount++;
      fetchOneProject(projectId).finally(() => {
        activeCount--;
      });
    }
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  queueRunning = false;
}

async function fetchOneProject(projectId: string) {
  try {
    const { data, error } = await supabase.functions.invoke("sharepoint-documents", {
      body: { action: "count", projectIds: [projectId] },
    });

    if (error || !data?.counts) {
      throw new Error(error?.message ?? "No counts returned");
    }

    const counts = data.counts as Record<string, number>;
    const count = counts[projectId] ?? 0;
    fetchedThisSession.add(projectId);

    // Persist to sharepoint_document_cache
    await supabase
      .from("sharepoint_document_cache")
      .upsert({
        project_id: projectId,
        total_count: count,
        category_counts: {},
        file_list: {},
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "project_id" });

    // Dispatch event for UI update
    window.dispatchEvent(
      new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId, absolute: count } })
    );
  } catch {
    const tries = (retryCount[projectId] ?? 0) + 1;
    retryCount[projectId] = tries;
    if (tries < 2) {
      setTimeout(() => {
        fetchQueue.push(projectId);
        processQueue();
      }, RETRY_DELAY_MS);
    } else {
      window.dispatchEvent(
        new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId, failed: true } })
      );
    }
  }
}

/** Enqueue projects for background fetching */
export function enqueueDocCountFetch(projectIds: string[]) {
  const toFetch = projectIds.filter(
    (id) => !isStage(id) && !fetchedThisSession.has(id) && !fetchQueue.includes(id)
  );
  if (toFetch.length === 0) return;
  fetchQueue.push(...toFetch);
  processQueue();
}

/** Optimistic delta update (+1 or -1) for upload/delete */
export function dispatchDocCountUpdate(projectId: string, delta: number) {
  // Update sharepoint_document_cache in background
  supabase
    .from("sharepoint_document_cache")
    .select("total_count")
    .eq("project_id", projectId)
    .maybeSingle()
    .then(({ data }) => {
      if (data) {
        const newCount = Math.max(0, (data.total_count ?? 0) + delta);
        supabase
          .from("sharepoint_document_cache")
          .update({ total_count: newCount, updated_at: new Date().toISOString() } as any)
          .eq("project_id", projectId)
          .then(() => {});
      }
    });

  window.dispatchEvent(
    new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId, delta } })
  );
}

/** Set an absolute count (e.g. after loading all categories from SharePoint) */
export function setDocCountAbsolute(projectId: string, count: number) {
  supabase
    .from("sharepoint_document_cache")
    .upsert({
      project_id: projectId,
      total_count: count,
      category_counts: {},
      file_list: {},
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "project_id" })
    .then(() => {});

  window.dispatchEvent(
    new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId, absolute: count } })
  );
}

/** Migrate doc count cache when project ID is renamed */
export async function migrateDocCountCache(oldProjectId: string, newProjectId: string) {
  window.dispatchEvent(
    new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId: newProjectId, delta: 0 } })
  );
}

// ── Hook ────────────────────────────────────────────────────────────

/** Fetch all cached doc counts from sharepoint_document_cache */
function useDocCountCache() {
  return useQuery({
    queryKey: ["doc-count-cache"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sharepoint_document_cache")
        .select("project_id, total_count");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        map[row.project_id] = row.total_count;
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useDocumentCounts(
  projectIds: string[],
  projectStatuses?: Record<string, string | null>
) {
  const mainProjectIds = projectIds.filter((id) => !isStage(id));
  const queryClient = useQueryClient();

  const { data: cacheMap } = useDocCountCache();

  const [overrides, setOverrides] = useState<Record<string, number | "failed">>({});
  const mountedRef = useRef(true);
  const enqueuedRef = useRef(false);

  // Build counts from cache + overrides
  const counts: Record<string, number | undefined> = {};
  for (const id of mainProjectIds) {
    if (id in overrides) {
      const v = overrides[id];
      counts[id] = v === "failed" ? undefined : v;
    } else {
      counts[id] = cacheMap?.[id] ?? undefined;
    }
  }

  // Enqueue projects with no cache entry for background fetch (once per mount)
  useEffect(() => {
    if (enqueuedRef.current || !cacheMap || mainProjectIds.length === 0) return;
    enqueuedRef.current = true;

    const nullProjects = mainProjectIds.filter((id) => cacheMap[id] == null);

    let toFetch = nullProjects;
    if (projectStatuses) {
      toFetch = nullProjects.filter((id) => projectStatuses[id] !== "Dokončeno");
    }

    if (toFetch.length > 0) {
      const timer = setTimeout(() => enqueueDocCountFetch(toFetch), 3000);
      return () => clearTimeout(timer);
    }
  }, [mainProjectIds.join(","), cacheMap, projectStatuses]);

  // Listen for update events
  useEffect(() => {
    mountedRef.current = true;
    const handler = (e: Event) => {
      const { projectId, delta, absolute, failed } = (e as CustomEvent).detail;
      if (!mountedRef.current) return;

      if (failed) {
        setOverrides((prev) => ({ ...prev, [projectId]: "failed" }));
        return;
      }

      if (absolute !== undefined) {
        setOverrides((prev) => ({ ...prev, [projectId]: absolute }));
        // Update react-query cache for doc-count-cache
        queryClient.setQueryData<Record<string, number>>(["doc-count-cache"], (old) => {
          if (!old) return { [projectId]: absolute };
          return { ...old, [projectId]: absolute };
        });
        return;
      }

      if (delta !== undefined && delta !== 0) {
        setOverrides((prev) => {
          const current = prev[projectId];
          const base = typeof current === "number" ? current : (cacheMap?.[projectId] ?? 0);
          const newVal = Math.max(0, base + delta);
          return { ...prev, [projectId]: newVal };
        });
        queryClient.setQueryData<Record<string, number>>(["doc-count-cache"], (old) => {
          if (!old) return old;
          const current = old[projectId] ?? 0;
          return { ...old, [projectId]: Math.max(0, current + delta) };
        });
      }
    };

    window.addEventListener(DOC_COUNT_EVENT, handler);
    return () => {
      mountedRef.current = false;
      window.removeEventListener(DOC_COUNT_EVENT, handler);
    };
  }, [cacheMap, queryClient]);

  const failed = new Set<string>();
  for (const [id, v] of Object.entries(overrides)) {
    if (v === "failed") failed.add(id);
  }

  return { counts, loading: false, failed };
}
