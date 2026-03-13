import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { GripVertical, ChevronRight, AlertTriangle } from "lucide-react";
import type { ForecastBlock } from "@/hooks/useForecastMode";
import { differenceInDays, format } from "date-fns";
import { useProductionSchedule, getISOWeekNumber, type WeekSilo, type ScheduleBundle, type ScheduleItem } from "@/hooks/useProductionSchedule";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { useWeekCapacityLookup } from "@/hooks/useWeeklyCapacity";
import { getProjectColor } from "@/lib/projectColors";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ProductionContextMenu, type ContextMenuAction } from "./ProductionContextMenu";
import { CompletionDialog } from "./CompletionDialog";
import { SpillSuggestionPanel } from "./SpillSuggestionPanel";
import { SplitItemDialog } from "./SplitItemDialog";
import { SplitBundleDialog } from "./SplitBundleDialog";
import { PauseItemDialog } from "./PauseItemDialog";
import { CancelItemDialog } from "./CancelItemDialog";
import { useProductionDragDrop } from "@/hooks/useProductionDragDrop";
import { useProjects } from "@/hooks/useProjects";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { parseAppDate } from "@/lib/dateFormat";
import { getProjectRiskSeverity } from "@/hooks/useRiskHighlight";
import { resolveDeadline } from "@/lib/deadlineWarning";
import { ForecastWeekContent } from "./ForecastOverlay";

function formatCompactCzk(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${Math.round(v)}`;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateShort(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

const MONTH_NAMES = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];

type DisplayMode = "hours" | "czk" | "percent";

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ background: "#fef08a", borderRadius: 2, padding: "0 2px" }}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

function bundleMatchesSearch(bundle: { project_name: string; project_id: string; items: Array<{ item_code: string | null }> }, query: string): boolean {
  if (!query) return false;
  const q = query.toLowerCase();
  return bundle.project_name.toLowerCase().includes(q) || bundle.project_id.toLowerCase().includes(q) || bundle.items.some(i => i.item_code?.toLowerCase().includes(q));
}

interface Props {
  showCzk: boolean;
  onToggleCzk: (v: boolean) => void;
  overDroppableId?: string | null;
  onNavigateToTPV?: (projectId: string, itemCode?: string | null) => void;
  onOpenProjectDetail?: (projectId: string) => void;
  displayMode?: DisplayMode;
  onDisplayModeChange?: (mode: DisplayMode) => void;
  selectedProjectId?: string | null;
  onSelectProject?: (projectId: string) => void;
  searchQuery?: string;
  forecastBlocks?: ForecastBlock[];
  forecastSelectedIds?: Set<string>;
  onToggleForecastSelect?: (id: string) => void;
  forecastDarkMode?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  actions: ContextMenuAction[];
}

interface CompletionState {
  projectName: string;
  projectId: string;
  weekLabel: string;
  weekKey: string;
  items: ScheduleItem[];
  preCheckedIds?: string[];
}

interface SplitState {
  itemId: string;
  itemName: string;
  itemCode: string | null;
  totalHours: number;
  projectId: string;
  stageId: string | null;
  scheduledCzk: number;
  source: "schedule" | "inbox";
  currentWeekKey?: string;
  splitGroupId?: string | null;
}

interface PauseState {
  itemId: string;
  itemName: string;
  itemCode: string | null;
  source: "schedule" | "inbox";
}

interface BundleSplitState {
  bundleName: string;
  currentWeekKey: string;
  items: Array<{
    id: string;
    item_name: string;
    item_code: string | null;
    project_id: string;
    stage_id: string | null;
    scheduled_hours: number;
    scheduled_czk: number;
    split_group_id: string | null;
  }>;
}

interface CancelState {
  itemId: string;
  itemName: string;
  itemCode: string | null;
  hours: number;
  projectName: string;
  projectId: string;
  source: "schedule" | "inbox";
  splitGroupId: string | null;
  cancelAll?: boolean;
}

export function WeeklySilos({ showCzk, onToggleCzk, overDroppableId, onNavigateToTPV, onOpenProjectDetail, displayMode, onDisplayModeChange, selectedProjectId, onSelectProject, searchQuery = "", forecastBlocks, forecastSelectedIds, onToggleForecastSelect, forecastDarkMode }: Props) {
  const { data: scheduleData } = useProductionSchedule();
  const { data: settings } = useProductionSettings();
  const { moveItemBackToInbox, returnBundleToInbox, returnToProduction, mergeSplitItems } = useProductionDragDrop();
  const { data: allProjects = [] } = useProjects();
  const qc = useQueryClient();
  const getWeekCapacity = useWeekCapacityLookup();

  const projectLookup = useMemo(() => {
    const map = new Map<string, { datum_smluvni?: string | null; expedice?: string | null; montaz?: string | null; status?: string | null; risk?: string | null }>();
    for (const p of allProjects) map.set(p.project_id, p);
    return map;
  }, [allProjects]);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [completionState, setCompletionState] = useState<CompletionState | null>(null);
  const [splitState, setSplitState] = useState<SplitState | null>(null);
  const [bundleSplitState, setBundleSplitState] = useState<BundleSplitState | null>(null);
  const [pauseState, setPauseState] = useState<PauseState | null>(null);
  const [cancelState, setCancelState] = useState<CancelState | null>(null);
  const [dismissedSpillWeeks, setDismissedSpillWeeks] = useState<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const siloRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [visiblePeriodLabel, setVisiblePeriodLabel] = useState("");
  const initialScrollDone = useRef(false);

  const defaultWeeklyCapacity = Math.round((settings?.monthly_capacity_hours ?? 3500) / 4);
  const hourlyRate = settings?.hourly_rate ?? 550;

  // Initial scroll — show last week (index 3) as first visible column
  useEffect(() => {
    if (initialScrollDone.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollLeft = 3 * 259;
    initialScrollDone.current = true;
  }, []);

  // Auto-scroll silo container during drag when pointer near edges
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let animFrame = 0;
    const EDGE_ZONE = 80;
    const SCROLL_SPEED = 6;

    const handlePointerMove = (e: PointerEvent) => {
      cancelAnimationFrame(animFrame);
      animFrame = 0;

      // Only auto-scroll when a button is pressed (dragging)
      if (e.buttons === 0) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX;

      if (x < rect.left + EDGE_ZONE && x >= rect.left) {
        const intensity = 1 - (x - rect.left) / EDGE_ZONE;
        const step = () => {
          container.scrollLeft -= Math.round(SCROLL_SPEED * intensity);
          animFrame = requestAnimationFrame(step);
        };
        animFrame = requestAnimationFrame(step);
      } else if (x > rect.right - EDGE_ZONE && x <= rect.right) {
        const intensity = 1 - (rect.right - x) / EDGE_ZONE;
        const step = () => {
          container.scrollLeft += Math.round(SCROLL_SPEED * intensity);
          animFrame = requestAnimationFrame(step);
        };
        animFrame = requestAnimationFrame(step);
      }
    };

    const handlePointerUp = () => {
      cancelAnimationFrame(animFrame);
      animFrame = 0;
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      cancelAnimationFrame(animFrame);
    };
  }, []);

  const weeks = useMemo(() => {
    const monday = getMonday(new Date());
    const result: { start: Date; end: Date; weekNum: number; key: string; isPast: boolean }[] = [];
    for (let i = -4; i < 12; i++) {
      const start = new Date(monday);
      start.setDate(monday.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      result.push({ start, end, weekNum: getISOWeekNumber(start), key: start.toISOString().split("T")[0], isPast: i < 0 });
    }
    return result;
  }, []);

  const weekKeys = useMemo(() => weeks.map(w => w.key), [weeks]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || weeks.length === 0) return;
    const visibleKeys = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout>;
    const updateLabel = () => {
      const visibleWeeks = weeks.filter(w => visibleKeys.has(w.key));
      if (visibleWeeks.length === 0) return;
      const first = visibleWeeks[0].start;
      const last = visibleWeeks[visibleWeeks.length - 1].start;
      const m1 = first.getMonth(); const m2 = last.getMonth();
      const y1 = first.getFullYear(); const y2 = last.getFullYear();
      if (m1 === m2 && y1 === y2) setVisiblePeriodLabel(`${MONTH_NAMES[m1]} ${y1}`);
      else if (y1 === y2) setVisiblePeriodLabel(`${MONTH_NAMES[m1]} – ${MONTH_NAMES[m2]} ${y1}`);
      else setVisiblePeriodLabel(`${MONTH_NAMES[m1]} ${y1} – ${MONTH_NAMES[m2]} ${y2}`);
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const key = (entry.target as HTMLElement).dataset.weekKey;
        if (!key) continue;
        if (entry.isIntersecting) visibleKeys.add(key); else visibleKeys.delete(key);
      }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updateLabel, 100);
    }, { root: container, threshold: 0.3 });
    for (const [, el] of siloRefs.current) observer.observe(el);
    return () => { clearTimeout(debounceTimer); observer.disconnect(); };
  }, [weeks]);

  const registerSiloRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) siloRefs.current.set(key, el); else siloRefs.current.delete(key);
  }, []);

  const currentWeekKey = useMemo(() => getMonday(new Date()).toISOString().split("T")[0], []);

  const weekOptions = useMemo(() => {
    return weeks.map(w => {
      const siloData = scheduleData?.get(w.key);
      const usedHours = siloData?.total_hours ?? 0;
      const cap = getWeekCapacity(w.key);
      return { key: w.key, weekNum: w.weekNum, label: `${formatDateShort(w.start)}–${formatDateShort(w.end)}`, remainingCapacity: cap - usedHours };
    });
  }, [weeks, scheduleData, getWeekCapacity]);

  const weeksCapacityMap = useMemo(() => {
    const map = new Map<string, { total_hours: number }>();
    if (scheduleData) { for (const [key, silo] of scheduleData) { map.set(key, { total_hours: silo.total_hours }); } }
    return map;
  }, [scheduleData]);

  // Auto-clear dismissed spill state when overload is resolved
  useEffect(() => {
    setDismissedSpillWeeks(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const wk of prev) {
        const silo = scheduleData?.get(wk);
        const activeH = silo ? silo.bundles.reduce((sum, b) =>
          sum + b.items.reduce((s, i) => s + (i.status === "paused" ? 0 : i.scheduled_hours), 0), 0) : 0;
        const cap = getWeekCapacity(wk);
        const pct = cap > 0 ? (activeH / cap) * 100 : 0;
        if (pct <= 120) { next.delete(wk); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [scheduleData, getWeekCapacity]);

  const handleDismissSpill = useCallback((weekKey: string) => {
    setDismissedSpillWeeks(prev => new Set(prev).add(weekKey));
  }, []);

  const handleReopenSpill = useCallback((weekKey: string) => {
    setDismissedSpillWeeks(prev => { const next = new Set(prev); next.delete(weekKey); return next; });
  }, []);

  const findSameWeekSiblings = useCallback((item: ScheduleItem, weekKey: string): ScheduleItem[] => {
    if (!item.split_group_id) return [];
    const silo = scheduleData?.get(weekKey);
    if (!silo) return [];
    return silo.bundles.flatMap(b => b.items).filter(i => i.id !== item.id && i.split_group_id === item.split_group_id);
  }, [scheduleData]);

  const handleReleaseItem = useCallback(async (itemId: string) => {
    try {
      const { error } = await supabase.from("production_schedule").update({
        status: "scheduled",
        pause_reason: null,
        pause_expected_date: null,
      }).eq("id", itemId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-progress"] });
      toast({ title: "▶ Položka uvolněna" });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [qc]);

  const handleBundleContextMenu = useCallback(
    (e: React.MouseEvent, bundle: ScheduleBundle, weekKey: string, weekNum: number, startDate: Date, endDate: Date, toggleExpand: () => void) => {
      e.preventDefault(); e.stopPropagation();
      const activeItems = bundle.items.filter(i => i.status !== "completed" && i.status !== "paused" && i.status !== "cancelled");
      const hasUncompleted = activeItems.length > 0;
      const completedItems = bundle.items.filter(i => i.status === "completed");
      const allCompleted = completedItems.length > 0 && activeItems.length === 0 && bundle.items.filter(i => i.status === "paused").length === 0;
      const pausedItems = bundle.items.filter(i => i.status === "paused");
      const actions: ContextMenuAction[] = [];
      if (hasUncompleted) {
        actions.push({
          label: "Dokončit položky → Expedice", icon: "✓",
          onClick: () => { setCompletionState({ projectName: bundle.project_name, projectId: bundle.project_id, weekLabel: `Výroba T${weekNum} · ${formatDateShort(startDate)} – ${formatDateShort(endDate)}`, weekKey, items: bundle.items }); },
        });

        actions.push({
          label: `Rozdělit bundle (${activeItems.length})`, icon: "✂",
          onClick: () => {
            setBundleSplitState({
              bundleName: bundle.project_name,
              currentWeekKey: weekKey,
              items: activeItems.map(i => ({
                id: i.id,
                item_name: i.item_name,
                item_code: i.item_code,
                project_id: i.project_id,
                stage_id: i.stage_id,
                scheduled_hours: i.scheduled_hours,
                scheduled_czk: i.scheduled_czk,
                split_group_id: i.split_group_id,
              })),
            });
          },
        });

        actions.push({
          label: `Pozastavit vše (${activeItems.length})`, icon: "⏸",
          onClick: () => setPauseState({ itemId: activeItems.map(i => i.id).join(","), itemName: `${bundle.project_name} — ${activeItems.length} položek`, itemCode: null, source: "schedule" }),
        });
      }
      if (pausedItems.length > 0) {
        actions.push({
          label: `Uvolnit vše (${pausedItems.length})`, icon: "▶",
          onClick: async () => {
            for (const item of pausedItems) await handleReleaseItem(item.id);
          },
        });
      }
      if (hasUncompleted || pausedItems.length > 0) {
        actions.push({ label: "Vrátit do Inboxu", icon: "←", onClick: () => returnBundleToInbox(bundle.project_id, weekKey) });
      }
      // Merge option for bundles containing split items
      const splitGroupIds = new Set<string>();
      for (const item of bundle.items) {
        if (item.split_group_id && item.status !== "completed" && item.status !== "cancelled") {
          splitGroupIds.add(item.split_group_id);
        }
      }
      const mergeableSplitGroups = Array.from(splitGroupIds).filter(sgId => {
        const siblingsInWeek = bundle.items.filter(i => i.split_group_id === sgId && i.status !== "completed" && i.status !== "cancelled");
        return siblingsInWeek.length >= 2;
      });
      if (mergeableSplitGroups.length > 0) {
        actions.push({
          label: `Spojit části (${mergeableSplitGroups.length} skupin)`, icon: "🔗",
          onClick: async () => {
            for (const sgId of mergeableSplitGroups) await mergeSplitItems(sgId);
          },
        });
      }

      actions.push({ label: "Rozbalit / Sbalit", icon: "⇅", onClick: toggleExpand });
      if (onNavigateToTPV) {
        actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(bundle.project_id) });
      }
      if (onOpenProjectDetail) {
        actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(bundle.project_id) });
      }

      // Completed bundle: add "Vrátit do výroby" and "Zrušit"
      if (allCompleted) {
        actions.push({
          label: "Vrátit do výroby", icon: "↩", dividerBefore: true,
          onClick: async () => {
            try {
              for (const ci of completedItems) await returnToProduction(ci.id);
              toast({ title: `↩ ${completedItems.length} položek vráceno do výroby` });
            } catch (err: any) {
              toast({ title: "Chyba", description: err.message, variant: "destructive" });
            }
          },
        });
        actions.push({
          label: "Zrušit", icon: "✕", danger: true,
          onClick: () => setCancelState({
            itemId: completedItems.map(i => i.id).join(","), itemName: `${bundle.project_name} — ${completedItems.length} položek`,
            itemCode: null, hours: completedItems.reduce((s, i) => s + i.scheduled_hours, 0),
            projectName: bundle.project_name, projectId: bundle.project_id,
            source: "schedule", splitGroupId: null, cancelAll: true,
          }),
        });
      }

      if (hasUncompleted) {
        actions.push({
          label: `Zrušit vše (${activeItems.length})`, icon: "✕", danger: true, dividerBefore: true,
          onClick: () => setCancelState({
            itemId: activeItems.map(i => i.id).join(","), itemName: `${bundle.project_name} — ${activeItems.length} položek`,
            itemCode: null, hours: activeItems.reduce((s, i) => s + i.scheduled_hours, 0),
            projectName: bundle.project_name, projectId: bundle.project_id,
            source: "schedule", splitGroupId: null, cancelAll: true,
          }),
        });
      }
      setContextMenu({ x: e.clientX, y: e.clientY, actions });
    },
    [returnBundleToInbox, returnToProduction, onNavigateToTPV, onOpenProjectDetail, handleReleaseItem, mergeSplitItems]
  );

  const handleItemContextMenu = useCallback(
    (e: React.MouseEvent, item: ScheduleItem, weekKey: string, weekNum: number, startDate: Date, endDate: Date, bundle: ScheduleBundle) => {
      e.preventDefault(); e.stopPropagation();
      const isCompleted = item.status === "completed";
      const isPaused = item.status === "paused";
      const actions: ContextMenuAction[] = [];

      if (isCompleted) {
        if (onNavigateToTPV) {
          actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(item.project_id, item.item_code) });
        }
        if (onOpenProjectDetail) {
          actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(item.project_id) });
        }
        actions.push({ label: "Vrátit do výroby", icon: "↩", dividerBefore: true, onClick: () => returnToProduction(item.id) });
      } else if (isPaused) {
        actions.push({ label: "Uvolnit položku", icon: "▶", onClick: () => handleReleaseItem(item.id) });
        actions.push({ label: "Vrátit do Inboxu", icon: "←", onClick: () => moveItemBackToInbox(item.id) });
      } else {
        // Normal active item
        actions.push({
          label: "Dokončit → Expedice", icon: "✓",
          onClick: () => {
            setCompletionState({
              projectName: bundle.project_name, projectId: bundle.project_id,
              weekLabel: `Výroba T${weekNum} · ${formatDateShort(startDate)} – ${formatDateShort(endDate)}`,
              weekKey, items: bundle.items, preCheckedIds: [item.id],
            });
          },
        });
        actions.push({
          label: "Rozdělit položku", icon: "✂",
          onClick: () => {
            setSplitState({
              itemId: item.id, itemName: item.item_name, itemCode: item.item_code,
              totalHours: item.scheduled_hours, projectId: item.project_id, stageId: item.stage_id,
              scheduledCzk: item.scheduled_czk, source: "schedule", currentWeekKey: weekKey,
              splitGroupId: item.split_group_id,
            });
          },
        });

        if (onNavigateToTPV) {
          actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(item.project_id, item.item_code) });
        }
        if (onOpenProjectDetail) {
          actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(item.project_id) });
        }

        actions.push({ label: "Vrátit do Inboxu", icon: "←", onClick: () => moveItemBackToInbox(item.id) });

        actions.push({
          label: "Pozastavit", icon: "⏸",
          onClick: () => setPauseState({ itemId: item.id, itemName: item.item_name, itemCode: item.item_code, source: "schedule" }),
        });

        // Merge options for split items
        if (item.split_group_id) {
          const sameWeekSiblings = findSameWeekSiblings(item, weekKey);
          if (sameWeekSiblings.length > 0) {
            actions.push({ label: `Spojit s ostatními v T${weekNum}`, icon: "🔗", onClick: () => mergeSplitItems(item.split_group_id!) });
          }
          actions.push({ label: "Spojit všechny části", icon: "🔗", onClick: () => mergeSplitItems(item.split_group_id!) });
        }
      }

      // Cancel — always at bottom with divider
      actions.push({
        label: "Zrušit položku", icon: "✕", danger: true, dividerBefore: true,
        onClick: () => setCancelState({
          itemId: item.id, itemName: item.item_name, itemCode: item.item_code,
          hours: item.scheduled_hours, projectName: bundle.project_name,
          projectId: item.project_id, source: "schedule", splitGroupId: item.split_group_id,
        }),
      });

      // Cancel all parts — for split items
      if (item.split_group_id) {
        actions.push({
          label: "Zrušit všechny části", icon: "✕", danger: true,
          onClick: () => setCancelState({
            itemId: item.id, itemName: item.item_name, itemCode: item.item_code,
            hours: item.scheduled_hours, projectName: bundle.project_name,
            projectId: item.project_id, source: "schedule", splitGroupId: item.split_group_id,
            cancelAll: true,
          }),
        });
      }

      if (!isCompleted && !isPaused && onNavigateToTPV) {
        // already added above
      }

      setContextMenu({ x: e.clientX, y: e.clientY, actions });
    },
    [moveItemBackToInbox, returnToProduction, mergeSplitItems, findSameWeekSiblings, onNavigateToTPV, onOpenProjectDetail, handleReleaseItem]
  );

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Toolbar */}
      <div className="px-3 py-[6px] flex items-center justify-between shrink-0" style={{ borderBottom: forecastDarkMode ? "1px solid #2a2f3d" : "1px solid #ece8e2" }}>
        <button
          onClick={() => { const el = scrollContainerRef.current; if (el) el.scrollTo({ left: 4 * 259, behavior: "smooth" }); }}
          className="px-2 py-[3px] text-[10px] font-medium rounded transition-colors"
          style={{ backgroundColor: forecastDarkMode ? "#1a1d2e" : "#ffffff", color: forecastDarkMode ? "#9ca3af" : "#6b7a78", border: forecastDarkMode ? "1px solid #2a2f3d" : "1px solid #e2ddd6", cursor: "pointer" }}
        >
          Tento týden
        </button>
        <span className="text-[9px] font-medium" style={{ color: forecastDarkMode ? "#6b7280" : "#99a5a3" }}>{visiblePeriodLabel}</span>
      </div>

      {/* Silos */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden" ref={scrollContainerRef}>
        <div className="flex gap-[6px] p-2 h-full" style={{ minWidth: `${weeks.length * 259}px` }}>
          {weeks.map(week => (
            <SiloColumn
              key={week.key} weekKey={week.key} weekNum={week.weekNum}
              startDate={week.start} endDate={week.end}
              isCurrent={week.key === currentWeekKey} isPast={week.isPast}
              silo={scheduleData?.get(week.key) || null}
              weeklyCapacity={getWeekCapacity(week.key)} showCzk={showCzk} hourlyRate={hourlyRate} displayMode={displayMode || "hours"}
              isOverTarget={overDroppableId === `silo-week-${week.key}`}
              onBundleContextMenu={(e, bundle, toggleExpand) => handleBundleContextMenu(e, bundle, week.key, week.weekNum, week.start, week.end, toggleExpand)}
              onItemContextMenu={(e, item, bundle) => handleItemContextMenu(e, item, week.key, week.weekNum, week.start, week.end, bundle)}
              allWeeksData={weeksCapacityMap} weekKeys={weekKeys} registerRef={registerSiloRef}
              projectLookup={projectLookup}
              spillDismissed={dismissedSpillWeeks.has(week.key)}
              onDismissSpill={() => handleDismissSpill(week.key)}
              onReopenSpill={() => handleReopenSpill(week.key)}
              selectedProjectId={selectedProjectId}
              onSelectProject={onSelectProject}
              searchQuery={searchQuery}
              forecastBlocks={forecastBlocks}
              forecastSelectedIds={forecastSelectedIds}
              onToggleForecastSelect={onToggleForecastSelect}
              forecastDarkMode={forecastDarkMode}
            />
          ))}
        </div>
      </div>

      {contextMenu && <ProductionContextMenu x={contextMenu.x} y={contextMenu.y} actions={contextMenu.actions} onClose={() => setContextMenu(null)} />}

      {completionState && (
        <CompletionDialog open={!!completionState} onOpenChange={open => !open && setCompletionState(null)} {...completionState} hourlyRate={hourlyRate} />
      )}

      {splitState && (
        <SplitItemDialog open={!!splitState} onOpenChange={open => !open && setSplitState(null)} {...splitState} itemCode={splitState.itemCode} weeks={weekOptions} weeklyCapacity={defaultWeeklyCapacity} splitGroupId={splitState.splitGroupId} />
      )}

      {bundleSplitState && (
        <SplitBundleDialog
          open={!!bundleSplitState}
          onOpenChange={open => !open && setBundleSplitState(null)}
          bundleName={bundleSplitState.bundleName}
          currentWeekKey={bundleSplitState.currentWeekKey}
          items={bundleSplitState.items}
          weeks={weekOptions}
        />
      )}

      {pauseState && (
        <PauseItemDialog open={!!pauseState} onOpenChange={open => !open && setPauseState(null)} {...pauseState} itemCode={pauseState.itemCode} />
      )}

      {cancelState && (
        <CancelItemDialog open={!!cancelState} onOpenChange={open => !open && setCancelState(null)} {...cancelState} itemCode={cancelState.itemCode} />
      )}
    </div>
  );
}

function ToolbarButton({ active, disabled, label, onClick }: { active?: boolean; disabled?: boolean; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={!disabled ? onClick : undefined}
      className="px-2 py-[3px] text-[10px] font-medium rounded transition-colors"
      style={{
        backgroundColor: active ? "#223937" : "#ffffff",
        color: active ? "#ffffff" : disabled ? "#99a5a3" : "#6b7a78",
        border: active ? "none" : "1px solid #e2ddd6",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

type ProjectLookup = Map<string, { datum_smluvni?: string | null; expedice?: string | null; montaz?: string | null; status?: string | null; risk?: string | null }>;

interface SiloProps {
  weekKey: string; weekNum: number; startDate: Date; endDate: Date;
  isCurrent: boolean; isPast: boolean; silo: WeekSilo | null;
  weeklyCapacity: number; showCzk: boolean; hourlyRate: number; isOverTarget: boolean;
  displayMode: DisplayMode;
  onBundleContextMenu: (e: React.MouseEvent, bundle: ScheduleBundle, toggleExpand: () => void) => void;
  onItemContextMenu: (e: React.MouseEvent, item: ScheduleItem, bundle: ScheduleBundle) => void;
  allWeeksData: Map<string, { total_hours: number }>; weekKeys: string[];
  registerRef: (key: string, el: HTMLDivElement | null) => void;
  projectLookup: ProjectLookup;
  spillDismissed: boolean;
  onDismissSpill: () => void;
  onReopenSpill: () => void;
  selectedProjectId?: string | null;
  onSelectProject?: (projectId: string) => void;
  searchQuery?: string;
  forecastBlocks?: ForecastBlock[];
  forecastSelectedIds?: Set<string>;
  onToggleForecastSelect?: (id: string) => void;
  forecastDarkMode?: boolean;
}

function SiloColumn({ weekKey, weekNum, startDate, endDate, isCurrent, isPast, silo, weeklyCapacity,
  showCzk, hourlyRate, isOverTarget, onBundleContextMenu, onItemContextMenu, allWeeksData, weekKeys, registerRef, projectLookup, spillDismissed, onDismissSpill, onReopenSpill, selectedProjectId, onSelectProject, displayMode, searchQuery = "", forecastBlocks, forecastSelectedIds, onToggleForecastSelect, forecastDarkMode }: SiloProps) {
  // Capacity calculation: exclude paused items
  const activeHours = useMemo(() => {
    if (!silo) return 0;
    return silo.bundles.reduce((sum, b) =>
      sum + b.items.reduce((s, i) => s + (i.status === "paused" ? 0 : i.scheduled_hours), 0), 0);
  }, [silo]);

  const totalHours = activeHours;
  const pct = weeklyCapacity > 0 ? (totalHours / weeklyCapacity) * 100 : 0;
  const isOverloaded = pct > 120;
  const isWarning = pct > 100 && pct <= 120;
  const overloadHours = totalHours - weeklyCapacity;

  const barColor = isPast ? "#b0bab8" : isOverloaded ? "#dc3545" : isWarning ? "#d97706" : "#3a8a36";
  const barBg = isPast ? "linear-gradient(90deg, #d0d7d5, #b0bab8)"
    : isOverloaded ? "linear-gradient(90deg, #fca5a5, #dc3545)"
    : isWarning ? "linear-gradient(90deg, #fcd34d, #d97706)"
    : "linear-gradient(90deg, #a7d9a2, #3a8a36)";

  const { setNodeRef, isOver } = useDroppable({ id: `silo-week-${weekKey}`, disabled: isPast });
  const highlighted = !isPast && (isOver || isOverTarget);
  const dropBorderColor = highlighted ? (isOverloaded ? "#d97706" : "#3b82f6") : undefined;
  const headerColor = forecastDarkMode
    ? (isPast ? "#6b7280" : isCurrent ? "#f59e0b" : "#e5e7eb")
    : (isPast ? "#9ca3af" : isCurrent ? "#223937" : "#1a1a1a");
  const headerWeight = isCurrent ? 700 : isPast ? 500 : 600;
  const dateRangeColor = forecastDarkMode ? "#6b7280" : (isPast ? "#b0b7c3" : "#6b7280");

  const combinedRef = useCallback((el: HTMLDivElement | null) => { setNodeRef(el); registerRef(weekKey, el); }, [setNodeRef, registerRef, weekKey]);

  return (
    <div ref={combinedRef} data-week-key={weekKey} className="w-[252px] shrink-0 flex flex-col transition-all"
      style={{
        backgroundColor: forecastDarkMode ? "#141720" : "#ffffff", borderRadius: 9,
        border: highlighted ? `2px solid ${dropBorderColor}`
          : isCurrent ? (forecastDarkMode ? "2px solid #f59e0b" : "2px solid #3a8a36")
          : isOverloaded && !isPast ? (forecastDarkMode ? "1px solid rgba(220,53,69,0.5)" : "1px solid rgba(220,53,69,0.4)")
          : forecastDarkMode ? "1px solid #2a2f3d" : "1px solid #ece8e2",
      }}
    >
      {/* Header */}
      <div className="px-2.5 py-1.5 text-center" style={{ borderBottom: forecastDarkMode ? "1px solid #2a2f3d" : "1px solid #ece8e2" }}>
        <div className="flex items-center justify-center gap-1.5">
          <span className="font-mono text-[14px]" style={{ color: headerColor, fontWeight: headerWeight }}>T{weekNum}</span>
          {isCurrent && <span className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: "#3a8a36" }} />}
        </div>
        <div className="text-[9px] mt-0.5" style={{ color: dateRangeColor }}>{formatDateShort(startDate)} – {formatDateShort(endDate)}</div>
        <div className="mt-1.5" style={{ opacity: isPast ? 0.6 : 1 }}>
          <div className="h-[7px] rounded" style={{ backgroundColor: forecastDarkMode ? "#2a2f3d" : "#f0eee9", overflow: "hidden" }}>
            <div className="h-full rounded transition-all duration-300" style={{ width: `${Math.min(pct, 100)}%`, background: barBg }} />
          </div>
           <div className="flex items-baseline justify-between mt-[3px]">
            {displayMode === "czk" ? (
              <>
                <span className="font-mono text-[11px] font-bold" style={{ color: barColor }}>{formatCompactCzk(totalHours * hourlyRate)}</span>
                <span className="font-mono text-[10px]" style={{ color: forecastDarkMode ? "#6b7280" : "#99a5a3" }}>/ {formatCompactCzk(weeklyCapacity * hourlyRate)}</span>
                <span className="font-mono text-[10px] font-bold" style={{ color: barColor }}>{Math.round(pct)}%</span>
              </>
            ) : (
              <>
                <span className="font-mono text-[11px] font-bold" style={{ color: barColor }}>{Math.round(totalHours)}h</span>
                <span className="font-mono text-[10px]" style={{ color: forecastDarkMode ? "#6b7280" : "#99a5a3" }}>/ {weeklyCapacity}h</span>
                <span className="font-mono text-[10px] font-bold" style={{ color: barColor }}>{Math.round(pct)}%</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-1.5" style={{ display: "flex", flexDirection: "column", gap: 3, opacity: isPast ? 0.7 : 1 }}>
        {(!silo || silo.bundles.length === 0) && !isPast && (
          <div className="flex-1 flex items-center justify-center rounded-[5px] px-2 py-[14px] transition-all" style={{ border: forecastDarkMode ? "1.5px dashed #2a2f3d" : "1.5px dashed #e2ddd6" }}>
            <span className="text-[9px] text-center" style={{ color: forecastDarkMode ? "#4b5563" : "#99a5a3" }}>Přetáhni sem z Inboxu</span>
          </div>
        )}
        {(!silo || silo.bundles.length === 0) && isPast && (
          <div className="flex-1 flex items-center justify-center px-2 py-[14px]">
            <span className="text-[9px] text-center" style={{ color: forecastDarkMode ? "#374151" : "#c4ccc9" }}>Prázdný týden</span>
          </div>
        )}
        {silo?.bundles
          .slice()
          .sort((a, b) => {
            const aDone = a.items.length > 0 && a.items.every(i => i.status === "completed");
            const bDone = b.items.length > 0 && b.items.every(i => i.status === "completed");
            if (aDone === bDone) return 0;
            return aDone ? 1 : -1;
          })
          .map(bundle => (
          <CollapsibleBundleCard key={bundle.project_id} bundle={bundle} weekKey={weekKey}
            showCzk={showCzk} hourlyRate={hourlyRate} displayMode={displayMode}
            onBundleContextMenu={onBundleContextMenu} onItemContextMenu={onItemContextMenu}
            projectLookup={projectLookup}
            isSelected={selectedProjectId === bundle.project_id}
            onSelectProject={onSelectProject} searchQuery={searchQuery}
            forecastDarkMode={forecastDarkMode} />
        ))}

        {/* Forecast blocks */}
        {forecastBlocks && forecastSelectedIds && onToggleForecastSelect && (
          <ForecastWeekContent
            weekKey={weekKey}
            blocks={forecastBlocks}
            selectedBlockIds={forecastSelectedIds}
            onToggleSelect={onToggleForecastSelect}
          />
        )}
      </div>

      {isOverloaded && !isPast && silo && !spillDismissed && (
        <SpillSuggestionPanel overloadHours={overloadHours} bundles={silo.bundles} weekKey={weekKey}
          allWeeksData={allWeeksData} weeklyCapacity={weeklyCapacity} weekKeys={weekKeys} onClose={onDismissSpill} />
      )}
      {isOverloaded && !isPast && spillDismissed && (
        <button
          onClick={onReopenSpill}
          className="w-full px-2 py-[3px] text-[9px] font-semibold text-center transition-colors cursor-pointer"
          style={{
            backgroundColor: "rgba(220,53,69,0.06)",
            color: "#dc3545",
            borderRadius: "0 0 8px 8px",
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(220,53,69,0.12)"; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(220,53,69,0.06)"; }}
        >
          ⚡ Přetíženo — zobrazit návrhy
        </button>
      )}
    </div>
  );
}

function formatDateShortYY(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = parseAppDate(dateStr);
  if (!d) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

function CollapsibleBundleCard({ bundle, weekKey, showCzk, hourlyRate, onBundleContextMenu, onItemContextMenu, projectLookup, isSelected, onSelectProject, displayMode, searchQuery = "" }: {
  bundle: ScheduleBundle; weekKey: string; showCzk: boolean; hourlyRate: number;
  displayMode: DisplayMode;
  onBundleContextMenu: (e: React.MouseEvent, bundle: ScheduleBundle, toggleExpand: () => void) => void;
  onItemContextMenu: (e: React.MouseEvent, item: ScheduleItem, bundle: ScheduleBundle) => void;
  projectLookup: ProjectLookup;
  isSelected?: boolean;
  onSelectProject?: (projectId: string) => void;
  searchQuery?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = getProjectColor(bundle.project_id);
  const completedCount = bundle.items.filter(i => i.status === "completed").length;
  const totalCount = bundle.items.length;
  const allCompleted = completedCount === totalCount && totalCount > 0;
  const hasUncompleted = completedCount < totalCount;

  const project = projectLookup.get(bundle.project_id);
  const expDate = formatDateShortYY(project?.expedice);
  const expParsed = project?.expedice ? parseAppDate(project.expedice) : null;
  const daysUntilExp = expParsed ? differenceInDays(expParsed, new Date()) : null;
  const isProjectDone = ["Fakturace", "Dokonceno", "Dokončeno", "Expedice"].includes(project?.status ?? "");
  const expSeverity: "overdue" | "urgent" | null = (!isProjectDone && !allCompleted && daysUntilExp !== null)
    ? (daysUntilExp < 0 ? "overdue" : daysUntilExp <= 3 ? "urgent" : null)
    : null;

  // Check if project is overdue based on resolved deadline (expedice → montáž → datum_smluvní)
  const isOverdueProject = useMemo(() => {
    if (isProjectDone || allCompleted) return false;
    const deadline = resolveDeadline({
      expedice: project?.expedice ?? null,
      montaz: project?.montaz ?? null,
      datum_smluvni: project?.datum_smluvni ?? null,
    });
    if (!deadline) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dl = new Date(deadline.date);
    dl.setHours(0, 0, 0, 0);
    return dl < today;
  }, [project, isProjectDone, allCompleted]);

  const shouldHighlightOverdue = (daysUntilExp !== null && daysUntilExp < 0) || isOverdueProject;

  const borderLeftColor = allCompleted ? "#3a8a36"
    : shouldHighlightOverdue ? "hsl(0 70% 50%)"
    : expSeverity === "urgent" ? "#d97706"
    : color;

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `silo-bundle-${bundle.project_id}-${weekKey}`,
    data: { type: "silo-bundle", projectId: bundle.project_id, projectName: bundle.project_name, weekDate: weekKey, hours: bundle.total_hours, itemCount: bundle.items.length },
    disabled: allCompleted,
  });
  const toggleExpand = useCallback(() => setExpanded(v => !v), []);
  const isSearchMatch = bundleMatchesSearch(bundle, searchQuery);

  return (
    <div className="rounded-[6px] overflow-hidden relative" style={{
      borderTop: shouldHighlightOverdue ? "1px solid hsl(0 60% 82%)" : isSelected ? "2px solid #d97706" : isSearchMatch ? "1.5px solid #facc15" : "1px solid #ece8e2",
      borderRight: shouldHighlightOverdue ? "1px solid hsl(0 60% 82%)" : isSelected ? "2px solid #d97706" : isSearchMatch ? "1.5px solid #facc15" : "1px solid #ece8e2",
      borderBottom: shouldHighlightOverdue ? "1px solid hsl(0 60% 82%)" : isSelected ? "2px solid #d97706" : isSearchMatch ? "1.5px solid #facc15" : "1px solid #ece8e2",
      borderLeft: `4px solid ${borderLeftColor}`,
      backgroundColor: shouldHighlightOverdue ? "hsl(0 75% 93%)" : isSelected ? "rgba(217,119,6,0.05)" : isSearchMatch ? "rgba(254,240,138,0.15)" : "#ffffff", opacity: isDragging ? 0.3 : 1,
      boxShadow: shouldHighlightOverdue ? "inset 0 0 0 1px hsl(0 60% 86%)" : isSelected ? "0 0 0 2px rgba(217,119,6,0.15)" : isSearchMatch ? "0 0 0 2px rgba(250,204,21,0.25)" : undefined,
      transition: "border-top-color 150ms, border-right-color 150ms, border-bottom-color 150ms, box-shadow 150ms",
    }}>

      <div className="flex" style={{ borderBottom: expanded ? "1px solid #ece8e2" : "none", backgroundColor: shouldHighlightOverdue ? "hsl(0 75% 93%)" : undefined }}>
        {/* Left strip: expand/collapse toggle — NOT draggable */}
        <div
          className="shrink-0 flex items-center justify-center cursor-pointer select-none"
          style={{ width: 28 }}
          onClick={() => toggleExpand()}
          onMouseDown={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
        >
          <ChevronRight className="shrink-0 transition-transform duration-150"
            style={{ width: 10, height: 10, color: "#99a5a3", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }} />
        </div>

        {/* Right portion: drag handle + bundle info */}
        <div ref={setDragRef} {...attributes} {...(hasUncompleted ? listeners : {})}
          data-context="bundle"
          className={`flex items-center gap-1 flex-1 min-w-0 pr-[6px] py-[5px] ${hasUncompleted ? "cursor-grab" : "cursor-default"}`}
          onClick={e => { e.stopPropagation(); onSelectProject?.(bundle.project_id); }}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onBundleContextMenu(e, bundle, toggleExpand); }}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[11px] truncate" style={{ color: allCompleted ? "#9ca3af" : "#1a1a1a", fontWeight: allCompleted ? 500 : 600 }}>{highlightMatch(bundle.project_name, searchQuery)}</div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs" style={{ color: allCompleted ? "#b0b7c3" : "#6b7280" }}>{bundle.project_id}</span>
              {expDate && !allCompleted && (
                <span className="text-xs truncate" style={{ color: expSeverity === "overdue" ? "#dc2626" : expSeverity === "urgent" ? "#d97706" : daysUntilExp !== null && daysUntilExp <= 14 ? "#d97706" : "#6b7280" }}>
                  Exp: {expDate}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {expSeverity && !allCompleted && expParsed && (() => {
              const warnColor = expSeverity === "overdue" ? "#dc3545" : "#d97706";
              const tooltipText = expSeverity === "overdue"
                ? `Expedice ${format(expParsed, "dd.MM.yyyy")} — po termínu o ${differenceInDays(new Date(), expParsed)} dní`
                : `Expedice za ${differenceInDays(expParsed, new Date())} dní (${format(expParsed, "dd.MM.yyyy")})`;
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle size={14} style={{ color: warnColor }} className="shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="z-[9999] text-xs">{tooltipText}</TooltipContent>
                </Tooltip>
              );
            })()}
            {completedCount > 0 && <span className="text-[9px]" style={{ color: "#3a8a36", fontWeight: 600 }}>{completedCount}/{totalCount} ✓</span>}
            {displayMode === "czk" ? (
              <span className="font-mono text-[11px]" style={{ color: allCompleted ? "#9ca3af" : "#1a1a1a", fontWeight: 700 }}>{formatCompactCzk(bundle.total_hours * hourlyRate)}</span>
            ) : (
              <span className="font-mono text-[11px]" style={{ color: allCompleted ? "#9ca3af" : "#1a1a1a", fontWeight: 700 }}>{Math.round(bundle.total_hours)}h</span>
            )}
          </div>
        </div>
      </div>
      {expanded && (() => {
        const activeItems = bundle.items.filter(i => i.status !== "completed");
        const completedItems = bundle.items.filter(i => i.status === "completed");
        return (
          <div className="px-[3px] py-[2px]" onContextMenu={e => e.stopPropagation()}>
            {activeItems.map(item =>
              item.status === "paused" ? (
                <PausedSiloItem key={item.id} item={item} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onItemContextMenu(e, item, bundle); }} />
              ) : (
                <DraggableSiloItem key={item.id} item={item} weekKey={weekKey} showCzk={showCzk} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onItemContextMenu(e, item, bundle); }} />
              )
            )}
            {completedItems.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-1.5 mt-1 mb-0.5">
                  <div className="flex-1 h-px" style={{ backgroundColor: "#e2ddd6" }} />
                  <span className="text-[8px] font-medium" style={{ color: "#b0bab8" }}>Dokončeno</span>
                  <div className="flex-1 h-px" style={{ backgroundColor: "#e2ddd6" }} />
                </div>
                <div style={{ opacity: 0.65 }}>
                  {completedItems.map(item => (
                    <CompletedSiloItem key={item.id} item={item} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onItemContextMenu(e, item, bundle); }} />
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function CompletedSiloItem({ item, onContextMenu }: { item: ScheduleItem; onContextMenu: (e: React.MouseEvent) => void }) {
  const isSplit = !!item.split_group_id;
  return (
    <div data-context="item" className="flex items-center gap-[3px] px-[6px] py-[3px] rounded cursor-default transition-colors"
      style={{ borderLeft: isSplit ? "2px dashed #c4ccc9" : undefined, backgroundColor: "#f8f7f4" }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#eceae6"; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#f5f3f0"; }}
      onContextMenu={onContextMenu}
    >
      <span style={{ width: 10, fontSize: 9, color: "#3a8a36", fontWeight: 700 }}>✓</span>
      {item.item_code && <span className="font-mono text-[9px] font-bold shrink-0" style={{ color: "#99a5a3" }}>{item.item_code}</span>}
      <span className="text-[10px] flex-1 truncate" style={{ color: "#6b7280", textDecoration: "line-through" }}>{item.item_name}</span>
      {isSplit && (
        <Tooltip><TooltipTrigger asChild><span className="text-[8px] font-mono shrink-0" style={{ color: "#c4ccc9" }}>{item.split_part}/{item.split_total}</span></TooltipTrigger>
          <TooltipContent side="top" className="z-[9999] text-[10px]">Část {item.split_part} ze {item.split_total}</TooltipContent></Tooltip>
      )}
      <span className="font-mono text-[9px] shrink-0" style={{ color: "#c4ccc9" }}>{item.scheduled_hours}h</span>
    </div>
  );
}

function PausedSiloItem({ item, onContextMenu }: { item: ScheduleItem; onContextMenu: (e: React.MouseEvent) => void }) {
  const isSplit = !!item.split_group_id;
  const pauseReason = (item as any).pause_reason || "Pozastaveno";
  const pauseExpDate = (item as any).pause_expected_date;
  const isOverdue = pauseExpDate && new Date(pauseExpDate) < new Date();

  return (
    <div data-context="item" className="flex items-center gap-[3px] px-[6px] py-[3px] rounded cursor-default transition-colors"
      style={{
        borderLeft: isSplit ? "2px dashed #d97706" : "2px dashed #d97706",
        backgroundColor: "rgba(217,119,6,0.03)",
      }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(217,119,6,0.07)"; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(217,119,6,0.03)"; }}
      onContextMenu={onContextMenu}
    >
      <span style={{ width: 10, fontSize: 9, color: "#d97706", fontWeight: 700 }}>⏸</span>
      {item.item_code && <span className="font-mono text-[9px] shrink-0" style={{ color: "#d97706" }}>{item.item_code}</span>}
      <span className="text-[10px] flex-1 truncate" style={{ color: "#d97706", textDecoration: "line-through" }}>{item.item_name}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-[8px] font-medium shrink-0 px-1 py-0.5 rounded"
            style={{
              backgroundColor: isOverdue ? "rgba(220,53,69,0.1)" : "rgba(217,119,6,0.1)",
              color: isOverdue ? "#dc3545" : "#d97706",
            }}
          >
            {isOverdue ? "⚠ " : ""}⏸ {pauseReason}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="z-[9999] text-[10px]">
          {pauseExpDate ? `Očekávané uvolnění: ${new Date(pauseExpDate).toLocaleDateString("cs-CZ")}` : "Bez termínu uvolnění"}
        </TooltipContent>
      </Tooltip>
      <span className="font-mono text-[9px] shrink-0" style={{ color: "#d97706", textDecoration: "line-through" }}>{item.scheduled_hours}h</span>
    </div>
  );
}

function DraggableSiloItem({ item, weekKey, showCzk, onContextMenu }: {
  item: ScheduleItem; weekKey: string; showCzk: boolean; onContextMenu: (e: React.MouseEvent) => void;
}) {
  const isSplit = !!item.split_group_id;
  const adhocReason = (item as any).adhoc_reason;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `silo-item-${item.id}`,
    data: {
      type: "silo-item", itemId: item.id, itemName: item.item_name, itemCode: item.item_code,
      projectId: item.project_id, projectName: item.project_name, weekDate: weekKey,
      hours: item.scheduled_hours, stageId: item.stage_id, scheduledCzk: item.scheduled_czk,
      splitGroupId: item.split_group_id,
    },
  });

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e);
  }, [onContextMenu]);

  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      data-context="item"
      className="flex items-center gap-[3px] px-[6px] py-[3px] rounded cursor-grab transition-colors"
      style={{ opacity: isDragging ? 0.3 : 1, borderLeft: isSplit ? "2px dashed #99a5a3" : undefined }}
      onMouseEnter={e => { if (!isDragging) e.currentTarget.style.backgroundColor = "#f8f7f5"; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
      onContextMenu={handleContextMenu}
    >
      <GripVertical className="shrink-0" style={{ width: 8, height: 8, color: "#99a5a3" }} />
      {adhocReason && (
        <span className="text-[8px] shrink-0" style={{ color: "#d97706" }}>
          {adhocReason === "oprava" ? "🔧" : adhocReason === "dodatecna" ? "➕" : "📝"}
        </span>
      )}
      {item.item_code && <span className="font-mono text-[9px] shrink-0" style={{ color: "#223937" }}>{item.item_code}</span>}
      <span className="text-[10px] flex-1 truncate" style={{ color: "#6b7a78" }}>{item.item_name}</span>
      {isSplit && (
        <Tooltip><TooltipTrigger asChild><span className="text-[8px] font-mono shrink-0" style={{ color: "#99a5a3" }}>{item.split_part}/{item.split_total}</span></TooltipTrigger>
          <TooltipContent side="top" className="z-[9999] text-[10px]">Část {item.split_part} ze {item.split_total}</TooltipContent></Tooltip>
      )}
      <span className="font-mono text-[9px] shrink-0" style={{ color: "#99a5a3" }}>
        {item.scheduled_hours}h{showCzk && ` ${Math.round(item.scheduled_czk / 1000)}K`}
      </span>
    </div>
  );
}
