import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  // percentages = user-edited values for editable weeks (excluding the auto-anchor week).
  // Locked week percentages are derived from DB hours (read-only).
  // The "auto" week absorbs the remainder (100 - sum(locked) - sum(others)).
  // By default the auto-anchor is the LAST editable week, but it shifts when the user
  // moves that week's slider so the user's input is always preserved.
  const [percentages, setPercentages] = useState<Record<string, number>>({});
  const [autoKey, setAutoKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const initializedFor = useRef<string | null>(null);

  // Group rows by week — recomputes when `rows` reference changes
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

  // Detect duplicated rows: identical (hours, czk) per item_code across editable weeks.
  const duplicateCodes = useMemo<string[]>(() => {
    const editableRows = rows.filter(r => {
      const b = weekBuckets.find(x => x.weekKey === r.scheduled_week);
      return b && !b.locked;
    });
    const byCode = new Map<string, Map<string, number>>();
    for (const r of editableRows) {
      const code = r.item_code || "__no_code__";
      const k = `${Number(r.scheduled_hours)}::${Number(r.scheduled_czk)}`;
      if (!byCode.has(code)) byCode.set(code, new Map());
      const inner = byCode.get(code)!;
      inner.set(k, (inner.get(k) ?? 0) + 1);
    }
    const result: string[] = [];
    for (const [code, inner] of byCode) {
      if (Array.from(inner.values()).some(c => c >= 2)) result.push(code);
    }
    return result;
  }, [rows, weekBuckets]);

  // Locked weeks: percentages are derived from current DB hours, displayed read-only
  const lockedPct = useMemo<Record<string, number>>(() => {
    const result: Record<string, number> = {};
    if (grandTotal <= 0) return result;
    for (const b of weekBuckets) {
      if (b.locked) {
        result[b.weekKey] = Math.round((b.totalHours / grandTotal) * 100);
      }
    }
    return result;
  }, [weekBuckets, grandTotal]);

  // Default auto-anchor = last editable week
  const defaultAutoKey = useMemo(() => {
    const editable = weekBuckets.filter(b => !b.locked);
    return editable.length > 0 ? editable[editable.length - 1].weekKey : null;
  }, [weekBuckets]);

  // Initialize ONLY when the dialog opens for a new splitGroupId — never on re-render.
  // Reads exact hour ratios from DB so the dialog mirrors what the user sees in silos.
  useEffect(() => {
    if (!open) {
      initializedFor.current = null;
      return;
    }
    if (initializedFor.current === splitGroupId) return;
    initializedFor.current = splitGroupId;

    if (grandTotal <= 0) { setPercentages({}); setAutoKey(defaultAutoKey); return; }

    // Compute raw percent for every week (locked + editable)
    const rawPct: Record<string, number> = {};
    for (const b of weekBuckets) {
      rawPct[b.weekKey] = Math.round((b.totalHours / grandTotal) * 100);
    }
    // Adjust rounding so total = 100 (absorb diff into default auto week)
    const sum = Object.values(rawPct).reduce((s, v) => s + v, 0);
    if (sum !== 100 && defaultAutoKey) {
      rawPct[defaultAutoKey] = (rawPct[defaultAutoKey] || 0) + (100 - sum);
    }
    // Keep ALL editable values in `percentages` state — even the auto-anchor,
    // so its slider can show + the user can grab it (which then shifts the anchor).
    const init: Record<string, number> = {};
    for (const b of weekBuckets) {
      if (b.locked) continue;
      init[b.weekKey] = rawPct[b.weekKey] ?? 0;
    }
    setPercentages(init);
    setAutoKey(defaultAutoKey);
  }, [open, splitGroupId, grandTotal, weekBuckets, defaultAutoKey]);

  // Live effective percentages used for display + save.
  const effectivePct = useMemo<Record<string, number>>(() => {
    const next: Record<string, number> = {};
    // Locked weeks = derived from DB
    for (const b of weekBuckets) if (b.locked) next[b.weekKey] = lockedPct[b.weekKey] ?? 0;
    // Editable non-auto = user-controlled
    for (const b of weekBuckets) {
      if (b.locked || b.weekKey === autoKey) continue;
      next[b.weekKey] = Number(percentages[b.weekKey]) || 0;
    }
    // Auto week = remainder
    if (autoKey) {
      const others = weekBuckets
        .filter(b => b.weekKey !== autoKey)
        .reduce((s, b) => s + (next[b.weekKey] || 0), 0);
      next[autoKey] = Math.max(0, 100 - others);
    }
    return next;
  }, [weekBuckets, lockedPct, percentages, autoKey]);

  const totalPct = useMemo(
    () => Object.values(effectivePct).reduce((s, v) => s + (Number(v) || 0), 0),
    [effectivePct]
  );
  const isValid = totalPct === 100;

  const handleSliderChange = useCallback((weekKey: string, value: number) => {
    const lockedSum = Object.values(lockedPct).reduce((s, v) => s + (v || 0), 0);
    const max = 100 - lockedSum;

    // If user grabs the current auto-anchor, shift the anchor to another editable
    // week so this week becomes a fixed user value.
    let nextAutoKey = autoKey;
    if (weekKey === autoKey) {
      const editable = weekBuckets.filter(b => !b.locked).map(b => b.weekKey);
      // Prefer the last editable that isn't this one; fallback to first other.
      const candidates = editable.filter(k => k !== weekKey);
      nextAutoKey = candidates.length > 0
        ? (candidates[candidates.length - 1] ?? null)
        : weekKey; // only one editable: nothing to shift to
    }

    setPercentages(prev => {
      const next = { ...prev, [weekKey]: value };
      // Cap so editable sum (excluding the new auto week) does not exceed available room
      const othersSum = weekBuckets
        .filter(b => !b.locked && b.weekKey !== nextAutoKey)
        .reduce((s, b) => s + (next[b.weekKey] || 0), 0);
      if (othersSum > max) {
        next[weekKey] = Math.max(0, value - (othersSum - max));
      }
      return next;
    });
    if (nextAutoKey !== autoKey) setAutoKey(nextAutoKey);
  }, [autoKey, weekBuckets, lockedPct]);

  const handleAutoDistribute = useCallback(() => {
    const lockedSum = Object.values(lockedPct).reduce((s, v) => s + (v || 0), 0);
    const editable = weekBuckets.filter(b => !b.locked);
    if (editable.length === 0) return;
    const remaining = Math.max(0, 100 - lockedSum);
    const each = Math.floor(remaining / editable.length);
    // Reset auto-anchor to default (last editable) so leftover lands there.
    setAutoKey(defaultAutoKey);
    setPercentages(prev => {
      const next = { ...prev };
      for (const b of editable) {
        if (b.weekKey === defaultAutoKey) continue;
        next[b.weekKey] = each;
      }
      return next;
    });
  }, [weekBuckets, lockedPct, defaultAutoKey]);

  const handleSave = useCallback(async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      // Group rows by item_code across all weeks
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
        // Skip codes that exist only in locked weeks (they stay untouched)
        const editableRowsAll = codeRows.filter(r => {
          const bucket = weekBuckets.find(b => b.weekKey === r.scheduled_week);
          return bucket && !bucket.locked;
        });
        if (editableRowsAll.length === 0) continue;

        // Detect duplicate rows: identical (hours, czk) appearing across multiple
        // editable weeks for the same item_code → use MAX (canonical) instead of SUM,
        // otherwise we'd treat the bloated total as truth.
        const editableRowsForCode = editableRowsAll;
        const dupKey = (r: EditBundleSplitRow) =>
          `${Number(r.scheduled_hours)}::${Number(r.scheduled_czk)}`;
        const dupCounts = new Map<string, number>();
        for (const r of editableRowsForCode) {
          const k = dupKey(r);
          dupCounts.set(k, (dupCounts.get(k) ?? 0) + 1);
        }
        const hasDuplicates = Array.from(dupCounts.values()).some(c => c >= 2);

        // Locked rows for this code (preserve their hours)
        const lockedRows = codeRows.filter(r => {
          const bucket = weekBuckets.find(b => b.weekKey === r.scheduled_week);
          return bucket?.locked;
        });
        const lockedHours = lockedRows.reduce((s, r) => s + (Number(r.scheduled_hours) || 0), 0);
        const lockedCzk = lockedRows.reduce((s, r) => s + (Number(r.scheduled_czk) || 0), 0);

        // Canonical total = MAX across editable rows when duplicates detected,
        // otherwise SUM (normal case after a clean split).
        const editableHoursMax = editableRowsForCode.reduce(
          (m, r) => Math.max(m, Number(r.scheduled_hours) || 0), 0
        );
        const editableCzkMax = editableRowsForCode.reduce(
          (m, r) => Math.max(m, Number(r.scheduled_czk) || 0), 0
        );
        const editableHoursSum = editableRowsForCode.reduce(
          (s, r) => s + (Number(r.scheduled_hours) || 0), 0
        );
        const editableCzkSum = editableRowsForCode.reduce(
          (s, r) => s + (Number(r.scheduled_czk) || 0), 0
        );
        const totalHours = lockedHours + (hasDuplicates ? editableHoursMax : editableHoursSum);
        const totalCzk = lockedCzk + (hasDuplicates ? editableCzkMax : editableCzkSum);

        const remainingHours = Math.max(0, totalHours - lockedHours);
        const remainingCzk = Math.max(0, totalCzk - lockedCzk);

        // Sum of editable percentages used for THIS code (only weeks where this code has rows)
        const editablePctSum = editableRowsAll.reduce(
          (s, r) => s + (effectivePct[r.scheduled_week] || 0), 0
        );
        if (editablePctSum <= 0) continue;

        let allocatedH = 0;
        let allocatedC = 0;
        editableRowsAll.forEach((r, idx) => {
          const pct = effectivePct[r.scheduled_week] || 0;
          const isLast = idx === editableRowsAll.length - 1;
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

      for (const u of updates) {
        const { error } = await supabase
          .from("production_schedule")
          .update({ scheduled_hours: u.scheduled_hours, scheduled_czk: u.scheduled_czk })
          .eq("id", u.id);
        if (error) throw error;
      }

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
        .map(b => `T${b.weekNum} ${effectivePct[b.weekKey] || 0}%`)
        .join(" / ");
      toast({ title: `↻ Rozdělení uloženo: ${summary}` });
      onOpenChange(false);
    } catch (err: any) {
      console.error("[EditBundleSplit] save failed:", err);
      toast({ title: "Chyba", description: err?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }, [isValid, submitting, rows, weekBuckets, effectivePct, pushUndo, qc, bundleName, onOpenChange]);

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
            const pct = effectivePct[b.weekKey] || 0;
            const previewHours = Math.round((grandTotal * pct / 100) * 10) / 10;
            const isAuto = b.weekKey === autoKey;
            // Slider is shown for ALL editable weeks (including the auto-anchor).
            // Locked weeks have no slider.
            const showSlider = !b.locked;
            return (
              <div key={b.weekKey} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">
                    T{b.weekNum} · {fmtDate(b.weekKey)}
                    {b.locked && <span className="ml-1.5 text-muted-foreground">(zamknuto)</span>}
                    {isAuto && !b.locked && <span className="ml-1.5 text-muted-foreground">(auto — zbytek)</span>}
                  </span>
                  <span className="font-sans text-muted-foreground">
                    {pct}% (~{previewHours}h)
                  </span>
                </div>
                {showSlider && (
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
