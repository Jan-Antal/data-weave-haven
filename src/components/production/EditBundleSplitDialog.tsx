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
  /** Project for canonical TPV lookup (preferred). If omitted, dialog falls back to schedule sums. */
  projectId?: string;
  /** Stage for new schedule rows (auto-created for missing items) */
  stageId?: string | null;
}

interface WeekBucket {
  weekKey: string;
  weekNum: number;
  rows: EditBundleSplitRow[];
  totalHours: number;
  locked: boolean;
}

interface TpvCanonical {
  item_code: string;
  item_name: string;
  hodiny_plan: number;
  cena: number;
  pocet: number;
}

function fmtDate(weekKey: string): string {
  try {
    const d = new Date(weekKey);
    return `${d.getDate()}.${d.getMonth() + 1}.`;
  } catch { return weekKey; }
}

function normalizeItemCode(code: string | null | undefined): string {
  if (!code) return "";
  return code.replace(/_[a-z0-9]{4,8}$/i, "");
}

export function EditBundleSplitDialog({
  open, onOpenChange, bundleName, splitGroupId, rows, projectId, stageId,
}: EditBundleSplitDialogProps) {
  const qc = useQueryClient();
  const { pushUndo } = useUndoRedo();
  const [percentages, setPercentages] = useState<Record<string, number>>({});
  const [autoKey, setAutoKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const initializedFor = useRef<string | null>(null);

  // Canonical TPV per item_code for the project (fetched on open)
  const [tpvByCode, setTpvByCode] = useState<Map<string, TpvCanonical> | null>(null);
  const [hourlyRate, setHourlyRate] = useState<number>(550);

  useEffect(() => {
    if (!open || !projectId) { setTpvByCode(null); return; }
    let cancelled = false;
    (async () => {
      const [tpvRes, settRes] = await Promise.all([
        supabase
          .from("tpv_items")
          .select("item_code, nazev, hodiny_plan, cena, pocet, status")
          .eq("project_id", projectId)
          .is("deleted_at", null),
        supabase.from("production_settings").select("hourly_rate").limit(1).single(),
      ]);
      if (cancelled) return;
      const map = new Map<string, TpvCanonical>();
      for (const t of (tpvRes.data || []) as any[]) {
        if (!t.item_code) continue;
        if (t.status === "Zrušeno") continue;
        if (!(Number(t.cena) > 0)) continue;
        if (!(Number(t.hodiny_plan) > 0)) continue;
        map.set(t.item_code, {
          item_code: t.item_code,
          item_name: t.nazev || t.item_code,
          hodiny_plan: Number(t.hodiny_plan) || 0,
          cena: Number(t.cena) || 0,
          pocet: Number(t.pocet) || 1,
        });
      }
      setTpvByCode(map);
      const hr = Number((settRes.data as any)?.hourly_rate) || 550;
      setHourlyRate(hr);
    })();
    return () => { cancelled = true; };
  }, [open, projectId]);

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

  // Per-item canonical totals (TPV hours per item_code, summed across all distinct codes in chain)
  // Chain rows tell us which item_codes belong to this bundle.
  const chainCodes = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const c = normalizeItemCode(r.item_code);
      if (c) s.add(c);
    }
    return s;
  }, [rows]);

  // Locked hours per item_code (sum of hours in locked weeks)
  const lockedHoursByCode = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const b of weekBuckets) {
      if (!b.locked) continue;
      for (const r of b.rows) {
        const c = normalizeItemCode(r.item_code);
        if (!c) continue;
        out[c] = (out[c] || 0) + (Number(r.scheduled_hours) || 0);
      }
    }
    return out;
  }, [weekBuckets]);

  // Canonical TPV total for the chain — sum across item_codes present in the chain.
  // If TPV not loaded yet (projectId not provided), fall back to schedule sum.
  const canonicalTotalHours = useMemo(() => {
    if (!tpvByCode) {
      return weekBuckets.reduce((s, b) => s + b.totalHours, 0);
    }
    let sum = 0;
    for (const code of chainCodes) {
      const t = tpvByCode.get(code);
      if (t) sum += t.hodiny_plan;
      else {
        // unknown code (no TPV) — fall back to its current schedule sum
        for (const b of weekBuckets) {
          for (const r of b.rows) {
            if (normalizeItemCode(r.item_code) === code) sum += Number(r.scheduled_hours) || 0;
          }
        }
      }
    }
    return Math.round(sum * 10) / 10;
  }, [tpvByCode, chainCodes, weekBuckets]);

  const lockedHoursTotal = useMemo(() => {
    return weekBuckets
      .filter(b => b.locked)
      .reduce((s, b) => s + b.totalHours, 0);
  }, [weekBuckets]);

  const remainingHoursTotal = Math.max(0, Math.round((canonicalTotalHours - lockedHoursTotal) * 10) / 10);

  // Locked weeks % derived from DB hours / canonical total
  const lockedPct = useMemo<Record<string, number>>(() => {
    const result: Record<string, number> = {};
    if (canonicalTotalHours <= 0) return result;
    for (const b of weekBuckets) {
      if (b.locked) {
        result[b.weekKey] = Math.round((b.totalHours / canonicalTotalHours) * 100);
      }
    }
    return result;
  }, [weekBuckets, canonicalTotalHours]);

  const defaultAutoKey = useMemo(() => {
    const editable = weekBuckets.filter(b => !b.locked);
    return editable.length > 0 ? editable[editable.length - 1].weekKey : null;
  }, [weekBuckets]);

  // Initialize percentages on dialog open. Uses current schedule ratios for editable weeks
  // mapped to remaining (canonical − locked).
  useEffect(() => {
    if (!open) {
      initializedFor.current = null;
      return;
    }
    // Wait until TPV loaded if projectId is given
    if (projectId && !tpvByCode) return;
    if (initializedFor.current === splitGroupId) return;
    initializedFor.current = splitGroupId;

    if (canonicalTotalHours <= 0) { setPercentages({}); setAutoKey(defaultAutoKey); return; }

    const rawPct: Record<string, number> = {};
    for (const b of weekBuckets) {
      rawPct[b.weekKey] = Math.round((b.totalHours / canonicalTotalHours) * 100);
    }
    const sum = Object.values(rawPct).reduce((s, v) => s + v, 0);
    if (sum !== 100 && defaultAutoKey) {
      rawPct[defaultAutoKey] = (rawPct[defaultAutoKey] || 0) + (100 - sum);
    }
    const init: Record<string, number> = {};
    for (const b of weekBuckets) {
      if (b.locked) continue;
      init[b.weekKey] = Math.max(0, rawPct[b.weekKey] ?? 0);
    }
    setPercentages(init);
    setAutoKey(defaultAutoKey);
  }, [open, splitGroupId, canonicalTotalHours, weekBuckets, defaultAutoKey, projectId, tpvByCode]);

  const effectivePct = useMemo<Record<string, number>>(() => {
    const next: Record<string, number> = {};
    for (const b of weekBuckets) if (b.locked) next[b.weekKey] = lockedPct[b.weekKey] ?? 0;
    for (const b of weekBuckets) {
      if (b.locked || b.weekKey === autoKey) continue;
      next[b.weekKey] = Number(percentages[b.weekKey]) || 0;
    }
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

    let nextAutoKey = autoKey;
    if (weekKey === autoKey) {
      const editable = weekBuckets.filter(b => !b.locked).map(b => b.weekKey);
      const candidates = editable.filter(k => k !== weekKey);
      nextAutoKey = candidates.length > 0
        ? (candidates[candidates.length - 1] ?? null)
        : weekKey;
    }

    setPercentages(prev => {
      const next = { ...prev, [weekKey]: value };
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
      const editableBuckets = weekBuckets.filter(b => !b.locked);
      const editablePctSum = editableBuckets.reduce(
        (s, b) => s + (effectivePct[b.weekKey] || 0), 0
      );
      if (editablePctSum <= 0) {
        toast({ title: "Žádný editovatelný týden" });
        setSubmitting(false);
        onOpenChange(false);
        return;
      }

      // Build per-week percentage among editable
      const pctOfEditable: Record<string, number> = {};
      for (const b of editableBuckets) {
        pctOfEditable[b.weekKey] = (effectivePct[b.weekKey] || 0) / editablePctSum;
      }

      // Determine canonical per-item TPV totals.
      // For each item_code in chain, decide its TPV (or fallback to schedule sum if no TPV/projectId).
      const codeTpvHours = new Map<string, number>();
      const codeTpvCzk = new Map<string, number>();
      const codeName = new Map<string, string>();
      for (const code of chainCodes) {
        const t = tpvByCode?.get(code);
        if (t) {
          codeTpvHours.set(code, t.hodiny_plan);
          // tpv_czk full = cena * pocet (CZK assumption — same as recalculate)
          codeTpvCzk.set(code, Math.floor(t.cena * (t.pocet || 1)));
          codeName.set(code, t.item_name);
        } else {
          // Fallback: sum schedule hours/czk for this code
          let h = 0, c = 0;
          let nm = "";
          for (const b of weekBuckets) {
            for (const r of b.rows) {
              if (normalizeItemCode(r.item_code) === code) {
                h += Number(r.scheduled_hours) || 0;
                c += Number(r.scheduled_czk) || 0;
                if (!nm) nm = (r as any).item_name || code;
              }
            }
          }
          codeTpvHours.set(code, Math.round(h * 10) / 10);
          codeTpvCzk.set(code, Math.floor(c));
          codeName.set(code, nm || code);
        }
      }

      // Per-code locked hours/czk (history + midflight + completed)
      const codeLockedHours = new Map<string, number>();
      const codeLockedCzk = new Map<string, number>();
      for (const b of weekBuckets) {
        if (!b.locked) continue;
        for (const r of b.rows) {
          const c = normalizeItemCode(r.item_code);
          if (!c) continue;
          codeLockedHours.set(c, (codeLockedHours.get(c) || 0) + (Number(r.scheduled_hours) || 0));
          codeLockedCzk.set(c, (codeLockedCzk.get(c) || 0) + (Number(r.scheduled_czk) || 0));
        }
      }

      const updates: Array<{ id: string; scheduled_hours: number; scheduled_czk: number }> = [];
      const undoRecords: Array<{ id: string; scheduled_hours: number; scheduled_czk: number }> = [];
      const inserts: Array<{
        project_id: string;
        stage_id: string | null;
        item_name: string;
        item_code: string;
        scheduled_week: string;
        scheduled_hours: number;
        scheduled_czk: number;
        position: number;
        status: string;
        split_group_id: string;
      }> = [];

      const { data: { user } } = await supabase.auth.getUser();

      // For each chain code, distribute remaining (canonical − locked) across editable weeks per pctOfEditable
      for (const code of chainCodes) {
        const totalH = codeTpvHours.get(code) ?? 0;
        const totalC = codeTpvCzk.get(code) ?? 0;
        const lockedH = codeLockedHours.get(code) ?? 0;
        const lockedC = codeLockedCzk.get(code) ?? 0;
        const remainingH = Math.max(0, Math.round((totalH - lockedH) * 10) / 10);
        const remainingC = Math.max(0, totalC - lockedC);
        if (remainingH <= 0 && remainingC <= 0) continue;

        // Allocate per editable week, last week gets remainder for exact match
        let allocatedH = 0;
        let allocatedC = 0;
        editableBuckets.forEach((b, idx) => {
          const isLast = idx === editableBuckets.length - 1;
          const pct = pctOfEditable[b.weekKey] || 0;
          const newH = isLast
            ? Math.round((remainingH - allocatedH) * 10) / 10
            : Math.round(remainingH * pct * 10) / 10;
          const newC = isLast
            ? Math.max(0, remainingC - allocatedC)
            : Math.floor(remainingC * pct);
          allocatedH += newH;
          allocatedC += newC;

          // Find existing row for this code in this week
          const existing = b.rows.find(r => normalizeItemCode(r.item_code) === code);
          if (existing) {
            if (newH !== Number(existing.scheduled_hours) || newC !== Number(existing.scheduled_czk)) {
              updates.push({ id: existing.id, scheduled_hours: newH, scheduled_czk: newC });
              undoRecords.push({
                id: existing.id,
                scheduled_hours: Number(existing.scheduled_hours),
                scheduled_czk: Number(existing.scheduled_czk),
              });
            }
          } else if (projectId && newH > 0) {
            // Auto-create missing row for this active TPV item in editable week
            inserts.push({
              project_id: projectId,
              stage_id: stageId ?? null,
              item_name: codeName.get(code) || code,
              item_code: code,
              scheduled_week: b.weekKey,
              scheduled_hours: newH,
              scheduled_czk: newC,
              position: 999,
              status: "scheduled",
              split_group_id: splitGroupId,
            });
          }
        });
      }

      if (updates.length === 0 && inserts.length === 0) {
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
      let insertedIds: string[] = [];
      if (inserts.length > 0) {
        const payload = inserts.map(i => ({ ...i, created_by: user?.id ?? null }));
        const { data: ins, error } = await supabase
          .from("production_schedule")
          .insert(payload)
          .select("id");
        if (error) throw error;
        insertedIds = (ins || []).map((r: any) => r.id);
      }

      // Renumber chain by week so all items in the same week share split_part (1/N, 2/N, ...)
      try {
        const { renumberBundleChain } = await import("@/lib/splitChainHelpers");
        await renumberBundleChain(splitGroupId);
      } catch { /* silent */ }

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
          if (insertedIds.length > 0) {
            await supabase.from("production_schedule").delete().in("id", insertedIds);
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
          // (Inserts not re-created on redo — undo is the recovery path; skipping is safe.)
          for (const k of productionQueryKeys) qc.invalidateQueries({ queryKey: k });
        },
        undoPayload: { table: "production_schedule", operation: "update", records: undoRecords, queryKeys: productionQueryKeys },
        redoPayload: { table: "production_schedule", operation: "update", records: updates, queryKeys: productionQueryKeys },
      });

      for (const k of productionQueryKeys) qc.invalidateQueries({ queryKey: k });

      const summary = weekBuckets
        .map(b => `T${b.weekNum} ${effectivePct[b.weekKey] || 0}%`)
        .join(" / ");
      const insertedNote = inserts.length > 0 ? ` · doplněno ${inserts.length} řádků` : "";
      toast({ title: `↻ Rozdělení uloženo: ${summary}${insertedNote}` });
      onOpenChange(false);
    } catch (err: any) {
      console.error("[EditBundleSplit] save failed:", err);
      toast({ title: "Chyba", description: err?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }, [isValid, submitting, rows, weekBuckets, effectivePct, pushUndo, qc, bundleName, onOpenChange,
      chainCodes, tpvByCode, projectId, stageId, splitGroupId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <div className="text-sm font-semibold text-foreground">⚙ Upravit rozdělení po týdnech</div>
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {bundleName} · {weekBuckets.length} týdnů
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5 font-sans">
            <div>Kanonický základ z TPV: <span className="font-semibold text-foreground">{canonicalTotalHours}h</span></div>
            <div>Zamknuto/history: <span className="font-semibold text-foreground">{Math.round(lockedHoursTotal * 10) / 10}h</span></div>
            <div>Rozděluji zbytek: <span className="font-semibold text-foreground">{remainingHoursTotal}h</span></div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {weekBuckets.map(b => {
            const pct = effectivePct[b.weekKey] || 0;
            const previewHours = Math.round((canonicalTotalHours * pct / 100) * 10) / 10;
            const isAuto = b.weekKey === autoKey;
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
