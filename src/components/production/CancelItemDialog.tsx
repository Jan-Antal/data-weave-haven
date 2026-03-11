import { useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { renumberSiblings } from "./SplitItemDialog";

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
  const { pushUndo } = useUndoRedo();
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

      if (cancelAll && splitGroupId) {
        // Cancel all parts in the split group
        // Delete from schedule
        await supabase.from("production_schedule")
          .delete()
          .or(`split_group_id.eq.${splitGroupId},id.eq.${splitGroupId}`);
        // Delete from inbox if any
        await supabase.from("production_inbox")
          .delete()
          .or(`split_group_id.eq.${splitGroupId},id.eq.${splitGroupId}`);
      } else {
        if (source === "schedule") {
          // Delete from production_schedule
          const { error } = await supabase.from("production_schedule").delete().eq("id", itemId);
          if (error) throw error;

          // If this was a split part, renumber siblings
          if (splitGroupId) {
            // Check remaining siblings
            const { data: remaining } = await supabase
              .from("production_schedule")
              .select("id")
              .or(`split_group_id.eq.${splitGroupId},id.eq.${splitGroupId}`);
            
            if (remaining && remaining.length > 1) {
              await renumberSiblings(splitGroupId);
              // Update names
              const { data: allParts } = await supabase
                .from("production_schedule")
                .select("id, split_part, split_total, item_name")
                .or(`split_group_id.eq.${splitGroupId},id.eq.${splitGroupId}`)
                .order("scheduled_week");
              if (allParts) {
                const cleanName = itemName.replace(/\s*\(\d+\/\d+\)$/, "");
                for (const p of allParts) {
                  await supabase.from("production_schedule").update({
                    item_name: `${cleanName} (${p.split_part}/${p.split_total})`,
                  }).eq("id", p.id);
                }
              }
            } else if (remaining && remaining.length === 1) {
              // Only one part left — remove split info
              const cleanName = itemName.replace(/\s*\(\d+\/\d+\)$/, "");
              await supabase.from("production_schedule").update({
                split_group_id: null,
                split_part: null,
                split_total: null,
                item_name: cleanName,
              }).eq("id", remaining[0].id);
            }
          }
        } else {
          // Delete from inbox
          const { error } = await supabase.from("production_inbox").delete().eq("id", itemId);
          if (error) throw error;
        }
      }

      invalidateAll();
      toast({ title: `✕ Položka zrušena: ${cancelReason}` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  }, [reason, itemId, source, splitGroupId, cancelAll, invalidateAll, onOpenChange, itemName]);

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
                <span className="font-mono text-[10px] font-bold" style={{ color: "#223937" }}>{itemCode}</span>
              )}
              <span className="text-[11px] font-medium" style={{ color: "#223937" }}>{cleanName}</span>
              <span className="font-mono text-[10px] ml-auto" style={{ color: "#6b7a78" }}>{hours}h</span>
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
