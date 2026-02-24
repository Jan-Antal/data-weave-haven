import { useState, useCallback, useEffect, useRef } from "react";

export interface ColumnDef {
  key: string;
  label: string;
  locked?: boolean;
}

export function useColumnVisibility(
  storageKey: string,
  allColumns: ColumnDef[],
  defaultHidden: string[],
  dbVisibilityMap?: Record<string, boolean>,
  onDbToggle?: (key: string, visible: boolean) => void
) {
  // Compute hidden set from DB visibility map + defaults
  const computeHidden = useCallback(
    (dbMap?: Record<string, boolean>) => {
      if (!dbMap || Object.keys(dbMap).length === 0) {
        return new Set(defaultHidden);
      }
      const hidden = new Set<string>();
      for (const col of allColumns) {
        if (col.locked) continue;
        if (col.key in dbMap) {
          if (!dbMap[col.key]) hidden.add(col.key);
        } else {
          // No DB entry — use hardcoded default
          if (defaultHidden.includes(col.key)) hidden.add(col.key);
        }
      }
      return hidden;
    },
    [allColumns, defaultHidden]
  );

  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() =>
    computeHidden(dbVisibilityMap)
  );

  // Sync from DB when dbVisibilityMap changes
  const prevMapRef = useRef<string>("");
  useEffect(() => {
    const key = JSON.stringify(dbVisibilityMap ?? {});
    if (key !== prevMapRef.current) {
      prevMapRef.current = key;
      setHiddenColumns(computeHidden(dbVisibilityMap));
    }
  }, [dbVisibilityMap, computeHidden]);

  const toggleColumn = useCallback(
    (key: string) => {
      setHiddenColumns((prev) => {
        const next = new Set(prev);
        const nowVisible = next.has(key);
        nowVisible ? next.delete(key) : next.add(key);
        // Save to DB via callback (admin only)
        if (onDbToggle) {
          onDbToggle(key, nowVisible); // nowVisible = was hidden, now showing
        }
        return next;
      });
    },
    [onDbToggle]
  );

  const isVisible = useCallback(
    (key: string) => {
      const col = allColumns.find((c) => c.key === key);
      if (col?.locked) return true;
      return !hiddenColumns.has(key);
    },
    [hiddenColumns, allColumns]
  );

  return { hiddenColumns, toggleColumn, isVisible, columns: allColumns };
}
