import { useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { logActivity } from "@/lib/activityLog";

interface CancelItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemName: string;
  itemCode?: string | null;
  hours: number;
  projectName: string;
  projectId: string;
  source: "schedule" | "inbox";
  splitGroupId?: string | null;
  /** If true, cancel all parts in the split group */
  cancelAll?: boolean;
}

const REASON_OPTIONS = [
  { value: "klient", label: "Zrušeno klientem" },
  { value: "zmena", label: "Změna projektu" },
  { value: "duplicita", label: "Duplicita" },
  { value: "jine", label: "Jiné" },
] as const;

export function CancelItemDialog({
  open, onOpenChange, itemId, itemName, itemCode, hours, projectName, projectId,
  source, splitGroupId, cancelAll,
}: CancelItemDialogProps) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { pushUndo } = useUndoRedo();
  const [reason, setReason] = useState("klient");
  const [submitting, setSubmitting] = useState(false);

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["production-schedule"] });
    qc.invalidateQueries({ queryKey: ["production-inbox"] });
    qc.invalidateQueries({ queryKey: ["production-expedice"] });
    qc.invalidateQueries({ queryKey: ["production-progress"] });
  }, [qc]);

  const handleCancel = useCallback(async () => {
    setSubmitting(true);
    try {
      const cancelReason = REASON_OPTIONS.find(r => r.value === reason)?.label || reason;
      const cancelledAt = new Date().toISOString();
      const cancelledBy = user?.id ?? null;
      const updatePayload = {
        status: "cancelled",
        cancel_reason: cancelReason,
        cancelled_at: cancelledAt,
        cancelled_by: cancelledBy,
      } as any;
      const tableName = source === "schedule" ? "production_schedule" : "production_inbox";
      const idsForUndo = cancelAll && splitGroupId
        ? null
        : [itemId];
      const { data: beforeRows } = idsForUndo
        ? await supabase.from(tableName as any).select("*").in("id", idsForUndo)
        : await supabase.from(tableName as any).select("*").or(`split_group_id.eq.${splitGroupId},id.eq.${splitGroupId}`);

      if (cancelAll && splitGroupId) {
        // Cancel all parts in the split group via UPDATE — best-effort across both tables
        try {
          await supabase.from("production_schedule")
            .update(updatePayload)
            .or(`split_group_id.eq.${splitGroupId},id.eq.${splitGroupId}`);
        } catch (e) { console.warn("[Cancel] schedule split update failed:", e); }
        try {
          await supabase.from("production_inbox")
            .update(updatePayload)
            .or(`split_group_id.eq.${splitGroupId},id.eq.${splitGroupId}`);
        } catch (e) { console.warn("[Cancel] inbox split update failed:", e); }
      } else {
        if (source === "schedule") {
          const { error } = await supabase.from("production_schedule")
            .update(updatePayload)
            .eq("id", itemId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("production_inbox")
            .update(updatePayload)
            .eq("id", itemId);
          if (error) throw error;
        }
      }

      // Auto-sync: invalidate TPV virtual status (production-statuses cache).
      qc.invalidateQueries({ queryKey: ["production-statuses", projectId] });
      qc.invalidateQueries({ queryKey: ["tpv-items", projectId] });

      invalidateAll();

      const changedRows = (beforeRows || []).map((row: any) => ({ ...row, ...updatePayload }));
      if (beforeRows?.length) {
        pushUndo({
          page: "plan-vyroby",
          actionType: "item_cancelled",
          description: cancelAll ? `Zrušení ${beforeRows.length} částí položky ${cleanName}` : `Zrušení položky ${cleanName}`,
          undoDescription: cancelAll ? `Vrátí ${beforeRows.length} částí položky ${cleanName} zpět před zrušení` : `Vrátí položku ${cleanName} zpět před zrušení`,
          redoDescription: cancelAll ? `Znovu zruší ${beforeRows.length} částí položky ${cleanName}` : `Znovu zruší položku ${cleanName}`,
          undoPayload: { table: tableName, operation: "update", records: beforeRows as any[], queryKeys: [["production-schedule"], ["production-inbox"], ["production-progress"], ["production-statuses", projectId], ["tpv-items", projectId]] },
          redoPayload: { table: tableName, operation: "update", records: changedRows, queryKeys: [["production-schedule"], ["production-inbox"], ["production-progress"], ["production-statuses", projectId], ["tpv-items", projectId]] },
          undo: async () => {},
          redo: async () => {},
        });
      }

      // Log activity
      logActivity({
        projectId: projectId || "_production_",
        actionType: "item_cancelled",
        oldValue: source === "schedule" ? "Naplánováno" : "Inbox",
        newValue: "Zrušeno",
        detail: JSON.stringify({ item_name: itemName, item_code: itemCode, cancel_reason: cancelReason }),
      });

      toast({ title: `✕ Položka zrušena: ${cancelReason}` });
      onOpenChange(false);
    } catch (err: any) {
      console.error("[Cancel] handleCancel error:", err);
      toast({
        title: "Chyba při rušení položky",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
    setSubmitting(false);
  }, [reason, itemId, source, splitGroupId, cancelAll, invalidateAll, onOpenChange, itemName, projectId, itemCode, qc, user?.id, pushUndo]);

  const cleanName = itemName.replace(/\s*\(\d+\/\d+\)$/, "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px] p-0 gap-0" style={{ borderRadius: 12 }}>
        <div className="px-5 pt-5 pb-2">
          <div className="text-[13px] font-semibold" style={{ color: "#dc3545" }}>
            ⚠ Opravdu zrušit položku?
          </div>
        </div>

        <div className="px-5 pb-3 space-y-2.5">
          <div className="px-3 py-2 rounded-md" style={{ backgroundColor: "#fafaf8", border: "1px solid #ece8e2" }}>
            <div className="flex items-center gap-2">
              {itemCode && (
                <span className="font-sans text-[10px] font-bold" style={{ color: "#223937" }}>{itemCode}</span>
              )}
              <span className="text-[11px] font-medium" style={{ color: "#223937" }}>{cleanName}</span>
              <span className="font-sans text-[10px] ml-auto" style={{ color: "#6b7a78" }}>{hours}h</span>
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: "#99a5a3" }}>
              Projekt: {projectName} ({projectId})
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: "#6b7a78" }}>Důvod</label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full text-[11px] px-2.5 py-1.5 rounded-md bg-transparent outline-none"
              style={{ border: "1px solid #e2ddd6", color: "#223937" }}
            >
              {REASON_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid #ece8e2" }}>
          <button
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors"
            style={{ color: "#6b7a78", border: "1px solid #e2ddd6" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f0eee9")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            Zpět
          </button>
          <button
            onClick={handleCancel}
            disabled={submitting}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-md text-white transition-colors"
            style={{
              backgroundColor: "#dc3545",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Ruším..." : cancelAll ? "Zrušit všechny části" : "Zrušit položku"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
