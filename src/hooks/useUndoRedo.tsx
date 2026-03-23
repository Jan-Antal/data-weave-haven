import React, { createContext, useContext, useCallback, useRef, useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────────────
export type UndoPage = "plan-vyroby" | "vyroba" | "project-table" | "tpv-list" | "settings";

export interface UndoPayload {
  table: string;
  operation: "update" | "delete" | "insert" | "multi";
  records: Record<string, any>[];
  newRecords?: Record<string, any>[];
  queryKeys?: string[][];
}

export interface UndoEntry {
  id: string;
  timestamp: Date;
  page: UndoPage;
  actionType: string;
  description: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  undoPayload?: UndoPayload;
  redoPayload?: UndoPayload;
  dbId?: string; // id in undo_sessions table
}

interface UndoRedoState {
  pushUndo: (entry: Omit<UndoEntry, "id" | "timestamp">) => void;
  popLastUndo: (page?: UndoPage) => UndoEntry | null;
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
const SESSION_EXPIRY_MS = 15 * 60 * 1000;

const UndoRedoContext = createContext<UndoRedoState | null>(null);

// ── Reconstructor ─────────────────────────────────────────────────────
async function executePayload(payload: UndoPayload, queryClient: ReturnType<typeof useQueryClient>) {
  if (payload.operation === "update") {
    for (const record of payload.records) {
      const { id, ...rest } = record;
      await supabase.from(payload.table as any).update(rest as any).eq("id", id);
    }
  } else if (payload.operation === "delete") {
    // Undo a delete = re-insert the records
    await supabase.from(payload.table as any).insert(payload.records as any);
  } else if (payload.operation === "insert") {
    // Undo an insert = delete the records
    const ids = payload.records.map(r => r.id);
    await supabase.from(payload.table as any).delete().in("id", ids);
  } else if (payload.operation === "multi") {
    // Multi combines sub-operations in records array
    for (const sub of payload.records) {
      await executePayload(sub as unknown as UndoPayload, queryClient);
    }
  }
  // Invalidate relevant query keys
  if (payload.queryKeys) {
    for (const key of payload.queryKeys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  }
}

function reconstructFromPayload(
  payload: UndoPayload,
  queryClient: ReturnType<typeof useQueryClient>
): () => Promise<void> {
  return async () => {
    await executePayload(payload, queryClient);
  };
}

// ── DB Persistence helpers ────────────────────────────────────────────
async function persistToDb(entry: UndoEntry, userId: string): Promise<string | null> {
  if (!entry.undoPayload || !entry.redoPayload) return null;
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS).toISOString();
  const { data, error } = await supabase.from("undo_sessions" as any).insert({
    user_id: userId,
    page: entry.page,
    action_type: entry.actionType,
    description: entry.description,
    undo_payload: entry.undoPayload,
    redo_payload: entry.redoPayload,
    expires_at: expiresAt,
  } as any).select("id").single();
  if (error) {
    console.warn("Failed to persist undo entry:", error.message);
    return null;
  }
  return (data as any)?.id ?? null;
}

async function removeFromDb(dbId: string) {
  await supabase.from("undo_sessions" as any).delete().eq("id", dbId);
}

async function refreshExpiry(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS).toISOString();
  await supabase.from("undo_sessions" as any)
    .update({ expires_at: expiresAt } as any)
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString());
}

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
  const userIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const loadedRef = useRef(false);

  const setCurrentPage = useCallback((page: UndoPage | null) => {
    currentPageRef.current = page;
    setCurrentPageState(page);
  }, []);

  // Track current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      userIdRef.current = data.user?.id ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      userIdRef.current = session?.user?.id ?? null;
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load persisted undo entries on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const loadPersistedEntries = async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data: rows, error } = await supabase
        .from("undo_sessions" as any)
        .select("*")
        .eq("user_id", user.user.id)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true });

      if (error || !rows || rows.length === 0) return;

      const entries: UndoEntry[] = (rows as any[]).map((row: any) => ({
        id: crypto.randomUUID(),
        timestamp: new Date(row.created_at),
        page: row.page as UndoPage,
        actionType: row.action_type,
        description: row.description,
        undoPayload: row.undo_payload as UndoPayload,
        redoPayload: row.redo_payload as UndoPayload,
        dbId: row.id,
        undo: reconstructFromPayload(row.undo_payload as UndoPayload, queryClient),
        redo: reconstructFromPayload(row.redo_payload as UndoPayload, queryClient),
      }));

      undoStackRef.current = entries;
      bump();
    };

    loadPersistedEntries();
  }, [queryClient, bump]);

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

      if (isExpired(entry)) {
        undoStackRef.current = [...undoStackRef.current.slice(0, idx), ...undoStackRef.current.slice(idx + 1)];
        if (entry.dbId) removeFromDb(entry.dbId);
        bump();
        toast({ title: "Akce již nelze vrátit (vypršel čas)", duration: 3000 });
        return;
      }

      undoStackRef.current = [...undoStackRef.current.slice(0, idx), ...undoStackRef.current.slice(idx + 1)];
      const maxForPage = PAGE_MAX_STACK[entry.page] ?? DEFAULT_MAX_STACK;
      redoStackRef.current = [...redoStackRef.current, entry].slice(-maxForPage);
      bump();

      // Remove from DB on undo
      if (entry.dbId) removeFromDb(entry.dbId);

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
        // Clean up DB entry for evicted items
        if (newStack[oldest].dbId) removeFromDb(newStack[oldest].dbId);
        newStack.splice(oldest, 1);
        pageCount--;
      }
      undoStackRef.current = newStack;
      // Clear redo for this page
      const evictedRedo = redoStackRef.current.filter((e) => e.page === entry.page);
      for (const r of evictedRedo) {
        if (r.dbId) removeFromDb(r.dbId);
      }
      redoStackRef.current = redoStackRef.current.filter((e) => e.page !== entry.page);
      bump();

      // Persist to DB if payloads provided
      if (entry.undoPayload && entry.redoPayload && userIdRef.current) {
        persistToDb(full, userIdRef.current).then((dbId) => {
          if (dbId) full.dbId = dbId;
        });
        // Refresh expiry on all entries
        refreshExpiry(userIdRef.current);
      }

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

  const popLastUndo = useCallback(
    (page?: UndoPage): UndoEntry | null => {
      const targetPage = page ?? currentPageRef.current;
      const stack = undoStackRef.current;
      let idx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (!targetPage || stack[i].page === targetPage) { idx = i; break; }
      }
      if (idx === -1) return null;
      const entry = stack[idx];
      undoStackRef.current = [...stack.slice(0, idx), ...stack.slice(idx + 1)];
      if (entry.dbId) removeFromDb(entry.dbId);
      bump();
      return entry;
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
