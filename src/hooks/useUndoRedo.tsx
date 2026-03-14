import React, { createContext, useContext, useCallback, useRef, useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────
export type UndoPage = "plan-vyroby" | "vyroba" | "project-table" | "tpv-list" | "settings";

export interface UndoEntry {
  id: string;
  timestamp: Date;
  page: UndoPage;
  actionType: string;
  description: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface UndoRedoState {
  pushUndo: (entry: Omit<UndoEntry, "id" | "timestamp">) => void;
  undo: (page?: UndoPage) => void;
  redo: (page?: UndoPage) => void;
  canUndo: (page?: UndoPage) => boolean;
  canRedo: (page?: UndoPage) => boolean;
  setCurrentPage: (page: UndoPage | null) => void;
  currentPage: UndoPage | null;
  lastUndoDescription: (page?: UndoPage) => string | null;
  lastRedoDescription: (page?: UndoPage) => string | null;
}

const PAGE_MAX_STACK: Record<string, number> = {
  "plan-vyroby": 50,
  "vyroba": 50,
  "project-table": 20,
  "tpv-list": 20,
};
const DEFAULT_MAX_STACK = 20;
const SESSION_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

const UndoRedoContext = createContext<UndoRedoState | null>(null);

// ── Provider ──────────────────────────────────────────────────────────
export function UndoRedoProvider({ children }: { children: React.ReactNode }) {
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const [, forceUpdate] = useState(0);
  const bump = useCallback(() => forceUpdate((n) => n + 1), []);
  const currentPageRef = useRef<UndoPage | null>(null);
  const [currentPage, setCurrentPageState] = useState<UndoPage | null>(null);
  const executingRef = useRef(false);
  const undoFnRef = useRef<(page?: UndoPage) => void>(() => {});

  const setCurrentPage = useCallback((page: UndoPage | null) => {
    currentPageRef.current = page;
    setCurrentPageState(page);
  }, []);

  function isExpired(entry: UndoEntry): boolean {
    return Date.now() - entry.timestamp.getTime() > SESSION_EXPIRY_MS;
  }

  const undo = useCallback(
    async (page?: UndoPage) => {
      if (executingRef.current) return;
      const targetPage = page ?? currentPageRef.current;
      let idx = -1;
      const stack = undoStackRef.current;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (!targetPage || stack[i].page === targetPage) { idx = i; break; }
      }
      if (idx === -1) return;

      const entry = undoStackRef.current[idx];

      // Check session expiry
      if (isExpired(entry)) {
        undoStackRef.current = [...undoStackRef.current.slice(0, idx), ...undoStackRef.current.slice(idx + 1)];
        bump();
        toast({ title: "Akce již nelze vrátit (vypršel čas)", duration: 3000 });
        return;
      }

      undoStackRef.current = [...undoStackRef.current.slice(0, idx), ...undoStackRef.current.slice(idx + 1)];
      const maxForPage = PAGE_MAX_STACK[entry.page] ?? DEFAULT_MAX_STACK;
      redoStackRef.current = [...redoStackRef.current, entry].slice(-maxForPage);
      bump();

      executingRef.current = true;
      try {
        await entry.undo();
        toast({ title: `← Vráceno: ${entry.description}`, duration: 2000 });
      } catch (err: any) {
        toast({
          title: "Nelze vrátit — data se změnila",
          description: err.message,
          variant: "destructive",
          duration: 3000,
        });
      }
      executingRef.current = false;
    },
    [bump]
  );

  useEffect(() => { undoFnRef.current = undo; }, [undo]);

  const redo = useCallback(
    async (page?: UndoPage) => {
      if (executingRef.current) return;
      const targetPage = page ?? currentPageRef.current;
      let idx = -1;
      const stack = redoStackRef.current;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (!targetPage || stack[i].page === targetPage) { idx = i; break; }
      }
      if (idx === -1) return;

      const entry = redoStackRef.current[idx];

      // Check session expiry
      if (isExpired(entry)) {
        redoStackRef.current = [...redoStackRef.current.slice(0, idx), ...redoStackRef.current.slice(idx + 1)];
        bump();
        toast({ title: "Akce již nelze vrátit (vypršel čas)", duration: 3000 });
        return;
      }

      redoStackRef.current = [...redoStackRef.current.slice(0, idx), ...redoStackRef.current.slice(idx + 1)];
      const maxForPage = PAGE_MAX_STACK[entry.page] ?? DEFAULT_MAX_STACK;
      undoStackRef.current = [...undoStackRef.current, entry].slice(-maxForPage);
      bump();

      executingRef.current = true;
      try {
        await entry.redo();
        toast({ title: `→ Opakováno: ${entry.description}`, duration: 2000 });
      } catch (err: any) {
        toast({
          title: "Nelze obnovit — data se změnila",
          description: err.message,
          variant: "destructive",
          duration: 3000,
        });
      }
      executingRef.current = false;
    },
    [bump]
  );

  const pushUndo = useCallback(
    (entry: Omit<UndoEntry, "id" | "timestamp">) => {
      const full: UndoEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: new Date(),
      };
      const maxForPage = PAGE_MAX_STACK[entry.page] ?? DEFAULT_MAX_STACK;
      const newStack = [...undoStackRef.current, full];
      let pageCount = newStack.filter(e => e.page === entry.page).length;
      while (pageCount > maxForPage) {
        const oldest = newStack.findIndex(e => e.page === entry.page);
        if (oldest === -1) break;
        newStack.splice(oldest, 1);
        pageCount--;
      }
      undoStackRef.current = newStack;
      redoStackRef.current = redoStackRef.current.filter((e) => e.page !== entry.page);
      bump();

      // Show undo toast for plan-vyroby and vyroba actions
      if (entry.page === "plan-vyroby" || entry.page === "vyroba") {
        const { dismiss } = toast({
          duration: 6000,
          className: "bg-muted text-foreground border-border shadow-md",
          title: (
            <div className="flex items-center justify-between w-full gap-4">
              <span className="text-sm font-medium">{entry.description}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss();
                  undoFnRef.current?.();
                }}
                className="text-muted-foreground font-medium hover:text-foreground transition-colors text-sm shrink-0"
              >
                Zpět
              </button>
            </div>
          ) as any,
          description: (
            <div className="mt-2 w-full">
              <div
                className="h-0.5 bg-border rounded-full origin-left"
                style={{ animation: `undo-shrink 6000ms linear forwards` }}
              />
              <style>{`@keyframes undo-shrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
            </div>
          ) as any,
        });
      }
    },
    [bump]
  );

  const canUndo = useCallback(
    (page?: UndoPage) => {
      const targetPage = page ?? currentPageRef.current;
      if (!targetPage) return undoStackRef.current.length > 0;
      return undoStackRef.current.some((e) => e.page === targetPage);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bump]
  );

  const canRedo = useCallback(
    (page?: UndoPage) => {
      const targetPage = page ?? currentPageRef.current;
      if (!targetPage) return redoStackRef.current.length > 0;
      return redoStackRef.current.some((e) => e.page === targetPage);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bump]
  );

  const lastUndoDescription = useCallback(
    (page?: UndoPage) => {
      const targetPage = page ?? currentPageRef.current;
      for (let i = undoStackRef.current.length - 1; i >= 0; i--) {
        if (!targetPage || undoStackRef.current[i].page === targetPage) {
          return undoStackRef.current[i].description;
        }
      }
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bump]
  );

  const lastRedoDescription = useCallback(
    (page?: UndoPage) => {
      const targetPage = page ?? currentPageRef.current;
      for (let i = redoStackRef.current.length - 1; i >= 0; i--) {
        if (!targetPage || redoStackRef.current[i].page === targetPage) {
          return redoStackRef.current[i].description;
        }
      }
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bump]
  );

  // ── Global keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      if (document.querySelector("[data-radix-portal]")) return;

      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  return (
    <UndoRedoContext.Provider value={{ pushUndo, undo, redo, canUndo, canRedo, setCurrentPage, currentPage, lastUndoDescription, lastRedoDescription }}>
      {children}
    </UndoRedoContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────
export function useUndoRedo() {
  const ctx = useContext(UndoRedoContext);
  if (!ctx) throw new Error("useUndoRedo must be used within UndoRedoProvider");
  return ctx;
}
