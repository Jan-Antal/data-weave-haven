import { useState, useCallback, useMemo } from "react";

export interface ColumnDef {
  key: string;
  label: string;
  locked?: boolean; // Cannot be hidden
}

export function useColumnVisibility(storageKey: string, columns: ColumnDef[], defaultHidden?: string[]) {
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) return new Set(JSON.parse(stored));
      return new Set(defaultHidden ?? []);
    } catch {
      return new Set(defaultHidden ?? []);
    }
  });

  const toggleColumn = useCallback((key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
  }, [storageKey]);

  const isVisible = useCallback((key: string) => {
    const col = columns.find((c) => c.key === key);
    if (col?.locked) return true;
    return !hiddenColumns.has(key);
  }, [hiddenColumns, columns]);

  return { hiddenColumns, toggleColumn, isVisible, columns };
}
