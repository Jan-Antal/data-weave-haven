import { createContext, useContext, useRef, useCallback, type ReactNode } from "react";

export type ExportDataGetter = (selectedKeys?: string[]) => { headers: string[]; rows: (string | number)[][] } | null;

export interface ExportColumnGroup {
  label: string;
  keys: string[];
  getLabel: (key: string) => string;
}

export interface ExportMeta {
  getter: ExportDataGetter;
  groups: ExportColumnGroup[];
  defaultVisibleKeys: string[];
}

interface ExportContextType {
  registerExport: (tab: string, meta: ExportMeta) => void;
  getExportMeta: (tab: string) => ExportMeta | null;
}

const ExportCtx = createContext<ExportContextType | null>(null);

export function ExportProvider({ children }: { children: ReactNode }) {
  const metaRef = useRef<Record<string, ExportMeta>>({});

  const registerExport = useCallback((tab: string, meta: ExportMeta) => {
    metaRef.current[tab] = meta;
  }, []);

  const getExportMeta = useCallback((tab: string) => {
    return metaRef.current[tab] ?? null;
  }, []);

  return (
    <ExportCtx.Provider value={{ registerExport, getExportMeta }}>
      {children}
    </ExportCtx.Provider>
  );
}

export function useExportContext() {
  const ctx = useContext(ExportCtx);
  if (!ctx) throw new Error("ExportProvider missing");
  return ctx;
}
