import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "recently-opened-projects";
const MAX_ENTRIES = 10;

export interface RecentProject {
  project_id: string;
  project_name: string;
  status: string | null;
  opened_at: string; // ISO
}

function loadRecent(): RecentProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useRecentlyOpened() {
  const [recent, setRecent] = useState<RecentProject[]>(loadRecent);

  const trackOpen = useCallback((project: { project_id: string; project_name: string; status?: string | null }) => {
    setRecent(prev => {
      const filtered = prev.filter(r => r.project_id !== project.project_id);
      const entry: RecentProject = {
        project_id: project.project_id,
        project_name: project.project_name,
        status: project.status ?? null,
        opened_at: new Date().toISOString(),
      };
      const updated = [entry, ...filtered].slice(0, MAX_ENTRIES);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  return { recent, trackOpen };
}
