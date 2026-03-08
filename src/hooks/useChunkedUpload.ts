import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const MAX_RETRIES = 3;
const SMALL_FILE_LIMIT = 4 * 1024 * 1024; // 4MB — use simple upload below this

export interface UploadProgress {
  fileName: string;
  fileSize: number;
  loaded: number;
  percent: number;
  speed: number; // bytes/sec
  status: "uploading" | "done" | "error" | "cancelled";
  error?: string;
}

export interface ChunkedUploadResult {
  itemId: string;
  name: string;
  size: number;
  downloadUrl: string | null;
  webUrl: string | null;
}

export function useChunkedUpload() {
  const [uploads, setUploads] = useState<Record<string, UploadProgress>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});

  const updateUpload = (id: string, update: Partial<UploadProgress>) => {
    setUploads(prev => ({
      ...prev,
      [id]: { ...prev[id], ...update },
    }));
  };

  const removeUpload = useCallback((id: string) => {
    setUploads(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const cancelUpload = useCallback((id: string) => {
    abortControllers.current[id]?.abort();
    updateUpload(id, { status: "cancelled" });
    setTimeout(() => removeUpload(id), 2000);
  }, [removeUpload]);

  const isLargeFile = (file: File) => file.size >= SMALL_FILE_LIMIT;

  const uploadLargeFile = useCallback(async (
    projectId: string,
    categoryFolder: string,
    file: File,
  ): Promise<ChunkedUploadResult> => {
    const uploadId = `${file.name}-${Date.now()}`;
    const controller = new AbortController();
    abortControllers.current[uploadId] = controller;

    setUploads(prev => ({
      ...prev,
      [uploadId]: {
        fileName: file.name,
        fileSize: file.size,
        loaded: 0,
        percent: 0,
        speed: 0,
        status: "uploading",
      },
    }));

    try {
      // Step 1: Create upload session via edge function
      const { data: sessionData, error: sessionError } = await supabase.functions.invoke(
        "sharepoint-documents",
        {
          body: {
            action: "create_upload_session",
            projectId,
            category: categoryFolder,
            fileName: file.name,
            fileSize: file.size,
          },
        }
      );

      if (sessionError) throw new Error(sessionError.message ?? "Nepodařilo se vytvořit upload session");
      const uploadUrl = sessionData?.uploadUrl;
      if (!uploadUrl) throw new Error("Server nevrátil upload URL");

      // Step 2: Upload chunks directly to SharePoint
      const totalSize = file.size;
      const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
      let loaded = 0;
      const startTime = Date.now();
      let lastResult: any = null;

      for (let i = 0; i < totalChunks; i++) {
        if (controller.signal.aborted) {
          throw new Error("CANCELLED");
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunk = file.slice(start, end);
        const chunkBytes = await chunk.arrayBuffer();

        let success = false;
        let lastError: Error | null = null;

        for (let retry = 0; retry < MAX_RETRIES; retry++) {
          if (controller.signal.aborted) throw new Error("CANCELLED");

          try {
            const res = await fetch(uploadUrl, {
              method: "PUT",
              headers: {
                "Content-Length": String(end - start),
                "Content-Range": `bytes ${start}-${end - 1}/${totalSize}`,
              },
              body: chunkBytes,
              signal: controller.signal,
            });

            if (res.status === 200 || res.status === 201) {
              // Upload complete — final response
              lastResult = await res.json();
              success = true;
              break;
            } else if (res.status === 202) {
              // Chunk accepted, continue
              await res.json(); // consume body
              success = true;
              break;
            } else {
              const text = await res.text();
              lastError = new Error(`Chunk ${i + 1}/${totalChunks} selhal: ${res.status}`);
              console.warn(`Chunk upload retry ${retry + 1}:`, text);
            }
          } catch (err: any) {
            if (err.name === "AbortError" || err.message === "CANCELLED") throw new Error("CANCELLED");
            lastError = err;
            console.warn(`Chunk upload retry ${retry + 1}:`, err.message);
          }
        }

        if (!success) {
          throw lastError ?? new Error(`Chunk ${i + 1} selhal po ${MAX_RETRIES} pokusech`);
        }

        loaded = end;
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? loaded / elapsed : 0;

        updateUpload(uploadId, {
          loaded,
          percent: Math.round((loaded / totalSize) * 100),
          speed,
        });
      }

      // Upload complete
      updateUpload(uploadId, { status: "done", percent: 100, loaded: totalSize });

      // Clean up after 3 seconds
      setTimeout(() => removeUpload(uploadId), 3000);
      delete abortControllers.current[uploadId];

      if (lastResult) {
        return {
          itemId: lastResult.id,
          name: lastResult.name,
          size: lastResult.size,
          downloadUrl: lastResult["@microsoft.graph.downloadUrl"] ?? null,
          webUrl: lastResult.webUrl ?? null,
        };
      }

      // If we didn't get a final result (shouldn't happen), return basic info
      return {
        itemId: "",
        name: file.name,
        size: file.size,
        downloadUrl: null,
        webUrl: null,
      };
    } catch (err: any) {
      if (err.message === "CANCELLED") {
        updateUpload(uploadId, { status: "cancelled" });
        setTimeout(() => removeUpload(uploadId), 2000);
        throw err;
      }
      updateUpload(uploadId, {
        status: "error",
        error: err.message ?? "Nahrávání selhalo",
      });
      delete abortControllers.current[uploadId];
      throw err;
    }
  }, [removeUpload]);

  return {
    uploads,
    isLargeFile,
    uploadLargeFile,
    cancelUpload,
    removeUpload,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024 * 1024) return `${Math.round(bytesPerSec / 1024)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}
