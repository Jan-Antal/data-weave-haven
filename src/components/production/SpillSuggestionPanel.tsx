import { useState, useMemo, useEffect, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import type { ScheduleBundle } from "@/hooks/useProductionSchedule";

interface SpillSuggestionPanelProps {
  overloadHours: number;
  bundles: ScheduleBundle[];
  weekKey: string;
  allWeeksData: Map<string, { total_hours: number }> | null;
  weeklyCapacity: number;
  weekKeys: string[]; // sorted list of all week keys
}

export function SpillSuggestionPanel({
  overloadHours,
  bundles,
  weekKey,
  allWeeksData,
  weeklyCapacity,
  weekKeys,
}: SpillSuggestionPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [projectDeadlines, setProjectDeadlines] = useState<Map<string, string | null>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  // Fetch project deadlines
  useEffect(() => {
    const projectIds = [...new Set(bundles.flatMap((b) => b.items.map((i) => i.project_id)))];
    if (projectIds.length === 0) return;
    supabase
      .from("projects")
      .select("project_id, datum_smluvni")
      .in("project_id", projectIds)
      .then(({ data }) => {
        const map = new Map<string, string | null>();
        data?.forEach((p) => map.set(p.project_id, p.datum_smluvni));
        setProjectDeadlines(map);
      });
  }, [bundles]);

  // Find target week (next one with available capacity)
  const targetWeek = useMemo(() => {
    const currentIdx = weekKeys.indexOf(weekKey);
    for (let i = currentIdx + 1; i < weekKeys.length; i++) {
      const wk = weekKeys[i];
      const used = allWeeksData?.get(wk)?.total_hours ?? 0;
      if (used < weeklyCapacity) return wk;
    }
    // If no week in view has space, suggest next week anyway
    if (currentIdx + 1 < weekKeys.length) return weekKeys[currentIdx + 1];
    return null;
  }, [weekKey, weekKeys, allWeeksData, weeklyCapacity]);

  const targetWeekNum = useMemo(() => {
    if (!targetWeek) return "?";
    const d = new Date(targetWeek);
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }, [targetWeek]);

  // All items sorted by priority (least urgent first)
  const allItems = useMemo(() => {
    const items = bundles.flatMap((b) => b.items);
    return items.sort((a, b) => {
      const deadA = projectDeadlines.get(a.project_id);
      const deadB = projectDeadlines.get(b.project_id);
      // No deadline = lowest priority = sort first (to be pre-checked first)
      if (!deadA && !deadB) return 0;
      if (!deadA) return -1;
      if (!deadB) return 1;
      // Latest deadline first (least urgent)
      return deadB.localeCompare(deadA);
    });
  }, [bundles, projectDeadlines]);

  // Pre-select items to cover overflow
  useEffect(() => {
    if (allItems.length === 0) return;
    const preChecked = new Set<string>();
    let accumulated = 0;
    for (const item of allItems) {
      if (accumulated >= overloadHours) break;
      preChecked.add(item.id);
      accumulated += item.scheduled_hours;
    }
    setCheckedIds(preChecked);
  }, [allItems, overloadHours]);

  const toggleItem = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSpill = useCallback(async () => {
    if (!targetWeek || checkedIds.size === 0) return;
    setSubmitting(true);
    try {
      const ids = Array.from(checkedIds);
      const { error } = await supabase
        .from("production_schedule")
        .update({ scheduled_week: targetWeek })
        .in("id", ids);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      toast({ title: `${ids.length} položek přelito do T${targetWeekNum}` });
      setDismissed(true);
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  }, [targetWeek, checkedIds, qc, targetWeekNum]);

  if (dismissed) return null;

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full px-2 py-[3px] text-[9px] font-semibold text-center transition-colors"
        style={{
          backgroundColor: "rgba(239,68,68,0.06)",
          color: "#dc3545",
          borderRadius: "0 0 8px 8px",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.12)")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.06)")}
      >
        ⚠ Přetížení +{Math.round(overloadHours)}h — klikni pro přelití
      </button>
    );
  }

  return (
    <div
      className="mx-1.5 mb-1.5 rounded-md overflow-hidden"
      style={{ backgroundColor: "#ffffff", border: "1px solid #ece8e2", borderLeft: "4px solid #dc3545" }}
    >
      <div className="px-2 py-1.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-semibold" style={{ color: "#dc3545" }}>
            Přelít do T{targetWeekNum}:
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="text-[9px] px-1 rounded"
            style={{ color: "#99a5a3" }}
          >
            ×
          </button>
        </div>

        <div className="space-y-[2px] max-h-[120px] overflow-y-auto">
          {allItems.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-1.5 px-1 py-[2px] rounded cursor-pointer text-[8px]"
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8f7f5")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Checkbox
                className="h-3 w-3"
                checked={checkedIds.has(item.id)}
                onCheckedChange={() => toggleItem(item.id)}
              />
              {item.item_code && (
                <span className="font-mono font-bold shrink-0" style={{ color: "#223937", fontSize: 8 }}>
                  {item.item_code}
                </span>
              )}
              <span className="flex-1 truncate" style={{ color: "#6b7a78" }}>
                {item.item_name}
              </span>
              <span className="font-mono shrink-0" style={{ color: "#99a5a3" }}>
                {item.scheduled_hours}h
              </span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-1.5 mt-1.5">
          <button
            onClick={handleSpill}
            disabled={checkedIds.size === 0 || submitting}
            className="flex-1 px-2 py-1 text-[8px] font-semibold rounded text-white transition-colors"
            style={{
              backgroundColor: checkedIds.size === 0 ? "#99a5a3" : "#3a8a36",
              cursor: checkedIds.size === 0 ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "..." : `Přelít vybrané → T${targetWeekNum}`}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="px-2 py-1 text-[8px] font-medium rounded transition-colors"
            style={{ color: "#6b7a78", border: "1px solid #e2ddd6" }}
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
}
