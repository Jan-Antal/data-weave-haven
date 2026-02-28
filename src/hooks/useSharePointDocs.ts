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

const CATEGORY_FOLDER_MAP: Record<string, string> = {
  cenova_nabidka: "Cenova-nabidka",
  smlouva: "Smlouva",
  vykresy: "Vykresy",
  dokumentace: "Dokumentace",
  dodaci_list: "Dodaci-list",
};

const ALL_CATEGORY_KEYS = Object.keys(CATEGORY_FOLDER_MAP);

// Global file cache: projectId → categoryKey → SPFile[]
const globalFileCache: Record<string, Record<string, SPFile[]>> = {};

export function useSharePointDocs(projectId: string) {
  const [filesByCategory, setFilesByCategory] = useState<Record<string, SPFile[]>>(() => {
    // Initialize from global cache
    return globalFileCache[projectId] ?? {};
  });
  const [loadingCategory, setLoadingCategory] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fetchedRef = useRef<Set<string>>(new Set());

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("sharepoint-documents", { body });
    if (error) throw new Error(error.message ?? "Edge function error");
    return data;
  }, []);

  const fetchAllCategories = useCallback(async () => {
    if (!projectId) return;

    // If we have cached data for this project, show it immediately
    if (globalFileCache[projectId] && Object.keys(globalFileCache[projectId]).length > 0) {
      setFilesByCategory(globalFileCache[projectId]);
      for (const key of Object.keys(globalFileCache[projectId])) {
        fetchedRef.current.add(key);
      }
      // Background refresh
      (async () => {
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
          setFilesByCategory(map);
        } catch { /* ignore background refresh errors */ }
      })();
      return;
    }

    setInitialLoading(true);
    try {
      const results = await Promise.all(
        ALL_CATEGORY_KEYS.map(async (key) => {
          const folder = CATEGORY_FOLDER_MAP[key];
          try {
            const files = await invoke({ action: "list", projectId, category: folder });
            return { key, files: (files ?? []) as SPFile[] };
          } catch (err) {
            console.error(`SP list error for ${key}:`, err);
            return { key, files: [] as SPFile[] };
          }
        })
      );
      const map: Record<string, SPFile[]> = {};
      for (const r of results) {
        map[r.key] = r.files;
        fetchedRef.current.add(r.key);
      }
      globalFileCache[projectId] = map;
      setFilesByCategory(map);
    } finally {
      setInitialLoading(false);
    }
  }, [projectId, invoke]);

  const listFiles = useCallback(async (categoryKey: string, force = false) => {
    if (!force && fetchedRef.current.has(categoryKey)) return;
    const folder = CATEGORY_FOLDER_MAP[categoryKey];
    if (!folder) return;
    setLoadingCategory(categoryKey);
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
      console.error("SP list error:", err);
      setFilesByCategory((prev) => ({ ...prev, [categoryKey]: [] }));
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
        return updated;
      });
      return result as SPFile;
    } finally {
      setUploading(false);
    }
  }, [projectId, invoke]);

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
      return updated;
    });
  }, [projectId, invoke]);

  const archiveProject = useCallback(async () => {
    await invoke({ action: "archive", projectId });
  }, [projectId, invoke]);

  const getPreview = useCallback(async (itemId: string): Promise<SPPreview> => {
    const result = await invoke({ action: "preview", itemId });
    return result as SPPreview;
  }, [invoke]);

  const resetCache = useCallback(() => {
    // Only clear the ref so next fetchAllCategories will refresh
    // but keep globalFileCache for instant display
    fetchedRef.current.clear();
  }, []);

  return { filesByCategory, loadingCategory, initialLoading, uploading, listFiles, fetchAllCategories, uploadFile, getDownloadUrl, deleteFile, archiveProject, getPreview, resetCache };
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
