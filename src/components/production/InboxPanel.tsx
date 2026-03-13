import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown, GripVertical, Check, Plus, X } from "lucide-react";
import { useProductionInbox, type InboxProject, type InboxItem } from "@/hooks/useProductionInbox";
import { useProductionProgress, type ProjectProgress } from "@/hooks/useProductionProgress";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { useProductionSchedule } from "@/hooks/useProductionSchedule";
import { useProjects } from "@/hooks/useProjects";
import { useWeekCapacityLookup } from "@/hooks/useWeeklyCapacity";
import { useProductionDragDrop } from "@/hooks/useProductionDragDrop";
import { getProjectColor } from "@/lib/projectColors";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ProjectProgressBar } from "./ProjectProgressBar";
import { ProductionContextMenu, type ContextMenuAction } from "./ProductionContextMenu";
import { AddItemPopover, getAdhocBadge } from "./AddItemPopover";
import { CancelItemDialog } from "./CancelItemDialog";
import { InboxPlanningDialog, type SchedulePlanEntry, type PlanningItem, type PlanningWeek } from "./InboxPlanningDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseAppDate } from "@/lib/dateFormat";
import { differenceInDays, isPast, addDays, format } from "date-fns";
import { resolveDeadline, checkDeadlineWarning } from "@/lib/deadlineWarning";
import { DeadlineWarningDialog } from "./DeadlineWarningDialog";
import { getISOWeekNumber } from "@/hooks/useProductionSchedule";

function formatCompactCzk(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${Math.round(v)}`;
}

type UrgencyLevel = "overdue" | "urgent" | "upcoming" | "ok";

function getUrgency(datumSmluvni: string | null | undefined, status: string | null | undefined): UrgencyLevel {
  if (!datumSmluvni) return "ok";
  const s = (status ?? "").toLowerCase();
  if (s === "fakturace" || s === "dokonceno" || s === "dokončeno") return "ok";
  const d = parseAppDate(datumSmluvni);
  if (!d) return "ok";
  if (isPast(d)) return "overdue";
  const days = differenceInDays(d, new Date());
  if (days <= 14) return "urgent";
  if (days <= 30) return "upcoming";
  return "ok";
}

function getUrgencyDaysLabel(datumSmluvni: string | null | undefined): string | null {
  if (!datumSmluvni) return null;
  const d = parseAppDate(datumSmluvni);
  if (!d) return null;
  const days = differenceInDays(d, new Date());
  if (days <= 0) return null; // overdue uses badge text
  return `${days} dní`;
}

const URGENCY_ORDER: Record<UrgencyLevel, number> = { overdue: 0, urgent: 1, upcoming: 2, ok: 3 };

const URGENCY_COLORS: Record<UrgencyLevel, { border: string; text: string }> = {
  overdue:  { border: "#DC2626", text: "#DC2626" },
  urgent:   { border: "#D97706", text: "#D97706" },
  upcoming: { border: "#2563EB", text: "#2563EB" },
  ok:       { border: "transparent", text: "#223937" },
};

const SAMPLE_ITEMS = [
  { pid: "Z-2601-001", items: [{ name: "Kuchyňská linka A", code: "TK.01", h: 120 }, { name: "Obývací stěna", code: "OB.01", h: 85 }, { name: "Vestavěné skříně", code: "SK.01", h: 95 }, { name: "Jídelní stůl masiv", code: "JS.01", h: 60 }, { name: "Komoda předsíň", code: "KM.02", h: 45 }] },
  { pid: "Z-2502-011", items: [{ name: "Recepční pult", code: "NB.01", h: 180 }, { name: "Jednací stoly 6ks", code: "ST.01", h: 65 }, { name: "Knihovna lobby", code: "KN.01", h: 140 }, { name: "Kancelářské příčky", code: "PR.01", h: 210 }, { name: "Šatní skříně 12ks", code: "SS.01", h: 160 }, { name: "Kuchyňka kancelář", code: "TK.05", h: 90 }] },
  { pid: "Z-2504-019", items: [{ name: "Kuchyň - spodní skříňky", code: "TK.02", h: 75 }, { name: "Kuchyň - horní skříňky", code: "TK.03", h: 55 }, { name: "Ostrůvek s digestoří", code: "TK.06", h: 130 }, { name: "Spižní skříň", code: "TK.07", h: 40 }] },
  { pid: "Z-2513-002", items: [{ name: "Stolové desky 10ks", code: "SD.01", h: 35 }, { name: "Podnoží 10ks", code: "PD.01", h: 45 }, { name: "Montáž a povrch", code: "MP.01", h: 60 }, { name: "Konferenční stůl", code: "KS.01", h: 80 }] },
  { pid: "Z-2603-002", items: [{ name: "Doplňky set A", code: "DP.01", h: 40 }, { name: "Doplňky set B", code: "DP.02", h: 55 }, { name: "Zrcadlová stěna", code: "ZS.01", h: 70 }] },
  { pid: "Z-2607-002", items: [{ name: "Skříň PPF Gate", code: "SK.02", h: 280 }, { name: "Vitrína showroom", code: "VT.01", h: 150 }, { name: "Pult info", code: "NB.04", h: 95 }] },
  { pid: "Z-2601-005", items: [{ name: "Ložnicová sestava", code: "LS.01", h: 200 }, { name: "Noční stolky 2ks", code: "NS.01", h: 30 }, { name: "Šatní vestavba", code: "SV.01", h: 170 }, { name: "Toaletní stolek", code: "TS.01", h: 50 }] },
  { pid: "Z-2508-003", items: [{ name: "Barový pult hotel", code: "BP.01", h: 320 }, { name: "Zadní stěna baru", code: "ZB.01", h: 180 }, { name: "Poličky na lahve", code: "PL.03", h: 65 }, { name: "Chladící skříň obklad", code: "CH.01", h: 110 }, { name: "Sedací boxy 4ks", code: "SB.01", h: 240 }] },
  { pid: "Z-2610-001", items: [{ name: "Stůl jednací oval", code: "SJ.01", h: 90 }, { name: "Kredenc ředitelna", code: "KR.01", h: 120 }, { name: "Obklad stěn dýha", code: "OD.01", h: 260 }] },
];

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

type DisplayMode = "hours" | "czk" | "percent";

interface InboxPanelProps {
  overDroppableId?: string | null;
  showCzk?: boolean;
  displayMode?: DisplayMode;
  onNavigateToTPV?: (projectId: string) => void;
  onOpenProjectDetail?: (projectId: string) => void;
  disableDropZone?: boolean;
  selectedProjectId?: string | null;
  onSelectProject?: (projectId: string) => void;
  searchQuery?: string;
  forecastActive?: boolean;
}

interface ContextMenuState {
  x: number; y: number; actions: ContextMenuAction[];
}

interface CancelState {
  itemId: string; itemName: string; itemCode: string | null;
  hours: number; projectName: string; projectId: string;
  source: "schedule" | "inbox"; splitGroupId: string | null;
}

export function InboxPanel({ overDroppableId, showCzk, displayMode: displayModeProp, onNavigateToTPV, onOpenProjectDetail, disableDropZone, selectedProjectId, onSelectProject, searchQuery = "", forecastActive }: InboxPanelProps) {
  const displayMode: DisplayMode = displayModeProp ?? (showCzk ? "czk" : "hours");
  const { data: projects = [], isLoading } = useProductionInbox();
  const { data: progressData } = useProductionProgress();
  const { data: settings } = useProductionSettings();
  const { data: allDbProjects = [] } = useProjects();
  const { data: scheduleData } = useProductionSchedule();
  const getWeekCapacity = useWeekCapacityLookup();
  const { moveInboxItemToWeek } = useProductionDragDrop();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandKey, setExpandKey] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [addItemState, setAddItemState] = useState<{ projectId?: string; projectName?: string } | null>(null);
  const [cancelState, setCancelState] = useState<CancelState | null>(null);
  const [planningState, setPlanningState] = useState<{ projectId: string; projectName: string; items: PlanningItem[] } | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [deadlineWarning, setDeadlineWarning] = useState<{
    projectName: string; deadlineLabel: string; deadlineDate: Date; weekLabel: string;
  } | null>(null);
  const pendingDeadlineAction = useRef<(() => Promise<void>) | null>(null);

  // Clean up checked items that no longer exist in inbox
  useEffect(() => {
    if (checkedItems.size === 0) return;
    const allItemIds = new Set(projects.flatMap(p => p.items.map(i => i.id)));
    setCheckedItems(prev => {
      const next = new Set<string>();
      for (const id of prev) {
        if (allItemIds.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [projects]);

  const { setNodeRef, isOver } = useDroppable({ id: "inbox-drop-zone", disabled: !!disableDropZone });

  const totalHours = useMemo(() => projects.reduce((s, p) => s + p.total_hours, 0), [projects]);
  const hourlyRate = settings?.hourly_rate ?? 550;
  const weeklyCapacity = settings?.weekly_capacity_hours ?? 875;
  const isHighlighted = isOver || overDroppableId === "inbox-drop-zone";

  // Build next 12 weeks with remaining capacity
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
      const d = new Date(Date.UTC(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

      const cap = getWeekCapacity(key);
      // Sum already scheduled hours for this week
      const silo = scheduleData?.get(key);
      const scheduledHours = silo ? silo.total_hours : 0;
      const remaining = Math.max(0, cap - scheduledHours);

      result.push({
        key,
        weekNum,
        label: `T${weekNum} · ${format(weekStart, "d.M")} – ${format(weekEnd, "d.M")}`,
        remainingCapacity: remaining,
      });
    }
    return result;
  }, [getWeekCapacity, scheduleData]);


  // Map project_id → project info including deadline fields
  const projectInfoMap = useMemo(() => {
    const m = new Map<string, { datum_smluvni: string | null; status: string | null; expedice: string | null; montaz: string | null }>();
    for (const p of allDbProjects) m.set(p.project_id, { datum_smluvni: p.datum_smluvni ?? null, status: p.status ?? null, expedice: (p as any).expedice ?? null, montaz: (p as any).montaz ?? null });
    return m;
  }, [allDbProjects]);

  // Sort projects by urgency
  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const infoA = projectInfoMap.get(a.project_id);
      const infoB = projectInfoMap.get(b.project_id);
      const uA = getUrgency(infoA?.datum_smluvni, infoA?.status);
      const uB = getUrgency(infoB?.datum_smluvni, infoB?.status);
      if (URGENCY_ORDER[uA] !== URGENCY_ORDER[uB]) return URGENCY_ORDER[uA] - URGENCY_ORDER[uB];
      const dA = infoA?.datum_smluvni ? parseAppDate(infoA.datum_smluvni)?.getTime() ?? Infinity : Infinity;
      const dB = infoB?.datum_smluvni ? parseAppDate(infoB.datum_smluvni)?.getTime() ?? Infinity : Infinity;
      return dA - dB;
    });
  }, [projects, projectInfoMap]);

  // Count overdue + urgent items
  const urgentItemCount = useMemo(() => {
    let count = 0;
    for (const p of projects) {
      const info = projectInfoMap.get(p.project_id);
      const u = getUrgency(info?.datum_smluvni, info?.status);
      if (u === "overdue" || u === "urgent") count += p.items.length;
    }
    return count;
  }, [projects, projectInfoMap]);

  const totalItemCount = projects.reduce((s, p) => s + p.items.length, 0);

  const completedProjects = useMemo(() => {
    if (!progressData) return [];
    const activeProjectIds = new Set(projects.map(p => p.project_id));
    return Array.from(progressData.values()).filter(p => p.is_complete && !activeProjectIds.has(p.project_id));
  }, [progressData, projects]);

  const allProjectOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: { project_id: string; project_name: string }[] = [];
    for (const p of projects) {
      if (!seen.has(p.project_id)) { seen.add(p.project_id); result.push({ project_id: p.project_id, project_name: p.project_name }); }
    }
    return result;
  }, [projects]);

  const handleExpandAll = () => { setAllExpanded(true); setExpandKey((k) => k + 1); };
  const handleCollapseAll = () => { setAllExpanded(false); setExpandKey((k) => k + 1); };

  const toggleCheckItem = useCallback((itemId: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const clearCheckedItems = useCallback(() => setCheckedItems(new Set()), []);

  // Build a lookup of all inbox items for batch drag data
  const allInboxItemsMap = useMemo(() => {
    const m = new Map<string, InboxItem & { projectName: string }>();
    for (const p of projects) {
      for (const item of p.items) {
        m.set(item.id, { ...item, projectName: p.project_name });
      }
    }
    return m;
  }, [projects]);

  const handleProjectContextMenu = (e: React.MouseEvent, project: InboxProject) => {
    e.preventDefault(); e.stopPropagation();
    const planItems: PlanningItem[] = project.items.map(i => ({
      id: i.id, item_name: i.item_name, item_code: i.item_code,
      estimated_hours: i.estimated_hours, estimated_czk: i.estimated_czk, stage_id: i.stage_id,
    }));
    const actions: ContextMenuAction[] = [
      {
        label: "Naplánovat výrobu...", icon: "📅",
        onClick: () => setPlanningState({ projectId: project.project_id, projectName: project.project_name, items: planItems }),
      },
      {
        label: "Přidat položku", icon: "➕",
        onClick: () => setAddItemState({ projectId: project.project_id, projectName: project.project_name }),
      },
    ];
    if (onNavigateToTPV) {
      actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(project.project_id) });
    }
    if (onOpenProjectDetail) {
      actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(project.project_id) });
    }
    setContextMenu({ x: e.clientX, y: e.clientY, actions });
  };

  const handleItemContextMenu = (e: React.MouseEvent, item: InboxItem, project: InboxProject) => {
    e.preventDefault(); e.stopPropagation();
    const planItem: PlanningItem = {
      id: item.id, item_name: item.item_name, item_code: item.item_code,
      estimated_hours: item.estimated_hours, estimated_czk: item.estimated_czk, stage_id: item.stage_id,
    };
    const actions: ContextMenuAction[] = [
      {
        label: "Naplánovat...", icon: "📅",
        onClick: () => setPlanningState({ projectId: project.project_id, projectName: project.project_name, items: [planItem] }),
      },
    ];
    if (onNavigateToTPV) {
      actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(project.project_id) });
    }
    if (onOpenProjectDetail) {
      actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(project.project_id) });
    }
    actions.push({
      label: "Zrušit položku", icon: "✕", danger: true, dividerBefore: true,
      onClick: () => setCancelState({
        itemId: item.id, itemName: item.item_name, itemCode: item.item_code,
        hours: item.estimated_hours, projectName: project.project_name,
        projectId: project.project_id, source: "inbox", splitGroupId: null,
      }),
    });
    setContextMenu({ x: e.clientX, y: e.clientY, actions });
  };

  const executePlan = useCallback(async (plan: SchedulePlanEntry[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Group plan entries by inboxItemId
      const byItem = new Map<string, SchedulePlanEntry[]>();
      for (const entry of plan) {
        const arr = byItem.get(entry.inboxItemId) || [];
        arr.push(entry);
        byItem.set(entry.inboxItemId, arr);
      }

      for (const [inboxItemId, entries] of byItem) {
        // Fetch inbox item details
        const { data: inboxItem } = await supabase.from("production_inbox").select("*").eq("id", inboxItemId).single();
        if (!inboxItem) continue;

        if (entries.length === 1) {
          // Simple schedule — single week
          const e = entries[0];
          await supabase.from("production_schedule").insert({
            project_id: inboxItem.project_id,
            stage_id: inboxItem.stage_id,
            item_name: inboxItem.item_name,
            item_code: inboxItem.item_code,
            scheduled_week: e.scheduledWeek,
            scheduled_hours: e.scheduledHours,
            scheduled_czk: e.scheduledCzk,
            position: 999,
            status: "scheduled",
            created_by: user.id,
            inbox_item_id: inboxItemId,
          });
        } else {
          // Split across multiple weeks

          // Insert first part to get its id as split_group_id
          const { data: firstPart } = await supabase.from("production_schedule").insert({
            project_id: inboxItem.project_id,
            stage_id: inboxItem.stage_id,
            item_name: `${inboxItem.item_name} (1/${entries.length})`,
            item_code: inboxItem.item_code,
            scheduled_week: entries[0].scheduledWeek,
            scheduled_hours: entries[0].scheduledHours,
            scheduled_czk: entries[0].scheduledCzk,
            position: 999,
            status: "scheduled",
            created_by: user.id,
            inbox_item_id: inboxItemId,
            split_part: 1,
            split_total: entries.length,
          }).select().single();

          if (firstPart) {
            // Update first part with its own id as split_group_id
            await supabase.from("production_schedule").update({ split_group_id: firstPart.id }).eq("id", firstPart.id);

            // Insert remaining parts
            for (let i = 1; i < entries.length; i++) {
              await supabase.from("production_schedule").insert({
                project_id: inboxItem.project_id,
                stage_id: inboxItem.stage_id,
                item_name: `${inboxItem.item_name} (${i + 1}/${entries.length})`,
                item_code: inboxItem.item_code,
                scheduled_week: entries[i].scheduledWeek,
                scheduled_hours: entries[i].scheduledHours,
                scheduled_czk: entries[i].scheduledCzk,
                position: 999,
                status: "scheduled",
                created_by: user.id,
                inbox_item_id: inboxItemId,
                split_group_id: firstPart.id,
                split_part: i + 1,
                split_total: entries.length,
              });
            }
          }
        }

        // Mark inbox item as scheduled
        await supabase.from("production_inbox").update({ status: "scheduled" }).eq("id", inboxItemId);
      }

      qc.invalidateQueries({ queryKey: ["production-inbox"] });
      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-progress"] });
      toast({ title: `${plan.length} položek naplánováno` });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [planningState, qc]);

  const formatWeekLabel = useCallback((weekKey: string): string => {
    const d = new Date(weekKey);
    const weekNum = getISOWeekNumber(d);
    const end = new Date(d);
    end.setDate(d.getDate() + 6);
    return `T${weekNum} · ${d.getDate()}.${d.getMonth() + 1}–${end.getDate()}.${end.getMonth() + 1}.${end.getFullYear()}`;
  }, []);

  const handlePlanConfirm = useCallback(async (plan: SchedulePlanEntry[]) => {
    if (!planningState) return;

    // Find the latest scheduled week in the plan
    const latestWeek = plan.reduce((latest, e) => e.scheduledWeek > latest ? e.scheduledWeek : latest, plan[0]?.scheduledWeek || "");
    if (!latestWeek) { await executePlan(plan); return; }

    const project = allDbProjects.find(p => p.project_id === planningState.projectId);
    if (!project) { await executePlan(plan); return; }

    const deadline = resolveDeadline(project);
    const weekStart = new Date(latestWeek);
    const result = checkDeadlineWarning(deadline, weekStart);

    if (result.level === "hard" && result.deadline) {
      pendingDeadlineAction.current = async () => { await executePlan(plan); };
      setDeadlineWarning({
        projectName: project.project_name,
        deadlineLabel: result.deadline.fieldLabel,
        deadlineDate: result.deadline.date,
        weekLabel: formatWeekLabel(latestWeek),
      });
      return;
    }

    if (result.level === "soft" && result.deadline) {
      const formattedDate = format(result.deadline.date, "d.M.yyyy");
      toast({
        title: `⏰ Blíží se termín: ${project.project_name}`,
        description: `${result.deadline.fieldLabel} za ${result.daysUntilDeadline} dní (${formattedDate})`,
        className: "border-amber-400 bg-amber-50 text-amber-900",
      });
    }

    await executePlan(plan);
  }, [planningState, allDbProjects, executePlan, formatWeekLabel]);

  const handleSeedData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const rows = SAMPLE_ITEMS.flatMap(({ pid, items }) =>
        items.map((item) => ({ project_id: pid, item_name: item.name, item_code: item.code, estimated_hours: item.h, estimated_czk: item.h * hourlyRate, sent_by: user.id, status: "pending" as const }))
      );
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      const scheduleRows: any[] = [];
      const weekOffsets = [
        { offset: -1, items: [{ pid: "Z-2601-001", name: "Kuchyňská linka B", code: "TK.04", h: 200, status: "completed", completed_at: new Date(monday.getTime() - 3 * 86400000).toISOString() }, { pid: "Z-2502-011", name: "Stoly meeting room", code: "ST.02", h: 150, status: "completed", completed_at: new Date(monday.getTime() - 2 * 86400000).toISOString() }, { pid: "Z-2508-003", name: "Barové židle", code: "BZ.01", h: 120, status: "completed", completed_at: new Date(monday.getTime() - 1 * 86400000).toISOString() }] },
        { offset: 0, items: [{ pid: "Z-2504-019", name: "Obložení stěn", code: "OB.02", h: 320 }, { pid: "Z-2601-001", name: "Barový pult", code: "NB.02", h: 280 }, { pid: "Z-2513-002", name: "Desky speciál", code: "SD.02", h: 350 }, { pid: "Z-2610-001", name: "Kazetový strop", code: "KS.02", h: 180 }] },
        { offset: 1, items: [{ pid: "Z-2603-002", name: "Police sada A", code: "PL.01", h: 180 }, { pid: "Z-2607-002", name: "Skříň prototyp", code: "SK.03", h: 200 }, { pid: "Z-2601-005", name: "Postel king-size", code: "PK.01", h: 160 }] },
        { offset: 2, items: [{ pid: "Z-2502-011", name: "Recepce fáze 2", code: "NB.03", h: 400 }, { pid: "Z-2504-019", name: "Obložení fáze 2", code: "OB.03", h: 320 }, { pid: "Z-2601-001", name: "Komoda XXL", code: "KM.01", h: 250 }, { pid: "Z-2508-003", name: "Sedací boxy fáze 1", code: "SB.02", h: 190 }] },
        { offset: 3, items: [{ pid: "Z-2513-002", name: "Stolové desky XL", code: "SD.03", h: 150 }, { pid: "Z-2610-001", name: "Obklad dýha fáze 1", code: "OD.02", h: 280 }, { pid: "Z-2601-005", name: "Walk-in šatna", code: "WS.01", h: 350 }] },
        { offset: 4, items: [{ pid: "Z-2607-002", name: "Skříň série", code: "SK.04", h: 300 }, { pid: "Z-2603-002", name: "Police sada B", code: "PL.02", h: 220 }, { pid: "Z-2508-003", name: "Obklad baru final", code: "OB.04", h: 170 }] },
        { offset: 5, items: [{ pid: "Z-2610-001", name: "Ředitelský stůl", code: "RS.01", h: 140 }, { pid: "Z-2502-011", name: "Open-space příčky", code: "PR.02", h: 380 }] },
      ];
      for (const week of weekOffsets) {
        const weekDate = new Date(monday);
        weekDate.setDate(monday.getDate() + week.offset * 7);
        const weekStr = weekDate.toISOString().split("T")[0];
        for (let i = 0; i < week.items.length; i++) {
          const item = week.items[i];
          scheduleRows.push({
            project_id: item.pid, item_name: item.name, item_code: (item as any).code || null,
            scheduled_week: weekStr, scheduled_hours: item.h, scheduled_czk: item.h * hourlyRate,
            position: i, status: (item as any).status || "scheduled",
            completed_at: (item as any).completed_at || null,
            completed_by: (item as any).status === "completed" ? user.id : null,
            created_by: user.id,
          });
        }
      }
      const { error: inboxErr } = await supabase.from("production_inbox").insert(rows);
      if (inboxErr) throw inboxErr;
      const { error: schedErr } = await supabase.from("production_schedule").insert(scheduleRows);
      if (schedErr) throw schedErr;
      qc.invalidateQueries({ queryKey: ["production-inbox"] });
      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-expedice"] });
      qc.invalidateQueries({ queryKey: ["production-progress"] });
      toast({ title: "Testovací data vložena" });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  // Forecast mode: show empty state
  if (forecastActive) {
    return (
      <div className="w-[270px] shrink-0 flex flex-col" style={{ borderRight: "1px solid #2a2f3d", backgroundColor: "#1c1f26" }}>
        <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid #2a2f3d" }}>
          <span className="text-sm">📥</span>
          <span className="text-[13px] font-semibold" style={{ color: "#4a5168" }}>Inbox</span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(74,81,104,0.15)", color: "#4a5168" }}>
            0
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <p className="text-[12px] font-medium italic" style={{ color: "#4a5168" }}>0 položek</p>
            <p className="text-[10px] mt-1" style={{ color: "#3d4558" }}>Vše naplánováno ve forecastu</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} className="w-[270px] shrink-0 flex flex-col transition-colors"
      style={{ borderRight: "1px solid #ece8e2", backgroundColor: isHighlighted ? "rgba(59,130,246,0.04)" : "#ffffff", boxShadow: isHighlighted ? "inset 0 0 0 2px #3b82f6" : undefined }}>
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid #ece8e2" }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">📥</span>
          <span className="text-[13px] font-semibold" style={{ color: "#223937" }}>Inbox</span>
          {totalItemCount > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(217,151,6,0.12)", color: "#d97706" }}>
              {totalItemCount}
              {urgentItemCount > 0 && (
                <span className="ml-1">· 🔴 {urgentItemCount}</span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {projects.length > 0 && (
            <>
              <span className="text-[9px] font-mono font-medium" style={{ color: "#6b7a78" }}>
                {displayMode === "czk" ? formatCompactCzk(totalHours * hourlyRate) : `${Math.round(totalHours).toLocaleString("cs-CZ")}h`}
              </span>
              <button
                onClick={allExpanded ? handleCollapseAll : handleExpandAll}
                className="hover:text-gray-600 transition-colors"
                style={{ color: "#9CA3AF" }}
              >
                {allExpanded
                  ? <ChevronDown className="h-4 w-4" />
                  : <ChevronRight className="h-4 w-4" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {projects.length === 0 && completedProjects.length === 0 && !isLoading && (
          <div className="text-center py-8">
            <p className="text-[10px] mb-3" style={{ color: "#99a5a3" }}>Inbox je prázdný</p>
          </div>
        )}
        {sortedProjects.map((project) => {
          const info = projectInfoMap.get(project.project_id);
          const urgency = getUrgency(info?.datum_smluvni, info?.status);
          return (
            <InboxProjectGroup key={`${project.project_id}-${expandKey}`} project={project} hourlyRate={hourlyRate}
              defaultExpanded={allExpanded} displayMode={displayMode} progress={progressData?.get(project.project_id)}
              onNavigateToTPV={onNavigateToTPV}
              onOpenProjectDetail={onOpenProjectDetail}
              onProjectContextMenu={handleProjectContextMenu}
              onItemContextMenu={handleItemContextMenu}
              urgency={urgency}
              daysLabel={getUrgencyDaysLabel(info?.datum_smluvni)}
              isSelected={selectedProjectId === project.project_id}
              onSelectProject={onSelectProject}
              projectInfo={info}
              checkedItems={checkedItems}
              onToggleCheck={toggleCheckItem}
              onClearChecked={clearCheckedItems}
              allInboxItemsMap={allInboxItemsMap}
              searchQuery={searchQuery}
            />
          );
        })}

        {completedProjects.length > 0 && (
          <div className="mt-3 space-y-[2px]">
            {/* Section divider */}
            <div className="flex items-center gap-0 mb-1.5">
              <div className="flex-1 h-px" style={{ backgroundColor: "#e2ddd6" }} />
              <span className="px-2" style={{ fontSize: 11, color: "#6b7280", backgroundColor: "#f8f7f4" }}>
                ✓ Naplánováno ({completedProjects.length})
              </span>
              <div className="flex-1 h-px" style={{ backgroundColor: "#e2ddd6" }} />
            </div>
            {completedProjects.map(p => {
              const isCompletedSelected = selectedProjectId === p.project_id;
              const completedColor = getProjectColor(p.project_id);
              const completedInfo = projectInfoMap.get(p.project_id);
              const completedDeadline = resolveDeadline({ expedice: completedInfo?.expedice, montaz: completedInfo?.montaz, datum_smluvni: completedInfo?.datum_smluvni });
              let completedDeadlineDisplay: { label: string; dateStr: string; color: string } | null = null;
              if (completedDeadline) {
                const days = differenceInDays(completedDeadline.date, new Date());
                const dateStr = `${completedDeadline.date.getDate()}.${completedDeadline.date.getMonth() + 1}.${completedDeadline.date.getFullYear()}`;
                const dlLabel = completedDeadline.fieldName === "expedice" ? "Exp" : completedDeadline.fieldName === "montaz" ? "Montáž" : "Sml";
                const dlColor = days < 0 ? "#dc2626" : days <= 14 ? "#d97706" : "#6b7280";
                completedDeadlineDisplay = { label: dlLabel, dateStr, color: dlColor };
              }
              return (
              <div key={p.project_id} className="flex items-center gap-1.5 px-2 py-[4px] rounded-[5px] cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onSelectProject?.(p.project_id); }}
                style={{
                  backgroundColor: isCompletedSelected ? "rgba(217,119,6,0.05)" : "#f5f3f0",
                  borderTop: isCompletedSelected ? "2px solid #d97706" : "1px solid #e5e2dd",
                  borderRight: isCompletedSelected ? "2px solid #d97706" : "1px solid #e5e2dd",
                  borderBottom: isCompletedSelected ? "2px solid #d97706" : "1px solid #e5e2dd",
                  borderLeft: `4px solid ${completedColor}80`,
                  boxShadow: isCompletedSelected ? "0 0 0 2px rgba(217,119,6,0.15)" : undefined,
                }}>
                <div className="flex-1 min-w-0">
                  <div className="truncate" style={{ fontSize: 12, fontWeight: 500, color: "#6b7280" }}>{p.project_name}</div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono" style={{ fontSize: 10, color: "#9ca3af" }}>{p.project_id}</span>
                    {completedDeadlineDisplay && (
                      <span style={{ fontSize: 10, color: completedDeadlineDisplay.color }}>· {completedDeadlineDisplay.label}: {completedDeadlineDisplay.dateStr}</span>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom: Add item button + test data */}
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderTop: "1px solid #ece8e2" }}>
        <button
          onClick={() => setAddItemState({})}
          className="flex items-center gap-1 text-[10px] font-medium transition-colors rounded px-2 py-1"
          style={{ color: "#3a8a36", border: "1px solid rgba(58,138,54,0.3)" }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(58,138,54,0.05)")}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <Plus className="h-3 w-3" /> Nová položka
        </button>
        {projects.length === 0 && !isLoading && (
          <button onClick={handleSeedData} disabled={loading} className="text-[9px] hover:underline transition-colors" style={{ color: "#99a5a3" }}>
            🧪 {loading ? "Vkládám..." : "Testovací data"}
          </button>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && <ProductionContextMenu x={contextMenu.x} y={contextMenu.y} actions={contextMenu.actions} onClose={() => setContextMenu(null)} />}

      {/* Add item popover */}
      {addItemState && (
        <AddItemPopover open={!!addItemState} onOpenChange={open => !open && setAddItemState(null)}
          projectId={addItemState.projectId} projectName={addItemState.projectName}
          allProjects={allProjectOptions} />
      )}

      {/* Cancel dialog */}
      {cancelState && (
        <CancelItemDialog open={!!cancelState} onOpenChange={open => !open && setCancelState(null)} {...cancelState} itemCode={cancelState.itemCode} />
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
      {deadlineWarning && (
        <DeadlineWarningDialog
          open={!!deadlineWarning}
          projectName={deadlineWarning.projectName}
          deadlineLabel={deadlineWarning.deadlineLabel}
          deadlineDate={deadlineWarning.deadlineDate}
          weekLabel={deadlineWarning.weekLabel}
          onCancel={() => {
            setDeadlineWarning(null);
            pendingDeadlineAction.current = null;
          }}
          onConfirm={async () => {
            setDeadlineWarning(null);
            if (pendingDeadlineAction.current) {
              await pendingDeadlineAction.current();
              pendingDeadlineAction.current = null;
            }
          }}
        />
      )}
    </div>
  );
}

function InboxProjectGroup({ project, hourlyRate, defaultExpanded, displayMode = "hours", progress, onNavigateToTPV, onOpenProjectDetail, onProjectContextMenu, onItemContextMenu, urgency, daysLabel, isSelected, onSelectProject, projectInfo, checkedItems, onToggleCheck, onClearChecked, allInboxItemsMap, searchQuery = "" }: {
  project: InboxProject; hourlyRate: number; defaultExpanded: boolean; displayMode?: DisplayMode;
  progress?: ProjectProgress; onNavigateToTPV?: (projectId: string) => void;
  onOpenProjectDetail?: (projectId: string) => void;
  onProjectContextMenu: (e: React.MouseEvent, project: InboxProject) => void;
  onItemContextMenu: (e: React.MouseEvent, item: InboxItem, project: InboxProject) => void;
  urgency: UrgencyLevel;
  daysLabel: string | null;
  isSelected?: boolean;
  onSelectProject?: (projectId: string) => void;
  projectInfo?: { datum_smluvni: string | null; status: string | null; expedice: string | null; montaz: string | null };
  checkedItems: Set<string>;
  onToggleCheck: (itemId: string) => void;
  onClearChecked: () => void;
  allInboxItemsMap: Map<string, InboxItem & { projectName: string }>;
  searchQuery?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const color = getProjectColor(project.project_id);
  const uColors = URGENCY_COLORS[urgency];

  // Use urgency border color if not "ok", otherwise project color
  const leftBorderColor = urgency !== "ok" ? uColors.border : color;
  const leftBorderWidth = urgency !== "ok" ? 3 : 4;

  // Resolve deadline for display
  const deadline = useMemo(() => {
    if (!projectInfo) return null;
    return resolveDeadline({ expedice: projectInfo.expedice, montaz: projectInfo.montaz, datum_smluvni: projectInfo.datum_smluvni });
  }, [projectInfo]);

  const deadlineDisplay = useMemo(() => {
    if (!deadline) return null;
    const days = differenceInDays(deadline.date, new Date());
    const dateStr = `${deadline.date.getDate()}.${deadline.date.getMonth() + 1}.${deadline.date.getFullYear()}`;
    const label = deadline.fieldName === "expedice" ? "Exp" : deadline.fieldName === "montaz" ? "Montáž" : "Sml";
    const color = days < 0 ? "#dc2626" : days <= 14 ? "#d97706" : "#6b7280";
    return { label, dateStr, color };
  }, [deadline]);

  return (
    <div className="rounded-lg overflow-hidden" style={{
      backgroundColor: isSelected ? "rgba(217,119,6,0.04)" : "#ffffff",
      borderTop: isSelected ? "2px solid #d97706" : "1px solid #ece8e2",
      borderRight: isSelected ? "2px solid #d97706" : "1px solid #ece8e2",
      borderBottom: isSelected ? "2px solid #d97706" : "1px solid #ece8e2",
      borderLeft: `${leftBorderWidth}px solid ${leftBorderColor}`,
      boxShadow: isSelected ? "0 0 0 2px rgba(217,119,6,0.15)" : undefined,
      transition: "border-color 150ms, box-shadow 150ms",
    }}>
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); onSelectProject?.(project.project_id); }}
        onContextMenu={e => onProjectContextMenu(e, project)}
        className="w-full flex items-center gap-1.5 px-2.5 py-2 text-left transition-colors"
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8f7f5")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        <ChevronRight className="h-3 w-3 shrink-0 transition-transform duration-150"
          style={{ color: "#99a5a3", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate" style={{ fontSize: 13, color: urgency === "ok" ? "#1a1a1a" : uColors.text, fontWeight: 600 }}>{highlightMatch(project.project_name, searchQuery || "")}</span>
            {urgency === "overdue" && (
              <span className="text-[8px] font-bold px-1 py-[1px] rounded shrink-0" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
                PO TERMÍNU
              </span>
            )}
            {urgency === "urgent" && daysLabel && (
              <span className="text-[8px] font-bold px-1 py-[1px] rounded shrink-0" style={{ backgroundColor: "rgba(217,119,6,0.1)", color: "#D97706" }}>
                {daysLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono" style={{ fontSize: 11, color: "#6b7280" }}>{project.project_id}</span>
            {deadlineDisplay && (
              <span style={{ fontSize: 11, color: deadlineDisplay.color }}>· {deadlineDisplay.label}: {deadlineDisplay.dateStr}</span>
            )}
          </div>
          {progress && <div className="mt-1"><ProjectProgressBar progress={progress} compact /></div>}
        </div>
        <div className="text-right shrink-0">
          <span className="font-mono" style={{ fontSize: 14, color: "#1a1a1a", fontWeight: 700 }}>
            {displayMode === "czk" ? formatCompactCzk(project.total_hours * hourlyRate) : `${Math.round(project.total_hours)}h`}
          </span>
        </div>
      </button>
    {expanded && (
        <div className="px-2 pb-2 space-y-[2px]">
          {progress?.scheduled_items.map(si => (
            <div key={si.id} className="flex items-center gap-1.5 px-2 py-[3px] rounded-[5px]" style={{ opacity: si.status === "completed" ? 0.6 : 0.7 }}>
              <span style={{ fontSize: 11, color: si.status === "completed" ? "#3a8a36" : "#3b82f6" }}>{si.status === "completed" ? "✓" : "→"}</span>
              {si.item_code && <span className="font-mono shrink-0" style={{ fontSize: 11, color: si.status === "completed" ? "#9ca3af" : "#223937", fontWeight: 500 }}>{si.item_code}</span>}
              <span className="flex-1 truncate" style={{ fontSize: 12, color: si.status === "completed" ? "#9ca3af" : "#4b5563" }}>{si.item_name}</span>
              <span className="font-mono shrink-0" style={{ fontSize: 11, color: "#6b7280" }}>{si.week_label}</span>
            </div>
          ))}
          {project.items.map((item) => (
            <DraggableInboxItem key={item.id} item={item} projectName={project.project_name}
              onContextMenu={e => onItemContextMenu(e, item, project)}
              isChecked={checkedItems.has(item.id)}
              onToggleCheck={onToggleCheck}
              checkedItems={checkedItems}
              allInboxItemsMap={allInboxItemsMap}
            />
          ))}
          {/* Checked items footer bar */}
          {(() => {
            const checkedInProject = project.items.filter(i => checkedItems.has(i.id));
            if (checkedInProject.length < 2) return null;
            const totalH = checkedInProject.reduce((s, i) => s + i.estimated_hours, 0);
            return (
              <div style={{
                borderTop: "1px solid rgba(58,138,54,0.2)",
                backgroundColor: "rgba(58,138,54,0.08)",
                padding: "6px 12px",
                fontSize: 11,
                color: "#3a8a36",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 6,
                borderRadius: "0 0 6px 6px",
              }}>
                <span>✓ {checkedInProject.length} položek vybráno · {Math.round(totalH)}h — Přetáhnout jako skupinu</span>
                <button onClick={onClearChecked} className="ml-auto hover:opacity-70" title="Zrušit výběr">
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })()}
          <DraggableInboxProject project={project} />
          {onNavigateToTPV && (
            <button onClick={() => onNavigateToTPV(project.project_id)} className="w-full text-[9px] text-center py-1 hover:underline transition-colors" style={{ color: "#6b7a78" }}>
              📋 Zobrazit položky
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DraggableInboxItem({ item, projectName, onContextMenu, isChecked, onToggleCheck, checkedItems, allInboxItemsMap }: {
  item: InboxItem; projectName: string; onContextMenu: (e: React.MouseEvent) => void;
  isChecked: boolean; onToggleCheck: (itemId: string) => void;
  checkedItems: Set<string>;
  allInboxItemsMap: Map<string, InboxItem & { projectName: string }>;
}) {
  const [hovered, setHovered] = useState(false);
  const adhocBadge = getAdhocBadge((item as any).adhoc_reason);

  // Determine drag data: if this item is checked and there are other checked items, drag as batch
  const otherCheckedCount = checkedItems.size;
  const isBatchDrag = isChecked && otherCheckedCount >= 2;

  const batchHours = useMemo(() => {
    if (!isBatchDrag) return item.estimated_hours;
    let total = 0;
    for (const id of checkedItems) {
      const it = allInboxItemsMap.get(id);
      if (it) total += it.estimated_hours;
    }
    return total;
  }, [isBatchDrag, checkedItems, allInboxItemsMap, item.estimated_hours]);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: isBatchDrag ? `inbox-items-${item.id}` : `inbox-item-${item.id}`,
    data: isBatchDrag ? {
      type: "inbox-items" as const,
      itemId: item.id,
      projectId: item.project_id,
      projectName,
      hours: batchHours,
      itemCount: checkedItems.size,
      batchItemIds: Array.from(checkedItems),
    } : {
      type: "inbox-item" as const, itemId: item.id, itemName: item.item_name, itemCode: item.item_code,
      projectId: item.project_id, projectName, hours: item.estimated_hours, stageId: item.stage_id,
      scheduledCzk: item.estimated_czk,
    },
  });

  const showCheckbox = hovered || isChecked;

  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      className="flex items-center gap-1.5 px-2 py-[5px] rounded-[5px] cursor-grab transition-all"
      style={{
        backgroundColor: isChecked ? "rgba(58,138,54,0.06)" : "#ffffff",
        border: isChecked ? "1px solid rgba(58,138,54,0.25)" : "1px solid #ece8e2",
        opacity: isDragging ? 0.3 : 1,
      }}
      onMouseEnter={(e) => {
        setHovered(true);
        if (!isDragging && !isChecked) { e.currentTarget.style.backgroundColor = "rgba(59,130,246,0.04)"; e.currentTarget.style.borderColor = "#3b82f6"; }
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        if (!isChecked) { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.borderColor = "#ece8e2"; }
      }}
      onContextMenu={onContextMenu}
    >
      {/* Checkbox or grip handle — same 14px slot */}
      {showCheckbox ? (
        <div
          className="shrink-0 flex items-center justify-center"
          style={{ width: 14, height: 14 }}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleCheck(item.id); }}
          onPointerDown={(e) => { e.stopPropagation(); }}
        >
          <div style={{
            width: 12, height: 12, borderRadius: 3,
            border: isChecked ? "none" : "1.5px solid #9ca3af",
            backgroundColor: isChecked ? "#3a8a36" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}>
            {isChecked && <Check className="h-2.5 w-2.5" style={{ color: "#ffffff" }} />}
          </div>
        </div>
      ) : (
        <GripVertical className="h-3 w-3 shrink-0" style={{ color: "#99a5a3" }} />
      )}
      {adhocBadge && (
        <span className="text-[8px] shrink-0" title={adhocBadge.label}>{adhocBadge.emoji}</span>
      )}
      {item.item_code && <span className="font-mono shrink-0" style={{ fontSize: 11, color: "#223937", fontWeight: 500 }}>{item.item_code}</span>}
      <span className="flex-1 truncate" style={{ fontSize: 12, color: "#4b5563" }}>{item.item_name}</span>
      <span className="font-mono text-[10px] shrink-0" style={{ color: "#1a1a1a", fontWeight: 700 }}>{item.estimated_hours}h</span>
    </div>
  );
}

function DraggableInboxProject({ project }: { project: InboxProject }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `inbox-project-${project.project_id}`,
    data: { type: "inbox-project", projectId: project.project_id, projectName: project.project_name, hours: project.total_hours },
  });

  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      className="flex items-center justify-center px-2 py-[5px] rounded-[5px] cursor-grab transition-all text-[9px] font-semibold"
      style={{ border: "1.5px dashed #3a8a36", backgroundColor: "rgba(58,138,54,0.05)", color: "#3a8a36", opacity: isDragging ? 0.3 : 1 }}
      onMouseEnter={(e) => { e.currentTarget.style.borderStyle = "solid"; e.currentTarget.style.backgroundColor = "rgba(58,138,54,0.1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderStyle = "dashed"; e.currentTarget.style.backgroundColor = "rgba(58,138,54,0.05)"; }}
    >
      Přetáhni celý projekt ({Math.round(project.total_hours)}h)
    </div>
  );
}
