import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { productionCzkToSellingPrice } from "@/lib/currency";
import { useProductionSchedule, useProductionExpedice, getISOWeekNumber, type ScheduleItem, type ScheduleBundle } from "@/hooks/useProductionSchedule";
import { useProductionInbox } from "@/hooks/useProductionInbox";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { useWeekCapacityLookup } from "@/hooks/useWeeklyCapacity";
import { useProjects } from "@/hooks/useProjects";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { getTerminalStatuses } from "@/lib/statusHelpers";
import { useProductionDragDrop } from "@/hooks/useProductionDragDrop";
import { getProjectColor } from "@/lib/projectColors";
import { exportToExcel } from "@/lib/exportExcel";
import { buildPrintableHtml } from "@/lib/exportPdf";
import { parseAppDate } from "@/lib/dateFormat";
import { format, differenceInDays, addDays } from "date-fns";
import { resolveDeadline } from "@/lib/deadlineWarning";
import { cs } from "date-fns/locale";
import { Download, ChevronRight, ChevronDown, Plus, ArrowRight, Inbox, CheckCircle2, XCircle, FileSpreadsheet, FileText, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getProjectRiskSeverity } from "@/hooks/useRiskHighlight";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { CancelItemDialog } from "./CancelItemDialog";
import { CompletionDialog } from "./CompletionDialog";
import { SplitItemDialog } from "./SplitItemDialog";
import { SplitBundleDialog } from "./SplitBundleDialog";
import { PauseItemDialog } from "./PauseItemDialog";
import { ProductionContextMenu, type ContextMenuAction } from "./ProductionContextMenu";
import { InboxPlanningDialog, type SchedulePlanEntry, type PlanningItem, type PlanningWeek } from "./InboxPlanningDialog";
import { DndContext, closestCenter, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

type DisplayMode = "hours" | "czk" | "percent";
type SortMode = "project" | "deadline" | "hours";

interface Props {
  displayMode: DisplayMode;
  searchQuery?: string;
  onNavigateToTPV?: (projectId: string, itemCode?: string | null) => void;
  onOpenProjectDetail?: (projectId: string) => void;
}

function formatCzk(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M Kč`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K Kč`;
  return `${v.toLocaleString("cs-CZ")} Kč`;
}

function formatCzkShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return v.toLocaleString("cs-CZ");
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateShort(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

interface WeekColumn {
  key: string;
  weekNum: number;
  start: Date;
  end: Date;
  isCurrent: boolean;
}

interface WeekAlloc {
  hours: number;
  czk: number;
  status: string;
  splitPart?: number;
  splitTotal?: number;
  scheduleItemIds: string[];
}

interface ItemRow {
  id: string;
  itemName: string;
  itemCode: string | null;
  totalHours: number;
  totalCzk: number;
  weekAllocations: Map<string, WeekAlloc>;
  inboxHours: number;
  inboxCzk: number;
  inboxItemIds: string[];
  expediceHours: number;
  expediceCzk: number;
  projectId: string;
  projectName: string;
  stageId: string | null;
}

interface ProjectRow {
  projectId: string;
  projectName: string;
  color: string;
  totalHours: number;
  totalCzk: number;
  items: ItemRow[];
  weekTotals: Map<string, { hours: number; czk: number }>;
  inboxTotalHours: number;
  inboxTotalCzk: number;
  expediceTotalHours: number;
  expediceTotalCzk: number;
  isBlockerOnly: boolean;
}

function getCollapsedCellStyle(proj: ProjectRow, weekKey: string): { bg: string; text: string; border: string } {
  const color = proj.color;
  let hasInProgress = false, hasPaused = false, hasScheduled = false, hasCompleted = false, hasInbox = false;
  for (const item of proj.items) {
    const alloc = item.weekAllocations.get(weekKey);
    if (alloc && alloc.hours > 0) {
      const s = alloc.status;
      if (s === "in_progress") hasInProgress = true;
      else if (s === "paused") hasPaused = true;
      else if (s === "completed") hasCompleted = true;
      else hasScheduled = true;
    }
    if (item.inboxHours > 0 && !hasInProgress && !hasPaused && !hasScheduled && !hasCompleted) hasInbox = true;
  }
  // Paused/inbox keep their semantic colors; all others use project color
  if (hasPaused) return { bg: "rgba(107,114,128,0.12)", text: "#6b7280", border: "rgba(107,114,128,0.3)" };
  if (hasInbox && !hasScheduled && !hasInProgress && !hasCompleted) return { bg: "rgba(249,115,22,0.12)", text: "#ea580c", border: "rgba(249,115,22,0.3)" };
  // Use project color with varying opacity for active states
  if (hasCompleted && !hasInProgress && !hasScheduled) return { bg: color + "25", text: color, border: color + "60" };
  return { bg: color + "18", text: color, border: color + "40" };
}

const CELL_W = 132;
const INBOX_W = 100;
const EXPEDICE_W = 100;
const LEFT_COL_W = 280;

export function PlanVyrobyTableView({ displayMode, searchQuery = "", onNavigateToTPV, onOpenProjectDetail }: Props) {
  const { data: scheduleData } = useProductionSchedule();
  const { data: expediceData } = useProductionExpedice();
  const { data: inboxProjects = [] } = useProductionInbox();
  const { data: settings } = useProductionSettings();
  const { data: allProjects = [] } = useProjects();
  const { data: statusOpts = [] } = useProjectStatusOptions();
  const terminalStatuses = useMemo(() => getTerminalStatuses(statusOpts), [statusOpts]);
  const getWeekCapacity = useWeekCapacityLookup();
  const { moveScheduleItemToWeek, moveItemBackToInbox, completeItems, moveInboxItemToWeek, returnBundleToInbox, returnToProduction, mergeSplitItems } = useProductionDragDrop();
  const qc = useQueryClient();
  const [sortMode, setSortMode] = useState<SortMode>("project");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; actions: ContextMenuAction[] } | null>(null);

  // Planning dialog state
  const [planningState, setPlanningState] = useState<{ projectId: string; projectName: string; items: PlanningItem[] } | null>(null);

  // Cancel dialog state
  const [cancelDialog, setCancelDialog] = useState<{
    open: boolean; itemId: string; itemName: string; itemCode?: string | null;
    hours: number; projectName: string; projectId: string;
    splitGroupId?: string | null; cancelAll?: boolean;
  } | null>(null);

  // Completion dialog state
  const [completionState, setCompletionState] = useState<{
    projectName: string; projectId: string; weekLabel: string; weekKey: string;
    items: ScheduleItem[]; preCheckedIds?: string[];
  } | null>(null);

  // Split item dialog state
  const [splitState, setSplitState] = useState<{
    itemId: string; itemName: string; itemCode: string | null;
    totalHours: number; projectId: string; stageId: string | null;
    scheduledCzk: number; source: "schedule" | "inbox";
    currentWeekKey?: string; splitGroupId?: string | null;
  } | null>(null);

  // Bundle split dialog state
  const [bundleSplitState, setBundleSplitState] = useState<{
    bundleName: string; currentWeekKey: string;
    items: Array<{ id: string; item_name: string; item_code: string | null; project_id: string; stage_id: string | null; scheduled_hours: number; scheduled_czk: number; split_group_id: string | null; }>;
  } | null>(null);

  // Pause dialog state
  const [pauseState, setPauseState] = useState<{
    itemId: string; itemName: string; itemCode: string | null; source: "schedule" | "inbox";
  } | null>(null);

  const projectDateLookup = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of allProjects) map.set(p.project_id, p);
    return map;
  }, [allProjects]);

  const hourlyRate = settings?.hourly_rate ?? 550;

  // Convert production CZK to selling price for a given project
  const toSellingCzk = useCallback((czk: number, projectId: string) => {
    const proj = projectDateLookup.get(projectId);
    if (!proj) return czk;
    return productionCzkToSellingPrice(czk, proj.cost_production_pct, proj.marze);
  }, [projectDateLookup]);

  const toggleProject = (pid: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const weeks = useMemo<WeekColumn[]>(() => {
    const monday = getMonday(new Date());
    const currentWeekKey = monday.toISOString().split("T")[0];
    let earliestDataWeek = currentWeekKey;
    if (scheduleData) {
      for (const weekKey of scheduleData.keys()) {
        if (weekKey < earliestDataWeek) earliestDataWeek = weekKey;
      }
    }
    const startMonday = new Date(earliestDataWeek < currentWeekKey ? earliestDataWeek : currentWeekKey);
    startMonday.setDate(startMonday.getDate() - 7);
    const result: WeekColumn[] = [];
    for (let i = 0; i < 18; i++) {
      const start = new Date(startMonday);
      start.setDate(startMonday.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const key = start.toISOString().split("T")[0];
      result.push({ key, weekNum: getISOWeekNumber(start), start, end, isCurrent: key === currentWeekKey });
    }
    return result;
  }, [scheduleData]);

  // Next 8 weeks from current for move targets
  const moveTargetWeeks = useMemo(() => {
    const monday = getMonday(new Date());
    const targets: { key: string; weekNum: number; label: string }[] = [];
    for (let i = 1; i <= 8; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i * 7);
      const key = d.toISOString().split("T")[0];
      targets.push({ key, weekNum: getISOWeekNumber(d), label: `T${getISOWeekNumber(d)} (${formatDateShort(d)})` });
    }
    return targets;
  }, []);

  const inboxByProject = useMemo(() => {
    const map = new Map<string, { items: { id: string; name: string; code: string | null; hours: number; czk: number; stageId: string | null }[]; totalHours: number; totalCzk: number }>();
    for (const p of inboxProjects) {
      if (p.total_hours <= 0) continue;
      map.set(p.project_id, {
        items: p.items.map(i => ({ id: i.id, name: i.item_name, code: i.item_code, hours: i.estimated_hours, czk: i.estimated_czk, stageId: i.stage_id })),
        totalHours: p.total_hours,
        totalCzk: p.items.reduce((s, i) => s + i.estimated_czk, 0),
      });
    }
    return map;
  }, [inboxProjects]);

  const expediceByProject = useMemo(() => {
    const map = new Map<string, { items: { name: string; code: string | null; hours: number; czk: number }[]; totalHours: number; totalCzk: number }>();
    if (!expediceData) return map;
    for (const g of expediceData) {
      const totalHours = g.items.reduce((s, i) => s + i.scheduled_hours, 0);
      const totalCzk = g.items.reduce((s, i) => s + i.scheduled_czk, 0);
      if (totalHours <= 0) continue;
      map.set(g.project_id, {
        items: g.items.map(i => ({ name: i.item_name, code: i.item_code, hours: i.scheduled_hours, czk: i.scheduled_czk })),
        totalHours,
        totalCzk,
      });
    }
    return map;
  }, [expediceData]);

  const cleanSplitName = (name: string) => name.replace(/\s*\(\d+\/\d+\)\s*$/, "").trim();

  const projectRows = useMemo<ProjectRow[]>(() => {
    const projectMap = new Map<string, {
      projectName: string;
      items: Map<string, {
        itemName: string;
        itemCode: string | null;
        stageId: string | null;
        weekAllocations: Map<string, WeekAlloc>;
        totalHours: number;
        totalCzk: number;
      }>;
    }>();

    if (scheduleData) {
      for (const [weekKey, silo] of scheduleData) {
        for (const bundle of silo.bundles) {
          if (!projectMap.has(bundle.project_id)) {
            projectMap.set(bundle.project_id, { projectName: bundle.project_name, items: new Map() });
          }
          const proj = projectMap.get(bundle.project_id)!;
          for (const item of bundle.items) {
            const itemKey = item.split_group_id || item.id;
            if (!proj.items.has(itemKey)) {
              proj.items.set(itemKey, { itemName: cleanSplitName(item.item_name), itemCode: item.item_code, stageId: item.stage_id, weekAllocations: new Map(), totalHours: 0, totalCzk: 0 });
            }
            const entry = proj.items.get(itemKey)!;
            const existing = entry.weekAllocations.get(weekKey);
            entry.weekAllocations.set(weekKey, {
              hours: (existing?.hours ?? 0) + item.scheduled_hours,
              czk: (existing?.czk ?? 0) + item.scheduled_czk,
              status: item.status,
              splitPart: item.split_part ?? undefined,
              splitTotal: item.split_total ?? undefined,
              scheduleItemIds: [...(existing?.scheduleItemIds ?? []), item.id],
            });
            entry.totalHours += item.scheduled_hours;
            entry.totalCzk += item.scheduled_czk;
          }
        }
      }
    }

    const allProjectIds = new Set<string>([...projectMap.keys(), ...inboxByProject.keys(), ...expediceByProject.keys()]);
    const rows: ProjectRow[] = [];

    for (const pid of allProjectIds) {
      const proj = projectMap.get(pid);
      const inbox = inboxByProject.get(pid);
      const expedice = expediceByProject.get(pid);
      const items: ItemRow[] = [];
      const knownItemKeys = new Set<string>();

      const realName = inboxProjects.find(p => p.project_id === pid)?.project_name ||
        expediceData?.find(g => g.project_id === pid)?.project_name ||
        proj?.projectName || pid;

      if (proj) {
        for (const [, entry] of proj.items) {
          if (entry.totalHours <= 0) continue;
          const cleanName = cleanSplitName(entry.itemName);
          if (entry.itemCode) knownItemKeys.add(entry.itemCode.toLowerCase());
          knownItemKeys.add(cleanName.toLowerCase());
          items.push({
            id: Math.random().toString(36),
            itemName: cleanName,
            itemCode: entry.itemCode,
            totalHours: entry.totalHours,
            totalCzk: entry.totalCzk,
            weekAllocations: entry.weekAllocations,
            inboxHours: 0, inboxCzk: 0, inboxItemIds: [],
            expediceHours: 0, expediceCzk: 0,
            projectId: pid, projectName: realName, stageId: entry.stageId,
          });
        }
      }

      if (inbox) {
        for (const inItem of inbox.items) {
          if (inItem.hours <= 0) continue;
          const cleanName = cleanSplitName(inItem.name);
          const codeKey = inItem.code?.toLowerCase();
          const nameKey = cleanName.toLowerCase();
          const existing = items.find(i =>
            (codeKey && i.itemCode?.toLowerCase() === codeKey) ||
            cleanSplitName(i.itemName).toLowerCase() === nameKey
          );
          if (existing) {
            existing.inboxHours += inItem.hours;
            existing.inboxCzk += inItem.czk;
            existing.totalHours += inItem.hours;
            existing.totalCzk += inItem.czk;
            existing.inboxItemIds.push(inItem.id);
          } else {
            if (codeKey) knownItemKeys.add(codeKey);
            knownItemKeys.add(nameKey);
            items.push({
              id: Math.random().toString(36),
              itemName: cleanName, itemCode: inItem.code,
              totalHours: inItem.hours, totalCzk: inItem.czk,
              weekAllocations: new Map(),
              inboxHours: inItem.hours, inboxCzk: inItem.czk, inboxItemIds: [inItem.id],
              expediceHours: 0, expediceCzk: 0,
              projectId: pid, projectName: realName, stageId: inItem.stageId,
            });
          }
        }
      }

      if (expedice) {
        for (const exItem of expedice.items) {
          if (exItem.hours <= 0) continue;
          const cleanName = cleanSplitName(exItem.name);
          const codeKey = exItem.code?.toLowerCase();
          const nameKey = cleanName.toLowerCase();
          const existing = items.find(i =>
            (codeKey && i.itemCode?.toLowerCase() === codeKey) ||
            cleanSplitName(i.itemName).toLowerCase() === nameKey
          );
          if (existing) {
            existing.expediceHours += exItem.hours;
            existing.expediceCzk += exItem.czk;
            existing.totalHours += exItem.hours;
            existing.totalCzk += exItem.czk;
          } else {
            items.push({
              id: Math.random().toString(36),
              itemName: cleanName, itemCode: exItem.code,
              totalHours: exItem.hours, totalCzk: exItem.czk,
              weekAllocations: new Map(),
              inboxHours: 0, inboxCzk: 0, inboxItemIds: [],
              expediceHours: exItem.hours, expediceCzk: exItem.czk,
              projectId: pid, projectName: realName, stageId: null,
            });
          }
        }
      }

      const visibleItems = items.filter(i => i.totalHours > 0 || i.inboxHours > 0 || i.expediceHours > 0);
      if (visibleItems.length === 0) continue;

      const weekTotals = new Map<string, { hours: number; czk: number }>();
      for (const item of visibleItems) {
        for (const [wk, alloc] of item.weekAllocations) {
          const existing = weekTotals.get(wk);
          weekTotals.set(wk, { hours: (existing?.hours ?? 0) + alloc.hours, czk: (existing?.czk ?? 0) + alloc.czk });
        }
      }

      // Check if all schedule items for this project are blockers
      let allBlocker = false;
      if (proj && !inbox) {
        const allItems = Array.from(proj.items.values());
        const scheduleItems: ScheduleItem[] = [];
        if (scheduleData) {
          for (const [, silo] of scheduleData) {
            for (const bundle of silo.bundles) {
              if (bundle.project_id === pid) {
                scheduleItems.push(...bundle.items);
              }
            }
          }
        }
        allBlocker = scheduleItems.length > 0 && scheduleItems.every(i => i.is_blocker);
      }

      rows.push({
        projectId: pid, projectName: realName, color: getProjectColor(pid),
        totalHours: visibleItems.reduce((s, i) => s + i.totalHours, 0),
        totalCzk: visibleItems.reduce((s, i) => s + i.totalCzk, 0),
        items: visibleItems, weekTotals,
        inboxTotalHours: inbox?.totalHours ?? 0, inboxTotalCzk: inbox?.totalCzk ?? 0,
        expediceTotalHours: expedice?.totalHours ?? 0, expediceTotalCzk: expedice?.totalCzk ?? 0,
        isBlockerOnly: allBlocker,
      });
    }

    if (sortMode === "hours") rows.sort((a, b) => b.totalHours - a.totalHours);
    else if (sortMode === "deadline") {
      rows.sort((a, b) => {
        const aMin = Math.min(...a.items.flatMap(i => [...i.weekAllocations.keys()].map(k => weeks.findIndex(w => w.key === k))).filter(x => x >= 0), 999);
        const bMin = Math.min(...b.items.flatMap(i => [...i.weekAllocations.keys()].map(k => weeks.findIndex(w => w.key === k))).filter(x => x >= 0), 999);
        return aMin - bMin;
      });
    } else {
      rows.sort((a, b) => a.projectName.localeCompare(b.projectName, "cs"));
    }
    return rows;
  }, [scheduleData, expediceData, inboxByProject, expediceByProject, inboxProjects, sortMode, weeks]);

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return projectRows;
    const q = searchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return projectRows.filter(p => {
      const pName = p.projectName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const pId = p.projectId.toLowerCase();
      if (pName.includes(q) || pId.includes(q)) return true;
      // Match PM
      const proj = allProjects.find(ap => ap.project_id === p.projectId);
      if (proj?.pm && proj.pm.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)) return true;
      return p.items.some(i => {
        const iName = i.itemName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const iCode = (i.itemCode || "").toLowerCase();
        return iName.includes(q) || iCode.includes(q);
      });
    });
  }, [projectRows, searchQuery, allProjects]);

  const regularRows = useMemo(() => filteredRows.filter(r => !r.isBlockerOnly), [filteredRows]);
  const blockerRows = useMemo(() => filteredRows.filter(r => r.isBlockerOnly), [filteredRows]);

  const totalProjects = filteredRows.length;
  const totalItems = filteredRows.reduce((s, p) => s + p.items.length, 0);

  const weekCapacities = useMemo(() => {
    const map = new Map<string, number>();
    if (scheduleData) {
      for (const [weekKey, silo] of scheduleData) {
        const activeHours = silo.bundles.reduce((sum, b) =>
          sum + b.items.reduce((s, i) => s + (i.status === "paused" ? 0 : i.scheduled_hours), 0), 0);
        map.set(weekKey, activeHours);
      }
    }
    return map;
  }, [scheduleData]);

  // --- New color system ---
  const STATUS_COLORS = {
    inbox:       { bg: "#FEE2CD", text: "#EA580C", border: "#EA580C" },
    scheduled:   { bg: "#DBEAFE", text: "#2563EB", border: "#2563EB" },
    in_progress: { bg: "#D1FAE5", text: "#059669", border: "#059669" },
    completed:   { bg: "#BBF7D0", text: "#16A34A", border: "#16A34A" },
    paused:      { bg: "#F3F4F6", text: "#6B7280", border: "#6B7280" },
    overdue:     { bg: "#FEE2E2", text: "#DC2626", border: "#DC2626" },
  } as const;

  const getCellStyle = (status: string, projectColor?: string) => {
    if (projectColor && status !== "paused") {
      if (status === "completed") return { bg: projectColor + "25", text: projectColor, border: projectColor + "60" };
      return { bg: projectColor + "18", text: projectColor, border: projectColor + "40" };
    }
    switch (status) {
      case "completed": return STATUS_COLORS.completed;
      case "in_progress": return STATUS_COLORS.in_progress;
      case "paused": return STATUS_COLORS.paused;
      default: return STATUS_COLORS.scheduled;
    }
  };

  // Bold variant for bundle-level cells (uses project color as bg, white text)
  const getBundleCellStyle = (status: string, projectColor?: string) => {
    if (projectColor && status !== "paused") {
      return { bg: projectColor, text: "#ffffff", border: projectColor };
    }
    const base = getCellStyle(status);
    return { bg: base.border, text: "#ffffff", border: base.border };
  };

  const formatCellValue = (hours: number, czk: number, status: string, totalItemHours: number, splitPart?: number, splitTotal?: number, projectId?: string) => {
    const splitLabel = splitPart && splitTotal
      ? ` ${["½", "²⁄₂", "⅓", "²⁄₃", "¼", "²⁄₄", "¾"][splitPart === 1 && splitTotal === 2 ? 0 : splitPart === 2 && splitTotal === 2 ? 1 : 0] || `${splitPart}/${splitTotal}`}`
      : "";
    const prefix = status === "completed" ? "✓ " : status === "paused" ? "⏸ " : "";
    if (displayMode === "percent") {
      const pct = totalItemHours > 0 ? Math.round((hours / totalItemHours) * 100) : 0;
      return `${prefix}${pct}%${splitLabel}`;
    }
    if (displayMode === "czk") {
      const sellCzk = projectId ? toSellingCzk(czk, projectId) : czk;
      return `${prefix}${formatCzkShort(Math.round(sellCzk))} Kč${splitLabel}`;
    }
    return `${prefix}${Math.round(hours)}h${splitLabel}`;
  };

  const formatCapacity = (used: number, weekKey: string) => {
    const cap = getWeekCapacity(weekKey);
    if (displayMode === "percent") return `${cap > 0 ? Math.round((used / cap) * 100) : 0}%`;
    if (displayMode === "czk") return `${formatCzk(Math.round(used * hourlyRate))}`;
    return `${Math.round(used)}h / ${cap}h`;
  };

  const formatProjectTotal = (row: ProjectRow) => {
    if (displayMode === "czk") return formatCzk(Math.round(toSellingCzk(row.totalCzk, row.projectId)));
    if (displayMode === "percent") {
      const completedItems = row.items.filter(i => i.expediceHours > 0).length;
      const totalItems = row.items.length;
      const completedPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
      return `${completedPct}% hotovo`;
    }
    return `${Math.round(row.totalHours)}h`;
  };

  const formatWeekTotal = (hours: number, czk: number, weekKey?: string, projectId?: string) => {
    if (displayMode === "czk") {
      const sellCzk = projectId ? toSellingCzk(czk, projectId) : czk;
      return `${formatCzkShort(Math.round(sellCzk))} Kč`;
    }
    if (displayMode === "percent") {
      const cap = weekKey ? getWeekCapacity(weekKey) : 0;
      return `${cap > 0 ? Math.round((hours / cap) * 100) : 0}%`;
    }
    return `${Math.round(hours)}h`;
  };

  const formatInboxValue = (hours: number, czk: number, totalProjectHours?: number, projectId?: string) => {
    if (displayMode === "czk") {
      const sellCzk = projectId ? toSellingCzk(czk, projectId) : czk;
      return `${formatCzkShort(Math.round(sellCzk))} Kč`;
    }
    if (displayMode === "percent" && totalProjectHours && totalProjectHours > 0) return `${Math.round((hours / totalProjectHours) * 100)}%`;
    return `${Math.round(hours)}h`;
  };

  const formatExpediceValue = (hours: number, czk: number, totalProjectHours?: number, projectId?: string) => {
    if (displayMode === "czk") {
      const sellCzk = projectId ? toSellingCzk(czk, projectId) : czk;
      return `${formatCzkShort(Math.round(sellCzk))} Kč`;
    }
    if (displayMode === "percent" && totalProjectHours && totalProjectHours > 0) return `${Math.round((hours / totalProjectHours) * 100)}%`;
    return `${Math.round(hours)}h`;
  };

  const formatItemTotal = (item: ItemRow, projectId?: string) => {
    if (displayMode === "czk") {
      const sellCzk = projectId ? toSellingCzk(item.totalCzk, projectId) : item.totalCzk;
      return formatCzkShort(Math.round(sellCzk)) + " Kč";
    }
    if (displayMode === "percent") {
      const totalProjectHours = item.totalHours;
      const totalCap = weeks.reduce((s, w) => s + getWeekCapacity(w.key), 0);
      return `${totalCap > 0 ? Math.round((totalProjectHours / totalCap) * 100) : 0}%`;
    }
    return `${Math.round(item.totalHours)}h`;
  };

  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [pdfHtml, setPdfHtml] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportDropdownOpen]);

  // Initial scroll — show current week as first visible week column
  useEffect(() => {
    if (initialScrollDone.current || weeks.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const currentMonday = getMonday(new Date());
    const currentWeekKey = currentMonday.toISOString().split("T")[0];
    const currentWeekIdx = weeks.findIndex(w => w.key === currentWeekKey);
    if (currentWeekIdx > 0) {
      el.scrollLeft = currentWeekIdx * CELL_W;
    }
    initialScrollDone.current = true;
  }, [weeks]);

  const buildExportData = useCallback(() => {
    const weekHeaders = weeks.map(w => `T${w.weekNum}`);
    const headers = ["Projekt", "ID projektu", "Položka", "Kód položky", "Celkem hodin", ...weekHeaders, "Expedice"];
    const rows: (string | number)[][] = [];

    const formatVal = (hours: number, czk: number, totalH: number, projectId?: string) => {
      if (displayMode === "czk") return Math.round(projectId ? toSellingCzk(czk, projectId) : czk);
      if (displayMode === "percent") return totalH > 0 ? Math.round((hours / totalH) * 100) : 0;
      return Math.round(hours);
    };

    for (const proj of filteredRows) {
      const isExpanded = expandedProjects.has(proj.projectId);
      if (!isExpanded) {
        // Collapsed: summary row only
        const row: (string | number)[] = [proj.projectName, proj.projectId, "", "", Math.round(proj.totalHours)];
        for (const week of weeks) {
          const wt = proj.weekTotals.get(week.key);
          row.push(wt ? formatVal(wt.hours, wt.czk, proj.totalHours, proj.projectId) : "");
        }
        row.push(proj.expediceTotalHours > 0 ? formatVal(proj.expediceTotalHours, proj.expediceTotalCzk, proj.totalHours, proj.projectId) : "");
        rows.push(row);
      } else {
        // Expanded: item rows
        for (const item of proj.items) {
          const row: (string | number)[] = [proj.projectName, proj.projectId, item.itemName, item.itemCode || "", Math.round(item.totalHours)];
          for (const week of weeks) {
            const alloc = item.weekAllocations.get(week.key);
            row.push(alloc ? formatVal(alloc.hours, alloc.czk, item.totalHours, proj.projectId) : "");
          }
          row.push(item.expediceHours > 0 ? formatVal(item.expediceHours, item.expediceCzk, item.totalHours, proj.projectId) : "");
          rows.push(row);
        }
      }
    }
    return { headers, rows };
  }, [filteredRows, weeks, displayMode, expandedProjects]);

  const handleExcelExport = () => {
    setExportDropdownOpen(false);
    const { headers, rows } = buildExportData();
    const monthLabel = format(new Date(), "yyyy-MM");
    const sheetName = `Plán výroby · ${format(new Date(), "LLLL yyyy", { locale: cs })}`;
    exportToExcel({ sheetName, fileName: `plan-vyroby-${monthLabel}.xlsx`, headers, rows });
  };

  const handlePdfExport = () => {
    setExportDropdownOpen(false);
    const { headers, rows } = buildExportData();
    // Add capacity sub-header row
    const capacityRow: (string | number)[] = ["", "", "", "", ""];
    for (const week of weeks) {
      const cap = getWeekCapacity(week.key);
      capacityRow.push(`Kapacita: ${cap}h`);
    }
    capacityRow.push("");
    const allRows = [capacityRow, ...rows];
    const monthLabel = format(new Date(), "LLLL yyyy", { locale: cs });
    const html = buildPrintableHtml({
      tabLabel: `Plán Výroby · ${monthLabel}`,
      headers,
      rows: allRows,
    });
    setPdfHtml(html);
  };

  // Action handlers
  const handleMoveToWeek = useCallback(async (scheduleItemIds: string[], targetWeekKey: string) => {
    try {
      for (const id of scheduleItemIds) {
        await moveScheduleItemToWeek(id, targetWeekKey);
      }
      toast({ title: `Přesunuto do T${getISOWeekNumber(new Date(targetWeekKey))}` });
    } catch { /* error handled in hook */ }
  }, [moveScheduleItemToWeek]);

  const handleReturnToInbox = useCallback(async (scheduleItemIds: string[]) => {
    try {
      for (const id of scheduleItemIds) {
        await moveItemBackToInbox(id);
      }
      toast({ title: "Vráceno do Inboxu" });
    } catch { /* error handled in hook */ }
  }, [moveItemBackToInbox]);

  const handleComplete = useCallback(async (scheduleItemIds: string[]) => {
    try {
      await completeItems(scheduleItemIds);
    } catch { /* error handled in hook */ }
  }, [completeItems]);

  const handleScheduleFromInbox = useCallback(async (inboxItemId: string, weekKey: string) => {
    try {
      await moveInboxItemToWeek(inboxItemId, weekKey);
      toast({ title: `Naplánováno do T${getISOWeekNumber(new Date(weekKey))}` });
    } catch { /* error handled in hook */ }
  }, [moveInboxItemToWeek]);

  // Build planning weeks for InboxPlanningDialog
  const weeklyCapacity = settings?.weekly_capacity_hours ?? 875;
  const planningWeeks = useMemo<PlanningWeek[]>(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const result: PlanningWeek[] = [];
    for (let i = 0; i < 12; i++) {
      const weekStart = new Date(monday);
      weekStart.setDate(monday.getDate() + i * 7);
      const key = weekStart.toISOString().split("T")[0];
      const weekEnd = addDays(weekStart, 6);
      const weekNum = getISOWeekNumber(weekStart);
      const cap = getWeekCapacity(key);
      const silo = scheduleData?.get(key);
      const scheduledHours = silo ? silo.total_hours : 0;
      const remaining = Math.max(0, cap - scheduledHours);
      result.push({ key, weekNum, label: `T${weekNum} · ${format(weekStart, "d.M")} – ${format(weekEnd, "d.M")}`, remainingCapacity: remaining });
    }
    return result;
  }, [getWeekCapacity, scheduleData]);

  const handlePlanConfirm = useCallback(async (plan: SchedulePlanEntry[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const byItem = new Map<string, SchedulePlanEntry[]>();
      for (const entry of plan) {
        const arr = byItem.get(entry.inboxItemId) || [];
        arr.push(entry);
        byItem.set(entry.inboxItemId, arr);
      }
      for (const [inboxItemId, entries] of byItem) {
        const { data: inboxItem } = await supabase.from("production_inbox").select("*").eq("id", inboxItemId).single();
        if (!inboxItem) continue;
        if (entries.length === 1) {
          await supabase.from("production_schedule").insert({
            project_id: inboxItem.project_id, stage_id: inboxItem.stage_id,
            item_name: inboxItem.item_name, item_code: inboxItem.item_code,
            scheduled_week: entries[0].scheduledWeek, scheduled_hours: entries[0].scheduledHours,
            scheduled_czk: entries[0].scheduledCzk, position: 999, status: "scheduled",
            created_by: user.id, inbox_item_id: inboxItemId,
          });
        } else {
          const { data: firstPart } = await supabase.from("production_schedule").insert({
            project_id: inboxItem.project_id, stage_id: inboxItem.stage_id,
            item_name: `${inboxItem.item_name} (1/${entries.length})`, item_code: inboxItem.item_code,
            scheduled_week: entries[0].scheduledWeek, scheduled_hours: entries[0].scheduledHours,
            scheduled_czk: entries[0].scheduledCzk, position: 999, status: "scheduled",
            created_by: user.id, inbox_item_id: inboxItemId, split_part: 1, split_total: entries.length,
          }).select().single();
          if (firstPart) {
            await supabase.from("production_schedule").update({ split_group_id: firstPart.id }).eq("id", firstPart.id);
            for (let i = 1; i < entries.length; i++) {
              await supabase.from("production_schedule").insert({
                project_id: inboxItem.project_id, stage_id: inboxItem.stage_id,
                item_name: `${inboxItem.item_name} (${i + 1}/${entries.length})`, item_code: inboxItem.item_code,
                scheduled_week: entries[i].scheduledWeek, scheduled_hours: entries[i].scheduledHours,
                scheduled_czk: entries[i].scheduledCzk, position: 999, status: "scheduled",
                created_by: user.id, inbox_item_id: inboxItemId, split_group_id: firstPart.id,
                split_part: i + 1, split_total: entries.length,
              });
            }
          }
        }
        await supabase.from("production_inbox").update({ status: "scheduled" }).eq("id", inboxItemId);
      }
      qc.invalidateQueries({ queryKey: ["production-inbox"] });
      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-progress"] });
      toast({ title: `${plan.length} položek naplánováno` });
    } catch (err: any) {
      toast({ title: "Chyba při plánování", description: err?.message, variant: "destructive" });
    }
    setPlanningState(null);
  }, [qc]);

  const handleReleaseItem = useCallback(async (itemId: string) => {
    try {
      const { error } = await supabase.from("production_schedule").update({
        status: "scheduled", pause_reason: null, pause_expected_date: null,
      }).eq("id", itemId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-progress"] });
      toast({ title: "▶ Položka uvolněna" });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [qc]);

  const findSameWeekSiblings = useCallback((item: ScheduleItem, weekKey: string): ScheduleItem[] => {
    if (!item.split_group_id) return [];
    const silo = scheduleData?.get(weekKey);
    if (!silo) return [];
    return silo.bundles.flatMap(b => b.items).filter(i => i.id !== item.id && i.split_group_id === item.split_group_id);
  }, [scheduleData]);

  const splitWeekOptions = useMemo(() => {
    return weeks.map(w => {
      const siloData = scheduleData?.get(w.key);
      const usedHours = siloData?.total_hours ?? 0;
      const cap = getWeekCapacity(w.key);
      return { key: w.key, weekNum: w.weekNum, label: `${formatDateShort(w.start)}–${formatDateShort(w.end)}`, remainingCapacity: cap - usedHours };
    });
  }, [weeks, scheduleData, getWeekCapacity]);

  const getBundleForWeek = useCallback((projectId: string, weekKey: string): ScheduleBundle | null => {
    const silo = scheduleData?.get(weekKey);
    if (!silo) return null;
    return silo.bundles.find(b => b.project_id === projectId) ?? null;
  }, [scheduleData]);

  const handleBundleContextMenu = useCallback((e: React.MouseEvent, projectId: string, weekKey: string, _isAllCompleted: boolean) => {
    e.preventDefault(); e.stopPropagation();
    const bundle = getBundleForWeek(projectId, weekKey);
    if (!bundle) return;
    const week = weeks.find(w => w.key === weekKey);
    const weekNum = week?.weekNum ?? 0;
    const startDate = week?.start ?? new Date();
    const endDate = week?.end ?? new Date();
    const activeItems = bundle.items.filter(i => i.status !== "completed" && i.status !== "paused" && i.status !== "cancelled");
    const completedItems = bundle.items.filter(i => i.status === "completed");
    const pausedItems = bundle.items.filter(i => i.status === "paused");
    const allCompleted = completedItems.length > 0 && activeItems.length === 0 && pausedItems.length === 0;
    const actions: ContextMenuAction[] = [];

    if (!allCompleted && activeItems.length > 0) {
      actions.push({
        label: "Dokončit položky → Expedice", icon: "✓",
        onClick: () => setCompletionState({ projectName: bundle.project_name, projectId, weekLabel: `Výroba T${weekNum} · ${formatDateShort(startDate)} – ${formatDateShort(endDate)}`, weekKey, items: bundle.items }),
      });
      actions.push({
        label: `Rozdělit bundle (${activeItems.length})`, icon: "✂",
        onClick: () => setBundleSplitState({ bundleName: bundle.project_name, currentWeekKey: weekKey, items: activeItems.map(i => ({ id: i.id, item_name: i.item_name, item_code: i.item_code, project_id: i.project_id, stage_id: i.stage_id, scheduled_hours: i.scheduled_hours, scheduled_czk: i.scheduled_czk, split_group_id: i.split_group_id })) }),
      });
      actions.push({
        label: `Pozastavit vše (${activeItems.length})`, icon: "⏸",
        onClick: () => setPauseState({ itemId: activeItems.map(i => i.id).join(","), itemName: `${bundle.project_name} — ${activeItems.length} položek`, itemCode: null, source: "schedule" }),
      });
    }
    if (pausedItems.length > 0) {
      actions.push({ label: `Uvolnit vše (${pausedItems.length})`, icon: "▶", onClick: async () => { for (const item of pausedItems) await handleReleaseItem(item.id); } });
    }
    if (activeItems.length > 0 || pausedItems.length > 0) {
      actions.push({ label: "Vrátit do Inboxu", icon: "←", onClick: () => returnBundleToInbox(projectId, weekKey) });
    }
    // Merge option
    const splitGroupIds = new Set<string>();
    for (const item of bundle.items) {
      if (item.split_group_id && item.status !== "completed" && item.status !== "cancelled") splitGroupIds.add(item.split_group_id);
    }
    const mergeableSplitGroups = Array.from(splitGroupIds).filter(sgId => bundle.items.filter(i => i.split_group_id === sgId && i.status !== "completed" && i.status !== "cancelled").length >= 2);
    if (mergeableSplitGroups.length > 0) {
      actions.push({ label: `Spojit části (${mergeableSplitGroups.length} skupin)`, icon: "🔗", onClick: async () => { for (const sgId of mergeableSplitGroups) await mergeSplitItems(sgId); } });
    }
    if (onNavigateToTPV) actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(projectId) });
    if (onOpenProjectDetail) actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(projectId) });

    if (allCompleted) {
      actions.push({ label: "Vrátit do výroby", icon: "↩", dividerBefore: true, onClick: async () => { try { for (const ci of completedItems) await returnToProduction(ci.id); toast({ title: `↩ ${completedItems.length} položek vráceno do výroby` }); } catch (err: any) { toast({ title: "Chyba", description: err.message, variant: "destructive" }); } } });
      actions.push({ label: "Zrušit", icon: "✕", danger: true, onClick: () => setCancelDialog({ open: true, itemId: completedItems.map(i => i.id).join(","), itemName: `${bundle.project_name} — ${completedItems.length} položek`, itemCode: null, hours: completedItems.reduce((s, i) => s + i.scheduled_hours, 0), projectName: bundle.project_name, projectId, splitGroupId: null, cancelAll: true }) });
    }
    if (!allCompleted && activeItems.length > 0) {
      actions.push({ label: `Zrušit vše (${activeItems.length})`, icon: "✕", danger: true, dividerBefore: true, onClick: () => setCancelDialog({ open: true, itemId: activeItems.map(i => i.id).join(","), itemName: `${bundle.project_name} — ${activeItems.length} položek`, itemCode: null, hours: activeItems.reduce((s, i) => s + i.scheduled_hours, 0), projectName: bundle.project_name, projectId, splitGroupId: null, cancelAll: true }) });
    }
    if (actions.length > 0) setContextMenu({ x: e.clientX, y: e.clientY, actions });
  }, [scheduleData, weeks, getBundleForWeek, returnBundleToInbox, returnToProduction, mergeSplitItems, handleReleaseItem, onNavigateToTPV, onOpenProjectDetail]);

  // Context menu: scheduled item in week cell (matching Kanban DraggableSiloItem)
  const handleScheduleItemContextMenu = useCallback((e: React.MouseEvent, scheduleItemId: string, weekKey: string, projectId: string) => {
    e.preventDefault(); e.stopPropagation();
    const bundle = getBundleForWeek(projectId, weekKey);
    if (!bundle) return;
    const item = bundle.items.find(i => i.id === scheduleItemId);
    if (!item) return;
    const week = weeks.find(w => w.key === weekKey);
    const weekNum = week?.weekNum ?? 0;
    const startDate = week?.start ?? new Date();
    const endDate = week?.end ?? new Date();
    const isCompleted = item.status === "completed";
    const isPaused = item.status === "paused";
    const actions: ContextMenuAction[] = [];

    if (isCompleted) {
      if (onNavigateToTPV) actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(item.project_id, item.item_code) });
      if (onOpenProjectDetail) actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(item.project_id) });
      actions.push({ label: "Vrátit do výroby", icon: "↩", dividerBefore: true, onClick: () => returnToProduction(item.id) });
    } else if (isPaused) {
      actions.push({ label: "Uvolnit položku", icon: "▶", onClick: () => handleReleaseItem(item.id) });
      actions.push({ label: "Vrátit do Inboxu", icon: "←", onClick: () => moveItemBackToInbox(item.id) });
    } else {
      actions.push({
        label: "Dokončit → Expedice", icon: "✓",
        onClick: () => setCompletionState({ projectName: bundle.project_name, projectId, weekLabel: `Výroba T${weekNum} · ${formatDateShort(startDate)} – ${formatDateShort(endDate)}`, weekKey, items: bundle.items, preCheckedIds: [item.id] }),
      });
      actions.push({
        label: "Rozdělit položku", icon: "✂",
        onClick: () => setSplitState({ itemId: item.id, itemName: item.item_name, itemCode: item.item_code, totalHours: item.scheduled_hours, projectId: item.project_id, stageId: item.stage_id, scheduledCzk: item.scheduled_czk, source: "schedule", currentWeekKey: weekKey, splitGroupId: item.split_group_id }),
      });
      if (onNavigateToTPV) actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(item.project_id, item.item_code) });
      if (onOpenProjectDetail) actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(item.project_id) });
      actions.push({ label: "Vrátit do Inboxu", icon: "←", onClick: () => moveItemBackToInbox(item.id) });
      actions.push({ label: "Pozastavit", icon: "⏸", onClick: () => setPauseState({ itemId: item.id, itemName: item.item_name, itemCode: item.item_code, source: "schedule" }) });
      if (item.split_group_id) {
        const sameWeekSiblings = findSameWeekSiblings(item, weekKey);
        if (sameWeekSiblings.length > 0) actions.push({ label: `Spojit s ostatními v T${weekNum}`, icon: "🔗", onClick: () => mergeSplitItems(item.split_group_id!) });
        actions.push({ label: "Spojit všechny části", icon: "🔗", onClick: () => mergeSplitItems(item.split_group_id!) });
      }
    }
    actions.push({ label: "Zrušit položku", icon: "✕", danger: true, dividerBefore: true, onClick: () => setCancelDialog({ open: true, itemId: item.id, itemName: item.item_name, itemCode: item.item_code, hours: item.scheduled_hours, projectName: bundle.project_name, projectId: item.project_id, splitGroupId: item.split_group_id }) });
    if (item.split_group_id) {
      actions.push({ label: "Zrušit všechny části", icon: "✕", danger: true, onClick: () => setCancelDialog({ open: true, itemId: item.id, itemName: item.item_name, itemCode: item.item_code, hours: item.scheduled_hours, projectName: bundle.project_name, projectId: item.project_id, splitGroupId: item.split_group_id, cancelAll: true }) });
    }
    setContextMenu({ x: e.clientX, y: e.clientY, actions });
  }, [scheduleData, weeks, getBundleForWeek, moveItemBackToInbox, returnToProduction, mergeSplitItems, findSameWeekSiblings, handleReleaseItem, onNavigateToTPV, onOpenProjectDetail]);

  // Context menu: inbox project header
  const handleInboxProjectContextMenu = useCallback((e: React.MouseEvent, proj: ProjectRow) => {
    e.preventDefault(); e.stopPropagation();
    const inbox = inboxByProject.get(proj.projectId);
    const actions: ContextMenuAction[] = [];
    if (inbox && inbox.totalHours > 0) {
      const planItems: PlanningItem[] = inbox.items.map(i => ({ id: i.id, item_name: i.name, item_code: i.code, estimated_hours: i.hours, estimated_czk: i.czk, stage_id: i.stageId }));
      actions.push({ label: "Naplánovat výrobu…", icon: "📅", onClick: () => setPlanningState({ projectId: proj.projectId, projectName: proj.projectName, items: planItems }) });
    }
    if (onNavigateToTPV) actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(proj.projectId) });
    if (onOpenProjectDetail) actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(proj.projectId) });
    if (actions.length > 0) setContextMenu({ x: e.clientX, y: e.clientY, actions });
  }, [inboxByProject, onNavigateToTPV, onOpenProjectDetail]);

  // Context menu: inbox cell item
  const handleInboxItemContextMenu = useCallback((e: React.MouseEvent, item: ItemRow) => {
    e.preventDefault(); e.stopPropagation();
    if (item.inboxItemIds.length === 0) return;
    const actions: ContextMenuAction[] = [];
    const planItems: PlanningItem[] = item.inboxItemIds.map(() => ({ id: item.inboxItemIds[0], item_name: item.itemName, item_code: item.itemCode, estimated_hours: item.inboxHours / item.inboxItemIds.length, estimated_czk: item.inboxCzk / item.inboxItemIds.length, stage_id: item.stageId }));
    actions.push({ label: "Naplánovat…", icon: "📅", onClick: () => setPlanningState({ projectId: item.projectId, projectName: item.projectName, items: planItems.map((p, i) => ({ ...p, id: item.inboxItemIds[i] })) }) });
    if (onNavigateToTPV) actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(item.projectId) });
    if (onOpenProjectDetail) actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(item.projectId) });
    if (actions.length > 0) setContextMenu({ x: e.clientX, y: e.clientY, actions });
  }, [onNavigateToTPV, onOpenProjectDetail]);

  // Context menu: expedice cell item
  const handleExpediceItemContextMenu = useCallback((e: React.MouseEvent, projectId: string, itemName?: string) => {
    e.preventDefault(); e.stopPropagation();
    const actions: ContextMenuAction[] = [];
    if (onNavigateToTPV) actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(projectId) });
    if (onOpenProjectDetail) actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(projectId) });
    const expGroup = expediceData?.find(g => g.project_id === projectId);
    if (expGroup) {
      const expItems = itemName ? expGroup.items.filter(i => cleanSplitName(i.item_name) === itemName) : expGroup.items;
      if (expItems.length > 0) {
        actions.push({ label: "Vrátit do výroby", icon: "↩", dividerBefore: true, onClick: async () => { for (const i of expItems) await returnToProduction(i.id); toast({ title: `↩ ${expItems.length} položek vráceno do výroby` }); } });
        actions.push({ label: "Zrušit", icon: "✕", danger: true, onClick: () => setCancelDialog({ open: true, itemId: expItems.map(i => i.id).join(","), itemName: itemName || projectId, itemCode: null, hours: expItems.reduce((s, i) => s + i.scheduled_hours, 0), projectName: expGroup.project_name, projectId, splitGroupId: null, cancelAll: expItems.length > 1 }) });
      }
    }
    if (actions.length > 0) setContextMenu({ x: e.clientX, y: e.clientY, actions });
  }, [expediceData, returnToProduction, onNavigateToTPV, onOpenProjectDetail]);

  // Context menu: project header row
  const handleProjectContextMenu = useCallback((e: React.MouseEvent, proj: ProjectRow) => {
    e.preventDefault(); e.stopPropagation();
    const actions: ContextMenuAction[] = [];
    const inbox = inboxByProject.get(proj.projectId);
    if (inbox && inbox.totalHours > 0) {
      const planItems: PlanningItem[] = inbox.items.map(i => ({ id: i.id, item_name: i.name, item_code: i.code, estimated_hours: i.hours, estimated_czk: i.czk, stage_id: i.stageId }));
      actions.push({ label: "Naplánovat výrobu…", icon: "📅", onClick: () => setPlanningState({ projectId: proj.projectId, projectName: proj.projectName, items: planItems }) });
    }
    if (onNavigateToTPV) actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(proj.projectId) });
    if (onOpenProjectDetail) actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(proj.projectId) });
    if (actions.length > 0) setContextMenu({ x: e.clientX, y: e.clientY, actions });
  }, [inboxByProject, onNavigateToTPV, onOpenProjectDetail]);

  // Context menu: item left-column cell (enriched)
  const handleItemContextMenu = useCallback((e: React.MouseEvent, item: ItemRow) => {
    e.preventDefault(); e.stopPropagation();
    const allIds = [...item.weekAllocations.values()].flatMap(a => a.scheduleItemIds);
    const actions: ContextMenuAction[] = [];

    if (item.weekAllocations.size > 0) {
      actions.push({ label: "Dokončit → Expedice", icon: "✓", onClick: () => handleComplete(allIds) });
      actions.push({
        label: "Přesunout do týdne…", icon: "➡️",
        onClick: () => {
          const weekActions: ContextMenuAction[] = moveTargetWeeks.map(tw => ({ label: tw.label, icon: "📅", onClick: () => handleMoveToWeek(allIds, tw.key) }));
          setContextMenu({ x: e.clientX, y: e.clientY, actions: weekActions });
        },
      });
      actions.push({ label: "Vrátit do Inboxu", icon: "📥", onClick: () => handleReturnToInbox(allIds) });
      if (onNavigateToTPV) actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(item.projectId) });
      if (onOpenProjectDetail) actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(item.projectId) });
      actions.push({
        label: "Zrušit", icon: "✕", danger: true, dividerBefore: true,
        onClick: () => setCancelDialog({ open: true, itemId: allIds[0], itemName: item.itemName, itemCode: item.itemCode, hours: item.totalHours, projectName: item.projectName, projectId: item.projectId }),
      });
    } else if (item.inboxHours > 0 && item.inboxItemIds.length > 0) {
      handleInboxItemContextMenu(e, item);
      return;
    }

    if (actions.length > 0) setContextMenu({ x: e.clientX, y: e.clientY, actions });
  }, [moveTargetWeeks, handleMoveToWeek, handleReturnToInbox, handleComplete, handleInboxItemContextMenu, onNavigateToTPV, onOpenProjectDetail]);

  // Context menu: week cell
  const handleWeekCellContextMenu = useCallback((e: React.MouseEvent, ids: string[], alloc: { hours: number; czk: number; status: string; splitPart?: number; splitTotal?: number }, item: ItemRow) => {
    e.preventDefault(); e.stopPropagation();
    // Find the weekKey from alloc
    let weekKey = "";
    for (const [wk, a] of item.weekAllocations) {
      if (a.scheduleItemIds.some(id => ids.includes(id))) { weekKey = wk; break; }
    }
    // Delegate to full schedule item context menu if we have the data
    if (weekKey && ids.length === 1) {
      handleScheduleItemContextMenu(e, ids[0], weekKey, item.projectId);
      return;
    }
    // Fallback for multi-id cells
    const actions: ContextMenuAction[] = [];
    actions.push({
      label: "Přesunout do týdne…", icon: "➡️",
      onClick: () => {
        const weekActions: ContextMenuAction[] = moveTargetWeeks.map(tw => ({ label: tw.label, icon: "📅", onClick: () => handleMoveToWeek(ids, tw.key) }));
        setContextMenu({ x: e.clientX, y: e.clientY, actions: weekActions });
      },
    });
    actions.push({ label: "Vrátit do Inboxu", icon: "📥", onClick: () => handleReturnToInbox(ids) });
    if (alloc.status !== "completed") {
      actions.push({ label: "Dokončit → Expedice", icon: "✓", onClick: () => handleComplete(ids) });
    }
    if (onNavigateToTPV) actions.push({ label: "Zobrazit položky", icon: "📦", dividerBefore: true, onClick: () => onNavigateToTPV(item.projectId) });
    if (onOpenProjectDetail) actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(item.projectId) });
    actions.push({
      label: "Zrušit", icon: "✕", danger: true, dividerBefore: true,
      onClick: () => setCancelDialog({ open: true, itemId: ids[0], itemName: item.itemName, itemCode: item.itemCode, hours: alloc.hours, projectName: item.projectName, projectId: item.projectId }),
    });
    setContextMenu({ x: e.clientX, y: e.clientY, actions });
  }, [moveTargetWeeks, handleMoveToWeek, handleReturnToInbox, handleComplete, handleScheduleItemContextMenu, onNavigateToTPV, onOpenProjectDetail]);

  // Drag & Drop handler
  const handleTableDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as { itemIds: string[]; fromWeek: string } | undefined;
    const overData = over.data.current as { weekKey: string } | undefined;
    if (!activeData || !overData) return;
    if (activeData.fromWeek !== overData.weekKey) {
      await handleMoveToWeek(activeData.itemIds, overData.weekKey);
    }
  }, [handleMoveToWeek]);

  const hasAnyInbox = true;
  const hasAnyExpedice = true;

  return (
    <DndContext onDragEnd={handleTableDragEnd} collisionDetection={closestCenter}>
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Toolbar */}
      <div className="px-3 py-[6px] flex items-center justify-between shrink-0 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium text-muted-foreground">
            {totalProjects} projektů · {totalItems} položek
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-medium text-muted-foreground">Řadit:</span>
            {(["project", "deadline", "hours"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`px-2 py-[2px] text-[9px] font-medium rounded transition-colors ${
                  sortMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground border border-border"
                }`}
              >
                {mode === "project" ? "Projekt" : mode === "deadline" ? "Termín" : "Hodiny"}
              </button>
            ))}
          </div>
        </div>
        <div ref={exportRef} className="relative">
          <button
            onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
            className="flex items-center gap-1 px-2 py-[3px] text-[10px] font-medium rounded bg-card text-muted-foreground border border-border transition-colors hover:bg-accent"
          >
            <Download className="h-3 w-3" />
            Export
            <ChevronDown className="h-2.5 w-2.5 opacity-50" />
          </button>
          {exportDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 z-50 w-44 bg-popover rounded-lg shadow-lg border border-border py-1">
              <button
                onClick={handleExcelExport}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-popover-foreground hover:bg-muted transition-colors text-left"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />
                Export do Excelu
              </button>
              <button
                onClick={handlePdfExport}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-popover-foreground hover:bg-muted transition-colors text-left"
              >
                <FileText className="h-3.5 w-3.5 text-red-500" />
                Export do PDF
              </button>
            </div>
          )}
        </div>
      </div>


      {/* Table */}
      <div className="flex-1 overflow-auto bg-muted/30" ref={scrollRef} style={{ padding: "0 0 8px 0" }}>
        <div className="min-w-max">
          {/* Header row */}
          <div className="flex sticky top-0 z-30" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div className="shrink-0 sticky left-0 z-40 border-r border-b border-border bg-card flex items-end" style={{ width: LEFT_COL_W }}>
              <div className="px-3 pb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Projekt / Položka
              </div>
            </div>
            {hasAnyInbox && (
              <div
                className="shrink-0 px-2 py-2 border-b border-r border-border/50 sticky z-40 flex flex-col items-center justify-center"
                style={{ width: INBOX_W, left: LEFT_COL_W, backgroundColor: "#fff7ed" }}
              >
                <div className="text-sm font-semibold" style={{ color: "#EA580C" }}>📥 Inbox</div>
                {(() => {
                  const totalInboxH = filteredRows.reduce((s, p) => s + p.inboxTotalHours, 0);
                  return totalInboxH > 0 ? (
                    <div className="text-[10px] font-sans font-bold mt-0.5" style={{ color: "#EA580C" }}>
                      {Math.round(totalInboxH).toLocaleString("cs-CZ")}h
                    </div>
                  ) : null;
                })()}
              </div>
            )}
            {weeks.map(week => {
              const used = weekCapacities.get(week.key) ?? 0;
              const cap = getWeekCapacity(week.key);
              const pct = cap > 0 ? (used / cap) * 100 : 0;
              const isPast = week.end < new Date();
              const isOverloaded = pct > 120;
              const isWarning = pct > 100 && pct <= 120;
              const barColor = isPast ? "#b0bab8" : isOverloaded ? "#dc3545" : isWarning ? "#d97706" : "#3a8a36";
              const barBg = isPast ? "linear-gradient(90deg, #d0d7d5, #b0bab8)"
                : isOverloaded ? "linear-gradient(90deg, #fca5a5, #dc3545)"
                : isWarning ? "linear-gradient(90deg, #fcd34d, #d97706)"
                : "linear-gradient(90deg, #a7d9a2, #3a8a36)";
              const borderColor = isPast ? "#b0bab8" : isOverloaded ? "rgba(220,53,69,0.4)" : isWarning ? "#d97706" : "#4ADE80";
              return (
                <div
                  key={week.key}
                  className="shrink-0 text-center px-2 py-2 border-r border-border/50 bg-card"
                  style={{
                    width: CELL_W,
                    backgroundColor: week.isCurrent ? "hsl(142 76% 97%)" : undefined,
                    borderBottom: `2px solid ${borderColor}`,
                    opacity: isPast ? 0.6 : 1,
                  }}
                >
                  {/* Week number */}
                  <div className="font-semibold text-base text-foreground leading-tight">
                    T{week.weekNum}{week.isCurrent && <span className="ml-0.5" style={{ color: "#3a8a36" }}>•</span>}
                  </div>
                  {/* Date range */}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatDateShort(week.start)} – {formatDateShort(week.end)}
                  </div>
                  {/* Capacity bar — matching Kanban WeeklySilos */}
                  <div className="relative w-full rounded overflow-hidden my-1" style={{ height: '7px', backgroundColor: '#f0eee9' }}>
                    <div
                      className="h-full rounded transition-all duration-300"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        background: barBg,
                      }}
                    />
                  </div>
                  {/* Hours row */}
                  <div className="flex items-center justify-between mt-[3px] font-sans text-[9px]">
                    <div>
                      <span className="font-bold" style={{ color: barColor }}>{Math.round(used)}h</span>
                      <span className="text-muted-foreground"> / {cap}h</span>
                    </div>
                    <span className="font-bold" style={{ color: barColor }}>{cap > 0 ? Math.round(pct) : 0}%</span>
                  </div>
                </div>
              );
            })}
            {hasAnyExpedice && (
              <div
                className="shrink-0 px-2 py-2 border-b border-l border-border/50 sticky right-0 z-40 flex flex-col items-center justify-center"
                style={{ width: EXPEDICE_W, backgroundColor: "#f0fdf4" }}
              >
                <div className="text-sm font-semibold" style={{ color: "#16A34A" }}>📦 Expedice</div>
              </div>
            )}
          </div>

          {/* Project rows */}
          <div className="flex flex-col" style={{ gap: 6, paddingTop: 6 }}>
            {(() => {
              const regular = filteredRows.filter(r => !r.isBlockerOnly);
              const blockers = filteredRows.filter(r => r.isBlockerOnly);
              const combined = [...regular];
              if (blockers.length > 0) {
                combined.push({ __separator: true, count: blockers.length } as any);
                combined.push(...blockers);
              }
              return combined;
            })().map((proj: any) => {
              if (proj.__separator) {
                return (
                  <div key="blocker-separator" className="flex items-center gap-2 mt-3 mb-1 px-2">
                    <div className="flex-1 h-px" style={{ backgroundColor: "#e2ddd6" }} />
                    <span className="px-2 whitespace-nowrap" style={{ fontSize: 11, color: "#6b7280" }}>
                      ⏳ Rezerva kapacit ({proj.count})
                    </span>
                    <div className="flex-1 h-px" style={{ backgroundColor: "#e2ddd6" }} />
                  </div>
                );
              }
              const isExpanded = expandedProjects.has(proj.projectId);
              const isOverdueProject = (() => {
                const pd = projectDateLookup.get(proj.projectId);
                if (!pd) return false;

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const expediceDate = pd?.expedice ? parseAppDate(pd.expedice) : null;
                if (expediceDate) {
                  const exp = new Date(expediceDate);
                  exp.setHours(0, 0, 0, 0);
                  if (exp < today) return true;
                }

                const deadline = resolveDeadline({
                  expedice: pd?.expedice ?? null,
                  montaz: pd?.montaz ?? null,
                  datum_smluvni: pd?.datum_smluvni ?? null,
                });
                if (!deadline) return false;
                const dl = new Date(deadline.date);
                dl.setHours(0, 0, 0, 0);
                return dl < today;
              })();
              return (
                <div key={proj.projectId} style={{ marginLeft: 4, marginRight: 4 }}>
                  {/* Project header row */}
                  <div
                    className="flex cursor-pointer transition-all"
                    onClick={() => toggleProject(proj.projectId)}
                    onContextMenu={(e) => handleProjectContextMenu(e, proj)}
                    style={{ height: 48, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
                  >
                    <div
                      className="shrink-0 flex items-center gap-2.5 px-3 sticky left-0 z-20"
                      style={{
                        width: LEFT_COL_W,
                        backgroundColor: isOverdueProject ? "hsl(0 75% 93%)" : "#fff",
                        borderLeft: `4px solid ${isOverdueProject ? "hsl(0 70% 50%)" : proj.color}`,
                        borderRight: `1px solid ${isOverdueProject ? "hsl(0 60% 82%)" : "#e5e2dd"}`,
                        borderTop: `1px solid ${isOverdueProject ? "hsl(0 60% 82%)" : "#e5e2dd"}`,
                        borderBottom: `1px solid ${isOverdueProject ? "hsl(0 60% 82%)" : "#e5e2dd"}`,
                        borderRadius: "6px 0 0 6px",
                      }}
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: proj.color }} />
                        : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: proj.items.length > 0 ? "#ea580c" : "#99a5a3" }} />
                      }
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] truncate leading-tight" style={{
                          color: (proj.items.length > 0 && proj.items.every(i => i.expediceHours > 0)) ? "#9ca3af" : "#1a1a1a",
                          fontWeight: (proj.items.length > 0 && proj.items.every(i => i.expediceHours > 0)) ? 400 : 500,
                        }}>{proj.projectName}</div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground font-sans leading-tight">{proj.projectId}</span>
                          {(() => {
                            const pd = projectDateLookup.get(proj.projectId);
                            if (!pd) return null;
                            const allShipped = proj.items.length > 0 && proj.items.every(i => i.expediceHours > 0);
                            const isProjectDone = terminalStatuses.has(pd?.status ?? "");
                            const fields: { label: string; value: string | null | undefined }[] = [
                              { label: "Exp", value: pd.expedice },
                              { label: "Mnt", value: pd.montaz },
                              { label: "Před", value: pd.predani },
                              { label: "Sml", value: pd.datum_smluvni },
                            ];
                            for (const f of fields) {
                              if (!f.value) continue;
                              const parsed = parseAppDate(f.value);
                              if (!parsed) continue;
                              const fmtD = (d: Date) => `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getFullYear()).slice(-2)}`;
                              const days = differenceInDays(parsed, new Date());
                              const clr = !allShipped && !isProjectDone && days < 0 ? "#dc2626" : !allShipped && !isProjectDone && days <= 14 ? "#d97706" : "#7aa8a4";
                              return (
                                <span className="text-[10px] truncate" style={{ color: clr }}>
                                  · {f.label}: {fmtD(parsed)}
                                </span>
                              );
                            }
                            if (!allShipped && !isProjectDone) {
                              return (
                                <span className="text-[8px] font-bold px-1 py-[1px] rounded shrink-0" style={{ backgroundColor: "rgba(217,119,6,0.1)", color: "#D97706" }}>
                                  ⚠ BEZ TERMÍNU
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                      {/* Inline deadline warning */}
                      {(() => {
                        const pd = projectDateLookup.get(proj.projectId);
                        const exp = pd?.expedice ? parseAppDate(pd.expedice) : null;
                        if (!exp) return null;
                        const isProjectDone = terminalStatuses.has(pd?.status ?? "");
                        const allItemsDone = proj.items.length > 0 && proj.items.every(i => i.expediceHours > 0);
                        if (isProjectDone || allItemsDone) return null;
                        const days = differenceInDays(exp, new Date());
                        if (days >= 0 && days > 3) return null;
                        const warnColor = days < 0 ? "#dc3545" : "#d97706";
                        const tooltipText = days < 0
                          ? `Expedice ${format(exp, "dd.MM.yyyy")} — po termínu o ${Math.abs(days)} dní`
                          : `Expedice za ${days} dní (${format(exp, "dd.MM.yyyy")})`;
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle size={14} style={{ color: warnColor }} className="shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="z-[9999] text-xs">{tooltipText}</TooltipContent>
                          </Tooltip>
                        );
                      })()}
                      <div
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-sans font-bold"
                        style={{ backgroundColor: proj.color + "18", color: proj.color }}
                      >
                        {formatProjectTotal(proj)}
                      </div>
                    </div>
                    {/* Inbox cell */}
                    {hasAnyInbox && (
                      <div
                        className="shrink-0 flex items-center justify-center px-1.5 sticky z-20"
                        onContextMenu={(e) => { if (proj.inboxTotalHours > 0) { e.stopPropagation(); handleInboxProjectContextMenu(e, proj); } }}
                        style={{ width: INBOX_W, left: LEFT_COL_W, backgroundColor: "#fff", borderTop: "1px solid #e5e2dd", borderBottom: "1px solid #e5e2dd" }}
                      >
                        {proj.inboxTotalHours > 0 && (
                          <div className="rounded-md px-2 py-0.5 text-center text-[10px] font-sans font-bold" style={{ backgroundColor: "#ffedd5", color: "#c2410c" }}>
                            {formatInboxValue(proj.inboxTotalHours, proj.inboxTotalCzk, proj.totalHours, proj.projectId)}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Week cells */}
                    {weeks.map(week => {
                      const wt = proj.weekTotals.get(week.key);
                      return (
                        <div
                          key={week.key}
                          className="shrink-0 flex items-center justify-center px-1.5"
                          onContextMenu={(e) => { if (wt && wt.hours > 0) { e.stopPropagation(); handleBundleContextMenu(e, proj.projectId, week.key, false); } }}
                          style={{
                            width: CELL_W,
                            backgroundColor: week.isCurrent ? "hsl(142 76% 97%)" : "#fff",
                            borderTop: "1px solid #e5e2dd",
                            borderBottom: "1px solid #e5e2dd",
                          }}
                        >
                          {!isExpanded && wt && wt.hours > 0 && (() => {
                            const cellStyle = getCollapsedCellStyle(proj, week.key);
                            return (
                              <div
                                className="w-full rounded px-1 py-0.5 text-center text-[9px] font-sans font-bold"
                                style={{ backgroundColor: cellStyle.bg, color: cellStyle.text, border: `1px solid ${cellStyle.border}` }}
                              >
                                {formatWeekTotal(wt.hours, wt.czk, week.key, proj.projectId)}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                    {/* Expedice cell */}
                    {hasAnyExpedice && (
                      <div
                        className="shrink-0 flex items-center justify-center px-1.5 sticky right-0 z-20"
                        onContextMenu={(e) => { if (proj.expediceTotalHours > 0) { e.stopPropagation(); handleExpediceItemContextMenu(e, proj.projectId); } }}
                        style={{
                          width: EXPEDICE_W,
                          backgroundColor: "#fff",
                          borderTop: "1px solid #e5e2dd",
                          borderBottom: "1px solid #e5e2dd",
                          borderRight: "1px solid #e5e2dd",
                          borderRadius: "0 6px 6px 0",
                        }}
                      >
                        {proj.expediceTotalHours > 0 && (
                          <div className="rounded-md px-2 py-0.5 text-center text-[10px] font-sans font-bold" style={{ backgroundColor: "#dcfce7", color: "#15803d" }}>
                            ✓ {formatExpediceValue(proj.expediceTotalHours, proj.expediceTotalCzk, proj.totalHours, proj.projectId)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Item rows — only when expanded */}
                  {isExpanded && (() => {
                    // Sort: active items first, completed items last
                    const activeItems = proj.items.filter(i => {
                      const hasOnlyExpedice = i.expediceHours > 0 && i.weekAllocations.size === 0 && i.inboxHours === 0;
                      const allCompleted = [...i.weekAllocations.values()].every(a => a.status === "completed");
                      return !hasOnlyExpedice && !allCompleted;
                    });
                    const completedItems = proj.items.filter(i => !activeItems.includes(i));
                    const sortedItems = [...activeItems, ...completedItems];
                    const firstCompletedIdx = activeItems.length;
                    return (
                    <div>
                      {sortedItems.map((item, idx) => {
                        const isCompletedItem = idx >= firstCompletedIdx;
                        const isFirstCompleted = idx === firstCompletedIdx && completedItems.length > 0;
                        return (
                        <div key={item.id}>
                          {isFirstCompleted && (
                            <div className="flex items-center gap-1.5 px-3 py-1" style={{ backgroundColor: "#fafaf8" }}>
                              <div className="flex-1 h-px" style={{ backgroundColor: "#e2ddd6" }} />
                              <span className="text-[8px] font-medium" style={{ color: "#b0bab8" }}>Dokončeno</span>
                              <div className="flex-1 h-px" style={{ backgroundColor: "#e2ddd6" }} />
                            </div>
                          )}
                          <div
                            className="flex"
                            style={{
                              height: 32,
                              borderBottom: idx < sortedItems.length - 1 ? "1px solid #f5f3f0" : undefined,
                              opacity: isCompletedItem ? 0.5 : 1,
                            }}
                          >
                          <div
                            className="shrink-0 flex items-center gap-2 pr-2 sticky left-0 z-20"
                            onContextMenu={(e) => handleItemContextMenu(e, item)}
                            style={{
                              width: LEFT_COL_W,
                              backgroundColor: "#fff",
                              borderRight: "1px solid #e5e2dd",
                              paddingLeft: 28,
                              borderLeft: "2px dashed #e5e2dd",
                            }}
                          >
                            {item.itemCode && (
                              <span className="font-sans font-bold text-[11px] shrink-0" style={{ color: "#223937" }}>{item.itemCode}</span>
                            )}
                            <span className="text-[12px] truncate text-foreground">{item.itemName}</span>
                            <span className="text-[10px] font-sans shrink-0 ml-auto" style={{ color: "#99a5a3" }}>{formatItemTotal(item, item.projectId)}</span>
                          </div>
                          {/* Inbox cell */}
                          {hasAnyInbox && (
                            <div
                              className="shrink-0 flex items-center justify-center px-1 sticky z-20"
                              onContextMenu={(e) => { if (item.inboxHours > 0) { e.stopPropagation(); handleInboxItemContextMenu(e, item); } }}
                              style={{ width: INBOX_W, left: LEFT_COL_W, backgroundColor: "#fff" }}
                            >
                              {item.inboxHours > 0 && (
                                <div className="rounded-md px-2 py-0.5 text-center text-[9px] font-sans font-semibold" style={{ backgroundColor: "#ffedd5", color: "#c2410c" }}>
                                  {formatInboxValue(item.inboxHours, item.inboxCzk, item.totalHours, item.projectId)}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Week cells — interactive + droppable */}
                          {weeks.map(week => {
                            const alloc = item.weekAllocations.get(week.key);
                            if (alloc) {
                              return (
                                <DroppableWeekCell key={week.key} droppableId={`${week.key}-${item.id}`} weekKey={week.key} isCurrent={week.isCurrent}>
                                  <FilledWeekCell
                                    weekKey={week.key}
                                    isCurrent={week.isCurrent}
                                    alloc={alloc}
                                    item={item}
                                    displayMode={displayMode}
                                    formatCellValue={formatCellValue}
                                    getCellStyle={(status: string) => getCellStyle(status, getProjectColor(item.projectId))}
                                    projectColor={getProjectColor(item.projectId)}
                                    moveTargetWeeks={moveTargetWeeks}
                                    getWeekCapacity={getWeekCapacity}
                                    weekCapacities={weekCapacities}
                                    onMoveToWeek={handleMoveToWeek}
                                    onReturnToInbox={handleReturnToInbox}
                                    onComplete={handleComplete}
                                    onCancel={(ids) => {
                                      setCancelDialog({
                                        open: true,
                                        itemId: ids[0],
                                        itemName: item.itemName,
                                        itemCode: item.itemCode,
                                        hours: alloc.hours,
                                        projectName: item.projectName,
                                        projectId: item.projectId,
                                      });
                                    }}
                                    onContextMenu={handleWeekCellContextMenu}
                                  />
                                </DroppableWeekCell>
                              );
                            }
                            return (
                              <DroppableWeekCell key={week.key} droppableId={`${week.key}-${item.id}`} weekKey={week.key} isCurrent={week.isCurrent}>
                                <EmptyWeekCell
                                  weekKey={week.key}
                                  isCurrent={week.isCurrent}
                                  item={item}
                                  onSchedule={handleScheduleFromInbox}
                                />
                              </DroppableWeekCell>
                            );
                          })}
                          {/* Expedice cell */}
                          {hasAnyExpedice && (
                            <div
                              className="shrink-0 flex items-center justify-center px-1 sticky right-0 z-20"
                              onContextMenu={(e) => { if (item.expediceHours > 0) { e.stopPropagation(); handleExpediceItemContextMenu(e, item.projectId, item.itemName); } }}
                              style={{ width: EXPEDICE_W, backgroundColor: "#f0fdf4" }}
                            >
                              {item.expediceHours > 0 && (
                                <div
                                  className="rounded-md px-2 py-0.5 text-center text-[9px] font-sans font-semibold"
                                  style={{ backgroundColor: "#dcfce7", color: "#15803d" }}
                                >
                                  ✓ {formatExpediceValue(item.expediceHours, item.expediceCzk, item.totalHours, item.projectId)}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        </div>
                        );
                      })}
                    </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          {filteredRows.length === 0 && (
            <div className="px-6 py-12 text-center text-[12px] text-muted-foreground">
              Žádné položky v plánu výroby
            </div>
          )}
        </div>
      </div>

      {/* Legend footer */}
      <div className="shrink-0 border-t border-border bg-card flex items-center justify-center gap-5" style={{ height: 32 }}>
        {[
          { label: "Inbox", bg: STATUS_COLORS.inbox.bg, border: STATUS_COLORS.inbox.border },
          { label: "Naplánováno", bg: STATUS_COLORS.scheduled.bg, border: STATUS_COLORS.scheduled.border },
          { label: "Ve výrobě", bg: STATUS_COLORS.in_progress.bg, border: STATUS_COLORS.in_progress.border },
          { label: "✓ Dokončeno", bg: STATUS_COLORS.completed.bg, border: STATUS_COLORS.completed.border },
          { label: "⏸ Pozastaveno", bg: STATUS_COLORS.paused.bg, border: STATUS_COLORS.paused.border },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="rounded-full" style={{ width: 8, height: 8, backgroundColor: l.border }} />
            <span className="text-[10px] font-medium text-muted-foreground">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Cancel dialog */}
      {cancelDialog && (
        <CancelItemDialog
          open={cancelDialog.open}
          onOpenChange={(open) => { if (!open) setCancelDialog(null); }}
          itemId={cancelDialog.itemId}
          itemName={cancelDialog.itemName}
          itemCode={cancelDialog.itemCode}
          hours={cancelDialog.hours}
          projectName={cancelDialog.projectName}
          projectId={cancelDialog.projectId}
          source="schedule"
          splitGroupId={cancelDialog.splitGroupId}
          cancelAll={cancelDialog.cancelAll}
        />
      )}

      {/* Completion dialog */}
      {completionState && (
        <CompletionDialog open={!!completionState} onOpenChange={open => !open && setCompletionState(null)} {...completionState} hourlyRate={hourlyRate} />
      )}

      {/* Split item dialog */}
      {splitState && (
        <SplitItemDialog open={!!splitState} onOpenChange={open => !open && setSplitState(null)} {...splitState} itemCode={splitState.itemCode} weeks={splitWeekOptions} weeklyCapacity={weeklyCapacity} splitGroupId={splitState.splitGroupId} />
      )}

      {/* Bundle split dialog */}
      {bundleSplitState && (
        <SplitBundleDialog open={!!bundleSplitState} onOpenChange={open => !open && setBundleSplitState(null)} bundleName={bundleSplitState.bundleName} currentWeekKey={bundleSplitState.currentWeekKey} items={bundleSplitState.items} weeks={splitWeekOptions} />
      )}

      {/* Pause dialog */}
      {pauseState && (
        <PauseItemDialog open={!!pauseState} onOpenChange={open => !open && setPauseState(null)} {...pauseState} itemCode={pauseState.itemCode} />
      )}

      {pdfHtml && (
        <PdfPreviewModal
          html={pdfHtml}
          tabLabel="Plán Výroby"
          onClose={() => setPdfHtml(null)}
        />
      )}
      {/* Context menu */}
      {contextMenu && (
        <ProductionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextMenu.actions}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Planning dialog */}
      {planningState && (
        <InboxPlanningDialog
          open={!!planningState}
          onOpenChange={open => !open && setPlanningState(null)}
          projectId={planningState.projectId}
          projectName={planningState.projectName}
          items={planningState.items}
          weeks={planningWeeks}
          weeklyCapacity={weeklyCapacity}
          onConfirm={handlePlanConfirm}
        />
      )}
    </div>
    </DndContext>
  );
}

/* ─── Droppable week cell wrapper ─── */
function DroppableWeekCell({ droppableId, weekKey, isCurrent, children }: {
  droppableId: string; weekKey: string; isCurrent: boolean; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, data: { weekKey } });
  return (
    <div
      ref={setNodeRef}
      className="shrink-0 flex items-center justify-center px-1 py-0.5"
      style={{
        width: CELL_W,
        backgroundColor: isOver ? "hsl(210 80% 95%)" : isCurrent ? "hsl(142 76% 97%)" : "#fff",
        outline: isOver ? "2px solid hsl(210 80% 60%)" : undefined,
        outlineOffset: -2,
        transition: "background-color 150ms, outline 150ms",
      }}
    >
      {children}
    </div>
  );
}

/* ─── Filled week cell with popover + draggable ─── */
function FilledWeekCell({ weekKey, isCurrent, alloc, item, displayMode, formatCellValue, getCellStyle, projectColor, moveTargetWeeks, getWeekCapacity, weekCapacities, onMoveToWeek, onReturnToInbox, onComplete, onCancel, onContextMenu }: {
  weekKey: string;
  isCurrent: boolean;
  alloc: WeekAlloc;
  item: ItemRow;
  displayMode: DisplayMode;
  formatCellValue: (hours: number, czk: number, status: string, totalItemHours: number, splitPart?: number, splitTotal?: number, projectId?: string) => string;
  getCellStyle: (status: string) => { bg: string; text: string; border: string };
  projectColor?: string;
  moveTargetWeeks: { key: string; weekNum: number; label: string }[];
  getWeekCapacity: (weekKey: string) => number;
  weekCapacities: Map<string, number>;
  onMoveToWeek: (ids: string[], weekKey: string) => Promise<void>;
  onReturnToInbox: (ids: string[]) => Promise<void>;
  onComplete: (ids: string[]) => Promise<void>;
  onCancel: (ids: string[]) => void;
  onContextMenu?: (e: React.MouseEvent, ids: string[], alloc: WeekAlloc, item: ItemRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showMoveList, setShowMoveList] = useState(false);
  const cellStyle = getCellStyle(alloc.status);
  const ids = alloc.scheduleItemIds;

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `drag-${ids[0]}`,
    data: { type: "table-item", itemIds: ids, fromWeek: weekKey },
  });

  const handleAction = async (action: () => Promise<void>) => {
    setOpen(false);
    setShowMoveList(false);
    await action();
  };

  return (
    <div ref={setDragRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.4 : 1, width: "100%" }}>
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowMoveList(false); }}>
        <PopoverTrigger asChild>
          <button
            className="w-full text-center text-[9px] font-sans font-semibold transition-all"
            style={{
              backgroundColor: cellStyle.bg,
              color: cellStyle.text,
              borderRadius: 4,
              padding: "3px 6px",
              border: `1px solid ${cellStyle.border}20`,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(0.93)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
            onContextMenu={(e) => {
              if (onContextMenu) {
                e.preventDefault();
                e.stopPropagation();
                onContextMenu(e, ids, alloc, item);
              }
            }}
          >
            {formatCellValue(alloc.hours, alloc.czk, alloc.status, item.totalHours, alloc.splitPart, alloc.splitTotal, item.projectId)}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-0" align="center" sideOffset={4}>
          {!showMoveList ? (
            <div className="py-1">
              <button
                className="w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 transition-colors hover:bg-accent"
                onClick={() => setShowMoveList(true)}
              >
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                Přesunout do týdne…
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 transition-colors hover:bg-accent"
                onClick={() => handleAction(() => onReturnToInbox(ids))}
              >
                <Inbox className="h-3 w-3 text-muted-foreground" />
                Vrátit do Inboxu
              </button>
              {alloc.status !== "completed" && (
                <button
                  className="w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 transition-colors hover:bg-accent"
                  onClick={() => handleAction(() => onComplete(ids))}
                >
                  <CheckCircle2 className="h-3 w-3" style={{ color: "#059669" }} />
                  Dokončit → Expedice
                </button>
              )}
              <div className="my-1 h-px bg-border" />
              <button
                className="w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 transition-colors hover:bg-destructive/10"
                style={{ color: "hsl(var(--destructive))" }}
                onClick={() => { setOpen(false); onCancel(ids); }}
              >
                <XCircle className="h-3 w-3" />
                Zrušit
              </button>
            </div>
          ) : (
            <div className="py-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Přesunout do týdne
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {moveTargetWeeks.map(tw => {
                  const used = weekCapacities.get(tw.key) ?? 0;
                  const cap = getWeekCapacity(tw.key);
                  const remaining = Math.max(0, cap - used);
                  const isFull = remaining <= 0;
                  return (
                    <button
                      key={tw.key}
                      className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center justify-between transition-colors ${
                        isFull ? "opacity-50" : "hover:bg-accent"
                      }`}
                      onClick={() => handleAction(() => onMoveToWeek(ids, tw.key))}
                    >
                      <span className="font-medium">{tw.label}</span>
                      <span className="font-sans text-[9px] text-muted-foreground">
                        {Math.round(remaining)}h volno
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="my-1 h-px bg-border" />
              <button
                className="w-full text-left px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent"
                onClick={() => setShowMoveList(false)}
              >
                ← Zpět
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ─── Empty week cell with "+" for scheduling from inbox ─── */
function EmptyWeekCell({ weekKey, isCurrent, item, onSchedule }: {
  weekKey: string;
  isCurrent: boolean;
  item: ItemRow;
  onSchedule: (inboxItemId: string, weekKey: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const hasInbox = item.inboxItemIds.length > 0;

  if (!hasInbox) {
    return <div className="w-full" />;
  }

  return (
    <div className="w-full flex items-center justify-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="w-full h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer group"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-0" align="center" sideOffset={4}>
          <div className="py-1">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Naplánovat sem
            </div>
            {item.inboxItemIds.map((inboxId, i) => (
              <button
                key={inboxId}
                className="w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 transition-colors hover:bg-accent"
                onClick={async () => {
                  setOpen(false);
                  await onSchedule(inboxId, weekKey);
                }}
              >
                <Plus className="h-3 w-3 text-muted-foreground" />
                <span className="truncate">
                  {item.inboxItemIds.length > 1 ? `Část ${i + 1} (${Math.round(item.inboxHours / item.inboxItemIds.length)}h)` : `${item.itemName}`}
                </span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
