import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useProductionSchedule, useProductionExpedice, getISOWeekNumber, type ScheduleItem } from "@/hooks/useProductionSchedule";
import { useProductionInbox } from "@/hooks/useProductionInbox";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { useWeekCapacityLookup } from "@/hooks/useWeeklyCapacity";
import { useProjects } from "@/hooks/useProjects";
import { useProductionDragDrop } from "@/hooks/useProductionDragDrop";
import { getProjectColor } from "@/lib/projectColors";
import { exportToExcel } from "@/lib/exportExcel";
import { buildPrintableHtml } from "@/lib/exportPdf";
import { parseAppDate } from "@/lib/dateFormat";
import { format, differenceInDays } from "date-fns";
import { cs } from "date-fns/locale";
import { Download, ChevronRight, ChevronDown, Plus, ArrowRight, Inbox, CheckCircle2, XCircle, FileSpreadsheet, FileText, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getProjectRiskSeverity } from "@/hooks/useRiskHighlight";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { CancelItemDialog } from "./CancelItemDialog";
import { toast } from "@/hooks/use-toast";

type DisplayMode = "hours" | "czk" | "percent";
type SortMode = "project" | "deadline" | "hours";

interface Props {
  displayMode: DisplayMode;
  searchQuery?: string;
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
}

const CELL_W = 132;
const INBOX_W = 100;
const EXPEDICE_W = 100;
const LEFT_COL_W = 280;

export function PlanVyrobyTableView({ displayMode, searchQuery = "" }: Props) {
  const { data: scheduleData } = useProductionSchedule();
  const { data: expediceData } = useProductionExpedice();
  const { data: inboxProjects = [] } = useProductionInbox();
  const { data: settings } = useProductionSettings();
  const { data: allProjects = [] } = useProjects();
  const getWeekCapacity = useWeekCapacityLookup();
  const { moveScheduleItemToWeek, moveItemBackToInbox, completeItems, moveInboxItemToWeek } = useProductionDragDrop();
  const [sortMode, setSortMode] = useState<SortMode>("project");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Cancel dialog state
  const [cancelDialog, setCancelDialog] = useState<{
    open: boolean; itemId: string; itemName: string; itemCode?: string | null;
    hours: number; projectName: string; projectId: string;
    splitGroupId?: string | null;
  } | null>(null);

  const projectDateLookup = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of allProjects) map.set(p.project_id, p);
    return map;
  }, [allProjects]);

  const hourlyRate = settings?.hourly_rate ?? 550;

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

      rows.push({
        projectId: pid, projectName: realName, color: getProjectColor(pid),
        totalHours: visibleItems.reduce((s, i) => s + i.totalHours, 0),
        totalCzk: visibleItems.reduce((s, i) => s + i.totalCzk, 0),
        items: visibleItems, weekTotals,
        inboxTotalHours: inbox?.totalHours ?? 0, inboxTotalCzk: inbox?.totalCzk ?? 0,
        expediceTotalHours: expedice?.totalHours ?? 0, expediceTotalCzk: expedice?.totalCzk ?? 0,
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
      return p.items.some(i => {
        const iName = i.itemName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const iCode = (i.itemCode || "").toLowerCase();
        return iName.includes(q) || iCode.includes(q);
      });
    });
  }, [projectRows, searchQuery]);

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

  const getCellStyle = (status: string) => {
    switch (status) {
      case "completed": return STATUS_COLORS.completed;
      case "in_progress": return STATUS_COLORS.in_progress;
      case "paused": return STATUS_COLORS.paused;
      default: return STATUS_COLORS.scheduled;
    }
  };

  // Bold variant for bundle-level cells (uses border color as bg, white text)
  const getBundleCellStyle = (status: string) => {
    const base = getCellStyle(status);
    return { bg: base.border, text: "#ffffff", border: base.border };
  };

  const formatCellValue = (hours: number, czk: number, status: string, totalItemHours: number, splitPart?: number, splitTotal?: number) => {
    const splitLabel = splitPart && splitTotal
      ? ` ${["½", "²⁄₂", "⅓", "²⁄₃", "¼", "²⁄₄", "¾"][splitPart === 1 && splitTotal === 2 ? 0 : splitPart === 2 && splitTotal === 2 ? 1 : 0] || `${splitPart}/${splitTotal}`}`
      : "";
    const prefix = status === "completed" ? "✓ " : status === "paused" ? "⏸ " : "";
    if (displayMode === "percent") {
      const pct = totalItemHours > 0 ? Math.round((hours / totalItemHours) * 100) : 0;
      return `${prefix}${pct}%${splitLabel}`;
    }
    if (displayMode === "czk") return `${prefix}${formatCzkShort(Math.round(czk))} Kč${splitLabel}`;
    return `${prefix}${Math.round(hours)}h${splitLabel}`;
  };

  const formatCapacity = (used: number, weekKey: string) => {
    const cap = getWeekCapacity(weekKey);
    if (displayMode === "percent") return `${cap > 0 ? Math.round((used / cap) * 100) : 0}%`;
    if (displayMode === "czk") return `${formatCzk(Math.round(used * hourlyRate))}`;
    return `${Math.round(used)}h / ${cap}h`;
  };

  const formatProjectTotal = (row: ProjectRow) => {
    if (displayMode === "czk") return formatCzk(Math.round(row.totalCzk));
    if (displayMode === "percent") {
      const completedItems = row.items.filter(i => i.expediceHours > 0).length;
      const totalItems = row.items.length;
      const completedPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
      return `${completedPct}% hotovo`;
    }
    return `${Math.round(row.totalHours)}h`;
  };

  const formatWeekTotal = (hours: number, czk: number) => {
    if (displayMode === "czk") return `${formatCzkShort(Math.round(czk))} Kč`;
    return `${Math.round(hours)}h`;
  };

  const formatInboxValue = (hours: number, czk: number, totalProjectHours?: number) => {
    if (displayMode === "czk") return `${formatCzkShort(Math.round(czk))} Kč`;
    if (displayMode === "percent" && totalProjectHours && totalProjectHours > 0) return `${Math.round((hours / totalProjectHours) * 100)}%`;
    return `${Math.round(hours)}h`;
  };

  const formatExpediceValue = (hours: number, czk: number, totalProjectHours?: number) => {
    if (displayMode === "czk") return `${formatCzkShort(Math.round(czk))} Kč`;
    if (displayMode === "percent" && totalProjectHours && totalProjectHours > 0) return `${Math.round((hours / totalProjectHours) * 100)}%`;
    return `${Math.round(hours)}h`;
  };

  const formatItemTotal = (item: ItemRow) => {
    if (displayMode === "czk") return formatCzkShort(Math.round(item.totalCzk)) + " Kč";
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

  const buildExportData = useCallback(() => {
    const weekHeaders = weeks.map(w => `T${w.weekNum}`);
    const headers = ["Projekt", "ID projektu", "Položka", "Kód položky", "Celkem hodin", ...weekHeaders, "Expedice"];
    const rows: (string | number)[][] = [];

    const formatVal = (hours: number, czk: number, totalH: number) => {
      if (displayMode === "czk") return Math.round(czk);
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
          row.push(wt ? formatVal(wt.hours, wt.czk, proj.totalHours) : "");
        }
        row.push(proj.expediceTotalHours > 0 ? formatVal(proj.expediceTotalHours, proj.expediceTotalCzk, proj.totalHours) : "");
        rows.push(row);
      } else {
        // Expanded: item rows
        for (const item of proj.items) {
          const row: (string | number)[] = [proj.projectName, proj.projectId, item.itemName, item.itemCode || "", Math.round(item.totalHours)];
          for (const week of weeks) {
            const alloc = item.weekAllocations.get(week.key);
            row.push(alloc ? formatVal(alloc.hours, alloc.czk, item.totalHours) : "");
          }
          row.push(item.expediceHours > 0 ? formatVal(item.expediceHours, item.expediceCzk, item.totalHours) : "");
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

  const hasAnyInbox = true;
  const hasAnyExpedice = true;

  return (
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
                    <div className="text-[10px] font-mono font-bold mt-0.5" style={{ color: "#EA580C" }}>
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
                  <div className="flex items-center justify-between mt-[3px] font-mono text-[9px]">
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
            {filteredRows.map(proj => {
              const isExpanded = expandedProjects.has(proj.projectId);
              return (
                <div key={proj.projectId} style={{ marginLeft: 4, marginRight: 4 }}>
                  {/* Project header row */}
                  <div
                    className="flex cursor-pointer transition-all"
                    onClick={() => toggleProject(proj.projectId)}
                    style={{ height: 48, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
                  >
                    <div
                      className="shrink-0 flex items-center gap-2.5 px-3 sticky left-0 z-20"
                      style={{
                        width: LEFT_COL_W,
                        backgroundColor: "#fff",
                        borderLeft: `4px solid ${proj.color}`,
                        borderRight: "1px solid #e5e2dd",
                        borderTop: "1px solid #e5e2dd",
                        borderBottom: "1px solid #e5e2dd",
                        borderRadius: "6px 0 0 6px",
                      }}
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: proj.color }} />
                        : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: proj.items.length > 0 ? "#ea580c" : "#99a5a3" }} />
                      }
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold truncate text-foreground leading-tight">{proj.projectName}</div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground font-mono leading-tight">{proj.projectId}</span>
                          {(() => {
                            const pd = projectDateLookup.get(proj.projectId);
                            const exp = pd?.expedice ? parseAppDate(pd.expedice) : null;
                            if (!exp) return null;
                            const fmtD = (d: Date) => `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getFullYear()).slice(-2)}`;
                            const days = differenceInDays(exp, new Date());
                            const clr = days < 0 ? "#dc3545" : days <= 3 ? "#d97706" : "#99a5a3";
                            return (
                              <span className="text-[10px] truncate" style={{ color: clr }}>
                                Exp: {fmtD(exp)}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      {/* Inline deadline warning */}
                      {(() => {
                        const pd = projectDateLookup.get(proj.projectId);
                        const exp = pd?.expedice ? parseAppDate(pd.expedice) : null;
                        if (!exp) return null;
                        const isProjectDone = ["Fakturace", "Dokonceno", "Dokončeno", "Expedice"].includes(pd?.status ?? "");
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
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-mono font-bold"
                        style={{ backgroundColor: proj.color + "18", color: proj.color }}
                      >
                        {formatProjectTotal(proj)}
                      </div>
                    </div>
                    {/* Inbox cell */}
                    {hasAnyInbox && (
                      <div
                        className="shrink-0 flex items-center justify-center px-1.5 sticky z-20"
                        style={{ width: INBOX_W, left: LEFT_COL_W, backgroundColor: "#fff", borderTop: "1px solid #e5e2dd", borderBottom: "1px solid #e5e2dd" }}
                      >
                        {proj.inboxTotalHours > 0 && (
                          <div className="rounded-md px-2 py-0.5 text-center text-[10px] font-mono font-bold" style={{ backgroundColor: "#ffedd5", color: "#c2410c" }}>
                            {formatInboxValue(proj.inboxTotalHours, proj.inboxTotalCzk, proj.totalHours)}
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
                          style={{
                            width: CELL_W,
                            backgroundColor: week.isCurrent ? "hsl(142 76% 97%)" : "#fff",
                            borderTop: "1px solid #e5e2dd",
                            borderBottom: "1px solid #e5e2dd",
                          }}
                        >
                          {!isExpanded && wt && wt.hours > 0 && (
                            <div
                              className="w-full rounded px-1 py-0.5 text-center text-[9px] font-mono font-bold"
                              style={{ backgroundColor: proj.color + "18", color: proj.color }}
                            >
                              {formatWeekTotal(wt.hours, wt.czk)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Expedice cell */}
                    {hasAnyExpedice && (
                      <div
                        className="shrink-0 flex items-center justify-center px-1.5 sticky right-0 z-20"
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
                          <div className="rounded-md px-2 py-0.5 text-center text-[10px] font-mono font-bold" style={{ backgroundColor: "#dcfce7", color: "#15803d" }}>
                            ✓ {formatExpediceValue(proj.expediceTotalHours, proj.expediceTotalCzk, proj.totalHours)}
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
                            style={{
                              width: LEFT_COL_W,
                              backgroundColor: "#fff",
                              borderRight: "1px solid #e5e2dd",
                              paddingLeft: 28,
                              borderLeft: "2px dashed #e5e2dd",
                            }}
                          >
                            {item.itemCode && (
                              <span className="font-mono font-bold text-[11px] shrink-0" style={{ color: "#223937" }}>{item.itemCode}</span>
                            )}
                            <span className="text-[12px] truncate text-foreground">{item.itemName}</span>
                            <span className="text-[10px] font-mono shrink-0 ml-auto" style={{ color: "#99a5a3" }}>{formatItemTotal(item)}</span>
                          </div>
                          {/* Inbox cell */}
                          {hasAnyInbox && (
                            <div
                              className="shrink-0 flex items-center justify-center px-1 sticky z-20"
                              style={{ width: INBOX_W, left: LEFT_COL_W, backgroundColor: "#fff" }}
                            >
                              {item.inboxHours > 0 && (
                                <div className="rounded-md px-2 py-0.5 text-center text-[9px] font-mono font-semibold" style={{ backgroundColor: "#ffedd5", color: "#c2410c" }}>
                                  {formatInboxValue(item.inboxHours, item.inboxCzk, item.totalHours)}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Week cells — interactive */}
                          {weeks.map(week => {
                            const alloc = item.weekAllocations.get(week.key);
                            if (alloc) {
                              return (
                                <FilledWeekCell
                                  key={week.key}
                                  weekKey={week.key}
                                  isCurrent={week.isCurrent}
                                  alloc={alloc}
                                  item={item}
                                  displayMode={displayMode}
                                  formatCellValue={formatCellValue}
                                  getCellStyle={getCellStyle}
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
                                />
                              );
                            }
                            // Empty cell — show "+" if item has inbox items
                            return (
                              <EmptyWeekCell
                                key={week.key}
                                weekKey={week.key}
                                isCurrent={week.isCurrent}
                                item={item}
                                onSchedule={handleScheduleFromInbox}
                              />
                            );
                          })}
                          {/* Expedice cell */}
                          {hasAnyExpedice && (
                            <div
                              className="shrink-0 flex items-center justify-center px-1 sticky right-0 z-20"
                              style={{ width: EXPEDICE_W, backgroundColor: "#f0fdf4" }}
                            >
                              {item.expediceHours > 0 && (
                                <div
                                  className="rounded-md px-2 py-0.5 text-center text-[9px] font-mono font-semibold"
                                  style={{ backgroundColor: "#dcfce7", color: "#15803d" }}
                                >
                                  ✓ {formatExpediceValue(item.expediceHours, item.expediceCzk, item.totalHours)}
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
        />
      )}

      {pdfHtml && (
        <PdfPreviewModal
          html={pdfHtml}
          tabLabel="Plán Výroby"
          onClose={() => setPdfHtml(null)}
        />
      )}
    </div>
  );
}

/* ─── Filled week cell with popover ─── */
function FilledWeekCell({ weekKey, isCurrent, alloc, item, displayMode, formatCellValue, getCellStyle, moveTargetWeeks, getWeekCapacity, weekCapacities, onMoveToWeek, onReturnToInbox, onComplete, onCancel }: {
  weekKey: string;
  isCurrent: boolean;
  alloc: WeekAlloc;
  item: ItemRow;
  displayMode: DisplayMode;
  formatCellValue: (hours: number, czk: number, status: string, totalItemHours: number, splitPart?: number, splitTotal?: number) => string;
  getCellStyle: (status: string) => { bg: string; text: string; border: string };
  moveTargetWeeks: { key: string; weekNum: number; label: string }[];
  getWeekCapacity: (weekKey: string) => number;
  weekCapacities: Map<string, number>;
  onMoveToWeek: (ids: string[], weekKey: string) => Promise<void>;
  onReturnToInbox: (ids: string[]) => Promise<void>;
  onComplete: (ids: string[]) => Promise<void>;
  onCancel: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showMoveList, setShowMoveList] = useState(false);
  const cellStyle = getCellStyle(alloc.status);
  const ids = alloc.scheduleItemIds;

  const handleAction = async (action: () => Promise<void>) => {
    setOpen(false);
    setShowMoveList(false);
    await action();
  };

  return (
    <div
      className="shrink-0 flex items-center justify-center px-1 py-0.5"
      style={{ width: CELL_W, backgroundColor: isCurrent ? "hsl(142 76% 97%)" : "#fff" }}
    >
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowMoveList(false); }}>
        <PopoverTrigger asChild>
          <button
            className="w-full text-center text-[9px] font-mono font-semibold transition-all"
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
          >
            {formatCellValue(alloc.hours, alloc.czk, alloc.status, item.totalHours, alloc.splitPart, alloc.splitTotal)}
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
                      <span className="font-mono text-[9px] text-muted-foreground">
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
    return (
      <div
        className="shrink-0"
        style={{ width: CELL_W, backgroundColor: isCurrent ? "hsl(142 76% 97%)" : "#fff" }}
      />
    );
  }

  return (
    <div
      className="shrink-0 flex items-center justify-center"
      style={{ width: CELL_W, backgroundColor: isCurrent ? "hsl(142 76% 97%)" : "#fff" }}
    >
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
