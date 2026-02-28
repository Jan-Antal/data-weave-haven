import { useState, useCallback, useEffect, useRef, useMemo } from "react";

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
      // Also process DB entries for keys NOT in allColumns (e.g., custom columns)
      for (const key of Object.keys(dbMap)) {
        if (!allColumns.find(c => c.key === key)) {
          if (!dbMap[key]) hidden.add(key);
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

  // Track which keys have explicit DB visibility entries
  const dbKeySet = useMemo(() => {
    return new Set(Object.keys(dbVisibilityMap ?? {}));
  }, [dbVisibilityMap]);

  const isVisible = useCallback(
    (key: string) => {
      const col = allColumns.find((c) => c.key === key);
      if (col?.locked) return true;
      // For custom/unknown columns not in allColumns: default to hidden
      // unless explicitly set visible in DB
      if (!col && key.startsWith("custom_")) {
        if (!dbKeySet.has(key)) return false; // No DB entry → hidden by default
      }
      return !hiddenColumns.has(key);
    },
    [hiddenColumns, allColumns, dbKeySet]
  );

  return { hiddenColumns, toggleColumn, isVisible, columns: allColumns };
}
