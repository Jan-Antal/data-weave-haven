import { useState, useCallback } from "react";

export interface ColumnDef {
  key: string;
  label: string;
  locked?: boolean;
}

export function useColumnVisibility(
  storageKey: string,
  allColumns: ColumnDef[],
  defaultHidden: string[]
) {
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {}
    return new Set(defaultHidden);
  });

  const toggleColumn = useCallback(
    (key: string) => {
      setHiddenColumns((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        localStorage.setItem(storageKey, JSON.stringify([...next]));
        return next;
      });
    },
    [storageKey]
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
