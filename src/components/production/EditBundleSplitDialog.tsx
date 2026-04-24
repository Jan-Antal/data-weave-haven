import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { getISOWeekNumber } from "@/hooks/useProductionSchedule";

export interface EditBundleSplitRow {
  id: string;
  item_code: string | null;
  scheduled_week: string;
  scheduled_hours: number;
  scheduled_czk: number;
  status: string;
  is_midflight: boolean;
}

interface EditBundleSplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundleName: string;
  splitGroupId: string;
  rows: EditBundleSplitRow[];
}

interface WeekBucket {
  weekKey: string;
  weekNum: number;
  rows: EditBundleSplitRow[];
  totalHours: number;
  locked: boolean;
}

function fmtDate(weekKey: string): string {
  try {
    const d = new Date(weekKey);
    return `${d.getDate()}.${d.getMonth() + 1}.`;
  } catch { return weekKey; }
}

export function EditBundleSplitDialog({
  open, onOpenChange, bundleName, splitGroupId, rows,
}: EditBundleSplitDialogProps) {
  const qc = useQueryClient();
  const { pushUndo } = useUndoRedo();
  const [percentages, setPercentages] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  // Group rows by week
  const weekBuckets = useMemo<WeekBucket[]>(() => {
    const map = new Map<string, WeekBucket>();
    for (const r of rows) {
      if (!map.has(r.scheduled_week)) {
        map.set(r.scheduled_week, {
          weekKey: r.scheduled_week,
          weekNum: getISOWeekNumber(new Date(r.scheduled_week)),
          rows: [],
          totalHours: 0,
          locked: false,
        });
      }
      const b = map.get(r.scheduled_week)!;
      b.rows.push(r);
      b.totalHours += Number(r.scheduled_hours) || 0;
    }
    // Lock weeks where ANY row is completed/expedice/cancelled or midflight
    for (const b of map.values()) {
      b.locked = b.rows.some(r =>
        r.is_midflight ||
        r.status === "completed" ||
        r.status === "expedice" ||
        r.status === "cancelled"
      );
    }
    return Array.from(map.values()).sort((a, b) => a.weekKey.localeCompare(b.weekKey));
  }, [rows]);

  const grandTotal = useMemo(
    () => weekBuckets.reduce((s, b) => s + b.totalHours, 0),
    [weekBuckets]
  );

  // Initialize percentages from current hour distribution
  useEffect(() => {
    if (!open) return;
    const init: Record<string, number> = {};
    if (grandTotal > 0) {
      for (const b of weekBuckets) {
        init[b.weekKey] = Math.round((b.totalHours / grandTotal) * 100);
      }
      // Adjust rounding so sum equals 100
      const sum = Object.values(init).reduce((s, v) => s + v, 0);
      if (sum !== 100 && weekBuckets.length > 0) {
        // Find last editable week to absorb the diff
        const editable = weekBuckets.filter(b => !b.locked);
        const last = editable[editable.length - 1] ?? weekBuckets[weekBuckets.length - 1];
        if (last) init[last.weekKey] = (init[last.weekKey] || 0) + (100 - sum);
      }
    }
    setPercentages(init);
  }, [open, weekBuckets, grandTotal]);

  const totalPct = useMemo(
    () => Object.values(percentages).reduce((s, v) => s + (Number(v) || 0), 0),
    [percentages]
  );
  const isValid = totalPct === 100;

  const handleSliderChange = useCallback((weekKey: string, value: number) => {
    setPercentages(prev => ({ ...prev, [weekKey]: value }));
  }, []);

  const handleAutoDistribute = useCallback(() => {
    const lockedSum = weekBuckets
      .filter(b => b.locked)
      .reduce((s, b) => s + (percentages[b.weekKey] || 0), 0);
    const editable = weekBuckets.filter(b => !b.locked);
    if (editable.length === 0) return;
    const remaining = Math.max(0, 100 - lockedSum);
    const each = Math.floor(remaining / editable.length);
    const leftover = remaining - each * editable.length;
    setPercentages(prev => {
      const next = { ...prev };
      editable.forEach((b, idx) => {
        next[b.weekKey] = each + (idx === editable.length - 1 ? leftover : 0);
      });
      return next;
    });
  }, [weekBuckets, percentages]);

  const handleSave = useCallback(async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      // Group rows by item_code across all weeks (only non-locked weeks need updating)
      const rowsByCode = new Map<string, EditBundleSplitRow[]>();
      for (const r of rows) {
        const code = r.item_code || "__no_code__";
        const arr = rowsByCode.get(code) || [];
        arr.push(r);
        rowsByCode.set(code, arr);
      }

      const updates: Array<{ id: string; scheduled_hours: number; scheduled_czk: number }> = [];
      const undoRecords: Array<{ id: string; scheduled_hours: number; scheduled_czk: number }> = [];

      for (const [, codeRows] of rowsByCode) {
        const totalHours = codeRows.reduce((s, r) => s + (Number(r.scheduled_hours) || 0), 0);
        const totalCzk = codeRows.reduce((s, r) => s + (Number(r.scheduled_czk) || 0), 0);

        // Calculate locked hours/czk for this code
        const lockedRows = codeRows.filter(r => {
          const bucket = weekBuckets.find(b => b.weekKey === r.scheduled_week);
          return bucket?.locked;
        });
        const lockedHours = lockedRows.reduce((s, r) => s + (Number(r.scheduled_hours) || 0), 0);
        const lockedCzk = lockedRows.reduce((s, r) => s + (Number(r.scheduled_czk) || 0), 0);
        const remainingHours = Math.max(0, totalHours - lockedHours);
        const remainingCzk = Math.max(0, totalCzk - lockedCzk);

        const editableRows = codeRows.filter(r => {
          const bucket = weekBuckets.find(b => b.weekKey === r.scheduled_week);
          return bucket && !bucket.locked;
        });
        const editablePctSum = editableRows.reduce((s, r) => s + (percentages[r.scheduled_week] || 0), 0);

        if (editablePctSum <= 0 || editableRows.length === 0) continue;

        // For each editable row, allocate proportionally to its week's pct
        let allocatedH = 0;
        let allocatedC = 0;
        editableRows.forEach((r, idx) => {
          const pct = percentages[r.scheduled_week] || 0;
          const isLast = idx === editableRows.length - 1;
          const newH = isLast
            ? Math.round((remainingHours - allocatedH) * 10) / 10
            : Math.round((remainingHours * pct / editablePctSum) * 10) / 10;
          const newC = isLast
            ? Math.max(0, remainingCzk - allocatedC)
            : Math.floor(remainingCzk * pct / editablePctSum);
          allocatedH += newH;
          allocatedC += newC;
          if (newH !== Number(r.scheduled_hours) || newC !== Number(r.scheduled_czk)) {
            updates.push({ id: r.id, scheduled_hours: newH, scheduled_czk: newC });
            undoRecords.push({
              id: r.id,
              scheduled_hours: Number(r.scheduled_hours),
              scheduled_czk: Number(r.scheduled_czk),
            });
          }
        });
      }

      if (updates.length === 0) {
        toast({ title: "Žádné změny" });
        onOpenChange(false);
        return;
      }

      // Apply updates one by one (Supabase doesn't support multi-row update in single call without upsert)
      for (const u of updates) {
        const { error } = await supabase
          .from("production_schedule")
          .update({ scheduled_hours: u.scheduled_hours, scheduled_czk: u.scheduled_czk })
          .eq("id", u.id);
        if (error) throw error;
      }

      // Push undo
      const productionQueryKeys = [
        ["production-schedule"],
        ["production-progress"],
        ["production-statuses"],
        ["production-expedice"],
      ];
      pushUndo({
        page: "plan-vyroby",
        actionType: "edit_bundle_split",
        description: `Upraveno rozdělení bundlu ${bundleName} po týdnech`,
        undo: async () => {
          for (const r of undoRecords) {
            await supabase
              .from("production_schedule")
              .update({ scheduled_hours: r.scheduled_hours, scheduled_czk: r.scheduled_czk })
              .eq("id", r.id);
          }
          for (const k of productionQueryKeys) qc.invalidateQueries({ queryKey: k });
        },
        redo: async () => {
          for (const u of updates) {
            await supabase
              .from("production_schedule")
              .update({ scheduled_hours: u.scheduled_hours, scheduled_czk: u.scheduled_czk })
              .eq("id", u.id);
          }
          for (const k of productionQueryKeys) qc.invalidateQueries({ queryKey: k });
        },
        undoPayload: { table: "production_schedule", operation: "update", records: undoRecords, queryKeys: productionQueryKeys },
        redoPayload: { table: "production_schedule", operation: "update", records: updates, queryKeys: productionQueryKeys },
      });

      for (const k of productionQueryKeys) qc.invalidateQueries({ queryKey: k });

      const summary = weekBuckets
        .map(b => `T${b.weekNum} ${percentages[b.weekKey] || 0}%`)
        .join(" / ");
      toast({ title: `↻ Rozdělení uloženo: ${summary}` });
      onOpenChange(false);
    } catch (err: any) {
      console.error("[EditBundleSplit] save failed:", err);
      toast({ title: "Chyba", description: err?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }, [isValid, submitting, rows, weekBuckets, percentages, pushUndo, qc, bundleName, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <div className="text-sm font-semibold text-foreground">⚙ Upravit rozdělení po týdnech</div>
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {bundleName} · celkem {Math.round(grandTotal)}h · {weekBuckets.length} týdnů
          </div>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {weekBuckets.map(b => {
            const pct = percentages[b.weekKey] || 0;
            const previewHours = Math.round((grandTotal * pct / 100) * 10) / 10;
            return (
              <div key={b.weekKey} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">
                    T{b.weekNum} · {fmtDate(b.weekKey)}
                    {b.locked && <span className="ml-1.5 text-muted-foreground">(zamknuto)</span>}
                  </span>
                  <span className="font-sans text-muted-foreground">
                    {pct}% (~{previewHours}h)
                  </span>
                </div>
                {!b.locked && (
                  <Slider
                    value={[pct]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([v]) => handleSliderChange(b.weekKey, v)}
                    className="w-full"
                  />
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleAutoDistribute}
            className="w-full text-xs text-primary hover:underline mt-2"
          >
            Auto-rozložit rovnoměrně
          </button>

          <div className={`text-xs text-center pt-2 border-t border-border ${isValid ? "text-emerald-600" : "text-destructive"}`}>
            {isValid
              ? `Σ = 100 % ✓`
              : `Součet musí být 100 % (aktuálně: ${totalPct} %)`
            }
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <button
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 text-xs rounded-md border border-input text-muted-foreground hover:bg-muted"
          >
            Zrušit
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || submitting}
            className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Ukládám..." : "Uložit"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
