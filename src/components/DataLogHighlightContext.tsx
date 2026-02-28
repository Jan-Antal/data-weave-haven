import { createContext, useContext, useState, useCallback, useRef } from "react";

interface DataLogHighlightContextType {
  highlightedProjectId: string | null;
  highlightProject: (projectId: string) => void;
  clearHighlight: () => void;
}

const DataLogHighlightContext = createContext<DataLogHighlightContextType>({
  highlightedProjectId: null,
  highlightProject: () => {},
  clearHighlight: () => {},
});

export function DataLogHighlightProvider({ children }: { children: React.ReactNode }) {
  const [highlightedProjectId, setHighlightedProjectId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const highlightProject = useCallback((projectId: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHighlightedProjectId(projectId);

    // Dispatch custom event so tables can scroll to the row
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent("datalog-highlight", { detail: { projectId } }));
    }, 50);

    timerRef.current = setTimeout(() => {
      setHighlightedProjectId(null);
    }, 2500);
  }, []);

  const clearHighlight = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHighlightedProjectId(null);
  }, []);

  return (
    <DataLogHighlightContext.Provider value={{ highlightedProjectId, highlightProject, clearHighlight }}>
      {children}
    </DataLogHighlightContext.Provider>
  );
}

export function useDataLogHighlight() {
  return useContext(DataLogHighlightContext);
}
