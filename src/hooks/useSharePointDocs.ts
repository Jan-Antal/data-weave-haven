import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SPFile {
  itemId: string;
  name: string;
  size: number;
  lastModified: string;
  downloadUrl: string | null;
  webUrl: string | null;
}

export interface SPPreview {
  previewUrl: string | null;
  webUrl: string | null;
  downloadUrl: string | null;
  name: string;
}

export const CATEGORY_FOLDER_MAP: Record<string, string> = {
  cenova_nabidka: "Cenova-nabidka",
  smlouva: "Smlouva",
  zadani: "Zadani",
  vykresy: "Vykresy",
  dokumentace: "Dokumentace",
  dodaci_list: "Dodaci-list",
  fotky: "Fotky",
};

const ALL_CATEGORY_KEYS = Object.keys(CATEGORY_FOLDER_MAP);

// Global file cache: projectId → categoryKey → SPFile[]
const globalFileCache: Record<string, Record<string, SPFile[]>> = {};
const lastRefreshTime: Record<string, number> = {};

const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
const EDGE_FN_TIMEOUT_MS = 10000; // 10 seconds

export function useSharePointDocs(projectId: string) {
  const [filesByCategory, setFilesByCategory] = useState<Record<string, SPFile[]>>(() => {
    return globalFileCache[projectId] ?? {};
  });
  const [loadingCategory, setLoadingCategory] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cacheTimestamp, setCacheTimestamp] = useState<string | null>(null);
  const fetchedRef = useRef<Set<string>>(new Set());

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    // Add timeout via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EDGE_FN_TIMEOUT_MS);
    try {
      const { data, error } = await supabase.functions.invoke("sharepoint-documents", { body });
      clearTimeout(timeoutId);
      if (error) throw new Error(error.message ?? "Edge function error");
      return data;
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }
  }, []);

  // Save file list to Supabase cache table
  const persistToCache = useCallback(async (pid: string, filesMap: Record<string, SPFile[]>) => {
    try {
      const categoryCounts: Record<string, number> = {};
      let total = 0;
      for (const [key, files] of Object.entries(filesMap)) {
        categoryCounts[key] = files.length;
        total += files.length;
      }
      await supabase
        .from("sharepoint_document_cache")
        .upsert({
          project_id: pid,
          category_counts: categoryCounts,
          file_list: filesMap,
          total_count: total,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "project_id" });
    } catch { /* ignore cache persist errors */ }
  }, []);

  // Load from Supabase cache table
  const loadFromDBCache = useCallback(async () => {
    if (!projectId) return false;
    try {
      const { data } = await supabase
        .from("sharepoint_document_cache")
        .select("file_list, updated_at")
        .eq("project_id", projectId)
        .maybeSingle();
      if (data?.file_list && typeof data.file_list === "object") {
        const filesMap = data.file_list as unknown as Record<string, SPFile[]>;
        globalFileCache[projectId] = filesMap;
        setFilesByCategory(filesMap);
        setCacheTimestamp(data.updated_at);
        for (const key of Object.keys(filesMap)) {
          fetchedRef.current.add(key);
        }
        // Check if stale
        const updatedAt = new Date(data.updated_at).getTime();
        return Date.now() - updatedAt < CACHE_MAX_AGE_MS;
      }
    } catch { /* ignore */ }
    return false;
  }, [projectId]);

  const fetchAllFromSharePoint = useCallback(async () => {
    if (!projectId) return;
    try {
      const results = await Promise.all(
        ALL_CATEGORY_KEYS.map(async (key) => {
          const folder = CATEGORY_FOLDER_MAP[key];
          try {
            const files = await invoke({ action: "list", projectId, category: folder });
            return { key, files: (files ?? []) as SPFile[] };
          } catch {
            return { key, files: [] as SPFile[] };
          }
        })
      );
      const map: Record<string, SPFile[]> = {};
      for (const r of results) map[r.key] = r.files;
      globalFileCache[projectId] = map;
      lastRefreshTime[projectId] = Date.now();
      setFilesByCategory(map);
      setCacheTimestamp(new Date().toISOString());
      // Persist to DB cache
      persistToCache(projectId, map);
    } catch (err) {
      console.warn("SharePoint fetch failed, using cached data:", err);
    }
  }, [projectId, invoke, persistToCache]);

  const fetchAllCategories = useCallback(async () => {
    if (!projectId) return;

    // If we have in-memory cached data, show immediately
    if (globalFileCache[projectId] && Object.keys(globalFileCache[projectId]).length > 0) {
      setFilesByCategory(globalFileCache[projectId]);
      for (const key of Object.keys(globalFileCache[projectId])) {
        fetchedRef.current.add(key);
      }
      // Check if stale and background refresh
      const lastRefresh = lastRefreshTime[projectId] ?? 0;
      if (Date.now() - lastRefresh > CACHE_MAX_AGE_MS) {
        setRefreshing(true);
        fetchAllFromSharePoint().finally(() => setRefreshing(false));
      }
      return;
    }

    // Try DB cache first (shows data instantly without spinner)
    const isFresh = await loadFromDBCache();
    if (globalFileCache[projectId] && Object.keys(globalFileCache[projectId]).length > 0) {
      // Got data from DB cache — no spinner needed
      if (!isFresh) {
        setRefreshing(true);
        fetchAllFromSharePoint().finally(() => setRefreshing(false));
      }
      return;
    }

    // No cache at all — try edge function but don't show spinner for long
    setInitialLoading(true);
    try {
      await fetchAllFromSharePoint();
    } catch {
      // Edge function failed, show empty state
    } finally {
      setInitialLoading(false);
    }
  }, [projectId, loadFromDBCache, fetchAllFromSharePoint]);

  // Manual refresh triggered by user
  const manualRefresh = useCallback(async () => {
    if (!projectId) return;
    setRefreshing(true);
    try {
      await fetchAllFromSharePoint();
    } catch {
      // Silently fail, keep showing cached data
    } finally {
      setRefreshing(false);
    }
  }, [projectId, fetchAllFromSharePoint]);

  const listFiles = useCallback(async (categoryKey: string, force = false) => {
    // Always show cached data immediately
    if (globalFileCache[projectId]?.[categoryKey]) {
      setFilesByCategory(prev => ({
        ...prev,
        [categoryKey]: globalFileCache[projectId][categoryKey],
      }));
    }

    if (!force && fetchedRef.current.has(categoryKey)) return;
    const folder = CATEGORY_FOLDER_MAP[categoryKey];
    if (!folder) return;
    
    // Only show loading if we have NO cached data for this category
    const hasCachedData = (globalFileCache[projectId]?.[categoryKey]?.length ?? 0) > 0;
    if (!hasCachedData) {
      setLoadingCategory(categoryKey);
    }
    
    try {
      const files = await invoke({ action: "list", projectId, category: folder });
      const fileList = files ?? [];
      setFilesByCategory((prev) => {
        const updated = { ...prev, [categoryKey]: fileList };
        if (!globalFileCache[projectId]) globalFileCache[projectId] = {};
        globalFileCache[projectId][categoryKey] = fileList;
        return updated;
      });
      fetchedRef.current.add(categoryKey);
    } catch (err: any) {
      console.warn("SP list error (using cached data):", err);
      // Don't clear existing cached data on error
      if (!hasCachedData) {
        setFilesByCategory((prev) => ({ ...prev, [categoryKey]: [] }));
      }
    } finally {
      setLoadingCategory(null);
    }
  }, [projectId, invoke]);

  const uploadFile = useCallback(async (categoryKey: string, file: File) => {
    const folder = CATEGORY_FOLDER_MAP[categoryKey];
    if (!folder) return;
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await invoke({
        action: "upload",
        projectId,
        category: folder,
        fileName: file.name,
        fileContent: base64,
      });
      setFilesByCategory((prev) => {
        const updated = { ...prev, [categoryKey]: [...(prev[categoryKey] ?? []), result as SPFile] };
        if (!globalFileCache[projectId]) globalFileCache[projectId] = {};
        globalFileCache[projectId][categoryKey] = updated[categoryKey];
        // Persist updated cache
        persistToCache(projectId, { ...globalFileCache[projectId] });
        return updated;
      });
      return result as SPFile;
    } finally {
      setUploading(false);
    }
  }, [projectId, invoke, persistToCache]);

  const getDownloadUrl = useCallback(async (categoryKey: string, fileName: string) => {
    const folder = CATEGORY_FOLDER_MAP[categoryKey];
    if (!folder) return null;
    const result = await invoke({ action: "download", projectId, category: folder, fileName });
    return (result as { downloadUrl: string | null }).downloadUrl;
  }, [projectId, invoke]);

  const deleteFile = useCallback(async (categoryKey: string, fileName: string) => {
    const folder = CATEGORY_FOLDER_MAP[categoryKey];
    if (!folder) return;
    await invoke({ action: "delete", projectId, category: folder, fileName });
    setFilesByCategory((prev) => {
      const updated = { ...prev, [categoryKey]: (prev[categoryKey] ?? []).filter((f) => f.name !== fileName) };
      if (!globalFileCache[projectId]) globalFileCache[projectId] = {};
      globalFileCache[projectId][categoryKey] = updated[categoryKey];
      // Persist updated cache
      persistToCache(projectId, { ...globalFileCache[projectId] });
      return updated;
    });
  }, [projectId, invoke, persistToCache]);

  const archiveProject = useCallback(async () => {
    await invoke({ action: "archive", projectId });
  }, [projectId, invoke]);

  const getPreview = useCallback(async (itemId: string): Promise<SPPreview> => {
    const result = await invoke({ action: "preview", itemId });
    return result as SPPreview;
  }, [invoke]);

  const resetCache = useCallback(() => {
    fetchedRef.current.clear();
  }, []);

  return { filesByCategory, loadingCategory, initialLoading, uploading, refreshing, cacheTimestamp, listFiles, fetchAllCategories, manualRefresh, uploadFile, getDownloadUrl, deleteFile, archiveProject, getPreview, resetCache };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
