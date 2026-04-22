import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { productionCzkToSellingPrice } from "@/lib/currency";
import { GripVertical, ChevronRight, AlertTriangle, Lock, LockOpen } from "lucide-react";
import type { ForecastBlock } from "@/hooks/useForecastMode";
import { differenceInDays, format } from "date-fns";
import { useProductionSchedule, getISOWeekNumber, type WeekSilo, type ScheduleBundle, type ScheduleItem } from "@/hooks/useProductionSchedule";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { useWeekCapacityLookup } from "@/hooks/useWeeklyCapacity";
import { useVyrobniEmployees } from "@/hooks/useCapacityCalc";
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
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { getTerminalStatuses } from "@/lib/statusHelpers";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { parseAppDate } from "@/lib/dateFormat";
import { getProjectRiskSeverity } from "@/hooks/useRiskHighlight";
import { resolveDeadline } from "@/lib/deadlineWarning";
import { ForecastWeekContent, ForecastSplitDialog } from "./ForecastOverlay";
import { type SafetyNetProject } from "./ForecastSafetyNet";
import { buildBundleKey, canAcceptBundleDrop, deriveBundleSplitMeta, formatBundleDisplayLabel } from "@/lib/productionBundles";

function formatCompactCzk(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${Math.round(v)}`;
}

/** Timezone-safe YYYY-MM-DD from local Date */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function bundleMatchesSearch(bundle: { project_name: string; project_id: string; items: Array<{ item_code: string | null }> }, query: string, pm?: string | null): boolean {
  if (!query) return false;
  const q = query.toLowerCase();
  if (pm && pm.toLowerCase().includes(q)) return true;
  return bundle.project_name.toLowerCase().includes(q) || bundle.project_id.toLowerCase().includes(q) || bundle.items.some(i => i.item_code?.toLowerCase().includes(q));
}

interface Props {
  showCzk: boolean;
  onToggleCzk: (v: boolean) => void;
  overDroppableId?: string | null;
  activeDrag?: {
    type?: string;
    projectId?: string;
    weekDate?: string;
    stageId?: string | null;
    bundleKey?: string;
    bundleLabel?: string | null;
    bundleType?: "full" | "split" | null;
    splitPart?: number | null;
  } | null;
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
  forecastPlanMode?: "respect_plan" | "from_scratch";
  onMoveForecastBlock?: (blockId: string, newWeek: string) => void;
  onRemoveForecastBlock?: (blockId: string) => void;
  onSplitForecastBlock?: (blockId: string, keepHours: number, splitWeek: string) => void;
  forecastSafetyNet?: SafetyNetProject[];
  onRestoreFromSafetyNet?: (projectId: string) => void;
  onConvertReserveToForecast?: (bundle: ScheduleBundle, weekKey: string) => void;
  /** Currently focused search match key (weekKey::projectId) for scroll + ring highlight */
  focusedMatchKey?: string | null;
  /** Week key of the current search match — triggers scroll */
  searchMatchWeekKey?: string | null;
  /** Set of project IDs matching the current search — used for dimming non-matches */
  searchMatchedProjectIds?: Set<string>;
  /** Whether search is active (>= 3 chars) */
  searchActive?: boolean;
  /** Called when the leftmost visible week changes — reports its month + year */
  onVisibleMonthChange?: (month: number, year: number) => void;
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

export function WeeklySilos({ showCzk, onToggleCzk, overDroppableId, activeDrag, onNavigateToTPV, onOpenProjectDetail, displayMode, onDisplayModeChange, selectedProjectId, onSelectProject, searchQuery = "", forecastBlocks, forecastSelectedIds, onToggleForecastSelect, forecastDarkMode, forecastPlanMode, onMoveForecastBlock, onRemoveForecastBlock, onSplitForecastBlock, forecastSafetyNet, onRestoreFromSafetyNet, onConvertReserveToForecast, focusedMatchKey, searchMatchWeekKey, searchMatchedProjectIds, searchActive, onVisibleMonthChange }: Props) {
  const { data: scheduleData } = useProductionSchedule();
  const { data: settings } = useProductionSettings();
  const { moveItemBackToInbox, returnBundleToInbox, returnToProduction, mergeSplitItems, mergeBundleSplitGroups } = useProductionDragDrop();
  const { data: allProjects = [] } = useProjects();
  const { data: statusOpts = [] } = useProjectStatusOptions();
  const terminalStatuses = useMemo(() => getTerminalStatuses(statusOpts), [statusOpts]);
  const qc = useQueryClient();
  const { data: vyrobniEmps = [] } = useVyrobniEmployees();
  const bruttoPerDay = vyrobniEmps.reduce((s, e) => s + (e.uvazok_hodiny ?? 8), 0);
  const getWeekCapacity = useWeekCapacityLookup(bruttoPerDay || undefined);
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = useMemo(() => (exchangeRatesData || []).map(r => ({ year: r.year, eur_czk: r.eur_czk })), [exchangeRatesData]);

  // FIX 6: Fetch plan hours and real hours for prodej calculation
  const { data: planHoursData } = useQuery({
    queryKey: ["project-plan-hours-lookup"],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_plan_hours").select("project_id, hodiny_plan");
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of data || []) map.set(row.project_id, row.hodiny_plan);
      return map;
    },
  });

  const { data: realHoursData } = useQuery({
    queryKey: ["real-hours-by-project"],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_hours_by_project");
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of data || []) map.set(row.ami_project_id, Number(row.total_hodiny));
      return map;
    },
  });

  const projectLookup = useMemo(() => {
    const map = new Map<string, { datum_smluvni?: string | null; expedice?: string | null; montaz?: string | null; predani?: string | null; status?: string | null; risk?: string | null; pm?: string | null; cost_production_pct?: number | null; marze?: string | null; prodejni_cena?: number | null; currency?: string | null; created_at?: string | null }>();
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
  const [pastWeeksLoaded, setPastWeeksLoaded] = useState(4);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [unlockedWeeks, setUnlockedWeeks] = useState<Set<string>>(new Set());

  const toggleWeekLock = useCallback((weekKey: string) => {
    setUnlockedWeeks(prev => {
      const next = new Set(prev);
      next.has(weekKey) ? next.delete(weekKey) : next.add(weekKey);
      return next;
    });
  }, []);

  const defaultWeeklyCapacity = Math.round((settings?.monthly_capacity_hours ?? 3500) / 4);
  const hourlyRate = settings?.hourly_rate ?? 550;

  // Initial scroll — defer until weeks are rendered
  useEffect(() => {
    if (initialScrollDone.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    // Scroll so that 1 past week is visible before current week
    const pastCount = pastWeeksLoaded;
    const scrollTarget = Math.max(0, (pastCount - 1)) * 259;
    el.scrollLeft = scrollTarget;
    initialScrollDone.current = true;
  }, [pastWeeksLoaded]);

  // Auto-scroll silo container during drag when pointer near edges
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let animFrame = 0;
    const EDGE_ZONE = 80;
    const SCROLL_SPEED = 6;
    let prevX = 0;

    const handlePointerMove = (e: PointerEvent) => {
      cancelAnimationFrame(animFrame);
      animFrame = 0;

      // Only auto-scroll when a button is pressed (dragging)
      if (e.buttons === 0) { prevX = e.clientX; return; }

      const rect = container.getBoundingClientRect();
      const x = e.clientX;
      const movingLeft = x < prevX;
      const movingRight = x > prevX;
      prevX = x;

      if (x < rect.left + EDGE_ZONE && x >= rect.left && movingLeft) {
        const intensity = 1 - (x - rect.left) / EDGE_ZONE;
        const step = () => {
          container.scrollLeft -= Math.round(SCROLL_SPEED * intensity);
          animFrame = requestAnimationFrame(step);
        };
        animFrame = requestAnimationFrame(step);
      } else if (x > rect.right - EDGE_ZONE && x <= rect.right && movingRight) {
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

  // Calculate future range based on latest project deadline
  const futureWeekCount = useMemo(() => {
    let maxDate = new Date();
    for (const p of allProjects) {
      if (!p.is_active || p.deleted_at) continue;
      if (terminalStatuses.has(p.status ?? "")) continue;
      const deadline = resolveDeadline(p);
      if (deadline && deadline.date.getTime() > maxDate.getTime()) {
        maxDate = deadline.date;
      }
    }
    const monday = getMonday(new Date());
    const diffWeeks = Math.ceil((maxDate.getTime() - monday.getTime()) / (7 * 86400000));
    return Math.max(12, diffWeeks + 2); // at least 12 future weeks, or deadline + 2
  }, [allProjects]);

  const weeks = useMemo(() => {
    const monday = getMonday(new Date());
    const result: { start: Date; end: Date; weekNum: number; key: string; isPast: boolean }[] = [];
    for (let i = -pastWeeksLoaded; i < futureWeekCount; i++) {
      const start = new Date(monday);
      start.setDate(monday.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      result.push({ start, end, weekNum: getISOWeekNumber(start), key: toLocalDateStr(start), isPast: i < 0 });
    }
    return result;
  }, [pastWeeksLoaded, futureWeekCount]);

  const weekKeys = useMemo(() => weeks.map(w => w.key), [weeks]);

  // Debug: log week key comparison when forecast is active
  useEffect(() => {
    if (forecastDarkMode && forecastBlocks && forecastBlocks.length > 0) {
      const siloKeys = weeks.map(w => w.key);
      const forecastWeeks = [...new Set(forecastBlocks.map(b => b.week))].sort();
      const matching = forecastWeeks.filter(fw => siloKeys.includes(fw));
      const missing = forecastWeeks.filter(fw => !siloKeys.includes(fw));
      console.log(`[WeeklySilos] Silo week keys:`, siloKeys);
      console.log(`[WeeklySilos] Forecast block weeks:`, forecastWeeks);
      console.log(`[WeeklySilos] Matching: ${matching.length}, Missing: ${missing.length}`, missing.length > 0 ? missing : "");
    }
  }, [forecastDarkMode, forecastBlocks, weeks]);

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
      // Report leftmost visible week's month to parent
      onVisibleMonthChange?.(first.getMonth(), first.getFullYear());
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
  }, [weeks, onVisibleMonthChange]);

  const registerSiloRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) siloRefs.current.set(key, el); else siloRefs.current.delete(key);
  }, []);

  // Scroll to matching silo when search nav changes, then scroll to specific bundle card
  useEffect(() => {
    if (!searchMatchWeekKey || !focusedMatchKey) return;
    const el = siloRefs.current.get(searchMatchWeekKey);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      // After horizontal scroll settles, scroll vertically to the bundle card
      setTimeout(() => {
        const cardEl = document.querySelector(`[data-bundle-key="${focusedMatchKey}"]`);
        if (cardEl) cardEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 350);
    }
  }, [searchMatchWeekKey, focusedMatchKey]);

  const currentWeekKey = useMemo(() => toLocalDateStr(getMonday(new Date())), []);

  // Compute spilled bundles for the current week T — mirrors logic from src/pages/Vyroba.tsx:
  // ONLY look at the immediately preceding week (T-1), skip projects already re-planned in T,
  // and exclude items that are effectively done (including legacy midflight items).
  const spilledBundlesForCurrent = useMemo(() => {
    if (!scheduleData) return [] as Array<ScheduleBundle & { __spilledFromWeekKey: string; __spilledFromWeekNum: number }>;

    const isItemDoneLocal = (item: ScheduleItem) => {
      if (item.is_midflight) return true;
      return item.status === "completed" || item.status === "expedice";
    };

    const prevMonday = new Date(currentWeekKey + "T00:00:00");
    prevMonday.setDate(prevMonday.getDate() - 7);
    const prevWeekKey = toLocalDateStr(prevMonday);
    const prevSilo = scheduleData.get(prevWeekKey);
    if (!prevSilo) return [];

    const currentSilo = scheduleData.get(currentWeekKey);
    const currentProjectIds = new Set<string>(currentSilo?.bundles.map((b) => b.project_id) || []);
    const result: Array<ScheduleBundle & { __spilledFromWeekKey: string; __spilledFromWeekNum: number }> = [];

    for (const b of prevSilo.bundles) {
      if (currentProjectIds.has(b.project_id)) continue;

      const activeItems = b.items.filter(
        (i) => (i.status === "scheduled" || i.status === "in_progress") && !isItemDoneLocal(i),
      );

      if (activeItems.length === 0) continue;

      const activeHours = activeItems.reduce((s, i) => s + (Number(i.scheduled_hours) || 0), 0);
      result.push({
        project_id: b.project_id,
        project_name: b.project_name,
        stage_id: b.stage_id,
        bundle_label: b.bundle_label,
        bundle_type: b.bundle_type,
        split_part: b.split_part,
        split_total: b.split_total,
        items: activeItems,
        total_hours: activeHours,
        __spilledFromWeekKey: prevWeekKey,
        __spilledFromWeekNum: prevSilo.week_number,
      });
    }

    return result;
  }, [scheduleData, currentWeekKey]);

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

      // Blocker bundles: only allow "Zrušit rezervu"
      const isBlocker = bundle.items.length > 0 && bundle.items.every(i => i.is_blocker);
      if (isBlocker) {
        const actions: ContextMenuAction[] = [];

        // Header info: project name + week
        actions.push({
          label: `${bundle.project_name} · T${weekNum}`,
          icon: "📋",
          onClick: () => {},
        });

        actions.push({
          label: "Přenést do plánu", icon: "📌",
          dividerBefore: true,
          onClick: async () => {
            const ids = bundle.items.map(i => i.id);
            const { error } = await supabase.from("production_schedule").update({
              is_blocker: false,
              status: "scheduled",
            } as any).in("id", ids);
            if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
            qc.invalidateQueries({ queryKey: ["production-schedule"] });
            toast({ title: `📌 ${bundle.project_name} přeneseno do plánu (T${weekNum})` });
          },
        });

        actions.push({
          label: "Zrušit rezervu", icon: "🗑",
          danger: true,
          onClick: async () => {
            const ids = bundle.items.map(i => i.id);
            const { error } = await supabase.from("production_schedule").delete().in("id", ids);
            if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
            qc.invalidateQueries({ queryKey: ["production-schedule"] });
            if (forecastDarkMode && onConvertReserveToForecast) {
              onConvertReserveToForecast(bundle, weekKey);
              toast({ title: `⏳ Rezerva → Forecast: ${bundle.project_name} (T${weekNum})` });
            } else {
              toast({ title: `🗑 Rezerva pro ${bundle.project_name} zrušena` });
            }
          },
        });

        setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 200), actions });
        return;
      }

      const activeItems = bundle.items.filter(i => i.status !== "expedice" && i.status !== "completed" && i.status !== "paused" && i.status !== "cancelled");
      const hasUncompleted = activeItems.length > 0;
      const completedItems = bundle.items.filter(i => i.status === "expedice" || i.status === "completed");
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
        // Vrátit celý projekt do TPV (soft-delete - zostane stopa s oranžovým badgem)
        const returnableItems = [...activeItems, ...pausedItems].filter(i => {
          const ia = i as any;
          return !ia.is_midflight && !ia.is_historical;
        });
        if (returnableItems.length > 0) {
          actions.push({
            label: `Vrátit do TPV (${returnableItems.length})`, icon: "↩",
            onClick: async () => {
              try {
                const { data: { user } } = await supabase.auth.getUser();
                const { error } = await supabase
                  .from("production_schedule")
                  .update({ status: "returned", returned_at: new Date().toISOString(), returned_by: user?.id ?? null } as any)
                  .in("id", returnableItems.map(i => i.id));
                if (error) throw error;
                qc.invalidateQueries({ queryKey: ["production-schedule"] });
                qc.invalidateQueries({ queryKey: ["production-progress"] });
                qc.invalidateQueries({ queryKey: ["production-statuses", bundle.project_id] });
                qc.invalidateQueries({ queryKey: ["tpv-items", bundle.project_id] });
                toast({ title: `↩ Vráceno ${returnableItems.length} položek do TPV` });
              } catch (err: any) {
                console.error("[Vrátit projekt do TPV] failed:", err);
                toast({ title: "Chyba", description: err?.message, variant: "destructive" });
              }
            },
          });
        }
      }
      // Merge option for bundles containing split items
      const splitGroupIds = new Set<string>();
      for (const item of bundle.items) {
        if (item.split_group_id && item.status !== "expedice" && item.status !== "completed" && item.status !== "cancelled") {
          splitGroupIds.add(item.split_group_id);
        }
      }
      const mergeableSplitGroups = Array.from(splitGroupIds).filter(sgId => {
        const siblingsInWeek = bundle.items.filter(i => i.split_group_id === sgId && i.status !== "expedice" && i.status !== "completed" && i.status !== "cancelled");
        return siblingsInWeek.length >= 2;
      });
      if (mergeableSplitGroups.length > 0) {
        actions.push({
          label: `Spojit části (${mergeableSplitGroups.length} skupin)`, icon: "🔗",
          onClick: async () => {
            await mergeBundleSplitGroups(mergeableSplitGroups);
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
    [returnBundleToInbox, returnToProduction, onNavigateToTPV, onOpenProjectDetail, handleReleaseItem, mergeSplitItems, mergeBundleSplitGroups, forecastDarkMode, onConvertReserveToForecast]
  );

  const handleItemContextMenu = useCallback(
    (e: React.MouseEvent, item: ScheduleItem, weekKey: string, weekNum: number, startDate: Date, endDate: Date, bundle: ScheduleBundle) => {
      e.preventDefault(); e.stopPropagation();
      const isCompleted = item.status === "expedice" || item.status === "completed";
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
        const itemAnyP = item as any;
        if (!itemAnyP.is_midflight && !itemAnyP.is_historical) {
          actions.push({
            label: "Vrátit do TPV", icon: "↩",
            onClick: async () => {
              try {
                const { data: { user } } = await supabase.auth.getUser();
                const { error } = await supabase
                  .from("production_schedule")
                  .update({ status: "returned", returned_at: new Date().toISOString(), returned_by: user?.id ?? null } as any)
                  .eq("id", item.id);
                if (error) throw error;
                qc.invalidateQueries({ queryKey: ["production-schedule"] });
                qc.invalidateQueries({ queryKey: ["production-progress"] });
                qc.invalidateQueries({ queryKey: ["production-statuses", item.project_id] });
                qc.invalidateQueries({ queryKey: ["tpv-items", item.project_id] });
                toast({ title: "↩ Vráceno do TPV" });
              } catch (err: any) {
                console.error("[Vrátit do TPV] failed:", err);
                toast({ title: "Chyba", description: err?.message, variant: "destructive" });
              }
            },
          });
        }
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

        // Vrátit do TPV — soft-delete (zostane stopa s oranžovým badgem v TPV Liste)
        const itemAnyA = item as any;
        if (!itemAnyA.is_midflight && !itemAnyA.is_historical) {
          actions.push({
            label: "Vrátit do TPV", icon: "↩",
            onClick: async () => {
              try {
                const { data: { user } } = await supabase.auth.getUser();
                const { error } = await supabase
                  .from("production_schedule")
                  .update({ status: "returned", returned_at: new Date().toISOString(), returned_by: user?.id ?? null } as any)
                  .eq("id", item.id);
                if (error) throw error;
                qc.invalidateQueries({ queryKey: ["production-schedule"] });
                qc.invalidateQueries({ queryKey: ["production-progress"] });
                qc.invalidateQueries({ queryKey: ["production-statuses", item.project_id] });
                qc.invalidateQueries({ queryKey: ["tpv-items", item.project_id] });
                toast({ title: "↩ Vráceno do TPV" });
              } catch (err: any) {
                console.error("[Vrátit do TPV] failed:", err);
                toast({ title: "Chyba", description: err?.message, variant: "destructive" });
              }
            },
          });
        }

        actions.push({
          label: "Pozastavit", icon: "⏸",
          onClick: () => setPauseState({ itemId: item.id, itemName: item.item_name, itemCode: item.item_code, source: "schedule" }),
        });

        // Merge options for split items
        if (item.split_group_id) {
          const sameWeekSiblings = findSameWeekSiblings(item, weekKey);
          if (sameWeekSiblings.length > 0) {
            actions.push({ label: `Spojit s ostatními v T${weekNum}`, icon: "🔗", onClick: () => mergeSplitItems(item.split_group_id!, weekKey) });
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

  // Forecast card context menu — same structure as real plan menus + forecast-specific actions
  const [forecastExpandedIds, setForecastExpandedIds] = useState<Set<string>>(new Set());
  const toggleForecastExpand = useCallback((blockId: string) => {
    setForecastExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }, []);

  // Forecast split dialog state
  const [forecastSplitState, setForecastSplitState] = useState<{
    blockId: string;
    blockName: string;
    totalHours: number;
    currentWeek: string;
  } | null>(null);

  const handleForecastContextMenu = useCallback((e: React.MouseEvent, block: ForecastBlock) => {
    e.preventDefault();
    e.stopPropagation();
    const futureWeeks = weeks.filter(w => !w.isPast && w.key !== block.week);
    const actions: ContextMenuAction[] = [];

    // Expand/Collapse
    actions.push({
      label: forecastExpandedIds.has(block.id) ? "Sbalit" : "Rozbalit",
      icon: "⇅",
      onClick: () => toggleForecastExpand(block.id),
    });

    // Split bundle
    if (block.estimated_hours > 1) {
      actions.push({
        label: "Rozdělit bundle",
        icon: "✂",
        onClick: () => setForecastSplitState({
          blockId: block.id,
          blockName: block.project_name,
          totalHours: block.estimated_hours,
          currentWeek: block.week,
        }),
      });
    }


    // Project navigation actions (same as real plan)
    if (onNavigateToTPV) {
      actions.push({
        label: "Zobrazit položky",
        icon: "📋",
        dividerBefore: true,
        onClick: () => onNavigateToTPV(block.project_id),
      });
    }
    if (onOpenProjectDetail) {
      actions.push({
        label: "Zobrazit detail projektu",
        icon: "🏗",
        onClick: () => onOpenProjectDetail(block.project_id),
      });
    }

    // Forecast-specific: remove
    actions.push({
      label: "Odstranit z forecastu",
      icon: "✕",
      danger: true,
      dividerBefore: true,
      onClick: () => onRemoveForecastBlock?.(block.id),
    });
    setContextMenu({ x: e.clientX, y: e.clientY, actions });
  }, [weeks, onMoveForecastBlock, onRemoveForecastBlock, onNavigateToTPV, onOpenProjectDetail, forecastExpandedIds, toggleForecastExpand]);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Toolbar */}
      <div className="px-3 py-[6px] flex items-center justify-between shrink-0" style={{ borderBottom: forecastDarkMode ? "1px solid #2a3d3a" : "1px solid #ece8e2", backgroundColor: forecastDarkMode ? "#1a2422" : undefined }}>
        <button
          onClick={() => { const el = scrollContainerRef.current; if (el) el.scrollTo({ left: pastWeeksLoaded * 259, behavior: "smooth" }); }}
          className="px-2 py-[3px] text-[10px] font-medium rounded transition-colors"
          style={{ backgroundColor: forecastDarkMode ? "#1f2e2c" : "#ffffff", color: forecastDarkMode ? "#a8c5c2" : "#6b7a78", border: forecastDarkMode ? "1px solid #2a3d3a" : "1px solid #e2ddd6", cursor: "pointer" }}
        >
          Tento týden
        </button>
        <span className="text-[9px] font-medium" style={{ color: forecastDarkMode ? "#7aa8a4" : "#99a5a3" }}>{visiblePeriodLabel}</span>
      </div>



      {/* Silos */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden" ref={scrollContainerRef}>
        <div className="flex gap-[6px] p-2 h-full" style={{ minWidth: `${(weeks.length + 1) * 259}px` }}>
          {/* History load button */}
          <div
            className="shrink-0 flex flex-col items-center justify-center rounded-lg cursor-pointer select-none transition-colors"
            style={{
              width: 252,
              minHeight: 120,
              backgroundColor: forecastDarkMode ? "#1a2422" : "#f8f6f3",
              border: forecastDarkMode ? "1px dashed #2a3d3a" : "1px dashed #d5cfc6",
              color: forecastDarkMode ? "#7aa8a4" : "#6b7280",
            }}
            onClick={() => {
              if (historyLoading) return;
              setHistoryLoading(true);
              const el = scrollContainerRef.current;
              const prevScrollLeft = el?.scrollLeft ?? 0;
              setPastWeeksLoaded(prev => prev + 4);
              // After state update + render, restore scroll position offset by new columns
              requestAnimationFrame(() => {
                if (el) el.scrollLeft = prevScrollLeft + 4 * 259;
                setHistoryLoading(false);
              });
            }}
          >
            {historyLoading ? (
              <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
            ) : (
              <>
                <span className="text-[11px] font-medium">← Historie</span>
                <span className="text-[9px] mt-1 opacity-60">Načíst 4 starší týdny</span>
              </>
            )}
          </div>
          {weeks.map((week, idx) => {
            return (
              <div key={week.key} className="relative shrink-0 flex flex-col" style={{ width: 252 }}>
                <SiloColumn
                  weekKey={week.key} weekNum={week.weekNum}
                  startDate={week.start} endDate={week.end}
                  isCurrent={week.key === currentWeekKey} isPast={week.isPast}
                  silo={scheduleData?.get(week.key) || null}
                  weeklyCapacity={getWeekCapacity(week.key)} showCzk={showCzk} hourlyRate={hourlyRate} displayMode={displayMode || "hours"}
                  isOverTarget={overDroppableId === `silo-week-${week.key}`}
                  onBundleContextMenu={(e, bundle, toggleExpand) => handleBundleContextMenu(e, bundle, week.key, week.weekNum, week.start, week.end, toggleExpand)}
                  onItemContextMenu={(e, item, bundle) => handleItemContextMenu(e, item, week.key, week.weekNum, week.start, week.end, bundle)}
                  allWeeksData={weeksCapacityMap} weekKeys={weekKeys} registerRef={registerSiloRef}
                  projectLookup={projectLookup}
                  planHoursMap={planHoursData}
                  realHoursMap={realHoursData}
                  exchangeRates={exchangeRates}
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
                  forecastPlanMode={forecastPlanMode}
                  onForecastContextMenu={forecastDarkMode ? handleForecastContextMenu : undefined}
                  forecastExpandedIds={forecastExpandedIds}
                  onToggleForecastExpand={toggleForecastExpand}
                  focusedMatchKey={focusedMatchKey}
                  searchMatchedProjectIds={searchMatchedProjectIds}
                  searchActive={searchActive}
                  isWeekLocked={week.isPast && !unlockedWeeks.has(week.key)}
                  onToggleLock={() => toggleWeekLock(week.key)}
                  activeDrag={activeDrag}
                  spilledBundles={week.key === currentWeekKey ? spilledBundlesForCurrent : undefined}
                />
              </div>
            );
          })}
        </div>
      </div>

      {contextMenu && <ProductionContextMenu x={contextMenu.x} y={contextMenu.y} actions={contextMenu.actions} onClose={() => setContextMenu(null)} darkMode={forecastDarkMode} />}

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

      {/* Forecast split dialog */}
      {forecastSplitState && onSplitForecastBlock && (
        <ForecastSplitDialog
          open={!!forecastSplitState}
          onOpenChange={open => !open && setForecastSplitState(null)}
          blockName={forecastSplitState.blockName}
          totalHours={forecastSplitState.totalHours}
          currentWeek={forecastSplitState.currentWeek}
          weeks={weekOptions}
          onSplit={(keepHours, targetWeek) => {
            onSplitForecastBlock(forecastSplitState.blockId, keepHours, targetWeek);
            setForecastSplitState(null);
          }}
        />
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

type ProjectLookup = Map<string, { datum_smluvni?: string | null; expedice?: string | null; montaz?: string | null; predani?: string | null; status?: string | null; risk?: string | null; pm?: string | null; cost_production_pct?: number | null; marze?: string | null; prodejni_cena?: number | null; currency?: string | null; created_at?: string | null }>;

/** FIX 6: Calculate prodej value for a project's hours in a week silo */
function calcProdejValue(
  scheduledHours: number,
  projectId: string,
  projectLookup: ProjectLookup,
  planHoursMap: Map<string, number> | undefined,
  realHoursMap: Map<string, number> | undefined,
  exchangeRates?: Array<{ year: number; eur_czk: number }>,
): number {
  const proj = projectLookup.get(projectId);
  let prodejniCena = proj?.prodejni_cena ?? 0;
  if (!prodejniCena || prodejniCena <= 0 || scheduledHours <= 0) return 0;
  // Convert EUR projects to CZK
  if (proj?.currency === 'EUR' && exchangeRates && exchangeRates.length > 0) {
    const projYear = proj.created_at ? new Date(proj.created_at).getFullYear() : new Date().getFullYear();
    const sorted = [...exchangeRates].sort((a, b) => b.year - a.year);
    const eurRate = sorted.find(r => r.year === projYear)?.eur_czk ?? sorted[0]?.eur_czk ?? 25;
    prodejniCena = prodejniCena * eurRate;
  }
  const planHours = planHoursMap?.get(projectId) ?? 0;
  const realHours = realHoursMap?.get(projectId) ?? 0;
  const effectiveHours = Math.max(planHours, realHours);
  if (effectiveHours <= 0) return 0;
  const weekShare = scheduledHours / effectiveHours;
  return weekShare * prodejniCena;
}

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
  planHoursMap?: Map<string, number>;
  realHoursMap?: Map<string, number>;
  exchangeRates?: Array<{ year: number; eur_czk: number }>;
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
  forecastPlanMode?: "respect_plan" | "from_scratch";
  onForecastContextMenu?: (e: React.MouseEvent, block: ForecastBlock) => void;
  forecastExpandedIds?: Set<string>;
  onToggleForecastExpand?: (blockId: string) => void;
  focusedMatchKey?: string | null;
  searchMatchedProjectIds?: Set<string>;
  searchActive?: boolean;
  isWeekLocked?: boolean;
  onToggleLock?: () => void;
  activeDrag?: Props["activeDrag"];
  spilledBundles?: Array<ScheduleBundle & { __spilledFromWeekKey: string; __spilledFromWeekNum: number }>;
}

function SiloColumn({ weekKey, weekNum, startDate, endDate, isCurrent, isPast, silo, weeklyCapacity,
  showCzk, hourlyRate, isOverTarget, onBundleContextMenu, onItemContextMenu, allWeeksData, weekKeys, registerRef, projectLookup, planHoursMap, realHoursMap, exchangeRates, spillDismissed, onDismissSpill, onReopenSpill, selectedProjectId, onSelectProject, displayMode, searchQuery = "", forecastBlocks, forecastSelectedIds, onToggleForecastSelect, forecastDarkMode, forecastPlanMode, onForecastContextMenu, forecastExpandedIds, onToggleForecastExpand, focusedMatchKey, searchMatchedProjectIds, searchActive, isWeekLocked, onToggleLock, activeDrag, spilledBundles }: SiloProps) {
  const spilledHours = useMemo(() => (spilledBundles || []).reduce((s, b) => s + b.total_hours, 0), [spilledBundles]);
  const spilledPct = weeklyCapacity > 0 ? (spilledHours / weeklyCapacity) * 100 : 0;
  // Capacity calculation: exclude paused items
  // Active hours (excl. paused), split into blocker and non-blocker
  const { activeHours, blockerHours, activeSellingCzk, blockerSellingCzk } = useMemo(() => {
    if (!silo) return { activeHours: 0, blockerHours: 0, activeSellingCzk: 0, blockerSellingCzk: 0 };
    let active = 0;
    let blocker = 0;
    let activeSelling = 0;
    let blockerSelling = 0;
    // Aggregate hours per project for prodej calc
    const projectHoursInWeek = new Map<string, { active: number; blocker: number }>();
    for (const b of silo.bundles) {
      for (const i of b.items) {
        if (i.status === "paused") continue;
        const prev = projectHoursInWeek.get(b.project_id) || { active: 0, blocker: 0 };
        if (i.is_blocker) { blocker += i.scheduled_hours; prev.blocker += i.scheduled_hours; }
        else { active += i.scheduled_hours; prev.active += i.scheduled_hours; }
        projectHoursInWeek.set(b.project_id, prev);
      }
    }
    // FIX 6: Use MAX(plan_hours, real_hours) for prodej calculation
    for (const [pid, hours] of projectHoursInWeek) {
      if (hours.active > 0) activeSelling += calcProdejValue(hours.active, pid, projectLookup, planHoursMap, realHoursMap, exchangeRates);
      if (hours.blocker > 0) blockerSelling += calcProdejValue(hours.blocker, pid, projectLookup, planHoursMap, realHoursMap, exchangeRates);
    }
    return { activeHours: active, blockerHours: blocker, activeSellingCzk: activeSelling, blockerSellingCzk: blockerSelling };
  }, [silo, projectLookup, hourlyRate, planHoursMap, realHoursMap, exchangeRates]);

  // Forecast layer is isolated and read-only, rendered separately per week
  const weekForecastBlocks = useMemo(() => {
    if (!forecastDarkMode || !forecastBlocks) return [];
    return forecastBlocks.filter(block => block.week === weekKey);
  }, [forecastDarkMode, forecastBlocks, weekKey]);

  // totalHours includes blockers for capacity bar; displayHours excludes them for header
  const totalHours = activeHours + blockerHours + (forecastDarkMode ? weekForecastBlocks.reduce((sum, block) => sum + block.estimated_hours, 0) : 0);
  const pct = weeklyCapacity > 0 ? (totalHours / weeklyCapacity) * 100 : 0;
  const isOverloaded = pct > 120;
  const isWarning = pct > 100 && pct <= 120;
  const overloadHours = totalHours - weeklyCapacity;

  // In "from_scratch" mode, hide real plan cards
  const hideRealCards = forecastDarkMode && forecastPlanMode === "from_scratch";

  const { realBundles, blockerBundles } = useMemo(() => {
    if (!silo || hideRealCards) return { realBundles: [], blockerBundles: [] };
    const regular: ScheduleBundle[] = [];
    const blockers: ScheduleBundle[] = [];
    for (const b of silo.bundles) {
      const isBlocker = b.items.length > 0 && b.items.every(i => i.is_blocker);
      if (isBlocker) blockers.push(b);
      else regular.push(b);
    }
    // FIX 5: Sort active projects first, completed/terminal projects bottom
    regular.sort((a, b) => {
      const projA = projectLookup.get(a.project_id);
      const projB = projectLookup.get(b.project_id);
      const terminalStatusesSet = ["Dokončeno", "Fakturace", "Expedice", "Montáž"];
      const isTerminalA = terminalStatusesSet.some(s => (projA?.status ?? "").toLowerCase() === s.toLowerCase());
      const isTerminalB = terminalStatusesSet.some(s => (projB?.status ?? "").toLowerCase() === s.toLowerCase());
      const aDone = isTerminalA || (a.items.length > 0 && a.items.every(i => i.status === "expedice" || i.status === "completed"));
      const bDone = isTerminalB || (b.items.length > 0 && b.items.every(i => i.status === "expedice" || i.status === "completed"));
      if (aDone === bDone) {
        // Within same group, sort by urgency (overdue first)
        if (!aDone) {
          const deadlineA = resolveDeadline({ expedice: projA?.expedice ?? null, montaz: projA?.montaz ?? null, datum_smluvni: projA?.datum_smluvni ?? null });
          const deadlineB = resolveDeadline({ expedice: projB?.expedice ?? null, montaz: projB?.montaz ?? null, datum_smluvni: projB?.datum_smluvni ?? null });
          const dA = deadlineA ? deadlineA.date.getTime() : Infinity;
          const dB = deadlineB ? deadlineB.date.getTime() : Infinity;
          return dA - dB;
        }
        return 0;
      }
      return aDone ? 1 : -1;
    });
    return { realBundles: regular, blockerBundles: blockers };
  }, [silo, hideRealCards]);

  const barColor = isOverloaded ? "#c0392b" : isWarning ? "#d97706" : "#3a8a36";
  const barBg = isOverloaded ? "linear-gradient(90deg, #fca5a5, #c0392b)"
    : isWarning ? "linear-gradient(90deg, #fcd34d, #d97706)"
    : "linear-gradient(90deg, #a7d9a2, #3a8a36)";

  const { setNodeRef, isOver } = useDroppable({ id: `silo-week-${weekKey}`, disabled: !!isWeekLocked });
  const highlighted = !isWeekLocked && (isOver || isOverTarget);
  const isUnlockedPast = isPast && !isWeekLocked;
  const dropBorderColor = highlighted ? (isOverloaded ? "#d97706" : "#3b82f6") : undefined;
  const headerColor = forecastDarkMode
    ? (isCurrent ? "#4a9e96" : "#7aa8a4")
    : (isCurrent ? "#223937" : "#1a1a1a");
  const headerWeight = isCurrent ? 700 : 600;
  const dateRangeColor = forecastDarkMode ? "#4a5a58" : "#6b7280";

  const combinedRef = useCallback((el: HTMLDivElement | null) => { setNodeRef(el); registerRef(weekKey, el); }, [setNodeRef, registerRef, weekKey]);

  return (
    <div ref={combinedRef} data-week-key={weekKey} className="w-[252px] shrink-0 flex flex-col h-full transition-all"
      style={{
        backgroundColor: forecastDarkMode ? "#1f2e2c" : "#ffffff", borderRadius: 9,
        border: highlighted ? `2.5px solid ${dropBorderColor}`
          : isCurrent ? (forecastDarkMode ? "2.5px solid #4a9e96" : "2.5px solid #3a8a36")
          : isUnlockedPast ? "2.5px solid #d97706"
          : isOverloaded && !isPast ? (forecastDarkMode ? "2.5px solid rgba(192,57,43,0.7)" : "2.5px solid #DC2626")
          : forecastDarkMode ? "1px solid #2a3d3a" : "1px solid #ece8e2",
        boxShadow: isCurrent ? (forecastDarkMode ? "0 0 12px rgba(74,158,150,0.2)" : "0 0 14px rgba(58,138,54,0.22)")
          : isUnlockedPast ? "0 0 8px rgba(217,119,6,0.15)"
          : isOverloaded && !isPast ? (forecastDarkMode ? "0 0 8px rgba(192,57,43,0.15)" : "0 0 10px rgba(220,38,38,0.15)")
          : undefined,
      }}
    >
      {/* Header */}
      <div className="px-2.5 py-1.5 text-center" style={{ borderBottom: forecastDarkMode ? "1px solid #2a3d3a" : "1px solid #ece8e2" }}>
        <div className="flex items-center justify-center gap-1.5">
          {isPast && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleLock?.(); }}
              className="p-0.5 rounded hover:bg-muted/50 transition-colors"
              title={isWeekLocked ? "Odemknout týden" : "Zamknout týden"}
            >
              {isWeekLocked
                ? <Lock size={11} style={{ color: forecastDarkMode ? "#4a5a58" : "#99a5a3" }} />
                : <LockOpen size={11} style={{ color: "#d97706" }} />
              }
            </button>
          )}
          <span className="font-sans text-[14px]" style={{ color: headerColor, fontWeight: headerWeight }}>T{weekNum}</span>
          {isCurrent && <span className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: forecastDarkMode ? "#4a9e96" : "#3a8a36" }} />}
        </div>
        <div className="text-[9px] mt-0.5" style={{ color: dateRangeColor }}>{formatDateShort(startDate)} – {formatDateShort(endDate)}</div>
        <div className="mt-1.5">
          <div className="h-[7px] rounded" style={{ backgroundColor: "#f0eee9", overflow: "hidden" }}>
            <div className="h-full rounded transition-all duration-300" style={{ width: `${Math.min(pct, 100)}%`, background: barBg }} />
          </div>
           <div className="flex items-baseline justify-between mt-[3px]">
            {displayMode === "czk" ? (
              <>
                <span className="font-sans text-[11px] font-bold" style={{ color: barColor }}>{formatCompactCzk(forecastDarkMode ? (totalHours * hourlyRate) : (activeSellingCzk))}</span>
                {!forecastDarkMode && blockerHours > 0 && <span className="font-sans text-[9px]" style={{ color: "#6b7280" }}>+~{formatCompactCzk(blockerSellingCzk)}</span>}
                <span className="font-sans text-[10px]" style={{ color: forecastDarkMode ? "#4a5a58" : "#99a5a3" }}>/ {formatCompactCzk(weeklyCapacity * hourlyRate)}</span>
                <span className="font-sans text-[10px] font-bold" style={{ color: barColor }}>{Math.round(pct)}%</span>
              </>
            ) : (
              <>
                <span className="font-sans text-[11px] font-bold" style={{ color: barColor }}>{Math.round(forecastDarkMode ? totalHours : activeHours)}h</span>
                {!forecastDarkMode && blockerHours > 0 && <span className="font-sans text-[9px]" style={{ color: "#6b7280" }}>+~{Math.round(blockerHours)}h</span>}
                <span className="font-sans text-[10px]" style={{ color: forecastDarkMode ? "#4a5a58" : "#99a5a3" }}>/ {weeklyCapacity}h</span>
                <span className="font-sans text-[10px] font-bold" style={{ color: barColor }}>{Math.round(pct)}%</span>
              </>
            )}
          </div>
          {isCurrent && spilledHours > 0 && (
            <div className="mt-[3px] text-[9px] font-medium text-center" style={{ color: "#d97706" }}>
              + {Math.round(spilledHours)}h přelité (mimo plán)
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-1.5" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {(realBundles.length === 0 && blockerBundles.length === 0) && !isPast && weekForecastBlocks.length === 0 && (
          <div className="flex-1 flex items-center justify-center rounded-[5px] px-2 py-[14px] transition-all" style={{ border: forecastDarkMode ? "1.5px dashed #2a3d3a" : "1.5px dashed #e2ddd6" }}>
            <span className="text-[9px] text-center" style={{ color: forecastDarkMode ? "#4a5a58" : "#99a5a3" }}>{forecastDarkMode ? "Žádný forecast" : "Přetáhni sem z Inboxu"}</span>
          </div>
        )}
        {(realBundles.length === 0 && blockerBundles.length === 0) && isPast && weekForecastBlocks.length === 0 && (
          <div className="flex-1 flex items-center justify-center px-2 py-[14px]">
            <span className="text-[9px] text-center" style={{ color: forecastDarkMode ? "#4a5a58" : "#c4ccc9" }}>Prázdný týden</span>
          </div>
        )}

        {/* Spilled section — read-only bundles from previous weeks (only in current week T) */}
        {spilledBundles && spilledBundles.length > 0 && (
          <div
            className="rounded-[6px] p-1.5 mb-1"
            style={{
              backgroundColor: "rgba(217, 119, 6, 0.06)",
              border: "1px solid rgba(217, 119, 6, 0.25)",
              borderTop: "3px solid #d97706",
            }}
          >
            <div className="flex items-center justify-between mb-1 px-0.5">
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#d97706" }}>
                ⚠ Přelité z předchozích T
              </span>
              <span className="text-[9px] font-bold" style={{ color: "#d97706" }}>
                {Math.round(spilledHours)}h
              </span>
            </div>
            {/* Mini-bar for spilled vs capacity (informative only) */}
            <div className="h-[5px] rounded mb-1.5" style={{ backgroundColor: "#fef3c7", overflow: "hidden" }}>
              <div className="h-full rounded transition-all" style={{ width: `${Math.min(spilledPct, 100)}%`, background: "linear-gradient(90deg, #fcd34d, #d97706)" }} />
            </div>
            <div className="flex flex-col" style={{ gap: 3 }}>
              {spilledBundles.map(b => (
                <CollapsibleBundleCard
                  key={`spilled-${b.project_id}-${b.__spilledFromWeekKey}`}
                  bundle={b}
                  weekKey={b.__spilledFromWeekKey}
                  showCzk={showCzk} hourlyRate={hourlyRate} weeklyCapacity={weeklyCapacity} displayMode={displayMode}
                  onBundleContextMenu={onBundleContextMenu}
                  onItemContextMenu={onItemContextMenu}
                  projectLookup={projectLookup}
                  planHoursMap={planHoursMap}
                  realHoursMap={realHoursMap}
                  isSelected={selectedProjectId === b.project_id}
                  onSelectProject={onSelectProject} searchQuery={searchQuery}
                  forecastDarkMode={forecastDarkMode}
                  isFocusedMatch={false}
                  searchMatchedProjectIds={searchMatchedProjectIds}
                  searchActive={searchActive}
                  isWeekLocked={false}
                  exchangeRates={exchangeRates}
                  isSpilled
                  spilledFromWeekNum={b.__spilledFromWeekNum}
                />
              ))}
            </div>
          </div>
        )}

        {/* Plan section divider when both sections are visible */}
        {spilledBundles && spilledBundles.length > 0 && realBundles.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 mb-1">
            <div className="flex-1" style={{ borderTop: "1px solid #e2ddd6" }} />
            <span className="text-[9px] font-bold tracking-wider shrink-0" style={{ color: "#6b7280" }}>PLÁN T{weekNum}</span>
            <div className="flex-1" style={{ borderTop: "1px solid #e2ddd6" }} />
          </div>
        )}

        {realBundles.map(bundle => {
          const bundleKey = buildBundleKey({ weekKey, project_id: bundle.project_id, stage_id: bundle.stage_id, bundle_label: bundle.bundle_label, split_part: bundle.split_part });
          return <CollapsibleBundleCard key={bundleKey} bundle={bundle} weekKey={weekKey}
            showCzk={showCzk} hourlyRate={hourlyRate} weeklyCapacity={weeklyCapacity} displayMode={displayMode}
            onBundleContextMenu={onBundleContextMenu}
            onItemContextMenu={onItemContextMenu}
            projectLookup={projectLookup}
            planHoursMap={planHoursMap}
            realHoursMap={realHoursMap}
            isSelected={selectedProjectId === bundle.project_id}
            onSelectProject={onSelectProject} searchQuery={searchQuery}
            forecastDarkMode={forecastDarkMode}
            isFocusedMatch={focusedMatchKey === bundleKey}
            searchMatchedProjectIds={searchMatchedProjectIds}
            searchActive={searchActive}
                  isWeekLocked={isWeekLocked} activeDrag={activeDrag} exchangeRates={exchangeRates} />;
        })}

        <NewBundleDropSpacer weekKey={weekKey} disabled={!!isWeekLocked || !!forecastDarkMode} activeDrag={activeDrag} />

        {/* Rezerva kapacit section — blocker bundles separated */}
        {blockerBundles.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 my-1">
              <div className="flex-1" style={{ borderTop: forecastDarkMode ? "1px solid #2a3d3a" : "1px solid #e2ddd6" }} />
              <span className="text-[9px] font-semibold tracking-wider shrink-0" style={{ color: forecastDarkMode ? "#4a5a58" : "#99a5a3" }}>REZERVA KAPACIT</span>
              <div className="flex-1" style={{ borderTop: forecastDarkMode ? "1px solid #2a3d3a" : "1px solid #e2ddd6" }} />
            </div>
            {blockerBundles.map(bundle => {
              const bundleKey = buildBundleKey({ weekKey, project_id: bundle.project_id, stage_id: bundle.stage_id, bundle_label: bundle.bundle_label, split_part: bundle.split_part });
              return <CollapsibleBundleCard key={`blocker-${bundleKey}`} bundle={bundle} weekKey={weekKey}
                showCzk={showCzk} hourlyRate={hourlyRate} weeklyCapacity={weeklyCapacity} displayMode={displayMode}
                onBundleContextMenu={onBundleContextMenu}
                onItemContextMenu={onItemContextMenu}
                projectLookup={projectLookup}
                planHoursMap={planHoursMap}
                realHoursMap={realHoursMap}
                isSelected={selectedProjectId === bundle.project_id}
                onSelectProject={onSelectProject} searchQuery={searchQuery}
                forecastDarkMode={forecastDarkMode}
                isFocusedMatch={focusedMatchKey === bundleKey}
                searchMatchedProjectIds={searchMatchedProjectIds}
                searchActive={searchActive}
                isWeekLocked={isWeekLocked} activeDrag={activeDrag} exchangeRates={exchangeRates} />;
            })}
          </>
        )}

        {/* Forecast divider + blocks — visually separated from real bundles */}
        {forecastDarkMode && forecastSelectedIds && onToggleForecastSelect && weekForecastBlocks.length > 0 && (
          <>
            {realBundles.length > 0 && (
              <div className="flex items-center gap-1.5 my-1">
                <div className="flex-1" style={{ borderTop: "1px solid #2a3d3a" }} />
                <span className="text-[9px] font-semibold tracking-wider shrink-0" style={{ color: "#4a5a58" }}>FORECAST</span>
                <div className="flex-1" style={{ borderTop: "1px solid #2a3d3a" }} />
              </div>
            )}
            <ForecastWeekContent
              blocks={weekForecastBlocks}
              selectedBlockIds={forecastSelectedIds}
              onToggleSelect={onToggleForecastSelect}
              onForecastContextMenu={onForecastContextMenu}
              expandedIds={forecastExpandedIds}
              onToggleExpand={onToggleForecastExpand}
              displayMode={displayMode}
              hourlyRate={hourlyRate}
              weeklyCapacity={weeklyCapacity}
            />
          </>
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

function NewBundleDropSpacer({ weekKey, disabled, activeDrag }: { weekKey: string; disabled?: boolean; activeDrag?: Props["activeDrag"] }) {
  const canDrop = !disabled && (activeDrag?.type === "silo-item" || activeDrag?.type === "silo-bundle" || activeDrag?.type === "inbox-item" || activeDrag?.type === "inbox-items" || activeDrag?.type === "inbox-project");
  const isActive = Boolean(activeDrag);
  const { setNodeRef, isOver } = useDroppable({ id: `silo-week-new-bundle-${weekKey}`, data: { type: "new-bundle-target", weekKey }, disabled: !canDrop });

  return (
    <div
      ref={setNodeRef}
      className="mt-1 flex min-h-[92px] shrink-0 items-center justify-center rounded-[6px] border border-dashed transition-all duration-200"
      style={{
        borderColor: isActive ? (isOver ? "hsl(var(--primary))" : "hsl(var(--border) / 0.45)") : "transparent",
        backgroundColor: isActive ? (isOver ? "hsl(var(--primary) / 0.08)" : "transparent") : "transparent",
        color: isOver ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
      }}
    >
      <span className={`text-[9px] font-semibold transition-all duration-200 ${isActive ? "translate-y-0 opacity-70" : "translate-y-1 opacity-0"}`}>
        Nový bundle
      </span>
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

function CollapsibleBundleCard({ bundle, weekKey, showCzk, hourlyRate, weeklyCapacity, onBundleContextMenu, onItemContextMenu, projectLookup, planHoursMap, realHoursMap, isSelected, onSelectProject, displayMode, searchQuery = "", forecastDarkMode, isFocusedMatch, searchMatchedProjectIds, searchActive, isWeekLocked, activeDrag, exchangeRates, isSpilled, spilledFromWeekNum }: {
  bundle: ScheduleBundle; weekKey: string; showCzk: boolean; hourlyRate: number; weeklyCapacity: number;
  displayMode: DisplayMode;
  onBundleContextMenu: (e: React.MouseEvent, bundle: ScheduleBundle, toggleExpand: () => void) => void;
  onItemContextMenu: (e: React.MouseEvent, item: ScheduleItem, bundle: ScheduleBundle) => void;
  projectLookup: ProjectLookup;
  planHoursMap?: Map<string, number>;
  realHoursMap?: Map<string, number>;
  isSelected?: boolean;
  onSelectProject?: (projectId: string) => void;
  searchQuery?: string;
  forecastDarkMode?: boolean;
  isFocusedMatch?: boolean;
  searchMatchedProjectIds?: Set<string>;
  searchActive?: boolean;
  isWeekLocked?: boolean;
  activeDrag?: Props["activeDrag"];
  exchangeRates?: Array<{ year: number; eur_czk: number }>;
  isSpilled?: boolean;
  spilledFromWeekNum?: number;
}) {
  const { data: statusOpts2 = [] } = useProjectStatusOptions();
  const terminalStatuses = useMemo(() => getTerminalStatuses(statusOpts2), [statusOpts2]);
  const [expanded, setExpanded] = useState(false);
  const color = getProjectColor(bundle.project_id);
  const project = projectLookup.get(bundle.project_id);
  const isMidflightBundle = bundle.items.length > 0 && bundle.items.every(i => i.is_midflight);
  const splitMeta = useMemo(() => deriveBundleSplitMeta(bundle.items), [bundle.items]);
  const isSplitBundle = splitMeta.isSplit;
  const isProjectDone = terminalStatuses.has(project?.status ?? "");
  const completedCount = bundle.items.filter(i => i.status === "expedice" || i.status === "completed").length;
  const totalCount = bundle.items.length;
  // Use project terminal status as primary "done" signal (schedule no longer uses completed/expedice statuses)
  const allCompleted = isProjectDone || (completedCount === totalCount && totalCount > 0);
  const hasUncompleted = !allCompleted;
  const isBlockerBundle = bundle.items.length > 0 && bundle.items.every(i => i.is_blocker);
  // Deadline fallback chain: expedice → montáž → předání → smluvní
  // For legacy (midflight) bundles, show only Smluvní termín from the project
  const deadlineInfo = useMemo(() => {
    if (isMidflightBundle) {
      // Legacy bundles: show project's Smluvní termín if available
      const sml = project?.datum_smluvni;
      if (sml) {
        const parsed = parseAppDate(sml);
        const formatted = formatDateShortYY(sml);
        if (parsed && formatted) {
          return { label: "Sml", dateStr: formatted, parsed, days: differenceInDays(parsed, new Date()) };
        }
      }
      return null;
    }
    const fields: { key: string; label: string; value: string | null | undefined }[] = [
      { key: "expedice", label: "Exp", value: project?.expedice },
      { key: "montaz", label: "Mnt", value: project?.montaz },
      { key: "predani", label: "Před", value: project?.predani },
      { key: "datum_smluvni", label: "Sml", value: project?.datum_smluvni },
    ];
    for (const f of fields) {
      if (f.value) {
        const parsed = parseAppDate(f.value);
        const formatted = formatDateShortYY(f.value);
        if (parsed && formatted) {
          return { label: f.label, dateStr: formatted, parsed, days: differenceInDays(parsed, new Date()) };
        }
      }
    }
    return null;
  }, [project]);
  const expDate = deadlineInfo?.dateStr ?? null;
  const daysUntilExp = deadlineInfo?.days ?? null;
  const deadlineLabel = deadlineInfo?.label ?? "Exp";
  // isProjectDone already declared above
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

  // Urgency badge logic (same as Inbox)
  const urgencyInfo = useMemo(() => {
    if (isMidflightBundle) return null;
    if (isProjectDone || allCompleted) return null;
    if (!project) return null;
    const dates = [project.expedice, project.montaz, project.predani, project.datum_smluvni].filter(Boolean);
    let earliest: Date | null = null;
    for (const val of dates) {
      const d = parseAppDate(val as string);
      if (d && (!earliest || d < earliest)) earliest = d;
    }
    if (!earliest) return null;
    const days = differenceInDays(earliest, new Date());
    if (days < 0) return { type: "overdue" as const, label: "PO TERMÍNU" };
    if (days <= 14) return { type: "urgent" as const, label: `${days} dní` };
    return null;
  }, [project, isProjectDone, allCompleted]);

  const shouldHighlightOverdue = !isMidflightBundle && ((daysUntilExp !== null && daysUntilExp < 0) || isOverdueProject);

  const borderLeftColor = isMidflightBundle ? "#b0bab8"
    : isProjectDone ? "#9ca3af"
    : shouldHighlightOverdue ? "hsl(0 70% 50%)"
    : expSeverity === "urgent" ? "#d97706"
    : color;

  const bundleDragDisabled = allCompleted || !!forecastDarkMode || isMidflightBundle || !!isWeekLocked;
  const bundleKey = buildBundleKey({ weekKey, project_id: bundle.project_id, stage_id: bundle.stage_id, bundle_label: bundle.bundle_label, split_part: bundle.split_part });
  const bundleItemIds = bundle.items.map((item) => item.id);
  const bundleDisplayLabel = formatBundleDisplayLabel({ bundle_label: bundle.bundle_label, split_part: splitMeta.splitPart ?? bundle.split_part, bundle_type: isSplitBundle ? "split" : bundle.bundle_type });
  const canDropActiveBundle = canAcceptBundleDrop(activeDrag?.type === "silo-bundle" || activeDrag?.type === "silo-item" ? {
    project_id: activeDrag.projectId || "",
    weekKey: activeDrag.weekDate ?? null,
    stage_id: activeDrag.stageId ?? null,
    bundle_label: activeDrag.bundleLabel ?? null,
    bundle_type: activeDrag.bundleType ?? null,
    bundle_key: activeDrag.bundleKey ?? null,
    split_part: activeDrag.splitPart ?? null,
  } : null, {
    project_id: bundle.project_id,
    weekKey,
    stage_id: bundle.stage_id ?? null,
    bundle_label: bundle.bundle_label ?? null,
    bundle_type: bundle.bundle_type ?? null,
    bundle_key: bundleKey,
    split_part: bundle.split_part ?? null,
  });
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `silo-bundle-${bundleKey}`,
    data: { type: "silo-bundle", bundleKey, itemIds: bundleItemIds, projectId: bundle.project_id, projectName: bundle.project_name, weekDate: weekKey, hours: bundle.total_hours, itemCount: bundle.items.length, stageId: bundle.stage_id, bundleLabel: bundle.bundle_label, bundleType: bundle.bundle_type, splitPart: bundle.split_part },
    disabled: bundleDragDisabled,
  });
  const { setNodeRef: setDropRef, isOver: isBundleOver } = useDroppable({
    id: `silo-bundle-drop-${bundleKey}`,
    data: { type: "silo-bundle-target", bundleKey, itemIds: bundleItemIds, projectId: bundle.project_id, projectName: bundle.project_name, weekDate: weekKey, stageId: bundle.stage_id, bundleLabel: bundle.bundle_label, bundleType: bundle.bundle_type, splitPart: bundle.split_part },
    disabled: bundleDragDisabled || !!isSpilled || !canDropActiveBundle,
  });
  const setBundleNodeRef = useCallback((node: HTMLDivElement | null) => { setDropRef(node); }, [setDropRef]);
  const toggleExpand = useCallback(() => setExpanded(v => !v), []);
  const isMatch = searchMatchedProjectIds?.has(bundle.project_id) ?? false;
  const isDimmed = !!searchActive && !isMatch;
  const isHighlighted = isSelected || isFocusedMatch;
  const isDropHighlighted = isBundleOver && canDropActiveBundle && !isDragging;

  // Blocker card — special rendering (after all hooks)
  if (isBlockerBundle) {
    const tpvDate = bundle.items.find(i => i.tpv_expected_date)?.tpv_expected_date;
    const tpvWeekLabel = tpvDate ? (() => {
      const d = new Date(tpvDate);
      if (isNaN(d.getTime())) return null;
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      const weekNum = Math.ceil(((monday.getTime() - new Date(monday.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7);
      return `T${weekNum}`;
    })() : null;

    return (
      <div className="rounded-[6px] overflow-hidden relative px-2.5 py-2"
        style={{
          background: "#1e2025",
          border: "2px dashed #4b5563",
          opacity: 0.85,
        }}
        onContextMenu={e => {
          e.preventDefault();
          e.stopPropagation();
          onBundleContextMenu(e, bundle, toggleExpand);
        }}
      >
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[11px] font-semibold truncate" style={{ color: "#9ca3af" }}>{bundle.project_name}</span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[9px] rounded-full px-1.5 py-0.5" style={{ backgroundColor: "#374151", color: "#9ca3af", fontWeight: 600 }}>⏳ Rezerva</span>
          <span className="font-sans text-[11px] font-bold" style={{ color: "#6b7280" }}>
            ~{displayMode === "czk" ? formatCompactCzk(calcProdejValue(bundle.total_hours, bundle.project_id, projectLookup, planHoursMap, realHoursMap, exchangeRates)) : `${Math.round(bundle.total_hours)}h`}
          </span>
        </div>
        {tpvWeekLabel && (
          <div className="mt-0.5 text-[10px]" style={{ color: "#6b7280" }}>TPV: {tpvWeekLabel}</div>
        )}
      </div>
    );
  }

  return (
    <div ref={setBundleNodeRef} data-bundle-key={bundleKey} className="rounded-[6px] overflow-hidden relative shrink-0" style={{
      borderTop: forecastDarkMode
        ? (isHighlighted ? "2px solid #d97706" : "1px solid #3d4558")
        : (shouldHighlightOverdue ? "1px solid hsl(0 60% 82%)" : isHighlighted ? "2px solid #d97706" : "1px solid #ece8e2"),
      borderRight: forecastDarkMode
        ? (isHighlighted ? "2px solid #d97706" : "1px solid #3d4558")
        : (shouldHighlightOverdue ? "1px solid hsl(0 60% 82%)" : isHighlighted ? "2px solid #d97706" : "1px solid #ece8e2"),
      borderBottom: forecastDarkMode
        ? (isHighlighted ? "2px solid #d97706" : "1px solid #3d4558")
        : (shouldHighlightOverdue ? "1px solid hsl(0 60% 82%)" : isHighlighted ? "2px solid #d97706" : "1px solid #ece8e2"),
      borderLeft: isHighlighted ? "4px solid #d97706" : isSpilled ? "4px solid #d97706" : `4px solid ${borderLeftColor}`,
      backgroundColor: forecastDarkMode
        ? (isHighlighted ? "rgba(217,119,6,0.08)" : "#252a35")
        : (shouldHighlightOverdue ? "hsl(0 75% 93%)" : isHighlighted ? "rgba(217,119,6,0.05)" : "#ffffff"),
      opacity: isDragging ? 0.3 : isDimmed ? 0.5 : 1,
      outline: isFocusedMatch ? "2px solid #d97706" : undefined,
      outlineOffset: isFocusedMatch ? "2px" : undefined,
      boxShadow: isDropHighlighted ? "0 8px 18px hsl(var(--primary) / 0.16), 0 0 0 2px hsl(var(--primary) / 0.24)" : forecastDarkMode ? undefined : (shouldHighlightOverdue ? "inset 0 0 0 1px hsl(0 60% 86%)" : isHighlighted ? "0 0 0 2px hsl(var(--accent) / 0.15)" : undefined),
      paddingBottom: isDropHighlighted ? 10 : undefined,
      transform: isDropHighlighted ? "translateY(-1px)" : undefined,
      transition: "border-top-color 150ms, border-right-color 150ms, border-bottom-color 150ms, box-shadow 150ms, outline 300ms, opacity 200ms, padding-bottom 160ms, transform 160ms",
    }}>

      {isDropHighlighted && (
        <div className="px-2 py-1 text-[9px] font-semibold" style={{ backgroundColor: "hsl(var(--primary) / 0.08)", color: "hsl(var(--primary))", borderBottom: "1px solid hsl(var(--primary) / 0.16)" }}>
          Vložit do bundle {bundleDisplayLabel}
        </div>
      )}
      <div className="flex" style={{ borderBottom: expanded ? (forecastDarkMode ? "1px solid #3d4558" : "1px solid #ece8e2") : "none", backgroundColor: forecastDarkMode ? undefined : (shouldHighlightOverdue ? "hsl(0 75% 93%)" : undefined) }}>
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
        <div ref={setDragRef} {...attributes} {...(!bundleDragDisabled && hasUncompleted ? listeners : {})}
          data-context="bundle"
          className={`flex items-start gap-1 flex-1 min-w-0 pr-[6px] py-[5px] ${!bundleDragDisabled && hasUncompleted ? "cursor-grab" : "cursor-default"}`}
          onClick={e => { e.stopPropagation(); onSelectProject?.(bundle.project_id); }}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onBundleContextMenu(e, bundle, toggleExpand); }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate" style={{ fontSize: 14, color: forecastDarkMode ? (allCompleted ? "#5a6480" : urgencyInfo?.type === "overdue" ? "#DC2626" : urgencyInfo?.type === "urgent" ? "#D97706" : "#c8d0e0") : (allCompleted ? "#9ca3af" : urgencyInfo?.type === "overdue" ? "#DC2626" : urgencyInfo?.type === "urgent" ? "#D97706" : "#1a1a1a"), fontWeight: allCompleted ? 400 : 500 }}>{highlightMatch(bundle.project_name, searchQuery)}</span>
              {isSpilled && spilledFromWeekNum !== undefined && (
                <span className="text-[8px] font-bold px-1 py-[1px] rounded shrink-0" style={{ backgroundColor: "rgba(217,119,6,0.15)", color: "#d97706", border: "1px solid rgba(217,119,6,0.35)" }}>
                  Z T{spilledFromWeekNum}
                </span>
              )}
              {urgencyInfo?.type === "overdue" && (
                <span className="text-[8px] font-bold px-1 py-[1px] rounded shrink-0" style={{ backgroundColor: forecastDarkMode ? "rgba(220,38,38,0.2)" : "rgba(220,38,38,0.1)", color: "#DC2626" }}>
                  PO TERMÍNU
                </span>
              )}
              {urgencyInfo?.type === "urgent" && (
                <span className="text-[8px] font-bold px-1 py-[1px] rounded shrink-0" style={{ backgroundColor: forecastDarkMode ? "rgba(217,119,6,0.2)" : "rgba(217,119,6,0.1)", color: "#D97706" }}>
                  {urgencyInfo.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
              <span className="font-sans shrink-0" style={{ fontSize: 11, color: forecastDarkMode ? "#5a6480" : (allCompleted ? "#b0b7c3" : "#6b7280") }}>{bundle.project_id}</span>
              {(() => {
                const proj = projectLookup.get(bundle.project_id);
                const risk = proj?.risk;
                if (!risk) return null;
                const r = risk.toLowerCase();
                if (r === "vysoká") return <span className="shrink-0" style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, marginLeft: 4, backgroundColor: "#7f1d1d", color: "#fca5a5" }}>{risk}</span>;
                if (r === "střední") return <span className="shrink-0" style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, marginLeft: 4, backgroundColor: "#7c2d12", color: "#fdba74" }}>{risk}</span>;
                if (r === "nízká") return <span className="shrink-0" style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, marginLeft: 4, backgroundColor: "#14532d", color: "#86efac" }}>{risk}</span>;
                return null;
              })()}
              {expDate ? (
                <span className="truncate min-w-0" style={{ fontSize: 11, color: !allCompleted && daysUntilExp !== null && daysUntilExp < 0 ? "#dc2626" : !allCompleted && daysUntilExp !== null && daysUntilExp <= 14 ? "#d97706" : forecastDarkMode ? "#5a7a76" : "#7aa8a4" }}>
                  {deadlineLabel}: {expDate}
                </span>
              ) : !allCompleted && !isProjectDone && (
                <span className="text-[8px] font-bold px-1 py-[1px] rounded shrink-0" style={{ backgroundColor: forecastDarkMode ? "rgba(217,119,6,0.2)" : "rgba(217,119,6,0.1)", color: "#D97706" }}>
                  ⚠ BEZ TERMÍNU
                </span>
              )}
            </div>
            {isMidflightBundle ? (
              <div className="flex items-center gap-1" style={{ fontSize: 10, marginTop: 1 }}>
                <span className="text-[9px] bg-slate-100 text-slate-500 border border-slate-300 rounded px-1 font-medium tracking-wide">Legacy</span>
                  {splitMeta.splitPart && splitMeta.splitTotal ? <span className="text-[9px] font-sans" style={{ color: "#99a5a3" }}>{splitMeta.splitPart}/{splitMeta.splitTotal}</span> : null}
              </div>
            ) : (
              <div className="flex items-center gap-1" style={{ fontSize: 11, color: "#5c706f", marginTop: 1 }}>
                <span>{bundle.items.length} položek</span>
                {isSplitBundle && (
                  <>
                    <span className="text-[9px] bg-slate-100 text-slate-500 border border-slate-300 rounded px-1 font-medium tracking-wide">Split</span>
                    {splitMeta.splitPart && splitMeta.splitTotal ? <span className="text-[9px] font-sans" style={{ color: "#99a5a3" }}>{splitMeta.splitPart}/{splitMeta.splitTotal}</span> : null}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-[1px] shrink-0">
            <span className="font-sans shrink-0" style={{ fontSize: 11, color: forecastDarkMode ? (allCompleted ? "#5a6480" : "#6b7280") : (allCompleted ? "#b0b7c3" : "#6b7280") }}>
              {bundleDisplayLabel}
            </span>
            <div className="flex items-center gap-1">
              {!isMidflightBundle && expSeverity && !allCompleted && deadlineInfo?.parsed && (() => {
                const warnColor = expSeverity === "overdue" ? "#dc3545" : "#d97706";
                const tooltipText = expSeverity === "overdue"
                  ? `${deadlineLabel} ${format(deadlineInfo.parsed, "dd.MM.yyyy")} — po termínu o ${differenceInDays(new Date(), deadlineInfo.parsed)} dní`
                  : `${deadlineLabel} za ${differenceInDays(deadlineInfo.parsed, new Date())} dní (${format(deadlineInfo.parsed, "dd.MM.yyyy")})`;
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle size={14} style={{ color: warnColor }} className="shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="z-[9999] text-xs">{tooltipText}</TooltipContent>
                  </Tooltip>
                );
              })()}
              {displayMode === "czk" ? (
                <span className="font-sans" style={{ fontSize: 15, color: forecastDarkMode ? (allCompleted ? "#4a5168" : "#8899bb") : (allCompleted ? "#9ca3af" : "#1a1a1a"), fontWeight: 600 }}>{formatCompactCzk(calcProdejValue(bundle.total_hours, bundle.project_id, projectLookup, planHoursMap, realHoursMap, exchangeRates))}</span>
              ) : displayMode === "percent" ? (
                <span className="font-sans" style={{ fontSize: 15, color: forecastDarkMode ? (allCompleted ? "#4a5168" : "#8899bb") : (allCompleted ? "#9ca3af" : "#1a1a1a"), fontWeight: 600 }}>{weeklyCapacity > 0 ? Math.round((bundle.total_hours / weeklyCapacity) * 100) : 0}%</span>
              ) : (
                <span className="font-sans" style={{ fontSize: 15, color: forecastDarkMode ? (allCompleted ? "#4a5168" : "#8899bb") : (allCompleted ? "#9ca3af" : "#1a1a1a"), fontWeight: 600 }}>{Math.round(bundle.total_hours)}h</span>
              )}
            </div>
            {!isMidflightBundle && completedCount > 0 && <span className="text-[9px] whitespace-nowrap leading-none" style={{ color: "#3a8a36", fontWeight: 600 }}>{completedCount}/{totalCount} ✓</span>}
          </div>
        </div>
      </div>
      {expanded && (() => {
        const sortByCode = (a: ScheduleItem, b: ScheduleItem) => {
          const ac = (a.item_code || a.item_name || "").toString();
          const bc = (b.item_code || b.item_name || "").toString();
          return ac.localeCompare(bc, undefined, { numeric: true, sensitivity: "base" });
        };
        const activeItems = bundle.items.filter(i => i.status !== "expedice" && i.status !== "completed").slice().sort(sortByCode);
        const completedItems = bundle.items.filter(i => i.status === "expedice" || i.status === "completed").slice().sort(sortByCode);
        return (
          <div className="px-[3px] py-[2px]" onContextMenu={e => e.stopPropagation()}>
            {activeItems.map(item =>
              item.status === "paused" ? (
                <PausedSiloItem key={item.id} item={item} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onItemContextMenu(e, item, bundle); }} />
              ) : (
                <DraggableSiloItem key={item.id} item={item} bundle={bundle} bundleKey={bundleKey} weekKey={weekKey} showCzk={showCzk} disabled={!!forecastDarkMode || isMidflightBundle || !!isWeekLocked} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onItemContextMenu(e, item, bundle); }} />
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
  const isSplit = !!item.split_group_id || (!!item.split_part && !!item.split_total);
  // Intermediate split part: virtual status "completed" + has more parts coming.
  // Visually distinct from fully shipped ("expedice") items so they don't look fully done.
  const isIntermediateSplit = item.status === "completed"
    && !!item.split_group_id
    && item.split_part != null && item.split_total != null
    && item.split_part < item.split_total;
  return (
    <div data-context="item" className="flex items-center gap-[3px] px-[6px] py-[3px] rounded cursor-default transition-colors"
      style={{
        borderLeft: isIntermediateSplit ? "2px solid #6366f1" : (isSplit ? "2px dashed #c4ccc9" : undefined),
        backgroundColor: isIntermediateSplit ? "rgba(99,102,241,0.06)" : "#f8f7f4",
      }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = isIntermediateSplit ? "rgba(99,102,241,0.12)" : "#eceae6"; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = isIntermediateSplit ? "rgba(99,102,241,0.06)" : "#f5f3f0"; }}
      onContextMenu={onContextMenu}
    >
      <span style={{ width: 10, fontSize: 9, color: isIntermediateSplit ? "#6366f1" : "#3a8a36", fontWeight: 700 }}>{isIntermediateSplit ? "↻" : "✓"}</span>
      {item.item_code && <span className="font-sans text-[9px] font-bold shrink-0" style={{ color: "#99a5a3" }}>{item.item_code}</span>}
      <span className="text-[10px] flex-1 truncate" style={{ color: isIntermediateSplit ? "#4f46e5" : "#6b7280", textDecoration: isIntermediateSplit ? "none" : "line-through" }}>{item.item_name}</span>
      {item.item_quantity != null && item.item_quantity > 1 && (
        <span className="text-[8px] font-semibold shrink-0 px-1 py-px rounded" style={{ backgroundColor: "rgba(58,138,54,0.12)", color: "#3a8a36", border: "1px solid rgba(58,138,54,0.24)" }}>
          {item.item_quantity} ks
        </span>
      )}
      {item.is_midflight && (
        <span className="text-[9px] bg-slate-100 text-slate-500 border border-slate-300 rounded px-1 ml-1 font-medium tracking-wide shrink-0">Legacy</span>
      )}
      {isIntermediateSplit ? (
        <Tooltip><TooltipTrigger asChild>
          <span className="text-[8px] font-semibold shrink-0 px-1 py-px rounded" style={{ backgroundColor: "rgba(99,102,241,0.18)", color: "#4f46e5" }}>
            Část {item.split_part}/{item.split_total} hotová
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="z-[9999] text-[10px]">Část dokončena, výroba pokračuje v dalších týdnech</TooltipContent></Tooltip>
      ) : isSplit && (
        <Tooltip><TooltipTrigger asChild><span className="text-[8px] font-sans shrink-0" style={{ color: "#c4ccc9" }}>{item.split_part}/{item.split_total}</span></TooltipTrigger>
          <TooltipContent side="top" className="z-[9999] text-[10px]">Část {item.split_part} ze {item.split_total}</TooltipContent></Tooltip>
      )}
      <span className="font-sans text-[9px] shrink-0" style={{ color: "#c4ccc9" }}>{Math.round(item.scheduled_hours * 10) / 10}h</span>
    </div>
  );
}

function PausedSiloItem({ item, onContextMenu }: { item: ScheduleItem; onContextMenu: (e: React.MouseEvent) => void }) {
  const isSplit = !!item.split_group_id || (!!item.split_part && !!item.split_total);
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
      {item.item_code && <span className="font-sans text-[9px] shrink-0" style={{ color: "#d97706" }}>{item.item_code}</span>}
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
      <span className="font-sans text-[9px] shrink-0" style={{ color: "#d97706", textDecoration: "line-through" }}>{Math.round(item.scheduled_hours * 10) / 10}h</span>
    </div>
  );
}

function DraggableSiloItem({ item, bundle, bundleKey, weekKey, showCzk, onContextMenu, disabled = false }: {
  item: ScheduleItem; bundle: ScheduleBundle; bundleKey: string; weekKey: string; showCzk: boolean; onContextMenu: (e: React.MouseEvent) => void; disabled?: boolean;
}) {
  const isSplit = !!item.split_group_id || (!!item.split_part && !!item.split_total);
  const adhocReason = (item as any).adhoc_reason;
  const bundleSplitMeta = deriveBundleSplitMeta(bundle.items);
  const bundleType = bundleSplitMeta.isSplit ? "split" : (bundle.bundle_type ?? "full");
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `silo-item-${item.id}`,
    data: {
      type: "silo-item", itemId: item.id, itemName: item.item_name, itemCode: item.item_code,
      projectId: item.project_id, projectName: item.project_name, weekDate: weekKey,
      hours: item.scheduled_hours, stageId: item.stage_id, scheduledCzk: item.scheduled_czk,
      splitGroupId: item.split_group_id, bundleKey, bundleLabel: bundle.bundle_label ?? null,
      bundleType, splitPart: bundleSplitMeta.splitPart ?? bundle.split_part ?? null,
    },
    disabled,
  });

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e);
  }, [onContextMenu]);

  return (
    <div ref={setNodeRef} {...attributes} {...(disabled ? {} : listeners)}
      data-context="item"
      className={`flex items-center gap-[3px] px-[6px] py-[3px] rounded ${disabled ? "cursor-default" : "cursor-grab"} transition-colors`}
      style={{ opacity: isDragging ? 0.3 : 1, borderLeft: isSplit ? "2px dashed #99a5a3" : undefined }}
      onMouseEnter={e => { if (!isDragging) e.currentTarget.style.backgroundColor = "#f8f7f5"; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
      onContextMenu={handleContextMenu}
    >
      <GripVertical className="shrink-0" style={{ width: 8, height: 8, color: "#99a5a3", opacity: disabled ? 0.3 : 1 }} />
      {adhocReason && (
        <span className="text-[8px] shrink-0" style={{ color: "#d97706" }}>
          {adhocReason === "oprava" ? "🔧" : adhocReason === "dodatecna" ? "➕" : "📝"}
        </span>
      )}
      {item.item_code && <span className="font-sans text-[9px] shrink-0" style={{ color: "#223937" }}>{item.item_code}</span>}
      <span className="text-[10px] flex-1 truncate" style={{ color: "#6b7a78" }}>{item.item_name}</span>
      {item.item_quantity != null && item.item_quantity > 1 && (
        <span className="text-[8px] font-semibold shrink-0 px-1 py-px rounded" style={{ backgroundColor: "rgba(58,138,54,0.12)", color: "#3a8a36", border: "1px solid rgba(58,138,54,0.24)" }}>
          {item.item_quantity} ks
        </span>
      )}
      {item.is_midflight && (
        <span className="text-[9px] bg-slate-100 text-slate-500 border border-slate-300 rounded px-1 ml-1 font-medium tracking-wide shrink-0">Legacy</span>
      )}
      {isSplit && (
        <Tooltip><TooltipTrigger asChild><span className="text-[8px] font-sans shrink-0" style={{ color: "#99a5a3" }}>{item.split_part}/{item.split_total}</span></TooltipTrigger>
          <TooltipContent side="top" className="z-[9999] text-[10px]">Část {item.split_part} ze {item.split_total}</TooltipContent></Tooltip>
      )}
      <span className="font-sans text-[9px] shrink-0" style={{ color: "#99a5a3" }}>
        {Math.round(item.scheduled_hours * 10) / 10}h{showCzk && ` ${Math.round(item.scheduled_czk / 1000)}K`}
      </span>
    </div>
  );
}
