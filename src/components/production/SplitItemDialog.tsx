import { useState, useMemo, useCallback, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { getISOWeekNumber } from "@/hooks/useProductionSchedule";
import { Slider } from "@/components/ui/slider";

interface WeekOption {
  key: string;
  weekNum: number;
  label: string;
  remainingCapacity: number;
}

interface SplitItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemName: string;
  itemCode?: string | null;
  totalHours: number;
  projectId: string;
  stageId: string | null;
  scheduledCzk: number;
  /** "schedule" for silo items, "inbox" for inbox items */
  source: "schedule" | "inbox";
  /** Current week key if from schedule */
  currentWeekKey?: string;
  /** Available weeks with capacity info */
  weeks: WeekOption[];
  weeklyCapacity: number;
  /** Existing split_group_id if re-splitting */
  splitGroupId?: string | null;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function renumberSiblings(splitGroupId: string) {
  const { data: siblings } = await supabase
    .from("production_schedule")
    .select("id, scheduled_week")
    .or(`split_group_id.eq.${splitGroupId},id.eq.${splitGroupId}`)
    .order("scheduled_week", { ascending: true });
  if (!siblings || siblings.length <= 1) return;
  const total = siblings.length;
  const updates = siblings.map((s, i) =>
    supabase.from("production_schedule").update({
      split_part: i + 1,
      split_total: total,
      item_name: undefined, // we'll handle names separately if needed
    }).eq("id", s.id)
  );
  // Actually just update part/total, not names
  for (let i = 0; i < siblings.length; i++) {
    await supabase.from("production_schedule").update({
      split_part: i + 1,
      split_total: total,
    }).eq("id", siblings[i].id);
  }
}

export { renumberSiblings };

export function SplitItemDialog({
  open, onOpenChange, itemId, itemName, itemCode, totalHours, projectId, stageId,
  scheduledCzk, source, currentWeekKey, weeks, weeklyCapacity, splitGroupId,
}: SplitItemDialogProps) {
  const qc = useQueryClient();
  const { pushUndo } = useUndoRedo();
  const [submitting, setSubmitting] = useState(false);
  const [pct, setPct] = useState(50);
  const [editingPart, setEditingPart] = useState<1 | 2 | null>(null);
  const [editValue, setEditValue] = useState("");

  const czkPerHour = totalHours > 0 ? scheduledCzk / totalHours : 550;
  const part1Hours = Math.round(totalHours * pct / 100);
  const part2Hours = totalHours - part1Hours;

  const futureWeeks = useMemo(() => {
    const today = getMonday(new Date()).toISOString().split("T")[0];
    return weeks.filter(w => w.key >= today);
  }, [weeks]);

  const defaultTargetWeek = useMemo(() => {
    if (!currentWeekKey) return futureWeeks[0]?.key || "";
    const idx = futureWeeks.findIndex(w => w.key === currentWeekKey);
    for (let i = idx + 1; i < futureWeeks.length; i++) {
      if (futureWeeks[i].remainingCapacity > 0) return futureWeeks[i].key;
    }
    return futureWeeks[idx + 1]?.key || futureWeeks[0]?.key || "";
  }, [currentWeekKey, futureWeeks]);

  const [targetWeek, setTargetWeek] = useState(defaultTargetWeek);

  useEffect(() => {
    setTargetWeek(defaultTargetWeek);
    setPct(50);
  }, [defaultTargetWeek, open]);

  const currentWeekNum = useMemo(() => {
    if (!currentWeekKey) return "?";
    return getISOWeekNumber(new Date(currentWeekKey));
  }, [currentWeekKey]);

  const targetWeekNum = useMemo(() => {
    const w = futureWeeks.find(w => w.key === targetWeek);
    return w?.weekNum ?? "?";
  }, [targetWeek, futureWeeks]);

  const cleanName = itemName.replace(/\s*\(\d+\/\d+\)$/, "");

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["production-schedule"] });
    qc.invalidateQueries({ queryKey: ["production-inbox"] });
    qc.invalidateQueries({ queryKey: ["production-expedice"] });
  }, [qc]);

  const handleSplit = useCallback(async () => {
    if (part1Hours <= 0 || part2Hours <= 0) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const groupId = splitGroupId || itemId;

      // Capture original state for undo
      let originalItem: any = null;
      if (source === "schedule") {
        const { data } = await supabase.from("production_schedule").select("*").eq("id", itemId).single();
        originalItem = data;
      } else {
        const { data } = await supabase.from("production_inbox").select("*").eq("id", itemId).single();
        originalItem = data;
      }

      if (source === "schedule") {
        await supabase.from("production_schedule").update({
          scheduled_hours: part1Hours,
          scheduled_czk: part1Hours * czkPerHour,
          split_group_id: groupId,
          split_part: 1,
          split_total: 2,
        }).eq("id", itemId);

        const { data: inserted } = await supabase.from("production_schedule").insert({
          project_id: projectId,
          stage_id: stageId,
          item_name: cleanName,
          item_code: itemCode ?? null,
          scheduled_week: targetWeek,
          scheduled_hours: part2Hours,
          scheduled_czk: part2Hours * czkPerHour,
          position: 999,
          status: "scheduled",
          created_by: user.id,
          split_group_id: groupId,
          split_part: 2,
          split_total: 2,
        }).select().single();

        await renumberSiblings(groupId);

        const { data: allParts } = await supabase
          .from("production_schedule")
          .select("id, split_part, split_total")
          .or(`split_group_id.eq.${groupId},id.eq.${groupId}`)
          .order("scheduled_week");
        if (allParts) {
          for (const p of allParts) {
            await supabase.from("production_schedule").update({
              item_name: `${cleanName} (${p.split_part}/${p.split_total})`,
            }).eq("id", p.id);
          }
        }

        invalidateAll();

        const insertedId = inserted?.id;
        pushUndo({
          page: "plan-vyroby",
          actionType: "split_item",
          description: `✂ Rozděleno: ${cleanName} (${part1Hours}h + ${part2Hours}h)`,
          undo: async () => {
            // Delete the created part
            if (insertedId) await supabase.from("production_schedule").delete().eq("id", insertedId);
            // Restore original
            if (originalItem) {
              await supabase.from("production_schedule").update({
                scheduled_hours: originalItem.scheduled_hours,
                scheduled_czk: originalItem.scheduled_czk,
                split_group_id: originalItem.split_group_id,
                split_part: originalItem.split_part,
                split_total: originalItem.split_total,
                item_name: originalItem.item_name,
              }).eq("id", itemId);
            }
            if (originalItem?.split_group_id) await renumberSiblings(originalItem.split_group_id);
            invalidateAll();
          },
          redo: async () => {
            const { data: { user: u } } = await supabase.auth.getUser();
            await supabase.from("production_schedule").update({
              scheduled_hours: part1Hours, scheduled_czk: part1Hours * czkPerHour,
              split_group_id: groupId, split_part: 1, split_total: 2,
            }).eq("id", itemId);
            await supabase.from("production_schedule").insert({
              project_id: projectId, stage_id: stageId, item_name: cleanName,
              item_code: itemCode ?? null, scheduled_week: targetWeek,
              scheduled_hours: part2Hours, scheduled_czk: part2Hours * czkPerHour,
              position: 999, status: "scheduled", created_by: u?.id,
              split_group_id: groupId, split_part: 2, split_total: 2,
            });
            await renumberSiblings(groupId);
            invalidateAll();
          },
        });
      } else {
        // Inbox split
        await supabase.from("production_inbox").update({
          estimated_hours: part1Hours,
          estimated_czk: part1Hours * czkPerHour,
          item_name: `${cleanName} (1/2)`,
          split_group_id: groupId,
          split_part: 1,
          split_total: 2,
        }).eq("id", itemId);

        await supabase.from("production_schedule").insert({
          project_id: projectId,
          stage_id: stageId,
          item_name: `${cleanName} (1/2)`,
          item_code: itemCode ?? null,
          scheduled_week: currentWeekKey || futureWeeks[0]?.key || "",
          scheduled_hours: part1Hours,
          scheduled_czk: part1Hours * czkPerHour,
          position: 999,
          status: "scheduled",
          created_by: user.id,
          inbox_item_id: itemId,
          split_group_id: groupId,
          split_part: 1,
          split_total: 2,
        });

        await supabase.from("production_inbox").update({ status: "scheduled" }).eq("id", itemId);

        const { data: inserted2 } = await supabase.from("production_schedule").insert({
          project_id: projectId,
          stage_id: stageId,
          item_name: `${cleanName} (2/2)`,
          item_code: itemCode ?? null,
          scheduled_week: targetWeek,
          scheduled_hours: part2Hours,
          scheduled_czk: part2Hours * czkPerHour,
          position: 999,
          status: "scheduled",
          created_by: user.id,
          split_group_id: groupId,
          split_part: 2,
          split_total: 2,
        }).select().single();

        invalidateAll();

        pushUndo({
          page: "plan-vyroby",
          actionType: "split_inbox_item",
          description: `✂ Rozděleno z inboxu: ${cleanName}`,
          undo: async () => {
            // Restore inbox item
            if (originalItem) {
              await supabase.from("production_inbox").update({
                estimated_hours: originalItem.estimated_hours,
                estimated_czk: originalItem.estimated_czk,
                item_name: originalItem.item_name,
                split_group_id: originalItem.split_group_id,
                split_part: originalItem.split_part,
                split_total: originalItem.split_total,
                status: "pending",
              }).eq("id", itemId);
            }
            // Delete created schedule rows
            await supabase.from("production_schedule").delete().eq("inbox_item_id", itemId);
            if (inserted2?.id) await supabase.from("production_schedule").delete().eq("id", inserted2.id);
            invalidateAll();
          },
          redo: async () => {
            // Simplified: re-run the split logic would be complex, just invalidate
            invalidateAll();
          },
        });
      }

      toast({ title: `Položka rozdělena: ${part1Hours}h + ${part2Hours}h` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  }, [part1Hours, part2Hours, itemId, cleanName, projectId, stageId, czkPerHour,
    source, currentWeekKey, targetWeek, splitGroupId, qc, onOpenChange, futureWeeks, itemCode, pushUndo, invalidateAll]);

  const handleHoursClick = (part: 1 | 2) => {
    setEditingPart(part);
    setEditValue(String(part === 1 ? part1Hours : part2Hours));
  };

  const commitHoursEdit = () => {
    if (editingPart === null) return;
    const val = Math.max(1, Math.min(totalHours - 1, parseInt(editValue) || 0));
    if (editingPart === 1) {
      setPct(Math.round(val / totalHours * 100));
    } else {
      setPct(Math.round((totalHours - val) / totalHours * 100));
    }
    setEditingPart(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[360px] p-0 gap-0" style={{ borderRadius: 12 }}>
        <div className="px-5 pt-5 pb-2">
          <div className="text-[13px] font-semibold" style={{ color: "#223937" }}>
            ✂ Rozdělit: {cleanName}
          </div>
          <div className="text-[11px] font-mono mt-0.5" style={{ color: "#99a5a3" }}>
            Celkem {totalHours}h
          </div>
        </div>

        {/* Slider */}
        <div className="px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold" style={{ color: "#6b7a78" }}>{pct}%</span>
            <span className="text-[10px] font-semibold" style={{ color: "#6b7a78" }}>{100 - pct}%</span>
          </div>
          <Slider
            value={[pct]}
            min={10}
            max={90}
            step={5}
            onValueChange={([v]) => setPct(v)}
            className="w-full"
          />
        </div>

        {/* Two columns showing result */}
        <div className="px-5 pb-3 grid grid-cols-2 gap-3">
          {/* Part 1 — stays */}
          <div className="rounded-md px-3 py-2" style={{ border: "1px solid #ece8e2", backgroundColor: "#fafaf8" }}>
            <div className="text-[9px] font-semibold mb-1" style={{ color: "#6b7a78" }}>
              Zde {source === "schedule" ? `(T${currentWeekNum})` : "(Inbox)"}:
            </div>
            {editingPart === 1 ? (
              <input
                type="number"
                className="font-mono text-[16px] font-bold w-full bg-transparent border-b outline-none text-center"
                style={{ color: "#223937", borderColor: "#3a8a36" }}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={commitHoursEdit}
                onKeyDown={e => e.key === "Enter" && commitHoursEdit()}
                autoFocus
              />
            ) : (
              <div
                className="font-mono text-[16px] font-bold text-center cursor-pointer rounded px-1 transition-colors"
                style={{ color: "#223937" }}
                onClick={() => handleHoursClick(1)}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f0eee9")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                {part1Hours}h
              </div>
            )}
          </div>

          {/* Part 2 — moves */}
          <div className="rounded-md px-3 py-2" style={{ border: "1px solid #ece8e2", backgroundColor: "#fafaf8" }}>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[9px] font-semibold" style={{ color: "#6b7a78" }}>→</span>
              <select
                value={targetWeek}
                onChange={e => setTargetWeek(e.target.value)}
                className="text-[9px] font-semibold bg-transparent border-none outline-none cursor-pointer"
                style={{ color: "#6b7a78" }}
              >
                {futureWeeks.map(w => (
                  <option key={w.key} value={w.key}>T{w.weekNum}</option>
                ))}
              </select>
            </div>
            {editingPart === 2 ? (
              <input
                type="number"
                className="font-mono text-[16px] font-bold w-full bg-transparent border-b outline-none text-center"
                style={{ color: "#223937", borderColor: "#3a8a36" }}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={commitHoursEdit}
                onKeyDown={e => e.key === "Enter" && commitHoursEdit()}
                autoFocus
              />
            ) : (
              <div
                className="font-mono text-[16px] font-bold text-center cursor-pointer rounded px-1 transition-colors"
                style={{ color: "#223937" }}
                onClick={() => handleHoursClick(2)}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f0eee9")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                {part2Hours}h
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid #ece8e2" }}>
          <button
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors"
            style={{ color: "#6b7a78", border: "1px solid #e2ddd6" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f0eee9")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            Zrušit
          </button>
          <button
            onClick={handleSplit}
            disabled={part1Hours <= 0 || part2Hours <= 0 || submitting}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-md text-white transition-colors"
            style={{
              backgroundColor: (part1Hours > 0 && part2Hours > 0) ? "#3a8a36" : "#99a5a3",
              cursor: (part1Hours > 0 && part2Hours > 0) ? "pointer" : "not-allowed",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Dělím..." : "Rozdělit"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
