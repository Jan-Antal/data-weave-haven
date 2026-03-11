import { useState, useCallback, useEffect } from "react";
import type { SPFile } from "@/hooks/useSharePointDocs";

export interface FileSelectionState {
  selectedIds: Set<string>;
  lastClickedId: string | null;
}

export function useFileSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setLastClicked(null);
  }, []);

  const toggleFile = useCallback((fileId: string, files: SPFile[], e?: React.MouseEvent) => {
    setSelected((prev) => {
      const next = new Set(prev);

      if (e?.shiftKey && lastClicked) {
        // Range select
        const ids = files.map((f) => f.itemId);
        const startIdx = ids.indexOf(lastClicked);
        const endIdx = ids.indexOf(fileId);
        if (startIdx !== -1 && endIdx !== -1) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          for (let i = from; i <= to; i++) {
            next.add(ids[i]);
          }
        }
      } else if (e?.metaKey || e?.ctrlKey) {
        // Toggle single
        if (next.has(fileId)) next.delete(fileId);
        else next.add(fileId);
      } else {
        // Single select (replace)
        if (next.size === 1 && next.has(fileId)) {
          next.clear();
        } else {
          next.clear();
          next.add(fileId);
        }
      }
      return next;
    });
    setLastClicked(fileId);
  }, [lastClicked]);

  const isSelected = useCallback((fileId: string) => selected.has(fileId), [selected]);

  const selectedCount = selected.size;

  // Escape to deselect
  useEffect(() => {
    if (selected.size === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelection();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selected.size, clearSelection]);

  return {
    selected,
    selectedCount,
    isSelected,
    toggleFile,
    clearSelection,
  };
}
