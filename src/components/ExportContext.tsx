import { createContext, useContext, useRef, useCallback, type MutableRefObject, type ReactNode } from "react";

export type ExportDataGetter = () => { headers: string[]; rows: (string | number)[][] } | null;

interface ExportContextType {
  registerGetter: (tab: string, getter: ExportDataGetter) => void;
  getExportData: (tab: string) => { headers: string[]; rows: (string | number)[][] } | null;
}

const ExportCtx = createContext<ExportContextType | null>(null);

export function ExportProvider({ children }: { children: ReactNode }) {
  const gettersRef = useRef<Record<string, ExportDataGetter>>({});

  const registerGetter = useCallback((tab: string, getter: ExportDataGetter) => {
    gettersRef.current[tab] = getter;
  }, []);

  const getExportData = useCallback((tab: string) => {
    const getter = gettersRef.current[tab];
    return getter ? getter() : null;
  }, []);

  return (
    <ExportCtx.Provider value={{ registerGetter, getExportData }}>
      {children}
    </ExportCtx.Provider>
  );
}

export function useExportContext() {
  const ctx = useContext(ExportCtx);
  if (!ctx) throw new Error("ExportProvider missing");
  return ctx;
}
