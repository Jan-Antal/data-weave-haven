import { useEffect, useState, useCallback, useMemo } from "react";
import { useWeekCapacityLookup } from "@/hooks/useWeeklyCapacity";
import { Search, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ProductionHeader } from "@/components/production/ProductionHeader";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { InboxPanel } from "@/components/production/InboxPanel";
import { WeeklySilos } from "@/components/production/WeeklySilos";
import { ExpedicePanel } from "@/components/production/ExpedicePanel";
import { DragOverlayContent } from "@/components/production/DragOverlayContent";
import { AutoSplitPopover } from "@/components/production/AutoSplitPopover";
import { MergePopover } from "@/components/production/MergePopover";
import { TPVList } from "@/components/TPVList";
import { ProjectDetailDialog } from "@/components/ProjectDetailDialog";
import { useProjects } from "@/hooks/useProjects";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useProductionDragDrop } from "@/hooks/useProductionDragDrop";
import { useProductionSchedule, getISOWeekNumber } from "@/hooks/useProductionSchedule";
import { useProductionInbox } from "@/hooks/useProductionInbox";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { PlanVyrobyTableView } from "@/components/production/PlanVyrobyTableView";

export type DisplayMode = "hours" | "czk" | "percent";
type ViewTab = "kanban" | "table";

interface ActiveDragData {
  type: "inbox-item" | "inbox-project" | "silo-item" | "silo-bundle";
  itemId?: string;
  itemName?: string;
  itemCode?: string | null;
  projectId?: string;
  projectName?: string;
  weekDate?: string;
  hours?: number;
  itemCount?: number;
  stageId?: string | null;
  scheduledCzk?: number;
  inboxItemId?: string;
  splitGroupId?: string | null;
}

interface AutoSplitState {
  itemId: string;
  itemName: string;
  itemCode: string | null;
  itemHours: number;
  projectId: string;
  stageId: string | null;
  czkPerHour: number;
  targetWeekKey: string;
  targetWeekNum: number;
  availableHours: number;
  spillWeekKey: string;
  spillWeekNum: number;
  source: "inbox" | "schedule";
  inboxItemId?: string;
  onInsertWhole: () => Promise<void>;
}

interface MergeState {
  itemName: string;
  splitGroupIds: string[];
  mergeItemCount: number;
  draggedItemId: string;
  targetWeekKey: string;
  onKeepSeparate: () => Promise<void>;
}

export default function PlanVyroby() {
  const { isAdmin, loading, profile } = useAuth();
  const navigate = useNavigate();
  const { setCurrentPage } = useUndoRedo();
  const [displayMode, setDisplayMode] = useState<DisplayMode>("hours");
  const [viewTab, setViewTab] = useState<ViewTab>("kanban");
  const [searchQuery, setSearchQuery] = useState("");
  const showCzk = displayMode === "czk";
  const [activeDrag, setActiveDrag] = useState<ActiveDragData | null>(null);
  const isDraggingFromInbox = activeDrag?.type === "inbox-item" || activeDrag?.type === "inbox-project";
  const [overDroppableId, setOverDroppableId] = useState<string | null>(null);
  const [autoSplitState, setAutoSplitState] = useState<AutoSplitState | null>(null);
  const [mergeState, setMergeState] = useState<MergeState | null>(null);
  const [tpvProjectId, setTpvProjectId] = useState<string | null>(null);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const handleSelectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
  }, []);
  const { data: allProjects = [] } = useProjects();
  const { data: scheduleData } = useProductionSchedule();
  const { data: settings } = useProductionSettings();
  const {
    moveInboxItemToWeek,
    moveInboxProjectToWeek,
    moveScheduleItemToWeek,
    moveBundleToWeek,
    moveItemBackToInbox,
    returnBundleToInbox,
    mergeSplitItems,
  } = useProductionDragDrop();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }));

  const weeklyCapacity = Math.round((settings?.monthly_capacity_hours ?? 3500) / 4);
  const hourlyRate = settings?.hourly_rate ?? 550;

  useEffect(() => {
    setCurrentPage("plan-vyroby");
    return () => setCurrentPage(null);
  }, [setCurrentPage]);

  const isMobile = useIsMobile();

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate("/", { replace: true });
    }
  }, [isAdmin, loading, navigate]);


  const tpvProject = tpvProjectId ? allProjects.find(p => p.project_id === tpvProjectId) : null;
  const detailProject = detailProjectId ? allProjects.find(p => p.project_id === detailProjectId) || null : null;

  const handleNavigateToTPV = useCallback((projectId: string, _itemCode?: string | null) => {
    setTpvProjectId(projectId);
  }, []);

  const handleOpenProjectDetail = useCallback((projectId: string) => {
    setDetailProjectId(projectId);
  }, []);

  const findSpillWeek = useCallback((afterWeekKey: string): { key: string; weekNum: number } => {
    const monday = new Date();
    const day = monday.getDay();
    monday.setDate(monday.getDate() - day + (day === 0 ? -6 : 1));
    monday.setHours(0, 0, 0, 0);

    for (let i = 0; i < 16; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i * 7);
      const key = d.toISOString().split("T")[0];
      if (key <= afterWeekKey) continue;
      const used = scheduleData?.get(key)?.total_hours ?? 0;
      if (used < weeklyCapacity) {
        return { key, weekNum: getISOWeekNumber(d) };
      }
    }
    const target = new Date(afterWeekKey);
    target.setDate(target.getDate() + 7);
    return { key: target.toISOString().split("T")[0], weekNum: getISOWeekNumber(target) };
  }, [scheduleData, weeklyCapacity]);

  const findSiblingInWeek = useCallback((splitGroupId: string, targetWeekKey: string, draggedItemId: string) => {
    const silo = scheduleData?.get(targetWeekKey);
    if (!silo) return null;
    for (const bundle of silo.bundles) {
      for (const item of bundle.items) {
        if (item.id !== draggedItemId && item.split_group_id === splitGroupId) {
          return item;
        }
      }
    }
    return null;
  }, [scheduleData]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as ActiveDragData | undefined;
    if (data) setActiveDrag(data);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverDroppableId(event.over?.id?.toString() ?? null);
  }, []);

  const resolveTargetWeek = useCallback((targetId: string, dragData: ActiveDragData): string | null => {
    if (targetId.startsWith("silo-week-")) {
      return targetId.replace("silo-week-", "");
    }
    if (targetId.startsWith("silo-item-") || targetId.startsWith("silo-bundle-")) {
      if (scheduleData) {
        for (const [weekKey, silo] of scheduleData) {
          for (const bundle of silo.bundles) {
            if (targetId.startsWith("silo-bundle-") && targetId.includes(bundle.project_id) && targetId.includes(weekKey)) {
              return weekKey;
            }
            for (const item of bundle.items) {
              if (targetId === `silo-item-${item.id}`) {
                return weekKey;
              }
            }
          }
        }
      }
    }
    return null;
  }, [scheduleData]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDrag(null);
    setOverDroppableId(null);

    if (!active.data.current) return;

    const dragData = active.data.current as ActiveDragData;

    if (!over) {
      if (dragData.type === "silo-item" && dragData.splitGroupId && dragData.itemId && dragData.weekDate) {
        const sibling = findSiblingInWeek(dragData.splitGroupId, dragData.weekDate, dragData.itemId);
        if (sibling) {
          setMergeState({
            itemName: dragData.itemName || "Položka",
            splitGroupIds: [dragData.splitGroupId],
            mergeItemCount: 1,
            draggedItemId: dragData.itemId,
            targetWeekKey: dragData.weekDate,
            onKeepSeparate: async () => {},
          });
        }
      }
      return;
    }

    const targetId = over.id.toString();

    if (targetId === "inbox-drop-zone") {
      if (dragData.type === "silo-item" && dragData.itemId) {
        await moveItemBackToInbox(dragData.itemId);
      } else if (dragData.type === "silo-bundle" && dragData.projectId && dragData.weekDate) {
        await returnBundleToInbox(dragData.projectId, dragData.weekDate);
      }
      return;
    }

    const weekDate = resolveTargetWeek(targetId, dragData);
    if (!weekDate) return;

      if (dragData.type === "silo-item" && dragData.splitGroupId && dragData.itemId) {
        const sibling = findSiblingInWeek(dragData.splitGroupId, weekDate, dragData.itemId);
        if (sibling) {
          const doNormalMove = async () => {
            if (dragData.weekDate !== weekDate) {
              await moveScheduleItemToWeek(dragData.itemId!, weekDate);
            }
          };
          setMergeState({
            itemName: dragData.itemName || "Položka",
            splitGroupIds: [dragData.splitGroupId],
            mergeItemCount: 1,
            draggedItemId: dragData.itemId,
            targetWeekKey: weekDate,
            onKeepSeparate: doNormalMove,
          });
          return;
        }
      }

      if ((dragData.type === "inbox-item" || dragData.type === "silo-item") && dragData.hours) {
        const targetUsed = scheduleData?.get(weekDate)?.total_hours ?? 0;
        const available = weeklyCapacity - targetUsed;

        if (dragData.hours > available && available > 0) {
          const targetDate = new Date(weekDate);
          const targetWeekNum = getISOWeekNumber(targetDate);
          const spillWeek = findSpillWeek(weekDate);
          const itemCzkPerHour = dragData.scheduledCzk && dragData.hours > 0
            ? dragData.scheduledCzk / dragData.hours
            : hourlyRate;

          const doInsertWhole = async () => {
            if (dragData.type === "inbox-item" && dragData.itemId) {
              await moveInboxItemToWeek(dragData.itemId, weekDate);
            } else if (dragData.type === "silo-item" && dragData.itemId && dragData.weekDate !== weekDate) {
              await moveScheduleItemToWeek(dragData.itemId, weekDate);
            }
          };

          setAutoSplitState({
            itemId: dragData.itemId!,
            itemName: dragData.itemName || "Položka",
            itemCode: dragData.itemCode ?? null,
            itemHours: dragData.hours,
            projectId: dragData.projectId || "",
            stageId: dragData.stageId ?? null,
            czkPerHour: itemCzkPerHour,
            targetWeekKey: weekDate,
            targetWeekNum,
            availableHours: Math.round(available),
            spillWeekKey: spillWeek.key,
            spillWeekNum: spillWeek.weekNum,
            source: dragData.type === "inbox-item" ? "inbox" : "schedule",
            inboxItemId: dragData.type === "inbox-item" ? dragData.itemId : undefined,
            onInsertWhole: doInsertWhole,
          });
          return;
        }
      }

      if (dragData.type === "inbox-item" && dragData.itemId) {
        await moveInboxItemToWeek(dragData.itemId, weekDate);
      } else if (dragData.type === "inbox-project" && dragData.projectId) {
        await moveInboxProjectToWeek(dragData.projectId, weekDate);
      } else if (dragData.type === "silo-item" && dragData.itemId) {
        if (dragData.weekDate !== weekDate) {
          await moveScheduleItemToWeek(dragData.itemId, weekDate);
        }
    } else if (dragData.type === "silo-bundle" && dragData.projectId && dragData.weekDate) {
        if (dragData.weekDate !== weekDate) {
          const sourceSilo = scheduleData?.get(dragData.weekDate);
          const sourceBundle = sourceSilo?.bundles.find(b => b.project_id === dragData.projectId);
          if (sourceBundle) {
            const splitItems = sourceBundle.items.filter(item =>
              item.split_group_id && findSiblingInWeek(item.split_group_id, weekDate, item.id)
            );
            if (splitItems.length > 0) {
              const uniqueGroupIds = [...new Set(splitItems.map(i => i.split_group_id!))];
              setMergeState({
                itemName: sourceBundle.project_name || dragData.projectName || "Bundle",
                splitGroupIds: uniqueGroupIds,
                mergeItemCount: splitItems.length,
                draggedItemId: splitItems[0].id,
                targetWeekKey: weekDate,
                onKeepSeparate: async () => {
                  await moveBundleToWeek(dragData.projectId!, dragData.weekDate!, weekDate);
                },
              });
              return;
            }
          }
          await moveBundleToWeek(dragData.projectId, dragData.weekDate, weekDate);
        }
      }
  }, [moveInboxItemToWeek, moveInboxProjectToWeek, moveScheduleItemToWeek, moveBundleToWeek,
    moveItemBackToInbox, returnBundleToInbox, scheduleData, weeklyCapacity, hourlyRate,
    findSpillWeek, findSiblingInWeek, mergeSplitItems, resolveTargetWeek]);

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Načítání...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  if (isMobile) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background px-6 text-center gap-4">
        <p className="text-lg font-medium text-foreground">Plán Výroby je dostupný pouze na počítači</p>
        <button
          onClick={() => navigate("/")}
          className="text-sm text-primary font-medium hover:underline"
        >
          ← Zpět na projekty
        </button>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: "#f4f2f0" }}>
        {profile?.email === "alfred@ami-test.cz" && (
          <div className="bg-orange-500 text-white px-6 flex items-center justify-center gap-2 font-bold tracking-wide shrink-0" style={{ height: 32 }}>
            <span>⚠ TEST MODE — Testovací prostředí — data nejsou produkční</span>
          </div>
        )}
        <ProductionHeader />

        {/* Row 2: Tabs + Search + Display mode + Stats + Period */}
        <ToolbarRow2
          viewTab={viewTab}
          setViewTab={setViewTab}
          displayMode={displayMode}
          onDisplayModeChange={setDisplayMode}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {viewTab === "kanban" ? (
          <div className="flex-1 flex min-h-0" onClick={() => setSelectedProjectId(null)}>
            <InboxPanel overDroppableId={overDroppableId} showCzk={showCzk} onNavigateToTPV={handleNavigateToTPV} onOpenProjectDetail={handleOpenProjectDetail} disableDropZone={isDraggingFromInbox} selectedProjectId={selectedProjectId} onSelectProject={handleSelectProject} />
            <WeeklySilos showCzk={showCzk} onToggleCzk={(v) => setDisplayMode(v ? "czk" : "hours")} overDroppableId={overDroppableId} onNavigateToTPV={handleNavigateToTPV} onOpenProjectDetail={handleOpenProjectDetail} displayMode={displayMode} onDisplayModeChange={setDisplayMode} selectedProjectId={selectedProjectId} onSelectProject={handleSelectProject} />
            <ExpedicePanel showCzk={showCzk} onNavigateToTPV={handleNavigateToTPV} onOpenProjectDetail={handleOpenProjectDetail} selectedProjectId={selectedProjectId} onSelectProject={handleSelectProject} />
          </div>
        ) : (
          <PlanVyrobyTableView displayMode={displayMode} searchQuery={searchQuery} onNavigateToTPV={handleNavigateToTPV} onOpenProjectDetail={handleOpenProjectDetail} />
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? <DragOverlayContent data={activeDrag} /> : null}
      </DragOverlay>

      {autoSplitState && (
        <AutoSplitPopover
          open={!!autoSplitState}
          onOpenChange={open => !open && setAutoSplitState(null)}
          {...autoSplitState}
        />
      )}

      {mergeState && (
        <MergePopover
          open={!!mergeState}
          onOpenChange={open => !open && setMergeState(null)}
          itemName={mergeState.itemName}
          mergeItemCount={mergeState.mergeItemCount}
          onMerge={async () => {
            await mergeState.onKeepSeparate();
            for (const gid of mergeState.splitGroupIds) {
              await mergeSplitItems(gid);
            }
          }}
          onKeepSeparate={mergeState.onKeepSeparate}
        />
      )}

      {tpvProject && (
        <Dialog open={!!tpvProjectId} onOpenChange={(open) => { if (!open) setTpvProjectId(null); }}>
          <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] overflow-auto p-0">
            <TPVList
              projectId={tpvProject.project_id}
              projectName={tpvProject.project_name}
              currency={tpvProject.currency || "CZK"}
              onBack={() => setTpvProjectId(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      <ProjectDetailDialog
        project={detailProject as any}
        open={!!detailProjectId}
        onOpenChange={(open) => { if (!open) setDetailProjectId(null); }}
      />
    </DndContext>
  );
}


function ToolbarRow2({ viewTab, setViewTab, displayMode, onDisplayModeChange, searchQuery, onSearchChange }: {
  viewTab: "kanban" | "table";
  setViewTab: (v: "kanban" | "table") => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (m: DisplayMode) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}) {
  const { data: settings } = useProductionSettings();
  const { data: scheduleData } = useProductionSchedule();
  const { data: inboxProjects = [] } = useProductionInbox();
  const getWeekCapacity = useWeekCapacityLookup();

   type StatsScope = "week" | "month" | "all";
  const statsScope: StatsScope = "month";

  const hourlyRate = settings?.hourly_rate ?? 550;
  const inboxHours = inboxProjects.reduce((s, p) => s + p.total_hours, 0);

  // Current week key
  const currentWeekKey = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split("T")[0];
  }, []);

  // Current month boundaries (week keys whose Monday falls in the current month)
  const currentMonthWeekKeys = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const keys: string[] = [];
    // Generate all Mondays that fall within this calendar month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    // Find the Monday on or before first day of month
    const d = new Date(firstDay);
    const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    // Iterate through Mondays
    while (d <= lastDay) {
      // Include if Monday falls within this month
      if (d.getMonth() === month && d.getFullYear() === year) {
        keys.push(d.toISOString().split("T")[0]);
      }
      d.setDate(d.getDate() + 7);
    }
    // Also check weeks from schedule data that have any day in this month
    if (scheduleData) {
      for (const weekKey of scheduleData.keys()) {
        const monday = new Date(weekKey + "T00:00:00");
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        if ((monday.getMonth() === month && monday.getFullYear() === year) ||
            (sunday.getMonth() === month && sunday.getFullYear() === year)) {
          if (!keys.includes(weekKey)) keys.push(weekKey);
        }
      }
    }
    return keys;
  }, [scheduleData]);

  const { capacityHours, scheduledHours, scheduledCzk } = useMemo(() => {
    if (!scheduleData) return { capacityHours: 0, scheduledHours: 0, scheduledCzk: 0 };

    let cap = 0;
    let hours = 0;
    let czk = 0;
    for (const wk of currentMonthWeekKeys) {
      cap += getWeekCapacity(wk);
      const silo = scheduleData.get(wk);
      if (silo) {
        hours += silo.total_hours;
        czk += silo.bundles.reduce((s, b) => s + b.items.reduce((ss, i) => ss + i.scheduled_czk, 0), 0);
      }
    }
    return { capacityHours: cap, scheduledHours: hours, scheduledCzk: czk };
  }, [scheduleData, currentMonthWeekKeys, getWeekCapacity]);

  const isOverCapacity = scheduledHours > capacityHours;
  const displayCzk = scheduledCzk;

  const formatCzk = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M Kč`;
    if (v >= 1_000) return `${Math.round(v / 1_000)}K Kč`;
    return `${v.toLocaleString("cs-CZ")} Kč`;
  };

  const periodLabel = useMemo(() => {
    if (!scheduleData || scheduleData.size === 0) return "";
    const weeks = Array.from(scheduleData.keys()).sort();
    const first = new Date(weeks[0] + "T00:00:00");
    const last = new Date(weeks[weeks.length - 1] + "T00:00:00");
    const months = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];
    if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
      return `${months[first.getMonth()]} ${first.getFullYear()}`;
    }
    if (first.getFullYear() === last.getFullYear()) {
      return `${months[first.getMonth()]} – ${months[last.getMonth()]} ${first.getFullYear()}`;
    }
    return `${months[first.getMonth()]} ${first.getFullYear()} – ${months[last.getMonth()]} ${last.getFullYear()}`;
  }, [scheduleData]);


  return (
    <div className="shrink-0 border-b border-border px-6 py-1.5 flex items-center gap-4 bg-card" style={{ minHeight: 40 }}>
      {/* Left: Tabs */}
      <div className="inline-flex h-9 items-center rounded-md bg-card border border-border p-1 shrink-0">
        <button
          onClick={() => setViewTab("kanban")}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium transition-all ${
            viewTab === "kanban"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Kanban
        </button>
        <button
          onClick={() => setViewTab("table")}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium transition-all ${
            viewTab === "table"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Tabulka
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Center: Scope toggle + Stats */}
      <div className="flex items-center gap-2 shrink-0">

        <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
          <span>Kapacita <span className="font-semibold text-foreground">{Math.round(capacityHours).toLocaleString("cs-CZ")}h</span></span>
          <span className="text-border">·</span>
          <span>CZK <span className="font-semibold text-foreground">{formatCzk(displayCzk)}</span></span>
          <span className="text-border">·</span>
          <span>Naplánováno <span className="font-semibold" style={{ color: isOverCapacity ? "hsl(var(--destructive))" : "hsl(142 76% 36%)" }}>{Math.round(scheduledHours).toLocaleString("cs-CZ")}h</span></span>
          <span className="text-border">·</span>
          <span>V Inboxu <span className="font-semibold" style={{ color: "#d97706" }}>{Math.round(inboxHours).toLocaleString("cs-CZ")}h</span></span>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: Display mode + Search */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="inline-flex h-8 items-center rounded-md bg-card border border-border p-0.5">
          {([
            { key: "hours" as DisplayMode, label: "Hodiny" },
            { key: "czk" as DisplayMode, label: "Hodnota" },
            { key: "percent" as DisplayMode, label: "%" },
          ]).map(m => (
            <button
              key={m.key}
              onClick={() => onDisplayModeChange(m.key)}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-1 text-xs font-medium transition-all ${
                displayMode === m.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="relative w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Hledat projekt..."
            className="w-full h-8 pl-8 pr-8 rounded-md text-sm bg-background border border-input placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
