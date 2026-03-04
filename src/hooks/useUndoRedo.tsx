import React, { createContext, useContext, useCallback, useRef, useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────
export type UndoPage = "plan-vyroby" | "tpv-list" | "project-table" | "settings";

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
  /** Current page context — set by each page to scope shortcuts */
  setCurrentPage: (page: UndoPage | null) => void;
  currentPage: UndoPage | null;
}

const MAX_STACK = 20;

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

  const setCurrentPage = useCallback((page: UndoPage | null) => {
    currentPageRef.current = page;
    setCurrentPageState(page);
  }, []);

  const pushUndo = useCallback(
    (entry: Omit<UndoEntry, "id" | "timestamp">) => {
      const full: UndoEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: new Date(),
      };
      undoStackRef.current = [...undoStackRef.current, full].slice(-MAX_STACK);
      // New action clears redo for this page
      redoStackRef.current = redoStackRef.current.filter((e) => e.page !== entry.page);
      bump();
    },
    [bump]
  );

  const undo = useCallback(
    async (page?: UndoPage) => {
      if (executingRef.current) return;
      const targetPage = page ?? currentPageRef.current;
      // Find last entry for this page
      const idx = targetPage
        ? undoStackRef.current.findLastIndex((e) => e.page === targetPage)
        : undoStackRef.current.length - 1;
      if (idx === -1) return;

      const entry = undoStackRef.current[idx];
      undoStackRef.current = [...undoStackRef.current.slice(0, idx), ...undoStackRef.current.slice(idx + 1)];
      redoStackRef.current = [...redoStackRef.current, entry].slice(-MAX_STACK);
      bump();

      executingRef.current = true;
      try {
        await entry.undo();
        toast({ title: `↩ Vráceno: ${entry.description}`, duration: 2000 });
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

  const redo = useCallback(
    async (page?: UndoPage) => {
      if (executingRef.current) return;
      const targetPage = page ?? currentPageRef.current;
      const idx = targetPage
        ? redoStackRef.current.findLastIndex((e) => e.page === targetPage)
        : redoStackRef.current.length - 1;
      if (idx === -1) return;

      const entry = redoStackRef.current[idx];
      redoStackRef.current = [...redoStackRef.current.slice(0, idx), ...redoStackRef.current.slice(idx + 1)];
      undoStackRef.current = [...undoStackRef.current, entry].slice(-MAX_STACK);
      bump();

      executingRef.current = true;
      try {
        await entry.redo();
        toast({ title: `↪ Obnoveno: ${entry.description}`, duration: 2000 });
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

  // ── Global keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture in inputs/textareas/contentEditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      // Don't capture when a dialog/modal is open (check for radix dialog overlay)
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
    <UndoRedoContext.Provider value={{ pushUndo, undo, redo, canUndo, canRedo, setCurrentPage, currentPage }}>
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
