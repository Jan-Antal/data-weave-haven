import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { renumberBundleChain, renumberProjectChain } from "@/lib/splitChainHelpers";
import { useUndoRedo } from "@/hooks/useUndoRedo";

interface WeekOption {
  key: string;
  weekNum: number;
  label: string;
  remainingCapacity: number;
}

interface BundleSplitItem {
  id: string;
  item_name: string;
  item_code: string | null;
  project_id: string;
  stage_id: string | null;
  scheduled_hours: number;
  scheduled_czk: number;
  split_group_id: string | null;
  bundle_label?: string | null;
}

interface SplitBundleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundleName: string;
  currentWeekKey: string;
  items: BundleSplitItem[];
  weeks: WeekOption[];
}

export function SplitBundleDialog({
  open,
  onOpenChange,
  bundleName,
  currentWeekKey,
  items,
  weeks,
}: SplitBundleDialogProps) {
  const qc = useQueryClient();
  const { pushUndo } = useUndoRedo();
  const [pct, setPct] = useState(50);
  const [targetWeek, setTargetWeek] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const futureWeeks = useMemo(
    () => weeks.filter((w) => w.key >= currentWeekKey),
    [weeks, currentWeekKey]
  );

  const defaultTargetWeek = useMemo(() => {
    const idx = futureWeeks.findIndex((w) => w.key === currentWeekKey);
    for (let i = idx + 1; i < futureWeeks.length; i++) {
      if (futureWeeks[i].remainingCapacity > 0) return futureWeeks[i].key;
    }
    return futureWeeks[idx + 1]?.key || futureWeeks[0]?.key || "";
  }, [futureWeeks, currentWeekKey]);

  useEffect(() => {
    if (open) {
      setPct(50);
      setTargetWeek(defaultTargetWeek);
    }
  }, [open, defaultTargetWeek]);

  const targetWeekNum = useMemo(() => {
    const w = futureWeeks.find((w) => w.key === targetWeek);
    return w?.weekNum ?? "?";
  }, [futureWeeks, targetWeek]);

  const totalHours = useMemo(
    () => Math.round(items.reduce((sum, item) => sum + item.scheduled_hours, 0)),
    [items]
  );

  const previewHours = useMemo(
    () => items.reduce((sum, item) => sum + Math.round(item.scheduled_hours * pct / 100), 0),
    [items, pct]
  );

  const remainingHours = Math.max(0, totalHours - previewHours);

  const canSubmit = items.length > 0 && pct > 0 && targetWeek && targetWeek !== currentWeekKey && !submitting;

  const handleSplitBundle = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const toMove: BundleSplitItem[] = [];
      const toSplit: BundleSplitItem[] = [];

      for (const item of items) {
        const spillHours = Math.round(item.scheduled_hours * pct / 100);
        if (spillHours <= 0) continue;
        if (spillHours >= item.scheduled_hours) toMove.push(item);
        else toSplit.push(item);
      }

      // If items in the bundle already share a project chain (split_group_id),
      // REUSE it so the chain stays unified (5/5 → 5/6 + 6/6, not a new branch).
      // Only when no chain exists do we mint a new bundle group.
      const existingGroupId = items.find((i) => i.split_group_id)?.split_group_id ?? null;
      const isProjectChain = !!existingGroupId;
      const bundleGroupId: string =
        existingGroupId || (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `bundle-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

      // Preserve the original bundle_label across the chain. If the items
      // don't carry it (legacy), fall back to whatever label the DB row has.
      let targetBundleLabel: string | null =
        items.find((i) => i.bundle_label)?.bundle_label ?? null;
      if (!targetBundleLabel) {
        const { data: existingRow } = await supabase
          .from("production_schedule")
          .select("bundle_label")
          .in("id", items.map((i) => i.id))
          .not("bundle_label", "is", null)
          .limit(1)
          .maybeSingle();
        targetBundleLabel = (existingRow as any)?.bundle_label ?? null;
      }

      // Snapshot original state of all items being touched (for undo)
      const touchedIds = [...toMove, ...toSplit].map((i) => i.id);
      const { data: originalRows } = touchedIds.length
        ? await supabase
            .from("production_schedule")
            .select("*")
            .in("id", touchedIds)
        : { data: [] as any[] };
      const originalById = new Map<string, any>((originalRows || []).map((r: any) => [r.id, r]));

      const insertedIds: string[] = [];

      if (toMove.length > 0) {
        await Promise.all(
          toMove.map((item) =>
            supabase
              .from("production_schedule")
              .update({
                scheduled_week: targetWeek,
                split_group_id: bundleGroupId,
                bundle_label: targetBundleLabel,
                bundle_type: "split",
              })
              .eq("id", item.id)
          )
        );
      }

      if (toSplit.length > 0) {
        const splitResults = await Promise.all(
          toSplit.flatMap((item) => {
            const spillHours = Math.round(item.scheduled_hours * pct / 100);
            const keepHours = item.scheduled_hours - spillHours;
            const czkPerHour = item.scheduled_hours > 0 ? item.scheduled_czk / item.scheduled_hours : 550;
            const cleanName = item.item_name.replace(/\s*\(\d+\/\d+\)$/, "");
            return [
              supabase.from("production_schedule").update({
                scheduled_hours: keepHours,
                scheduled_czk: keepHours * czkPerHour,
                split_group_id: bundleGroupId,
                bundle_label: targetBundleLabel,
                bundle_type: "split",
                item_name: cleanName,
              }).eq("id", item.id),
              supabase.from("production_schedule").insert({
                project_id: item.project_id, stage_id: item.stage_id,
                item_name: cleanName, item_code: item.item_code,
                scheduled_week: targetWeek, scheduled_hours: spillHours,
                scheduled_czk: spillHours * czkPerHour, position: 999,
                status: "scheduled", created_by: user.id,
                split_group_id: bundleGroupId,
                bundle_label: targetBundleLabel,
                bundle_type: "split",
              }).select("id").single(),
            ];
          })
        );
        // Collect inserted IDs (every odd index is the insert result)
        for (let i = 1; i < splitResults.length; i += 2) {
          const r: any = splitResults[i];
          if (r?.data?.id) insertedIds.push(r.data.id);
        }
      }

      // Renumber: project chain → renumberProjectChain (unified across project),
      // otherwise legacy bundle chain (per-week N/M for this bundle only).
      const projectId = items[0]?.project_id;
      if (isProjectChain && projectId) {
        await renumberProjectChain(projectId, bundleGroupId);
      } else {
        await renumberBundleChain(bundleGroupId);
      }

      const changedItems = toMove.length + toSplit.length;

      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-inbox"] });
      qc.invalidateQueries({ queryKey: ["production-expedice"] });

      // Push undo: deletes the spill rows + restores original state of touched rows
      pushUndo({
        page: "plan-vyroby",
        actionType: "split_bundle",
        description: `✂ Bundle rozdělen: ${bundleName} → T${targetWeekNum}`,
        undo: async () => {
          // 1. Delete spill rows (inserts from toSplit + moved rows that returned to current week below)
          if (insertedIds.length > 0) {
            await supabase.from("production_schedule").delete().in("id", insertedIds);
          }
          // 2. Restore original state of every touched row (week, hours, czk, group, name, parts)
          await Promise.all(
            (originalRows || []).map((orig: any) =>
              supabase
                .from("production_schedule")
                .update({
                  scheduled_week: orig.scheduled_week,
                  scheduled_hours: orig.scheduled_hours,
                  scheduled_czk: orig.scheduled_czk,
                  split_group_id: orig.split_group_id,
                  split_part: orig.split_part,
                  split_total: orig.split_total,
                  item_name: orig.item_name,
                })
                .eq("id", orig.id)
            )
          );
          // 3. Re-renumber the original chain (if any) so badges stay correct
          if (isProjectChain && projectId) {
            await renumberProjectChain(projectId, bundleGroupId);
          } else {
            await renumberBundleChain(bundleGroupId);
          }
          qc.invalidateQueries({ queryKey: ["production-schedule"] });
          qc.invalidateQueries({ queryKey: ["production-inbox"] });
          qc.invalidateQueries({ queryKey: ["production-expedice"] });
        },
        redo: async () => {
          qc.invalidateQueries({ queryKey: ["production-schedule"] });
          qc.invalidateQueries({ queryKey: ["production-inbox"] });
        },
      });

      toast({ title: `Rozděleno ${changedItems} položek do T${targetWeekNum}` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }

    setSubmitting(false);
  }, [canSubmit, items, onOpenChange, pct, qc, targetWeek, targetWeekNum, bundleName, pushUndo]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <div className="text-sm font-semibold text-foreground">✂ Rozdělit celý bundle</div>
          <div className="text-xs text-muted-foreground mt-1 truncate">{bundleName} · {items.length} položek</div>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">Podíl do dalšího týdne</span>
            <span className="font-sans text-muted-foreground">
              {pct}% (~{previewHours}h) · zůstane {remainingHours}h
            </span>
          </div>
          <Slider value={[pct]} min={5} max={100} step={5} onValueChange={([v]) => setPct(v)} className="w-full" />

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Cílový týden</label>
            <select
              value={targetWeek}
              onChange={(e) => setTargetWeek(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
            >
              {futureWeeks.map((w) => (
                <option key={w.key} value={w.key}>
                  T{w.weekNum} · {w.label}
                </option>
              ))}
            </select>
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
            onClick={handleSplitBundle}
            disabled={!canSubmit}
            className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Rozděluji..." : "Rozdělit bundle"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
