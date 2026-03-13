import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useWeekCapacityLookup } from "@/hooks/useWeeklyCapacity";
import { Search, X, Sparkles, Loader2 } from "lucide-react";
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
import { DeadlineWarningDialog } from "@/components/production/DeadlineWarningDialog";
import { resolveDeadline, checkDeadlineWarning } from "@/lib/deadlineWarning";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useForecastMode } from "@/hooks/useForecastMode";
import { ForecastCommitBar } from "@/components/production/ForecastCommitBar";
import { Switch } from "@/components/ui/switch";

export type DisplayMode = "hours" | "czk" | "percent";
type ViewTab = "kanban" | "table";

interface ActiveDragData {
  type: "inbox-item" | "inbox-items" | "inbox-project" | "silo-item" | "silo-bundle";
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
  /** For inbox-items: array of item IDs to schedule as a batch */
  batchItemIds?: string[];
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
  const { isAdmin, isOwner, loading, profile } = useAuth();
  const navigate = useNavigate();
  const { setCurrentPage } = useUndoRedo();
  const [displayMode, setDisplayMode] = useState<DisplayMode>("hours");
  const [viewTab, setViewTab] = useState<ViewTab>("kanban");
  const forecast = useForecastMode();
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleSearchChange = useCallback((v: string) => {
    setSearchInput(v);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSearchQuery(v), 300);
  }, []);
  useEffect(() => () => clearTimeout(searchTimerRef.current), []);
  const showCzk = displayMode === "czk";
  const [activeDrag, setActiveDrag] = useState<ActiveDragData | null>(null);
  const isDraggingFromInbox = activeDrag?.type === "inbox-item" || activeDrag?.type === "inbox-items" || activeDrag?.type === "inbox-project";
  const [overDroppableId, setOverDroppableId] = useState<string | null>(null);
  const [autoSplitState, setAutoSplitState] = useState<AutoSplitState | null>(null);
  const [mergeState, setMergeState] = useState<MergeState | null>(null);
  const [tpvProjectId, setTpvProjectId] = useState<string | null>(null);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [deadlineWarning, setDeadlineWarning] = useState<{
    projectName: string;
    deadlineLabel: string;
    deadlineDate: Date;
    weekLabel: string;
  } | null>(null);
  const pendingDeadlineAction = useRef<(() => Promise<void>) | null>(null);

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

  const formatWeekLabel = useCallback((weekKey: string): string => {
    const d = new Date(weekKey);
    const weekNum = getISOWeekNumber(d);
    const end = new Date(d);
    end.setDate(d.getDate() + 6);
    return `T${weekNum} · ${d.getDate()}.${d.getMonth() + 1}–${end.getDate()}.${end.getMonth() + 1}.${end.getFullYear()}`;
  }, []);

  /** Returns true if action should proceed, false if blocked by hard warning */
  const checkAndWarnDeadline = useCallback((projectId: string, weekKey: string, action: () => Promise<void>): boolean => {
    const project = allProjects.find(p => p.project_id === projectId);
    if (!project) return true;
    const deadline = resolveDeadline(project);
    const weekStart = new Date(weekKey);
    const result = checkDeadlineWarning(deadline, weekStart);

    if (result.level === "hard" && result.deadline) {
      pendingDeadlineAction.current = action;
      setDeadlineWarning({
        projectName: project.project_name,
        deadlineLabel: result.deadline.fieldLabel,
        deadlineDate: result.deadline.date,
        weekLabel: formatWeekLabel(weekKey),
      });
      return false;
    }

    if (result.level === "soft" && result.deadline) {
      const formattedDate = format(result.deadline.date, "d.M.yyyy");
      toast({
        title: `⏰ Blíží se termín: ${project.project_name}`,
        description: `${result.deadline.fieldLabel} za ${result.daysUntilDeadline} dní (${formattedDate})`,
        className: "border-amber-400 bg-amber-50 text-amber-900",
      });
    }

    return true;
  }, [allProjects, formatWeekLabel]);

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

      const projectId = dragData.projectId || "";

      if (dragData.type === "inbox-items" && dragData.batchItemIds && dragData.batchItemIds.length > 0) {
        // Batch schedule all checked items to the same week
        const action = async () => {
          for (const itemId of dragData.batchItemIds!) {
            await moveInboxItemToWeek(itemId, weekDate);
          }
          const weekNum = getISOWeekNumber(new Date(weekDate));
          toast({
            title: `${dragData.batchItemIds!.length} položek naplánováno do T${weekNum}`,
          });
        };
        if (!checkAndWarnDeadline(projectId, weekDate, action)) return;
        await action();
      } else if (dragData.type === "inbox-item" && dragData.itemId) {
        const action = async () => { await moveInboxItemToWeek(dragData.itemId!, weekDate); };
        if (!checkAndWarnDeadline(projectId, weekDate, action)) return;
        await action();
      } else if (dragData.type === "inbox-project" && dragData.projectId) {
        const action = async () => { await moveInboxProjectToWeek(dragData.projectId!, weekDate); };
        if (!checkAndWarnDeadline(dragData.projectId, weekDate, action)) return;
        await action();
      } else if (dragData.type === "silo-item" && dragData.itemId) {
        if (dragData.weekDate !== weekDate) {
          const action = async () => { await moveScheduleItemToWeek(dragData.itemId!, weekDate); };
          if (!checkAndWarnDeadline(projectId, weekDate, action)) return;
          await action();
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
          const action = async () => { await moveBundleToWeek(dragData.projectId!, dragData.weekDate!, weekDate); };
          if (!checkAndWarnDeadline(dragData.projectId, weekDate, action)) return;
          await action();
        }
      }
  }, [moveInboxItemToWeek, moveInboxProjectToWeek, moveScheduleItemToWeek, moveBundleToWeek,
    moveItemBackToInbox, returnBundleToInbox, scheduleData, weeklyCapacity, hourlyRate,
    findSpillWeek, findSiblingInWeek, mergeSplitItems, resolveTargetWeek, checkAndWarnDeadline]);

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
      <div
        className="h-screen flex flex-col overflow-hidden transition-colors duration-300"
        style={{ backgroundColor: forecast.forecastActive ? "#111318" : "#f4f2f0" }}
      >
        {profile?.email === "alfred@ami-test.cz" && (
          <div className="bg-orange-500 text-white px-6 flex items-center justify-center gap-2 font-bold tracking-wide shrink-0" style={{ height: 32 }}>
            <span>⚠ TEST MODE — Testovací prostředí — data nejsou produkční</span>
          </div>
        )}
        <ProductionHeader />

        {/* Row 2: Tabs + Search + Display mode + Stats + Period + Forecast toggle */}
        <ToolbarRow2
          viewTab={viewTab}
          setViewTab={setViewTab}
          displayMode={displayMode}
          onDisplayModeChange={setDisplayMode}
          searchQuery={searchInput}
          onSearchChange={handleSearchChange}
          forecastActive={forecast.forecastActive}
          onForecastToggle={(v) => {
            forecast.setForecastActive(v);
            if (v) {
              forecast.generateForecast(weeklyCapacity);
            }
          }}
          forecastPlanMode={forecast.planMode}
          onForecastPlanModeChange={(m) => {
            forecast.setPlanMode(m);
            // Re-generate with new mode
            forecast.clearForecast();
            setTimeout(() => forecast.generateForecast(weeklyCapacity), 100);
          }}
          isOwner={isOwner}
          isGenerating={forecast.isGenerating}
        />

        {viewTab === "kanban" ? (
          <div className="flex-1 flex min-h-0" onClick={() => setSelectedProjectId(null)}>
            <InboxPanel overDroppableId={overDroppableId} showCzk={showCzk} onNavigateToTPV={handleNavigateToTPV} onOpenProjectDetail={handleOpenProjectDetail} disableDropZone={isDraggingFromInbox} selectedProjectId={selectedProjectId} onSelectProject={handleSelectProject} searchQuery={searchQuery} />
            <WeeklySilos
              showCzk={showCzk}
              onToggleCzk={(v) => setDisplayMode(v ? "czk" : "hours")}
              overDroppableId={overDroppableId}
              onNavigateToTPV={handleNavigateToTPV}
              onOpenProjectDetail={handleOpenProjectDetail}
              displayMode={displayMode}
              onDisplayModeChange={setDisplayMode}
              selectedProjectId={selectedProjectId}
              onSelectProject={handleSelectProject}
              searchQuery={searchQuery}
              forecastBlocks={forecast.forecastActive ? forecast.forecastBlocks : undefined}
              forecastSelectedIds={forecast.forecastActive ? forecast.selectedBlockIds : undefined}
              onToggleForecastSelect={forecast.forecastActive ? forecast.toggleBlockSelection : undefined}
              forecastDarkMode={forecast.forecastActive}
            />
            <ExpedicePanel showCzk={showCzk} onNavigateToTPV={handleNavigateToTPV} onOpenProjectDetail={handleOpenProjectDetail} selectedProjectId={selectedProjectId} onSelectProject={handleSelectProject} searchQuery={searchQuery} />
          </div>
        ) : (
          <PlanVyrobyTableView displayMode={displayMode} searchQuery={searchQuery} onNavigateToTPV={handleNavigateToTPV} onOpenProjectDetail={handleOpenProjectDetail} />
        )}

        {/* Forecast commit bar */}
        {forecast.forecastActive && (
          <ForecastCommitBar
            totalBlocks={forecast.forecastBlocks.length}
            selectedCount={forecast.selectedBlockIds.size}
            inboxBlockCount={forecast.forecastBlocks.filter(b => b.source === "inbox_item").length}
            projectBlockCount={forecast.forecastBlocks.filter(b => b.source === "project_estimate").length}
            isGenerating={forecast.isGenerating}
            onCommitAll={() => forecast.commitBlocks(forecast.forecastBlocks.map(b => b.id))}
            onCommitSelected={() => forecast.commitBlocks(Array.from(forecast.selectedBlockIds))}
            onCommitInboxOnly={() => forecast.commitInboxOnly()}
            onCancel={() => forecast.setForecastActive(false)}
            onSelectAll={forecast.selectAll}
            onDeselectAll={forecast.deselectAll}
          />
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


function ToolbarRow2({ viewTab, setViewTab, displayMode, onDisplayModeChange, searchQuery, onSearchChange, forecastActive, onForecastToggle, forecastPlanMode, onForecastPlanModeChange, isOwner, isGenerating }: {
  viewTab: "kanban" | "table";
  setViewTab: (v: "kanban" | "table") => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (m: DisplayMode) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  forecastActive: boolean;
  onForecastToggle: (v: boolean) => void;
  forecastPlanMode: "respect_plan" | "from_scratch";
  onForecastPlanModeChange: (m: "respect_plan" | "from_scratch") => void;
  isOwner: boolean;
  isGenerating: boolean;
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
    <div
      className="shrink-0 border-b px-6 py-1.5 flex items-center gap-4 transition-colors duration-300"
      style={{
        minHeight: 40,
        backgroundColor: forecastActive ? "#1c2333" : "hsl(var(--card))",
        borderColor: forecastActive ? "#2a2f3d" : "hsl(var(--border))",
      }}
    >
      {/* Left: Tabs */}
      <div className="inline-flex h-8 items-center rounded-md p-0.5 shrink-0" style={{
        backgroundColor: forecastActive ? "#111318" : "hsl(var(--card))",
        border: forecastActive ? "1px solid #2a2f3d" : "1px solid hsl(var(--border))",
      }}>
        <button
          onClick={() => setViewTab("kanban")}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-1 text-[13px] font-medium transition-all ${
            viewTab === "kanban"
              ? forecastActive ? "bg-amber-600 text-white shadow-sm" : "bg-primary text-primary-foreground shadow-sm"
              : forecastActive ? "text-gray-400 hover:text-gray-200" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Kanban
        </button>
        <button
          onClick={() => setViewTab("table")}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-1 text-[13px] font-medium transition-all ${
            viewTab === "table"
              ? forecastActive ? "bg-amber-600 text-white shadow-sm" : "bg-primary text-primary-foreground shadow-sm"
              : forecastActive ? "text-gray-400 hover:text-gray-200" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Tabulka
        </button>
      </div>

      {/* Forecast badge */}
      {forecastActive && (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(245,158,11,0.15)" }}>
          <Sparkles className="h-3 w-3" style={{ color: "#f59e0b" }} />
          <span className="text-[11px] font-bold" style={{ color: "#f59e0b" }}>FORECAST MODE</span>
          {isGenerating && <Loader2 className="h-3 w-3 animate-spin" style={{ color: "#f59e0b" }} />}
        </div>
      )}

      {/* Forecast plan mode toggle */}
      {forecastActive && (
        <div className="inline-flex h-7 items-center rounded-md p-0.5 shrink-0" style={{ backgroundColor: "#111318", border: "1px solid #2a2f3d" }}>
          <button
            onClick={() => onForecastPlanModeChange("respect_plan")}
            className={`px-2 py-0.5 text-[11px] font-medium rounded-sm transition-all ${
              forecastPlanMode === "respect_plan" ? "bg-amber-600 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Respektovat plán
          </button>
          <button
            onClick={() => onForecastPlanModeChange("from_scratch")}
            className={`px-2 py-0.5 text-[11px] font-medium rounded-sm transition-all ${
              forecastPlanMode === "from_scratch" ? "bg-amber-600 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Od začátku
          </button>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Center: Stats */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1 text-xs font-mono" style={{ color: forecastActive ? "#9ca3af" : undefined }}>
          <span>Kapacita <span className="font-semibold" style={{ color: forecastActive ? "#e5e7eb" : undefined }}>{Math.round(capacityHours).toLocaleString("cs-CZ")}h</span></span>
          <span style={{ color: forecastActive ? "#4b5563" : undefined }}>·</span>
          <span>CZK <span className="font-semibold" style={{ color: forecastActive ? "#e5e7eb" : undefined }}>{formatCzk(displayCzk)}</span></span>
          <span style={{ color: forecastActive ? "#4b5563" : undefined }}>·</span>
          <span>Naplánováno <span style={{ fontWeight: 600, color: isOverCapacity ? "hsl(var(--destructive))" : "hsl(142 76% 36%)" }}>{Math.round(scheduledHours).toLocaleString("cs-CZ")}h</span></span>
          <span style={{ color: forecastActive ? "#4b5563" : undefined }}>·</span>
          <span>V Inboxu <span style={{ fontWeight: 600, color: "#d97706" }}>{Math.round(inboxHours).toLocaleString("cs-CZ")}h</span></span>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: Display mode + Search + Forecast toggle */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="inline-flex h-8 items-center rounded-md p-0.5" style={{
          backgroundColor: forecastActive ? "#111318" : "hsl(var(--card))",
          border: forecastActive ? "1px solid #2a2f3d" : "1px solid hsl(var(--border))",
        }}>
          {([
            { key: "hours" as DisplayMode, label: "Hodiny" },
            { key: "czk" as DisplayMode, label: "Hodnota" },
            { key: "percent" as DisplayMode, label: "%" },
          ]).map(m => (
            <button
              key={m.key}
              onClick={() => onDisplayModeChange(m.key)}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-1 text-[13px] font-medium transition-all ${
                displayMode === m.key
                  ? forecastActive ? "bg-amber-600 text-white shadow-sm" : "bg-primary text-primary-foreground shadow-sm"
                  : forecastActive ? "text-gray-400 hover:text-gray-200" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="relative w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: forecastActive ? "#6b7280" : undefined }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Hledat projekt..."
            className="w-full h-8 pl-8 pr-8 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 transition-colors"
            style={{
              backgroundColor: forecastActive ? "#111318" : "hsl(var(--background))",
              border: forecastActive ? "1px solid #2a2f3d" : "1px solid hsl(var(--input))",
              color: forecastActive ? "#e5e7eb" : undefined,
            }}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors"
              style={{ color: forecastActive ? "#6b7280" : undefined }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Forecast toggle — owner only */}
        {isOwner && (
          <div className="flex items-center gap-1.5 ml-2 pl-2" style={{ borderLeft: forecastActive ? "1px solid #2a2d3e" : "1px solid hsl(var(--border))" }}>
            <Sparkles className="h-3.5 w-3.5" style={{ color: forecastActive ? "#f59e0b" : "#9ca3af" }} />
            <span className="text-[12px] font-medium" style={{ color: forecastActive ? "#f59e0b" : "#6b7280" }}>Forecast</span>
            <Switch
              checked={forecastActive}
              onCheckedChange={onForecastToggle}
              className="data-[state=checked]:bg-amber-500"
            />
          </div>
        )}
      </div>
    </div>
  );
}
