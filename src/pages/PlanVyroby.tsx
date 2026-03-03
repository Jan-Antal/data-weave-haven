import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ProductionHeader } from "@/components/production/ProductionHeader";
import { InboxPanel } from "@/components/production/InboxPanel";
import { WeeklySilos } from "@/components/production/WeeklySilos";
import { ExpedicePanel } from "@/components/production/ExpedicePanel";
import { DragOverlayContent } from "@/components/production/DragOverlayContent";
import { AutoSplitPopover } from "@/components/production/AutoSplitPopover";
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

export default function PlanVyroby() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [showCzk, setShowCzk] = useState(false);
  const [activeDrag, setActiveDrag] = useState<ActiveDragData | null>(null);
  const [overDroppableId, setOverDroppableId] = useState<string | null>(null);
  const [autoSplitState, setAutoSplitState] = useState<AutoSplitState | null>(null);
  const { data: scheduleData } = useProductionSchedule();
  const { data: settings } = useProductionSettings();
  const {
    moveInboxItemToWeek,
    moveInboxProjectToWeek,
    moveScheduleItemToWeek,
    moveBundleToWeek,
    moveItemBackToInbox,
    returnBundleToInbox,
  } = useProductionDragDrop();

  const weeklyCapacity = Math.round((settings?.monthly_capacity_hours ?? 3500) / 4);
  const hourlyRate = settings?.hourly_rate ?? 550;

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate("/", { replace: true });
    }
  }, [isAdmin, loading, navigate]);

  // Helper to find first future week with capacity after a given week
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
    // Fallback: next week after target
    const target = new Date(afterWeekKey);
    target.setDate(target.getDate() + 7);
    return { key: target.toISOString().split("T")[0], weekNum: getISOWeekNumber(target) };
  }, [scheduleData, weeklyCapacity]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as ActiveDragData | undefined;
    if (data) setActiveDrag(data);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverDroppableId(event.over?.id?.toString() ?? null);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDrag(null);
    setOverDroppableId(null);

    if (!over || !active.data.current) return;

    const dragData = active.data.current as ActiveDragData;
    const targetId = over.id.toString();

    if (targetId === "inbox-drop-zone") {
      if (dragData.type === "silo-item" && dragData.itemId) {
        await moveItemBackToInbox(dragData.itemId);
      } else if (dragData.type === "silo-bundle" && dragData.projectId && dragData.weekDate) {
        await returnBundleToInbox(dragData.projectId, dragData.weekDate);
      }
      return;
    }

    if (targetId.startsWith("silo-week-")) {
      const weekDate = targetId.replace("silo-week-", "");

      // Check for auto-split on single items (inbox-item or silo-item)
      if ((dragData.type === "inbox-item" || dragData.type === "silo-item") && dragData.hours) {
        const targetUsed = scheduleData?.get(weekDate)?.total_hours ?? 0;
        // If dragging from same week, subtract the item's own hours from used
        const effectiveUsed = (dragData.type === "silo-item" && dragData.weekDate === weekDate)
          ? targetUsed
          : targetUsed;
        const available = weeklyCapacity - effectiveUsed;

        if (dragData.hours > available && available > 0) {
          // Show auto-split popover
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
          return; // Don't do normal drop
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
          await moveBundleToWeek(dragData.projectId, dragData.weekDate, weekDate);
        }
      }
    }
  }, [moveInboxItemToWeek, moveInboxProjectToWeek, moveScheduleItemToWeek, moveBundleToWeek, moveItemBackToInbox, returnBundleToInbox, scheduleData, weeklyCapacity, hourlyRate, findSpillWeek]);

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
          <InboxPanel overDroppableId={overDroppableId} showCzk={showCzk} />
          <WeeklySilos showCzk={showCzk} onToggleCzk={setShowCzk} overDroppableId={overDroppableId} />
          <ExpedicePanel showCzk={showCzk} />
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? <DragOverlayContent data={activeDrag} /> : null}
      </DragOverlay>

      {/* Auto-split popover */}
      {autoSplitState && (
        <AutoSplitPopover
          open={!!autoSplitState}
          onOpenChange={(open) => !open && setAutoSplitState(null)}
          {...autoSplitState}
        />
      )}
    </DndContext>
  );
}
