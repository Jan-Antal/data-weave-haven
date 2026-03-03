import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { GripVertical, ChevronRight } from "lucide-react";
import { useProductionSchedule, getISOWeekNumber, type WeekSilo, type ScheduleBundle, type ScheduleItem } from "@/hooks/useProductionSchedule";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { getProjectColor } from "@/lib/projectColors";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ProductionContextMenu, type ContextMenuAction } from "./ProductionContextMenu";
import { CompletionDialog } from "./CompletionDialog";
import { SpillSuggestionPanel } from "./SpillSuggestionPanel";
import { useProductionDragDrop } from "@/hooks/useProductionDragDrop";

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

interface Props {
  showCzk: boolean;
  onToggleCzk: (v: boolean) => void;
  overDroppableId?: string | null;
}

// Context menu state shared across silos
interface ContextMenuState {
  x: number;
  y: number;
  actions: ContextMenuAction[];
}

interface CompletionState {
  projectName: string;
  projectId: string;
  weekLabel: string;
  items: ScheduleItem[];
  preCheckedIds?: string[];
}

export function WeeklySilos({ showCzk, onToggleCzk, overDroppableId }: Props) {
  const { data: scheduleData } = useProductionSchedule();
  const { data: settings } = useProductionSettings();
  const { moveItemBackToInbox, returnBundleToInbox, returnToProduction } = useProductionDragDrop();

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [completionState, setCompletionState] = useState<CompletionState | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const siloRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [visiblePeriodLabel, setVisiblePeriodLabel] = useState("");

  // Auto-scroll to current week on mount
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollTarget = 4 * 216;
    el.scrollLeft = scrollTarget;
  }, []);

  const weeklyCapacity = Math.round((settings?.monthly_capacity_hours ?? 3500) / 4);

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

  const weekKeys = useMemo(() => weeks.map((w) => w.key), [weeks]);

  // IntersectionObserver to detect visible silos and update period label
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || weeks.length === 0) return;

    const visibleKeys = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout>;

    const updateLabel = () => {
      const visibleWeeks = weeks.filter((w) => visibleKeys.has(w.key));
      if (visibleWeeks.length === 0) return;
      const first = visibleWeeks[0].start;
      const last = visibleWeeks[visibleWeeks.length - 1].start;
      const m1 = first.getMonth();
      const m2 = last.getMonth();
      const y1 = first.getFullYear();
      const y2 = last.getFullYear();
      if (m1 === m2 && y1 === y2) {
        setVisiblePeriodLabel(`${MONTH_NAMES[m1]} ${y1}`);
      } else if (y1 === y2) {
        setVisiblePeriodLabel(`${MONTH_NAMES[m1]} – ${MONTH_NAMES[m2]} ${y1}`);
      } else {
        setVisiblePeriodLabel(`${MONTH_NAMES[m1]} ${y1} – ${MONTH_NAMES[m2]} ${y2}`);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.weekKey;
          if (!key) continue;
          if (entry.isIntersecting) visibleKeys.add(key);
          else visibleKeys.delete(key);
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(updateLabel, 100);
      },
      { root: container, threshold: 0.3 }
    );

    // Observe all registered silo elements
    for (const [, el] of siloRefs.current) {
      observer.observe(el);
    }

    return () => {
      clearTimeout(debounceTimer);
      observer.disconnect();
    };
  }, [weeks]);

  const registerSiloRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) siloRefs.current.set(key, el);
    else siloRefs.current.delete(key);
  }, []);

  const currentWeekKey = useMemo(() => getMonday(new Date()).toISOString().split("T")[0], []);

  // Build a simple map for spill panel
  const weeksCapacityMap = useMemo(() => {
    const map = new Map<string, { total_hours: number }>();
    if (scheduleData) {
      for (const [key, silo] of scheduleData) {
        map.set(key, { total_hours: silo.total_hours });
      }
    }
    return map;
  }, [scheduleData]);

  const handleBundleContextMenu = useCallback(
    (e: React.MouseEvent, bundle: ScheduleBundle, weekKey: string, weekNum: number, startDate: Date, endDate: Date, toggleExpand: () => void) => {
      e.preventDefault();
      e.stopPropagation();
      const hasUncompleted = bundle.items.some((i) => i.status !== "completed");
      const actions: ContextMenuAction[] = [];

      if (hasUncompleted) {
        actions.push({
          label: "Dokončit položky → Expedice",
          icon: "✓",
          onClick: () => {
            setCompletionState({
              projectName: bundle.project_name,
              projectId: bundle.project_id,
              weekLabel: `Výroba T${weekNum} · ${formatDateShort(startDate)} – ${formatDateShort(endDate)}`,
              items: bundle.items,
            });
          },
        });
        actions.push({
          label: "Vrátit do Inboxu",
          icon: "←",
          onClick: () => returnBundleToInbox(bundle.project_id, weekKey),
        });
      }
      actions.push({
        label: "Rozbalit / Sbalit",
        icon: "⇅",
        onClick: toggleExpand,
      });

      setContextMenu({ x: e.clientX, y: e.clientY, actions });
    },
    [returnBundleToInbox]
  );

  const handleItemContextMenu = useCallback(
    (e: React.MouseEvent, item: ScheduleItem, weekKey: string, weekNum: number, startDate: Date, endDate: Date, bundle: ScheduleBundle) => {
      e.preventDefault();
      e.stopPropagation();

      const isCompleted = item.status === "completed";
      const actions: ContextMenuAction[] = [];

      if (isCompleted) {
        actions.push({
          label: "Vrátit do výroby",
          icon: "↩",
          onClick: () => returnToProduction(item.id),
        });
      } else {
        actions.push({
          label: "Dokončit tuto položku → Expedice",
          icon: "✓",
          onClick: () => {
            setCompletionState({
              projectName: bundle.project_name,
              projectId: bundle.project_id,
              weekLabel: `Výroba T${weekNum} · ${formatDateShort(startDate)} – ${formatDateShort(endDate)}`,
              items: bundle.items,
              preCheckedIds: [item.id],
            });
          },
        });
        actions.push({
          label: "Vrátit do Inboxu",
          icon: "←",
          onClick: () => moveItemBackToInbox(item.id),
        });
      }

      setContextMenu({ x: e.clientX, y: e.clientY, actions });
    },
    [moveItemBackToInbox, returnToProduction]
  );

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Toolbar */}
      <div className="px-3 py-[6px] flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid #ece8e2" }}>
        <div />
        <span className="text-[9px] font-medium" style={{ color: "#99a5a3" }}>{visiblePeriodLabel}</span>
        <div className="flex items-center gap-[2px]">
          <ToolbarButton active={!showCzk} label="Hodiny" onClick={() => onToggleCzk(false)} />
          <ToolbarButton active={showCzk} label="Hod + Kč" onClick={() => onToggleCzk(true)} />
        </div>
      </div>

      {/* Silos */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden" ref={scrollContainerRef}>
        <div className="flex gap-[6px] p-2 h-full" style={{ minWidth: `${weeks.length * 216}px` }}>
          {weeks.map((week) => (
            <SiloColumn
              key={week.key}
              weekKey={week.key}
              weekNum={week.weekNum}
              startDate={week.start}
              endDate={week.end}
              isCurrent={week.key === currentWeekKey}
              isPast={week.isPast}
              silo={scheduleData?.get(week.key) || null}
              weeklyCapacity={weeklyCapacity}
              showCzk={showCzk}
              hourlyRate={settings?.hourly_rate ?? 550}
              isOverTarget={overDroppableId === `silo-week-${week.key}`}
              onBundleContextMenu={(e, bundle, toggleExpand) =>
                handleBundleContextMenu(e, bundle, week.key, week.weekNum, week.start, week.end, toggleExpand)
              }
              onItemContextMenu={(e, item, bundle) =>
                handleItemContextMenu(e, item, week.key, week.weekNum, week.start, week.end, bundle)
              }
              allWeeksData={weeksCapacityMap}
              weekKeys={weekKeys}
              registerRef={registerSiloRef}
            />
          ))}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ProductionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextMenu.actions}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Completion dialog */}
      {completionState && (
        <CompletionDialog
          open={!!completionState}
          onOpenChange={(open) => !open && setCompletionState(null)}
          {...completionState}
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

interface SiloProps {
  weekKey: string;
  weekNum: number;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
  isPast: boolean;
  silo: WeekSilo | null;
  weeklyCapacity: number;
  showCzk: boolean;
  hourlyRate: number;
  isOverTarget: boolean;
  onBundleContextMenu: (e: React.MouseEvent, bundle: ScheduleBundle, toggleExpand: () => void) => void;
  onItemContextMenu: (e: React.MouseEvent, item: ScheduleItem, bundle: ScheduleBundle) => void;
  allWeeksData: Map<string, { total_hours: number }>;
  weekKeys: string[];
  registerRef: (key: string, el: HTMLDivElement | null) => void;
}

function SiloColumn({
  weekKey, weekNum, startDate, endDate, isCurrent, isPast, silo, weeklyCapacity,
  showCzk, hourlyRate, isOverTarget, onBundleContextMenu, onItemContextMenu,
  allWeeksData, weekKeys, registerRef,
}: SiloProps) {
  const totalHours = silo?.total_hours ?? 0;
  const pct = weeklyCapacity > 0 ? (totalHours / weeklyCapacity) * 100 : 0;
  const isOverloaded = pct > 100;
  const isWarning = pct > 85 && pct <= 100;
  const overloadHours = totalHours - weeklyCapacity;

  const barColor = isPast ? "#b0bab8" : isOverloaded ? "#dc3545" : isWarning ? "#d97706" : "#3a8a36";
  const barBg = isPast
    ? "linear-gradient(90deg, #d0d7d5, #b0bab8)"
    : isOverloaded
    ? "linear-gradient(90deg, #fca5a5, #dc3545)"
    : isWarning
    ? "linear-gradient(90deg, #fcd34d, #d97706)"
    : "linear-gradient(90deg, #a7d9a2, #3a8a36)";

  const { setNodeRef, isOver } = useDroppable({ id: `silo-week-${weekKey}`, disabled: isPast });
  const highlighted = !isPast && (isOver || isOverTarget);
  const dropBorderColor = highlighted
    ? isOverloaded ? "#d97706" : "#3b82f6"
    : undefined;

  const headerColor = isPast ? "#99a5a3" : "#223937";

  const combinedRef = useCallback((el: HTMLDivElement | null) => {
    setNodeRef(el);
    registerRef(weekKey, el);
  }, [setNodeRef, registerRef, weekKey]);

  return (
    <div
      ref={combinedRef}
      data-week-key={weekKey}
      className="w-[210px] shrink-0 flex flex-col transition-all"
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 9,
        border: highlighted
          ? `2px solid ${dropBorderColor}`
          : isCurrent
          ? "2px solid #3a8a36"
          : isOverloaded && !isPast
          ? "1px solid rgba(220,53,69,0.4)"
          : "1px solid #ece8e2",
      }}
    >
      {/* Header */}
      <div className="px-2.5 py-1.5 text-center" style={{ borderBottom: "1px solid #ece8e2" }}>
        <div className="flex items-center justify-center gap-1.5">
          <span className="font-mono text-[14px] font-bold" style={{ color: headerColor }}>T{weekNum}</span>
          {isCurrent && <span className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: "#3a8a36" }} />}
        </div>
        <div className="text-[9px] mt-0.5" style={{ color: "#99a5a3" }}>
          {formatDateShort(startDate)} – {formatDateShort(endDate)}
        </div>

        {/* Capacity meter */}
        <div className="mt-1.5" style={{ opacity: isPast ? 0.6 : 1 }}>
          <div className="h-[7px] rounded" style={{ backgroundColor: "#f0eee9", overflow: "hidden" }}>
            <div
              className="h-full rounded transition-all duration-300"
              style={{ width: `${Math.min(pct, 100)}%`, background: barBg }}
            />
          </div>
          <div className="flex items-baseline justify-between mt-[3px]">
            <span className="font-mono text-[11px] font-bold" style={{ color: barColor }}>
              {Math.round(totalHours)}h
            </span>
            <span className="font-mono text-[10px]" style={{ color: "#99a5a3" }}>
              / {weeklyCapacity}h
            </span>
            <span className="font-mono text-[10px] font-bold" style={{ color: barColor }}>
              {Math.round(pct)}%
            </span>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-1.5" style={{ display: "flex", flexDirection: "column", gap: 3, opacity: isPast ? 0.7 : 1 }}>
        {(!silo || silo.bundles.length === 0) && !isPast && (
          <div
            className="flex-1 flex items-center justify-center rounded-[5px] px-2 py-[14px] transition-all"
            style={{ border: "1.5px dashed #e2ddd6" }}
          >
            <span className="text-[9px] text-center" style={{ color: "#99a5a3" }}>Přetáhni sem z Inboxu</span>
          </div>
        )}
        {(!silo || silo.bundles.length === 0) && isPast && (
          <div className="flex-1 flex items-center justify-center px-2 py-[14px]">
            <span className="text-[9px] text-center" style={{ color: "#c4ccc9" }}>Prázdný týden</span>
          </div>
        )}
        {silo?.bundles.map((bundle) => (
          <CollapsibleBundleCard
            key={bundle.project_id}
            bundle={bundle}
            weekKey={weekKey}
            showCzk={showCzk}
            hourlyRate={hourlyRate}
            onBundleContextMenu={onBundleContextMenu}
            onItemContextMenu={onItemContextMenu}
          />
        ))}
      </div>

      {/* Spill suggestion or simple overload banner */}
      {isOverloaded && !isPast && silo && (
        <SpillSuggestionPanel
          overloadHours={overloadHours}
          bundles={silo.bundles}
          weekKey={weekKey}
          allWeeksData={allWeeksData}
          weeklyCapacity={weeklyCapacity}
          weekKeys={weekKeys}
        />
      )}
    </div>
  );
}

function CollapsibleBundleCard({
  bundle, weekKey, showCzk, hourlyRate, onBundleContextMenu, onItemContextMenu,
}: {
  bundle: ScheduleBundle; weekKey: string; showCzk: boolean; hourlyRate: number;
  onBundleContextMenu: (e: React.MouseEvent, bundle: ScheduleBundle, toggleExpand: () => void) => void;
  onItemContextMenu: (e: React.MouseEvent, item: ScheduleItem, bundle: ScheduleBundle) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = getProjectColor(bundle.project_id);

  const completedCount = bundle.items.filter((i) => i.status === "completed").length;
  const totalCount = bundle.items.length;
  const allCompleted = completedCount === totalCount && totalCount > 0;
  const hasUncompleted = completedCount < totalCount;

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `silo-bundle-${bundle.project_id}-${weekKey}`,
    data: {
      type: "silo-bundle",
      projectId: bundle.project_id,
      projectName: bundle.project_name,
      weekDate: weekKey,
      hours: bundle.total_hours,
      itemCount: bundle.items.length,
    },
    disabled: allCompleted,
  });

  const toggleExpand = useCallback(() => setExpanded((v) => !v), []);

  return (
    <div
      className="rounded-[6px] overflow-hidden"
      style={{
        border: "1px solid #ece8e2",
        borderLeft: `4px solid ${allCompleted ? "#3a8a36" : color}`,
        backgroundColor: "#ffffff",
        opacity: isDragging ? 0.3 : 1,
      }}
    >
      {/* Bundle header */}
      <div
        ref={setDragRef}
        {...attributes}
        {...(hasUncompleted ? listeners : {})}
        className={`flex items-center gap-1 px-[6px] py-[5px] ${hasUncompleted ? "cursor-grab" : "cursor-default"}`}
        style={{ borderBottom: expanded ? "1px solid #ece8e2" : "none" }}
        onClick={(e) => {
          if (!(e as any).__isDrag) setExpanded(!expanded);
        }}
        onContextMenu={(e) => onBundleContextMenu(e, bundle, toggleExpand)}
      >
        <ChevronRight
          className="shrink-0 transition-transform duration-150"
          style={{ width: 10, height: 10, color: "#99a5a3", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold truncate" style={{ color: allCompleted ? "#99a5a3" : "#223937" }}>
            {bundle.project_name}
          </div>
          <div className="font-mono text-[8px]" style={{ color: "#99a5a3" }}>
            {bundle.project_id}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {completedCount > 0 && (
            <span className="text-[9px] font-medium" style={{ color: "#3a8a36" }}>
              {completedCount}/{totalCount} ✓
            </span>
          )}
          <span className="font-mono text-[11px] font-bold" style={{ color: allCompleted ? "#99a5a3" : "#223937" }}>
            {Math.round(bundle.total_hours)}h
          </span>
          {showCzk && (
            <span className="font-mono text-[9px]" style={{ color: "#6b7a78" }}>
              {formatCompactCzk(bundle.total_hours * hourlyRate)}
            </span>
          )}
        </div>
      </div>

      {/* Items — only when expanded */}
      {expanded && (
        <div className="px-[3px] py-[2px]">
          {bundle.items.map((item) => (
            item.status === "completed" ? (
              <CompletedSiloItem
                key={item.id}
                item={item}
                onContextMenu={(e) => onItemContextMenu(e, item, bundle)}
              />
            ) : (
              <DraggableSiloItem
                key={item.id}
                item={item}
                weekKey={weekKey}
                showCzk={showCzk}
                onContextMenu={(e) => onItemContextMenu(e, item, bundle)}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}

function CompletedSiloItem({
  item, onContextMenu,
}: {
  item: ScheduleItem;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="flex items-center gap-[3px] px-[6px] py-[3px] rounded cursor-default transition-colors"
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f8f7f5"; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
      onContextMenu={onContextMenu}
    >
      <span style={{ width: 10, fontSize: 9, color: "#3a8a36", fontWeight: 700 }}>✓</span>
      <span className="text-[10px] flex-1 truncate" style={{ color: "#99a5a3", textDecoration: "line-through" }}>
        {item.item_name}
      </span>
      <span className="font-mono text-[9px] shrink-0" style={{ color: "#c4ccc9" }}>
        {item.scheduled_hours}h
      </span>
    </div>
  );
}

function DraggableSiloItem({
  item, weekKey, showCzk, onContextMenu,
}: {
  item: ScheduleItem; weekKey: string; showCzk: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `silo-item-${item.id}`,
    data: {
      type: "silo-item",
      itemId: item.id,
      itemName: item.item_name,
      projectId: item.project_id,
      projectName: item.project_name,
      weekDate: weekKey,
      hours: item.scheduled_hours,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="flex items-center gap-[3px] px-[6px] py-[3px] rounded cursor-grab transition-colors"
      style={{ opacity: isDragging ? 0.3 : 1 }}
      onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.backgroundColor = "#f8f7f5"; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
      onContextMenu={onContextMenu}
    >
      <GripVertical className="shrink-0" style={{ width: 8, height: 8, color: "#99a5a3" }} />
      <span className="text-[10px] flex-1 truncate" style={{ color: "#223937" }}>
        {item.item_name}
      </span>
      <span className="font-mono text-[9px] shrink-0" style={{ color: "#99a5a3" }}>
        {item.scheduled_hours}h
        {showCzk && ` ${Math.round(item.scheduled_czk / 1000)}K`}
      </span>
    </div>
  );
}
