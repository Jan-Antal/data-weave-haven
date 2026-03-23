import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { renumberSiblings } from "./SplitItemDialog";

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

  const previewHours = useMemo(
    () => items.reduce((sum, item) => sum + Math.round(item.scheduled_hours * pct / 100), 0),
    [items, pct]
  );

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

    if (toMove.length > 0) {
      await Promise.all(toMove.map(item =>
        supabase.from("production_schedule").update({ scheduled_week: targetWeek }).eq("id", item.id)
      ));
    }

    if (toSplit.length > 0) {
      await Promise.all(toSplit.flatMap(item => {
        const spillHours = Math.round(item.scheduled_hours * pct / 100);
        const keepHours = item.scheduled_hours - spillHours;
        const czkPerHour = item.scheduled_hours > 0 ? item.scheduled_czk / item.scheduled_hours : 550;
        const groupId = item.split_group_id || item.id;
        const cleanName = item.item_name.replace(/\s*\(\d+\/\d+\)$/, "");
        return [
          supabase.from("production_schedule").update({
            scheduled_hours: keepHours, scheduled_czk: keepHours * czkPerHour,
            split_group_id: groupId, split_part: 1, split_total: 2,
            item_name: `${cleanName} (1/2)`,
          }).eq("id", item.id),
          supabase.from("production_schedule").insert({
            project_id: item.project_id, stage_id: item.stage_id,
            item_name: `${cleanName} (2/2)`, item_code: item.item_code,
            scheduled_week: targetWeek, scheduled_hours: spillHours,
            scheduled_czk: spillHours * czkPerHour, position: 999,
            status: "scheduled", created_by: user.id,
            split_group_id: groupId, split_part: 2, split_total: 2,
          }),
        ];
      }));
    }

    const changedItems = toMove.length + toSplit.length;

      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-inbox"] });
      qc.invalidateQueries({ queryKey: ["production-expedice"] });

      toast({ title: `Rozděleno ${changedItems} položek do T${targetWeekNum}` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }

    setSubmitting(false);
  }, [canSubmit, items, onOpenChange, pct, qc, targetWeek, targetWeekNum]);

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
            <span className="font-sans text-muted-foreground">{pct}% (~{previewHours}h)</span>
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
