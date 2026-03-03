import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { getISOWeekNumber } from "@/hooks/useProductionSchedule";

interface WeekOption {
  key: string;
  weekNum: number;
  label: string;
  remainingCapacity: number;
}

interface SplitPart {
  hours: number;
  weekKey: string;
}

interface SplitItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemName: string;
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
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function findWeeksWithCapacity(weeks: WeekOption[], hoursNeeded: number, excludeKey?: string): string[] {
  const result: string[] = [];
  let remaining = hoursNeeded;
  for (const w of weeks) {
    if (w.key === excludeKey) continue;
    if (w.remainingCapacity > 0 && remaining > 0) {
      result.push(w.key);
      remaining -= w.remainingCapacity;
      if (remaining <= 0) break;
    }
  }
  // Fallback: if no weeks with capacity, just pick the next week after current
  if (result.length === 0 && weeks.length > 0) {
    const currentIdx = excludeKey ? weeks.findIndex(w => w.key === excludeKey) : -1;
    const nextIdx = currentIdx >= 0 ? currentIdx + 1 : 0;
    if (nextIdx < weeks.length) result.push(weeks[nextIdx].key);
    else result.push(weeks[weeks.length - 1].key);
  }
  return result;
}

export function SplitItemDialog({
  open, onOpenChange, itemId, itemName, totalHours, projectId, stageId,
  scheduledCzk, source, currentWeekKey, weeks, weeklyCapacity,
}: SplitItemDialogProps) {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  // Calculate CZK rate per hour
  const czkPerHour = totalHours > 0 ? scheduledCzk / totalHours : 550;

  // Filter to future weeks only
  const futureWeeks = useMemo(() => {
    const today = getMonday(new Date()).toISOString().split("T")[0];
    return weeks.filter(w => w.key >= today);
  }, [weeks]);

  // Default parts
  const defaultParts = useMemo((): SplitPart[] => {
    if (source === "schedule" && currentWeekKey) {
      const currentWeek = futureWeeks.find(w => w.key === currentWeekKey);
      const remaining = currentWeek ? Math.max(currentWeek.remainingCapacity, 0) : totalHours;
      const part1Hours = Math.min(remaining, totalHours);
      const part2Hours = totalHours - part1Hours;
      const nextWeeks = findWeeksWithCapacity(futureWeeks, part2Hours, currentWeekKey);
      return [
        { hours: part1Hours > 0 ? part1Hours : Math.round(totalHours / 2), weekKey: currentWeekKey },
        { hours: part2Hours > 0 ? part2Hours : totalHours - Math.round(totalHours / 2), weekKey: nextWeeks[0] || currentWeekKey },
      ];
    } else {
      // Inbox: 50% rounded to nearest 10
      const part1 = Math.round((totalHours * 0.5) / 10) * 10;
      const part2 = totalHours - part1;
      const targetWeeks = findWeeksWithCapacity(futureWeeks, totalHours);
      return [
        { hours: part1, weekKey: targetWeeks[0] || futureWeeks[0]?.key || "" },
        { hours: part2, weekKey: targetWeeks[1] || targetWeeks[0] || futureWeeks[1]?.key || futureWeeks[0]?.key || "" },
      ];
    }
  }, [source, currentWeekKey, totalHours, futureWeeks]);

  const [parts, setParts] = useState<SplitPart[]>(defaultParts);

  const sum = parts.reduce((s, p) => s + p.hours, 0);
  const isValid = sum === totalHours && parts.every(p => p.hours > 0) && parts.every(p => p.weekKey);

  const updatePart = (idx: number, field: keyof SplitPart, value: any) => {
    setParts(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const addPart = () => {
    if (parts.length >= 5) return;
    const nextWeek = futureWeeks.find(w => !parts.some(p => p.weekKey === w.key));
    setParts(prev => [...prev, { hours: 0, weekKey: nextWeek?.key || futureWeeks[0]?.key || "" }]);
  };

  const removePart = (idx: number) => {
    if (parts.length <= 2) return;
    setParts(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSplit = useCallback(async () => {
    if (!isValid) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const n = parts.length;

      if (source === "schedule") {
        // Update original item (Part 1)
        const cleanName = itemName.replace(/\s*\(\d+\/\d+\)$/, "");
        const { error: updateErr } = await supabase
          .from("production_schedule")
          .update({
            scheduled_hours: parts[0].hours,
            scheduled_czk: parts[0].hours * czkPerHour,
            scheduled_week: parts[0].weekKey,
            item_name: `${cleanName} (1/${n})`,
            split_group_id: itemId,
            split_part: 1,
            split_total: n,
          })
          .eq("id", itemId);
        if (updateErr) throw updateErr;

        // Create new rows for Parts 2+
        const newRows = parts.slice(1).map((part, i) => ({
          project_id: projectId,
          stage_id: stageId,
          item_name: `${cleanName} (${i + 2}/${n})`,
          scheduled_week: part.weekKey,
          scheduled_hours: part.hours,
          scheduled_czk: part.hours * czkPerHour,
          position: 999,
          status: "scheduled" as const,
          created_by: user.id,
          split_group_id: itemId,
          split_part: i + 2,
          split_total: n,
        }));

        const { error: insertErr } = await supabase.from("production_schedule").insert(newRows);
        if (insertErr) throw insertErr;
      } else {
        // Inbox split: update original, create schedule rows for others
        const cleanName = itemName.replace(/\s*\(\d+\/\d+\)$/, "");

        // Update inbox item to Part 1 hours
        const { error: updateErr } = await supabase
          .from("production_inbox")
          .update({
            estimated_hours: parts[0].hours,
            estimated_czk: parts[0].hours * czkPerHour,
            item_name: `${cleanName} (1/${n})`,
            split_group_id: itemId,
            split_part: 1,
            split_total: n,
          })
          .eq("id", itemId);
        if (updateErr) throw updateErr;

        // Move Part 1 to its target week (create schedule row, mark inbox as scheduled)
        const { error: schedErr } = await supabase.from("production_schedule").insert({
          project_id: projectId,
          stage_id: stageId,
          item_name: `${cleanName} (1/${n})`,
          scheduled_week: parts[0].weekKey,
          scheduled_hours: parts[0].hours,
          scheduled_czk: parts[0].hours * czkPerHour,
          position: 999,
          status: "scheduled",
          created_by: user.id,
          inbox_item_id: itemId,
          split_group_id: itemId,
          split_part: 1,
          split_total: n,
        });
        if (schedErr) throw schedErr;

        const { error: statusErr } = await supabase
          .from("production_inbox")
          .update({ status: "scheduled" })
          .eq("id", itemId);
        if (statusErr) throw statusErr;

        // Create schedule rows for Parts 2+
        const newRows = parts.slice(1).map((part, i) => ({
          project_id: projectId,
          stage_id: stageId,
          item_name: `${cleanName} (${i + 2}/${n})`,
          scheduled_week: part.weekKey,
          scheduled_hours: part.hours,
          scheduled_czk: part.hours * czkPerHour,
          position: 999,
          status: "scheduled" as const,
          created_by: user.id,
          split_group_id: itemId,
          split_part: i + 2,
          split_total: n,
        }));

        const { error: insertErr } = await supabase.from("production_schedule").insert(newRows);
        if (insertErr) throw insertErr;
      }

      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-inbox"] });
      qc.invalidateQueries({ queryKey: ["production-expedice"] });

      toast({ title: `Položka rozdělena na ${n} částí` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  }, [isValid, parts, itemId, itemName, projectId, stageId, czkPerHour, source, qc, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px] p-0 gap-0" style={{ borderRadius: 12 }}>
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-[14px] font-semibold" style={{ color: "#223937" }}>
            ✂ Rozdělit: {itemName}
          </DialogTitle>
          <DialogDescription className="text-[11px] font-mono" style={{ color: "#99a5a3" }}>
            Celkem {totalHours}h
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-3 space-y-2 max-h-[350px] overflow-y-auto">
          {parts.map((part, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 px-3 py-2 rounded-md"
              style={{ border: "1px solid #ece8e2" }}
            >
              <span className="text-[10px] font-semibold shrink-0" style={{ color: "#6b7a78" }}>
                Část {idx + 1}:
              </span>
              <input
                type="number"
                min={1}
                value={part.hours || ""}
                onChange={(e) => updatePart(idx, "hours", Math.max(0, parseInt(e.target.value) || 0))}
                className="w-[60px] font-mono text-[12px] font-bold px-1.5 py-1 rounded text-center"
                style={{ border: "1px solid #e2ddd6", color: "#223937", backgroundColor: "#fafaf8" }}
              />
              <span className="text-[10px]" style={{ color: "#99a5a3" }}>h →</span>
              <select
                value={part.weekKey}
                onChange={(e) => updatePart(idx, "weekKey", e.target.value)}
                className="flex-1 text-[10px] font-mono px-1.5 py-1 rounded"
                style={{ border: "1px solid #e2ddd6", color: "#223937", backgroundColor: "#fafaf8" }}
              >
                {futureWeeks.map((w) => (
                  <option key={w.key} value={w.key}>
                    T{w.weekNum} · {w.label}
                  </option>
                ))}
              </select>
              {idx >= 2 && (
                <button
                  onClick={() => removePart(idx)}
                  className="text-[12px] font-bold shrink-0 w-5 h-5 rounded hover:bg-red-50 transition-colors"
                  style={{ color: "#dc3545" }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {/* Add part button */}
          {parts.length < 5 && (
            <button
              onClick={addPart}
              className="w-full text-[10px] font-medium py-1.5 rounded-md transition-colors"
              style={{ border: "1px dashed #e2ddd6", color: "#6b7a78" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8f7f5")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              + Přidat část
            </button>
          )}

          {/* Validation sum */}
          <div className="flex items-center justify-center gap-1 pt-1">
            <span className="text-[11px] font-mono font-semibold" style={{ color: isValid ? "#3a8a36" : "#dc3545" }}>
              Celkem: {sum}h / {totalHours}h {isValid ? "✓" : "✗"}
            </span>
          </div>
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
            onClick={handleSplit}
            disabled={!isValid || submitting}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-md text-white transition-colors"
            style={{
              backgroundColor: isValid ? "#3a8a36" : "#99a5a3",
              cursor: isValid ? "pointer" : "not-allowed",
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
