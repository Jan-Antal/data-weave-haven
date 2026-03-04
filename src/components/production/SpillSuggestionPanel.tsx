import { useState, useMemo, useEffect, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { renumberSiblings } from "./SplitItemDialog";
import type { ScheduleBundle, ScheduleItem } from "@/hooks/useProductionSchedule";

interface SpillSuggestionPanelProps {
  overloadHours: number;
  bundles: ScheduleBundle[];
  weekKey: string;
  allWeeksData: Map<string, { total_hours: number }> | null;
  weeklyCapacity: number;
  weekKeys: string[];
}

type SpillMode = "items" | "split";

interface BundleSpillData {
  projectId: string;
  projectName: string;
  items: ScheduleItem[];
  totalHours: number;
  deadline: string | null;
}

export function SpillSuggestionPanel({
  overloadHours, bundles, weekKey, allWeeksData, weeklyCapacity, weekKeys,
}: SpillSuggestionPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed when panel is collapsed (not expanded) — so the warning bar reappears
  // Only truly dismiss after a successful spill (overload goes to 0)
  useEffect(() => {
    if (dismissed && overloadHours > 0 && !expanded) {
      // User closed the expanded panel but overflow persists — collapse back to warning bar
      setDismissed(false);
      setExpanded(false);
    }
  }, [dismissed, overloadHours, expanded]);
  const [mode, setMode] = useState<SpillMode>("items");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [splitPcts, setSplitPcts] = useState<Record<string, number>>({});
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
  const [projectDeadlines, setProjectDeadlines] = useState<Map<string, string | null>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  // Fetch project deadlines
  useEffect(() => {
    const projectIds = [...new Set(bundles.map(b => b.project_id))];
    if (projectIds.length === 0) return;
    supabase.from("projects").select("project_id, datum_smluvni").in("project_id", projectIds)
      .then(({ data }) => {
        const map = new Map<string, string | null>();
        data?.forEach(p => map.set(p.project_id, p.datum_smluvni));
        setProjectDeadlines(map);
      });
  }, [bundles]);

  // Find target week
  const targetWeek = useMemo(() => {
    const currentIdx = weekKeys.indexOf(weekKey);
    for (let i = currentIdx + 1; i < weekKeys.length; i++) {
      const wk = weekKeys[i];
      const used = allWeeksData?.get(wk)?.total_hours ?? 0;
      if (used < weeklyCapacity) return wk;
    }
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

  // Build bundle-level data sorted by deadline (least urgent first)
  const bundleData = useMemo<BundleSpillData[]>(() => {
    return bundles
      .map(b => ({
        projectId: b.project_id,
        projectName: b.project_name,
        items: b.items.filter(i => i.status !== "completed" && i.status !== "paused" && i.status !== "cancelled"),
        totalHours: b.items.filter(i => i.status !== "completed" && i.status !== "paused" && i.status !== "cancelled")
          .reduce((s, i) => s + i.scheduled_hours, 0),
        deadline: projectDeadlines.get(b.project_id) ?? null,
      }))
      .filter(b => b.items.length > 0)
      .sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return -1;
        if (!b.deadline) return 1;
        return b.deadline.localeCompare(a.deadline); // latest deadline = least urgent = first
      });
  }, [bundles, projectDeadlines]);

  // All active item IDs for a bundle
  const bundleItemIds = useCallback((bd: BundleSpillData) => bd.items.map(i => i.id), []);

  // Pre-select bundles to cover overflow (items mode)
  useEffect(() => {
    if (bundleData.length === 0) return;
    const preChecked = new Set<string>();
    let accumulated = 0;
    for (const bd of bundleData) {
      if (accumulated >= overloadHours) break;
      for (const item of bd.items) {
        preChecked.add(item.id);
      }
      accumulated += bd.totalHours;
    }
    setCheckedIds(preChecked);
  }, [bundleData, overloadHours]);

  // Auto-suggest split percentages to cover overflow (split mode)
  useEffect(() => {
    if (bundleData.length === 0 || overloadHours <= 0) return;
    const totalActiveHours = bundleData.reduce((s, bd) => s + bd.totalHours, 0);
    if (totalActiveHours <= 0) return;

    // Strategy: distribute proportionally across least-urgent bundles first,
    // but cap so we only spill enough to cover the overload
    let remainingToSpill = overloadHours;
    const newPcts: Record<string, number> = {};

    for (const bd of bundleData) {
      if (remainingToSpill <= 0) {
        // No more spill needed — set remaining to 0%
        for (const item of bd.items) {
          newPcts[item.id] = 0;
        }
        continue;
      }

      // Calculate what % of this bundle we need to spill
      const bundleSpillNeeded = Math.min(remainingToSpill, bd.totalHours);
      const bundlePct = Math.min(100, Math.ceil((bundleSpillNeeded / bd.totalHours) * 100));
      // Round to nearest 5%
      const roundedPct = Math.min(100, Math.ceil(bundlePct / 5) * 5);

      for (const item of bd.items) {
        newPcts[item.id] = roundedPct;
      }

      const actualSpill = bd.items.reduce(
        (s, i) => s + Math.round(i.scheduled_hours * roundedPct / 100), 0
      );
      remainingToSpill -= actualSpill;
    }

    setSplitPcts(newPcts);
  }, [bundleData, overloadHours]);

  const toggleBundle = (bd: BundleSpillData) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      const ids = bundleItemIds(bd);
      const allChecked = ids.every(id => next.has(id));
      if (allChecked) {
        ids.forEach(id => next.delete(id));
      } else {
        ids.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const toggleItem = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleBundleExpand = (projectId: string) => {
    setExpandedBundles(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const setSplitPct = (id: string, pct: number) => {
    setSplitPcts(prev => ({ ...prev, [id]: pct }));
  };

  // Bundle-level split pct: set all items in bundle to same pct
  const setBundleSplitPct = (bd: BundleSpillData, pct: number) => {
    setSplitPcts(prev => {
      const next = { ...prev };
      for (const item of bd.items) {
        next[item.id] = pct;
      }
      return next;
    });
  };

  const getBundleSplitPct = (bd: BundleSpillData): number => {
    if (bd.items.length === 0) return 0;
    const pcts = bd.items.map(i => splitPcts[i.id] || 0);
    const allSame = pcts.every(p => p === pcts[0]);
    return allSame ? pcts[0] : Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length);
  };

  // Bundle checkbox state
  const getBundleCheckState = (bd: BundleSpillData): "checked" | "unchecked" | "indeterminate" => {
    const ids = bundleItemIds(bd);
    const checkedCount = ids.filter(id => checkedIds.has(id)).length;
    if (checkedCount === 0) return "unchecked";
    if (checkedCount === ids.length) return "checked";
    return "indeterminate";
  };

  // Calculate total spill hours
  const totalSpillHours = useMemo(() => {
    const allItems = bundleData.flatMap(b => b.items);
    if (mode === "items") {
      return allItems.filter(i => checkedIds.has(i.id)).reduce((s, i) => s + i.scheduled_hours, 0);
    }
    return allItems.reduce((s, i) => {
      const pct = splitPcts[i.id] || 0;
      return s + Math.round(i.scheduled_hours * pct / 100);
    }, 0);
  }, [mode, bundleData, checkedIds, splitPcts]);

  const handleSpill = useCallback(async () => {
    if (!targetWeek) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const allItems = bundleData.flatMap(b => b.items);

      if (mode === "items") {
        const ids = Array.from(checkedIds);
        if (ids.length === 0) return;
        const { error } = await supabase.from("production_schedule")
          .update({ scheduled_week: targetWeek }).in("id", ids);
        if (error) throw error;
        toast({ title: `${ids.length} položek přelito do T${targetWeekNum}` });
      } else {
        let movedCount = 0;
        for (const item of allItems) {
          const pct = splitPcts[item.id] || 0;
          if (pct === 0) continue;

          if (pct === 100) {
            await supabase.from("production_schedule")
              .update({ scheduled_week: targetWeek }).eq("id", item.id);
            movedCount++;
          } else {
            const spillHours = Math.round(item.scheduled_hours * pct / 100);
            const keepHours = item.scheduled_hours - spillHours;
            const czkPerHour = item.scheduled_hours > 0 ? item.scheduled_czk / item.scheduled_hours : 550;
            const groupId = item.split_group_id || item.id;
            const cleanName = item.item_name.replace(/\s*\(\d+\/\d+\)$/, "");

            await supabase.from("production_schedule").update({
              scheduled_hours: keepHours,
              scheduled_czk: keepHours * czkPerHour,
              split_group_id: groupId,
            }).eq("id", item.id);

            await supabase.from("production_schedule").insert({
              project_id: item.project_id,
              stage_id: item.stage_id,
              item_name: cleanName,
              item_code: item.item_code,
              scheduled_week: targetWeek,
              scheduled_hours: spillHours,
              scheduled_czk: spillHours * czkPerHour,
              position: 999,
              status: "scheduled",
              created_by: user.id,
              split_group_id: groupId,
            });

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
            movedCount++;
          }
        }
        toast({ title: `${movedCount} položek přelito/rozděleno → T${targetWeekNum}` });
      }

      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-inbox"] });
      qc.invalidateQueries({ queryKey: ["production-expedice"] });
      setDismissed(true);
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  }, [targetWeek, mode, checkedIds, splitPcts, bundleData, qc, targetWeekNum]);

  if (dismissed) return null;

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full px-2 py-[3px] text-[9px] font-semibold text-center transition-colors"
        style={{ backgroundColor: "rgba(239,68,68,0.06)", color: "#dc3545", borderRadius: "0 0 8px 8px" }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.12)")}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.06)")}
      >
        ⚠ Přetížení +{Math.round(overloadHours)}h — klikni pro přelití
      </button>
    );
  }

  const splitModeSufficient = totalSpillHours >= overloadHours;

  return (
    <div
      className="mx-1.5 mb-1.5 rounded-md overflow-hidden"
      style={{ backgroundColor: "#ffffff", border: "1px solid #ece8e2", borderLeft: "4px solid #dc3545" }}
    >
      <div className="px-2 py-1.5">
        {/* Header with mode toggle */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-semibold" style={{ color: "#dc3545" }}>
            ⚠ Přetížení +{Math.round(overloadHours)}h → T{targetWeekNum}:
          </span>
          <div className="flex items-center gap-0">
            <button
              onClick={() => setMode("items")}
              className="px-1.5 py-[2px] text-[8px] font-medium rounded-l transition-colors"
              style={{
                backgroundColor: mode === "items" ? "#223937" : "#ffffff",
                color: mode === "items" ? "#ffffff" : "#6b7a78",
                border: mode === "items" ? "none" : "1px solid #e2ddd6",
              }}
            >
              Po položkách
            </button>
            <button
              onClick={() => setMode("split")}
              className="px-1.5 py-[2px] text-[8px] font-medium rounded-r transition-colors"
              style={{
                backgroundColor: mode === "split" ? "#223937" : "#ffffff",
                color: mode === "split" ? "#ffffff" : "#6b7a78",
                border: mode === "split" ? "none" : "1px solid #e2ddd6",
              }}
            >
              Rozdělit %
            </button>
            <button
              onClick={() => { setExpanded(false); }}
              className="text-[9px] px-1 rounded ml-1"
              style={{ color: "#99a5a3" }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Bundle list */}
        <div className="space-y-[2px] max-h-[180px] overflow-y-auto">
          {bundleData.map(bd => {
            const isExpanded = expandedBundles.has(bd.projectId);
            const checkState = getBundleCheckState(bd);
            const bundlePct = getBundleSplitPct(bd);
            const bundleSpillHours = mode === "split"
              ? bd.items.reduce((s, i) => s + Math.round(i.scheduled_hours * (splitPcts[i.id] || 0) / 100), 0)
              : bd.items.filter(i => checkedIds.has(i.id)).reduce((s, i) => s + i.scheduled_hours, 0);

            return (
              <div key={bd.projectId}>
                {/* Bundle header row */}
                <div
                  className="flex items-center gap-1 px-1 py-[3px] rounded transition-colors"
                  style={{ backgroundColor: isExpanded ? "#fafaf8" : "transparent" }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.backgroundColor = "#f8f7f5"; }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  {mode === "items" ? (
                    <Checkbox
                      className="h-3 w-3 shrink-0"
                      checked={checkState === "checked" ? true : checkState === "indeterminate" ? "indeterminate" : false}
                      onCheckedChange={() => toggleBundle(bd)}
                    />
                  ) : (
                    <div className="w-3 shrink-0" />
                  )}
                  <span className="text-[8px] font-semibold flex-1 truncate" style={{ color: "#223937" }}>
                    {bd.projectName}
                  </span>
                  {mode === "split" && (
                    <span className="font-mono text-[8px] font-semibold shrink-0" style={{ color: "#223937" }}>
                      {bundlePct}%
                    </span>
                  )}
                  <span className="font-mono text-[8px] shrink-0" style={{ color: "#99a5a3" }}>
                    {mode === "split" && bundleSpillHours > 0 ? `${bundleSpillHours}h/` : ""}{Math.round(bd.totalHours)}h
                  </span>
                  <button
                    onClick={() => toggleBundleExpand(bd.projectId)}
                    className="shrink-0 p-0 rounded transition-colors"
                    style={{ color: "#99a5a3" }}
                  >
                    {isExpanded
                      ? <ChevronUp style={{ width: 10, height: 10 }} />
                      : <ChevronDown style={{ width: 10, height: 10 }} />
                    }
                  </button>
                </div>

                {/* Bundle-level slider in split mode (collapsed) */}
                {mode === "split" && !isExpanded && (
                  <div className="px-1 pb-[2px]">
                    <Slider
                      value={[bundlePct]}
                      min={0} max={100} step={5}
                      onValueChange={([v]) => setBundleSplitPct(bd, v)}
                      className="w-full"
                    />
                  </div>
                )}

                {/* Expanded: individual items */}
                {isExpanded && (
                  <div className="ml-3 space-y-[1px] pb-1">
                    {bd.items.map(item => (
                      <div key={item.id}>
                        {mode === "items" ? (
                          <label
                            className="flex items-center gap-1.5 px-1 py-[2px] rounded cursor-pointer text-[8px]"
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f8f7f5")}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                          >
                            <Checkbox
                              className="h-3 w-3"
                              checked={checkedIds.has(item.id)}
                              onCheckedChange={() => toggleItem(item.id)}
                            />
                            {item.item_code && (
                              <span className="font-mono shrink-0" style={{ color: "#223937", fontSize: 8 }}>
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
                        ) : (
                          <div className="px-1 py-[2px]">
                            <div className="flex items-center gap-1.5 text-[8px] mb-[2px]">
                              {item.item_code && (
                                <span className="font-mono shrink-0" style={{ color: "#223937" }}>
                                  {item.item_code}
                                </span>
                              )}
                              <span className="flex-1 truncate" style={{ color: "#6b7a78" }}>
                                {item.item_name}
                              </span>
                              <span className="font-mono shrink-0 font-semibold" style={{ color: "#223937" }}>
                                {splitPcts[item.id] || 0}%
                              </span>
                              <span className="font-mono shrink-0" style={{ color: "#99a5a3" }}>
                                {Math.round(item.scheduled_hours * (splitPcts[item.id] || 0) / 100)}h
                              </span>
                            </div>
                            <Slider
                              value={[splitPcts[item.id] || 0]}
                              min={0} max={100} step={5}
                              onValueChange={([v]) => setSplitPct(item.id, v)}
                              className="w-full"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Live summary */}
        <div className="mt-1 text-[8px] font-mono text-center" style={{ color: splitModeSufficient ? "#3a8a36" : "#dc3545" }}>
          Přelije se: {Math.round(totalSpillHours)}h / Potřeba: {Math.round(overloadHours)}h
          {splitModeSufficient ? " ✓" : ""}
        </div>

        <div className="flex items-center gap-1.5 mt-1.5">
          <button
            onClick={handleSpill}
            disabled={(mode === "items" ? checkedIds.size === 0 : !splitModeSufficient) || submitting}
            className="flex-1 px-2 py-1 text-[8px] font-semibold rounded text-white transition-colors"
            style={{
              backgroundColor: (mode === "items" ? checkedIds.size > 0 : splitModeSufficient) ? "#3a8a36" : "#99a5a3",
              cursor: (mode === "items" ? checkedIds.size > 0 : splitModeSufficient) ? "pointer" : "not-allowed",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "..." : mode === "items"
              ? `Přelít vybrané → T${targetWeekNum}`
              : `Přelít → T${targetWeekNum}`}
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