import { useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* ═══ Types ═══ */
export type UndoAction =
  | { type: "item_hotovo"; itemId: string; prevStatus: string; timestamp: number }
  | { type: "qc_confirm"; itemIds: string[]; timestamp: number }
  | { type: "move_items"; items: { id: string; prevWeek: string }[]; targetWeek: string; timestamp: number }
  | { type: "expedice"; projectId: string; prevStatus: string; itemSnapshots: { id: string; prevStatus: string }[]; timestamp: number }
  | { type: "phase_change"; bundleId: string; prevPhase: string; prevPercent: number; logId?: string; timestamp: number }
  | { type: "log_note"; logId: string; prevNote: string; logDate: string; projectId: string; timestamp: number }
  | { type: "no_activity"; logId: string; logDate: string; projectId: string; timestamp: number }
  | { type: "pause"; projectId: string; prevStatus: string; prevPauseReason: string | null; timestamp: number }
  | { type: "foto_upload"; fileId: string; projectId: string; fileName: string; timestamp: number };

const ACTION_LABELS: Record<UndoAction["type"], string> = {
  item_hotovo: "označení jako hotovo",
  qc_confirm: "QC potvrzení",
  move_items: "přesun položek",
  expedice: "odeslání do Expedice",
  phase_change: "změna fáze",
  log_note: "uložení poznámky",
  no_activity: "žádná aktivita",
  pause: "pozastavení projektu",
  foto_upload: "nahrání fotky",
};

const MAX_STACK = 50;
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/* ═══ Revert functions ═══ */
async function revertAction(action: UndoAction, qc: ReturnType<typeof useQueryClient>) {
  switch (action.type) {
    case "item_hotovo": {
      await supabase
        .from("production_schedule")
        .update({ status: action.prevStatus, completed_at: null, completed_by: null })
        .eq("id", action.itemId);
      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      break;
    }
    case "qc_confirm": {
      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
      for (const itemId of action.itemIds) {
        await (supabase.from("production_quality_checks" as any) as any)
          .delete()
          .eq("item_id", itemId)
          .gte("checked_at", oneMinuteAgo);
      }
      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["quality-checks"] });
      break;
    }
    case "move_items": {
      for (const item of action.items) {
        await supabase
          .from("production_schedule")
          .update({ scheduled_week: item.prevWeek })
          .eq("id", item.id);
      }
      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      break;
    }
    case "expedice": {
      await supabase
        .from("projects")
        .update({ status: action.prevStatus })
        .eq("project_id", action.projectId);
      for (const snap of action.itemSnapshots) {
        await supabase
          .from("production_schedule")
          .update({ status: snap.prevStatus, completed_at: null, completed_by: null })
          .eq("id", snap.id);
      }
      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["vyroba-project-details"] });
      break;
    }
    case "phase_change": {
      if (action.logId) {
        await (supabase.from("production_daily_logs") as any)
          .delete()
          .eq("id", action.logId);
      }
      qc.invalidateQueries({ queryKey: ["production-daily-logs"] });
      break;
    }
    case "log_note": {
      if (action.prevNote === "") {
        await (supabase.from("production_daily_logs") as any)
          .delete()
          .eq("id", action.logId);
      } else {
        await (supabase.from("production_daily_logs") as any)
          .update({ note_text: action.prevNote })
          .eq("id", action.logId);
      }
      qc.invalidateQueries({ queryKey: ["production-daily-logs"] });
      break;
    }
    case "no_activity": {
      await (supabase.from("production_daily_logs") as any)
        .delete()
        .eq("id", action.logId);
      qc.invalidateQueries({ queryKey: ["production-daily-logs"] });
      break;
    }
    case "pause": {
      const ids = action.projectId.split(",");
      await supabase
        .from("production_schedule")
        .update({
          status: action.prevStatus,
          pause_reason: action.prevPauseReason,
          pause_expected_date: null,
        })
        .in("id", ids);
      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      break;
    }
    case "foto_upload": {
      // Photo deletion via SharePoint is complex; just notify user
      toast.info("Fotku je třeba smazat ručně v SharePoint", { duration: 5000 });
      break;
    }
  }
}

/* ═══ Hook ═══ */
export function useVyrobaUndo() {
  const stack = useRef<UndoAction[]>([]);
  const sessionStart = useRef(Date.now());
  const qc = useQueryClient();

  const pushUndo = useCallback((action: UndoAction) => {
    stack.current = [...stack.current.slice(-(MAX_STACK - 1)), action];
  }, []);

  const performUndo = useCallback(async () => {
    if (stack.current.length === 0) {
      toast.info("Žádná akce k vrácení", { duration: 1500 });
      return;
    }

    const action = stack.current[stack.current.length - 1];
    stack.current = stack.current.slice(0, -1);

    // Check expiry
    const elapsed = Date.now() - sessionStart.current;
    if (elapsed > SESSION_TIMEOUT_MS) {
      toast.warning("Akce již nelze vrátit (vypršel čas)", { duration: 3000 });
      return;
    }

    const label = ACTION_LABELS[action.type];
    toast.loading(`Vracím: ${label}…`, { id: "undo-progress", duration: 5000 });

    try {
      await revertAction(action, qc);
      toast.success(`✓ Akce vrácena: ${label}`, { id: "undo-progress", duration: 2500 });
    } catch (err: any) {
      toast.error(`✗ Nelze vrátit: ${err?.message || "neznámá chyba"}`, { id: "undo-progress", duration: 4000 });
      // Push action back so user can retry
      stack.current = [...stack.current, action];
    }
  }, [qc]);

  // Global keyboard listener
  useEffect(() => {
    function handleGlobalUndo(e: KeyboardEvent) {
      // Skip if user is in input/textarea/contenteditable
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        performUndo();
      }
    }
    window.addEventListener("keydown", handleGlobalUndo);
    return () => window.removeEventListener("keydown", handleGlobalUndo);
  }, [performUndo]);

  return { pushUndo, performUndo };
}
