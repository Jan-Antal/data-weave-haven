import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

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
    // Wait for a slot to free up or batch delay
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  queueRunning = false;
}

async function fetchOneProject(projectId: string) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const { data, error } = await supabase.functions.invoke("sharepoint-documents", {
      body: { action: "count", projectIds: [projectId] },
    });
    clearTimeout(timeoutId);

    if (error || !data?.counts) {
      throw new Error(error?.message ?? "No counts returned");
    }

    const counts = data.counts as Record<string, number>;
    const count = counts[projectId] ?? 0;
    fetchedThisSession.add(projectId);

    // Persist to projects.document_count
    await supabase.from("projects").update({ document_count: count } as any).eq("project_id", projectId);

    // Dispatch event for UI update
    window.dispatchEvent(
      new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId, absolute: count } })
    );
  } catch {
    // Retry once after delay
    const tries = (retryCount[projectId] ?? 0) + 1;
    retryCount[projectId] = tries;
    if (tries < 2) {
      setTimeout(() => {
        fetchQueue.push(projectId);
        processQueue();
      }, RETRY_DELAY_MS);
    } else {
      // Give up — dispatch "failed" state
      window.dispatchEvent(
        new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId, failed: true } })
      );
    }
  }
}

/** Enqueue projects that have NULL document_count for background fetching */
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
  // Update Supabase in background
  supabase
    .from("projects")
    .select("document_count")
    .eq("project_id", projectId)
    .maybeSingle()
    .then(({ data }) => {
      const current = data?.document_count ?? 0;
      const newCount = Math.max(0, current + delta);
      supabase.from("projects").update({ document_count: newCount } as any).eq("project_id", projectId).then(() => {});
    });

  window.dispatchEvent(
    new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId, delta } })
  );
}

/** Set an absolute count (e.g. after loading all categories from SharePoint) */
export function setDocCountAbsolute(projectId: string, count: number) {
  // Persist to Supabase
  supabase.from("projects").update({ document_count: count } as any).eq("project_id", projectId).then(() => {});

  window.dispatchEvent(
    new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId, absolute: count } })
  );
}

/** Migrate doc count cache when project ID is renamed */
export async function migrateDocCountCache(oldProjectId: string, newProjectId: string) {
  // The projects table cascade handles this since document_count is on the projects row.
  // Just dispatch UI event for the new ID.
  window.dispatchEvent(
    new CustomEvent(DOC_COUNT_EVENT, { detail: { projectId: newProjectId, delta: 0 } })
  );
}

// ── Hook ────────────────────────────────────────────────────────────
export function useDocumentCounts(
  projectIds: string[],
  projectStatuses?: Record<string, string | null>
) {
  const mainProjectIds = projectIds.filter((id) => !isStage(id));
  const queryClient = useQueryClient();

  // Read document_count from already-loaded projects data (react-query cache)
  const projectsData = queryClient.getQueryData<any[]>(["projects"]);

  const [overrides, setOverrides] = useState<Record<string, number | "failed">>({});
  const mountedRef = useRef(true);
  const enqueuedRef = useRef(false);

  // Build counts from projects data + overrides
  const counts: Record<string, number | undefined> = {};
  for (const id of mainProjectIds) {
    if (id in overrides) {
      const v = overrides[id];
      counts[id] = v === "failed" ? undefined : v;
    } else {
      const proj = projectsData?.find((p: any) => p.project_id === id);
      counts[id] = proj?.document_count ?? undefined;
    }
  }

  // Enqueue NULL projects for background fetch (once per mount)
  useEffect(() => {
    if (enqueuedRef.current || !projectsData || mainProjectIds.length === 0) return;
    enqueuedRef.current = true;

    const nullProjects = mainProjectIds.filter((id) => {
      const proj = projectsData?.find((p: any) => p.project_id === id);
      return proj?.document_count == null;
    });

    // Skip Dokončeno projects from initial background fetch
    let toFetch = nullProjects;
    if (projectStatuses) {
      toFetch = nullProjects.filter((id) => projectStatuses[id] !== "Dokončeno");
    }

    if (toFetch.length > 0) {
      // Delay initial fetch by 3s to let UI settle
      const timer = setTimeout(() => enqueueDocCountFetch(toFetch), 3000);
      return () => clearTimeout(timer);
    }
  }, [mainProjectIds.join(","), projectsData, projectStatuses]);

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
        // Also update react-query cache so next render reads it
        queryClient.setQueryData<any[]>(["projects"], (old) => {
          if (!old) return old;
          return old.map((p: any) =>
            p.project_id === projectId ? { ...p, document_count: absolute } : p
          );
        });
        return;
      }

      if (delta !== undefined && delta !== 0) {
        setOverrides((prev) => {
          const current = prev[projectId];
          const base = typeof current === "number" ? current : (() => {
            const proj = projectsData?.find((p: any) => p.project_id === projectId);
            return proj?.document_count ?? 0;
          })();
          const newVal = Math.max(0, base + delta);
          return { ...prev, [projectId]: newVal };
        });
        // Also update react-query cache
        queryClient.setQueryData<any[]>(["projects"], (old) => {
          if (!old) return old;
          return old.map((p: any) =>
            p.project_id === projectId
              ? { ...p, document_count: Math.max(0, (p.document_count ?? 0) + delta) }
              : p
          );
        });
      }
    };

    window.addEventListener(DOC_COUNT_EVENT, handler);
    return () => {
      mountedRef.current = false;
      window.removeEventListener(DOC_COUNT_EVENT, handler);
    };
  }, [projectsData, queryClient]);

  // Compute failed set for badge display
  const failed = new Set<string>();
  for (const [id, v] of Object.entries(overrides)) {
    if (v === "failed") failed.add(id);
  }

  return { counts, loading: false, failed };
}
