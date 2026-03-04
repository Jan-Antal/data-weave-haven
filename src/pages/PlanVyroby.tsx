import { useEffect, useState, useCallback } from "react";
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
import { useProjects } from "@/hooks/useProjects";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useProductionDragDrop } from "@/hooks/useProductionDragDrop";
import { useProductionSchedule, getISOWeekNumber } from "@/hooks/useProductionSchedule";
import { useProductionSettings } from "@/hooks/useProductionSettings";

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
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const { setCurrentPage } = useUndoRedo();
  const [showCzk, setShowCzk] = useState(false);
  const [activeDrag, setActiveDrag] = useState<ActiveDragData | null>(null);
  const [overDroppableId, setOverDroppableId] = useState<string | null>(null);
  const [autoSplitState, setAutoSplitState] = useState<AutoSplitState | null>(null);
  const [mergeState, setMergeState] = useState<MergeState | null>(null);
  const [tpvProjectId, setTpvProjectId] = useState<string | null>(null);
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

  const weeklyCapacity = Math.round((settings?.monthly_capacity_hours ?? 3500) / 4);
  const hourlyRate = settings?.hourly_rate ?? 550;

  useEffect(() => {
    setCurrentPage("plan-vyroby");
    return () => setCurrentPage(null);
  }, [setCurrentPage]);

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate("/", { replace: true });
    }
  }, [isAdmin, loading, navigate]);

  const tpvProject = tpvProjectId ? allProjects.find(p => p.project_id === tpvProjectId) : null;

  const handleNavigateToTPV = useCallback((projectId: string, _itemCode?: string | null) => {
    setTpvProjectId(projectId);
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

  // Check if dropping a split item onto a sibling in the target week
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

  // Resolve the target week from any droppable ID
  const resolveTargetWeek = useCallback((targetId: string, dragData: ActiveDragData): string | null => {
    if (targetId.startsWith("silo-week-")) {
      return targetId.replace("silo-week-", "");
    }
    // Dropped on a specific item or bundle inside a silo — find its week
    if (targetId.startsWith("silo-item-") || targetId.startsWith("silo-bundle-")) {
      // Search schedule data for the item/bundle's week
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

    // If dropped with no target (same position), check for same-week merge opportunity
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
            onKeepSeparate: async () => { /* no-op, already in same week */ },
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

      // Check for merge: dragging split item onto sibling
      if (dragData.type === "silo-item" && dragData.splitGroupId && dragData.itemId) {
        const sibling = findSiblingInWeek(dragData.splitGroupId, weekDate, dragData.itemId);
        if (sibling) {
          // Show merge popover
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

      // Check for auto-split on single items
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

      // Normal drop logic
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
          // Check if any items in the bundle have split siblings in the target week
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

  return (
    <DndContext
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: "#f4f2f0" }}>
        <ProductionHeader />
        <div className="flex-1 flex min-h-0">
          <InboxPanel overDroppableId={overDroppableId} showCzk={showCzk} onNavigateToTPV={handleNavigateToTPV} />
          <WeeklySilos showCzk={showCzk} onToggleCzk={setShowCzk} overDroppableId={overDroppableId} onNavigateToTPV={handleNavigateToTPV} />
          <ExpedicePanel showCzk={showCzk} onNavigateToTPV={handleNavigateToTPV} />
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? <DragOverlayContent data={activeDrag} /> : null}
      </DragOverlay>

      {/* Auto-split popover */}
      {autoSplitState && (
        <AutoSplitPopover
          open={!!autoSplitState}
          onOpenChange={open => !open && setAutoSplitState(null)}
          {...autoSplitState}
        />
      )}

      {/* Merge popover */}
      {mergeState && (
        <MergePopover
          open={!!mergeState}
          onOpenChange={open => !open && setMergeState(null)}
          itemName={mergeState.itemName}
          mergeItemCount={mergeState.mergeItemCount}
          onMerge={async () => {
            // First move (bundle or item), then merge all groups
            await mergeState.onKeepSeparate();
            for (const gid of mergeState.splitGroupIds) {
              await mergeSplitItems(gid);
            }
          }}
          onKeepSeparate={mergeState.onKeepSeparate}
        />
      )}

      {/* TPV Navigation Dialog */}
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
    </DndContext>
  );
}
