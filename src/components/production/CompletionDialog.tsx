import { useState, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { renumberSiblings } from "./SplitItemDialog";
import type { ScheduleItem } from "@/hooks/useProductionSchedule";

interface CompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  projectId: string;
  weekLabel: string;
  weekKey: string;
  items: ScheduleItem[];
  preCheckedIds?: string[];
  hourlyRate: number;
}

type CompletionMode = "full" | "split";

interface ItemCompletionConfig {
  mode: CompletionMode;
  splitPct: number;
}

// Track which single item has split expanded


export function CompletionDialog({
  open, onOpenChange, projectName, projectId, weekLabel, weekKey, items, preCheckedIds, hourlyRate,
}: CompletionDialogProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set(preCheckedIds ?? []));
  const [itemConfigs, setItemConfigs] = useState<Record<string, ItemCompletionConfig>>({});
  const [splitOpenId, setSplitOpenId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const getConfig = (id: string): ItemCompletionConfig => itemConfigs[id] || { mode: "full", splitPct: 50 };

  const setConfig = (id: string, config: Partial<ItemCompletionConfig>) => {
    setItemConfigs(prev => ({ ...prev, [id]: { ...getConfig(id), ...config } }));
  };

  const toggleItem = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleComplete = useCallback(async () => {
    if (checkedIds.size === 0) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fullCompleteIds: string[] = [];
      const splitItems: { item: ScheduleItem; pct: number }[] = [];

      for (const id of checkedIds) {
        const config = getConfig(id);
        const item = items.find(i => i.id === id);
        if (!item) continue;
        if (config.mode === "split") {
          splitItems.push({ item, pct: config.splitPct });
        } else {
          fullCompleteIds.push(id);
        }
      }

      // Complete full items
      if (fullCompleteIds.length > 0) {
        const { error } = await supabase
          .from("production_schedule")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            completed_by: user.id,
          })
          .in("id", fullCompleteIds);
        if (error) throw error;
      }

      // Split-at-completion items
      for (const { item, pct } of splitItems) {
        const doneHours = Math.round(item.scheduled_hours * pct / 100);
        const remainingHours = item.scheduled_hours - doneHours;
        const czkPerHour = item.scheduled_hours > 0 ? item.scheduled_czk / item.scheduled_hours : hourlyRate;
        const groupId = item.split_group_id || item.id;
        const cleanName = item.item_name.replace(/\s*\(\d+\/\d+\)$/, "");

        // Update original → completed with reduced hours
        await supabase.from("production_schedule").update({
          scheduled_hours: doneHours,
          scheduled_czk: doneHours * czkPerHour,
          status: "completed",
          completed_at: new Date().toISOString(),
          completed_by: user.id,
          split_group_id: groupId,
        }).eq("id", item.id);

        // Create remaining part → stays in same week, active
        await supabase.from("production_schedule").insert({
          project_id: item.project_id,
          stage_id: item.stage_id,
          item_name: cleanName,
          item_code: item.item_code,
          scheduled_week: item.scheduled_week,
          scheduled_hours: remainingHours,
          scheduled_czk: remainingHours * czkPerHour,
          position: 999,
          status: "scheduled",
          created_by: user.id,
          split_group_id: groupId,
        });

        // Renumber all siblings
        await renumberSiblings(groupId);

        // Update names
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
      }

      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-expedice"] });
      qc.invalidateQueries({ queryKey: ["production-inbox"] });

      const totalCompleted = fullCompleteIds.length + splitItems.length;
      toast({ title: `${totalCompleted} položek přesunuto do Expedice` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  }, [checkedIds, itemConfigs, items, qc, onOpenChange, hourlyRate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] p-0 gap-0" style={{ borderRadius: 12 }}>
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-[14px] font-semibold" style={{ color: "#223937" }}>
            {projectName} ({projectId})
          </DialogTitle>
          <DialogDescription className="text-[11px] font-mono" style={{ color: "#99a5a3" }}>
            {weekLabel}
          </DialogDescription>
        </DialogHeader>

        {/* Select all / Deselect all */}
        {(() => {
          const uncompleted = items.filter(i => i.status !== "completed");
          const allChecked = uncompleted.length > 0 && uncompleted.every(i => checkedIds.has(i.id));
          return uncompleted.length > 1 ? (
            <div className="px-5 pb-1.5">
              <label
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors"
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f8f7f5")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={() => {
                    if (allChecked) setCheckedIds(new Set());
                    else setCheckedIds(new Set(uncompleted.map(i => i.id)));
                  }}
                />
                <span className="text-[11px] font-semibold" style={{ color: "#6b7a78" }}>
                  {allChecked ? "Odznačit vše" : "Vybrat vše"}
                </span>
                <span className="font-mono text-[10px] ml-auto" style={{ color: "#99a5a3" }}>
                  {checkedIds.size}/{uncompleted.length}
                </span>
              </label>
            </div>
          ) : null;
        })()}

        <div className="px-5 pb-3 space-y-1.5 max-h-[400px] overflow-y-auto">
          {items.map(item => {
            const isCompleted = item.status === "completed";
            const isChecked = checkedIds.has(item.id);
            const config = getConfig(item.id);

            return (
              <div key={item.id}>
                <label
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer transition-colors"
                  style={{ border: "1px solid #ece8e2" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f8f7f5")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <Checkbox
                    checked={isCompleted || isChecked}
                    disabled={isCompleted}
                    onCheckedChange={() => !isCompleted && toggleItem(item.id)}
                  />
                  {item.item_code && (
                    <span className="font-mono text-[10px] shrink-0" style={{ color: "#223937" }}>
                      {item.item_code}
                    </span>
                  )}
                  <span className="text-[11px] flex-1 truncate" style={{ color: "#6b7a78" }}>
                    {item.item_name}
                  </span>
                  <span className="font-mono text-[10px] shrink-0" style={{ color: "#6b7a78" }}>
                    {item.scheduled_hours}h
                  </span>
                  {isCompleted ? (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(58,138,54,0.12)", color: "#3a8a36" }}>
                      ✓ Hotovo
                    </span>
                  ) : (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(217,151,6,0.12)", color: "#d97706" }}>
                      Ve výrobě
                    </span>
                  )}
                </label>

                {/* Split-at-completion option — only for checked, uncompleted items */}
                {isChecked && !isCompleted && (
                  <div className="ml-8 mt-1 mb-1 px-2.5 py-1.5 rounded" style={{ backgroundColor: "#fafaf8", border: "1px solid #f0eee9" }}>
                    <div className="flex items-center gap-3 mb-1">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          checked={config.mode === "full"}
                          onChange={() => setConfig(item.id, { mode: "full" })}
                          className="accent-green-700"
                        />
                        <span className="text-[10px] font-medium" style={{ color: "#223937" }}>Celé</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          checked={config.mode === "split"}
                          onChange={() => setConfig(item.id, { mode: "split" })}
                          className="accent-green-700"
                        />
                        <span className="text-[10px] font-medium" style={{ color: "#223937" }}>Rozdělit</span>
                      </label>
                    </div>
                    {config.mode === "split" && (
                      <div className="space-y-1">
                        <Slider
                          value={[config.splitPct]}
                          min={10}
                          max={90}
                          step={5}
                          onValueChange={([v]) => setConfig(item.id, { splitPct: v })}
                          className="w-full"
                        />
                        <div className="flex items-center justify-between text-[9px] font-mono" style={{ color: "#6b7a78" }}>
                          <span>✓ {Math.round(item.scheduled_hours * config.splitPct / 100)}h → Expedice</span>
                          <span>⚙ {item.scheduled_hours - Math.round(item.scheduled_hours * config.splitPct / 100)}h zůstává</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid #ece8e2" }}>
          <button
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors"
            style={{ color: "#6b7a78", border: "1px solid #e2ddd6" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f0eee9")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            Zavřít
          </button>
          <button
            onClick={handleComplete}
            disabled={checkedIds.size === 0 || submitting}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-md text-white transition-colors"
            style={{
              backgroundColor: checkedIds.size === 0 ? "#99a5a3" : "#3a8a36",
              cursor: checkedIds.size === 0 ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Ukládám..." : `Dokončit vybrané → Expedice`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
