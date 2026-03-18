import { useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface AutoSplitPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemName: string;
  itemCode: string | null;
  itemHours: number;
  projectId: string;
  stageId: string | null;
  czkPerHour: number;
  /** Week being dropped into */
  targetWeekKey: string;
  targetWeekNum: number;
  /** Hours available in target week */
  availableHours: number;
  /** Next week with capacity */
  spillWeekKey: string;
  spillWeekNum: number;
  /** "inbox" or "schedule" */
  source: "inbox" | "schedule";
  /** Original inbox item ID if from inbox */
  inboxItemId?: string;
  /** Callback for "insert whole" (existing drag behavior) */
  onInsertWhole: () => Promise<void>;
}

export function AutoSplitPopover({
  open, onOpenChange, itemId, itemName, itemCode, itemHours, projectId, stageId, czkPerHour,
  targetWeekKey, targetWeekNum, availableHours, spillWeekKey, spillWeekNum,
  source, inboxItemId, onInsertWhole,
}: AutoSplitPopoverProps) {
  const part1Hours = Math.min(Math.max(availableHours, 0), itemHours);
  const part2Hours = itemHours - part1Hours;
  const overloadHours = itemHours - availableHours;

  // Guard: if split would create a 0-hour part, force "whole" only
  const splitViable = part1Hours > 0 && part2Hours > 0;

  const [choice, setChoice] = useState<"whole" | "split">(splitViable ? "split" : "whole");
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const handleConfirm = useCallback(async () => {
    setSubmitting(true);
    try {
      if (choice === "whole") {
        await onInsertWhole();
        onOpenChange(false);
        return;
      }

      // Split logic
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const cleanName = itemName.replace(/\s*\(\d+\/\d+\)$/, "");

      if (source === "inbox") {
        // Mark inbox as scheduled
        if (inboxItemId) {
          await supabase.from("production_inbox").update({ status: "scheduled" }).eq("id", inboxItemId);
        }

        // Create Part 1 in target week
        const { data: inserted, error: e1 } = await supabase.from("production_schedule").insert({
          project_id: projectId,
          stage_id: stageId,
          item_name: `${cleanName} (1/2)`,
          item_code: itemCode,
          scheduled_week: targetWeekKey,
          scheduled_hours: part1Hours,
          scheduled_czk: part1Hours * czkPerHour,
          position: 999,
          status: "scheduled",
          created_by: user.id,
          inbox_item_id: inboxItemId || null,
          split_part: 1,
          split_total: 2,
        }).select("id").single();
        if (e1) throw e1;

        const groupId = inserted!.id;

        // Update Part 1 with split_group_id
        await supabase.from("production_schedule")
          .update({ split_group_id: groupId })
          .eq("id", groupId);

        // Create Part 2 in spill week
        const { error: e2 } = await supabase.from("production_schedule").insert({
          project_id: projectId,
          stage_id: stageId,
          item_name: `${cleanName} (2/2)`,
          item_code: itemCode,
          scheduled_week: spillWeekKey,
          scheduled_hours: part2Hours,
          scheduled_czk: part2Hours * czkPerHour,
          position: 999,
          status: "scheduled",
          created_by: user.id,
          split_group_id: groupId,
          split_part: 2,
          split_total: 2,
        });
        if (e2) throw e2;
      } else {
        // Source is schedule — update existing item as Part 1
        const { error: e1 } = await supabase.from("production_schedule").update({
          scheduled_hours: part1Hours,
          scheduled_czk: part1Hours * czkPerHour,
          scheduled_week: targetWeekKey,
          item_name: `${cleanName} (1/2)`,
          split_group_id: itemId,
          split_part: 1,
          split_total: 2,
        }).eq("id", itemId);
        if (e1) throw e1;

        // Create Part 2
        const { error: e2 } = await supabase.from("production_schedule").insert({
          project_id: projectId,
          stage_id: stageId,
          item_name: `${cleanName} (2/2)`,
          item_code: itemCode,
          scheduled_week: spillWeekKey,
          scheduled_hours: part2Hours,
          scheduled_czk: part2Hours * czkPerHour,
          position: 999,
          status: "scheduled",
          created_by: user.id,
          split_group_id: itemId,
          split_part: 2,
          split_total: 2,
        });
        if (e2) throw e2;
      }

      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-inbox"] });
      qc.invalidateQueries({ queryKey: ["production-expedice"] });

      toast({ title: `Položka rozdělena: ${part1Hours}h → T${targetWeekNum}, ${part2Hours}h → T${spillWeekNum}` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  }, [choice, onInsertWhole, itemId, itemName, projectId, stageId, czkPerHour,
    targetWeekKey, targetWeekNum, spillWeekKey, spillWeekNum, part1Hours, part2Hours,
    source, inboxItemId, qc, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] p-0 gap-0" style={{ borderRadius: 12 }}>
        <div className="px-5 pt-5 pb-3">
          <div className="text-[13px] font-semibold" style={{ color: "#223937" }}>
            T{targetWeekNum} má volných jen {Math.max(availableHours, 0)}h
          </div>
          <div className="text-[11px] mt-1" style={{ color: "#6b7a78" }}>
            Položka: {itemName} ({itemHours}h)
          </div>
        </div>

        <div className="px-5 pb-3 space-y-2">
          {/* Option 1: Insert whole */}
          <label
            className="flex items-start gap-2.5 px-3 py-2.5 rounded-md cursor-pointer transition-colors"
            style={{
              border: choice === "whole" ? "1.5px solid #d97706" : "1px solid #ece8e2",
              backgroundColor: choice === "whole" ? "rgba(217,151,6,0.04)" : "transparent",
            }}
          >
            <input
              type="radio"
              name="split-choice"
              checked={choice === "whole"}
              onChange={() => setChoice("whole")}
              className="mt-0.5"
            />
            <div>
              <div className="text-[11px] font-semibold" style={{ color: "#223937" }}>
                Vložit celé
              </div>
              <div className="text-[10px]" style={{ color: "#d97706" }}>
                přetíží +{overloadHours}h
              </div>
            </div>
          </label>

          {/* Option 2: Split */}
          <label
            className="flex items-start gap-2.5 px-3 py-2.5 rounded-md cursor-pointer transition-colors"
            style={{
              border: choice === "split" ? "1.5px solid #3a8a36" : "1px solid #ece8e2",
              backgroundColor: choice === "split" ? "rgba(58,138,54,0.04)" : "transparent",
            }}
          >
            <input
              type="radio"
              name="split-choice"
              checked={choice === "split"}
              onChange={() => setChoice("split")}
              className="mt-0.5"
            />
            <div>
              <div className="text-[11px] font-semibold" style={{ color: "#223937" }}>
                Rozdělit
              </div>
              <div className="text-[10px] font-mono" style={{ color: "#6b7a78" }}>
                {part1Hours}h → T{targetWeekNum}<br />
                {part2Hours}h → T{spillWeekNum}
              </div>
            </div>
          </label>
        </div>

        <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid #ece8e2" }}>
          <button
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors"
            style={{ color: "#6b7a78", border: "1px solid #e2ddd6" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f0eee9")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            Zrušit
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-md text-white transition-colors"
            style={{
              backgroundColor: choice === "split" ? "#3a8a36" : "#d97706",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Ukládám..." : "Potvrdit"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
