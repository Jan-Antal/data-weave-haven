import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ProductionHeader } from "@/components/production/ProductionHeader";
import { InboxPanel } from "@/components/production/InboxPanel";
import { WeeklySilos } from "@/components/production/WeeklySilos";
import { ExpedicePanel } from "@/components/production/ExpedicePanel";
import { DragOverlayContent } from "@/components/production/DragOverlayContent";
import { ArrowLeft } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useProductionDragDrop } from "@/hooks/useProductionDragDrop";

interface ActiveDragData {
  type: "inbox-item" | "inbox-project" | "silo-item" | "silo-bundle";
  itemId?: string;
  itemName?: string;
  projectId?: string;
  projectName?: string;
  weekDate?: string;
  hours?: number;
  itemCount?: number;
}

export default function PlanVyroby() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [showCzk, setShowCzk] = useState(false);
  const [activeDrag, setActiveDrag] = useState<ActiveDragData | null>(null);
  const [overDroppableId, setOverDroppableId] = useState<string | null>(null);
  const {
    moveInboxItemToWeek,
    moveInboxProjectToWeek,
    moveScheduleItemToWeek,
    moveBundleToWeek,
    moveItemBackToInbox,
  } = useProductionDragDrop();

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate("/", { replace: true });
    }
  }, [isAdmin, loading, navigate]);

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

    // Dropped back on inbox
    if (targetId === "inbox-drop-zone") {
      if (dragData.type === "silo-item" && dragData.itemId) {
        await moveItemBackToInbox(dragData.itemId);
      }
      return;
    }

    // Dropped on a silo (silo-week-YYYY-MM-DD)
    if (targetId.startsWith("silo-week-")) {
      const weekDate = targetId.replace("silo-week-", "");

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
  }, [moveInboxItemToWeek, moveInboxProjectToWeek, moveScheduleItemToWeek, moveBundleToWeek, moveItemBackToInbox]);

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
        {/* Standard app header */}
        <header className="border-b bg-primary px-6 py-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-serif text-primary-foreground tracking-wide">
                A→M <span className="font-sans font-normal text-base opacity-80">Interior</span>
              </h1>
              <span className="text-primary-foreground/40 text-sm">|</span>
              <span className="text-primary-foreground/70 text-sm font-sans font-medium">Plán Výroby</span>
            </div>
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Zpět na přehled
            </button>
          </div>
        </header>

        {/* Stats bar */}
        <ProductionHeader />

        {/* Three-zone layout */}
        <div className="flex-1 flex min-h-0">
          <InboxPanel overDroppableId={overDroppableId} />
          <WeeklySilos showCzk={showCzk} onToggleCzk={setShowCzk} overDroppableId={overDroppableId} />
          <ExpedicePanel />
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? <DragOverlayContent data={activeDrag} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
