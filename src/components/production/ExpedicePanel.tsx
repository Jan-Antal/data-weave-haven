import { useState, useCallback, useMemo } from "react";
import { useProductionExpedice, type ScheduleItem } from "@/hooks/useProductionSchedule";
import { useProductionDragDrop } from "@/hooks/useProductionDragDrop";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { useProductionSchedule } from "@/hooks/useProductionSchedule";
import { useProductionInbox } from "@/hooks/useProductionInbox";
import { useProjects } from "@/hooks/useProjects";
import { format, isPast, isFuture, differenceInDays } from "date-fns";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { ProductionContextMenu, type ContextMenuAction } from "./ProductionContextMenu";

function formatCompactCzk(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${Math.round(v)}`;
}

function formatShortDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return format(d, "dd.MM.yyyy");
  } catch { return null; }
}

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  try {
    const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

/** Color for expedice date relative to now */
function getExpediceDateColor(expediceDate: Date | null): string {
  if (!expediceDate) return "#99a5a3";
  if (isPast(expediceDate)) return "#16A34A"; // green - delivered
  if (differenceInDays(expediceDate, new Date()) <= 7) return "#D97706"; // amber - within 7 days
  return "#2563EB"; // blue - future
}

interface ContextMenuState {
  x: number;
  y: number;
  actions: ContextMenuAction[];
}

interface ExpedicePanelProps {
  showCzk?: boolean;
  onNavigateToTPV?: (projectId: string, itemCode?: string | null) => void;
  onOpenProjectDetail?: (projectId: string) => void;
}

export function ExpedicePanel({ showCzk, onNavigateToTPV, onOpenProjectDetail }: ExpedicePanelProps) {
  const { data: projects = [] } = useProductionExpedice();
  const { data: allProjects = [] } = useProjects();
  const { data: scheduleData } = useProductionSchedule();
  const { data: inboxProjects = [] } = useProductionInbox();
  const { returnToProduction, moveItemBackToInbox } = useProductionDragDrop();
  const { data: settings } = useProductionSettings();
  const hourlyRate = settings?.hourly_rate ?? 550;
  const [collapsed, setCollapsed] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Map project_id → expedice field
  const projectExpediceMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const p of allProjects) m.set(p.project_id, p.expedice ?? null);
    return m;
  }, [allProjects]);

  // Compute total items per project (scheduled + inbox + completed)
  const projectTotalItems = useMemo(() => {
    const m = new Map<string, { total: number; nonCompleted: ScheduleItem[] }>();

    // Count all schedule items (including completed) per project
    if (scheduleData) {
      for (const [, silo] of scheduleData) {
        for (const bundle of silo.bundles) {
          for (const item of bundle.items) {
            if (!m.has(item.project_id)) m.set(item.project_id, { total: 0, nonCompleted: [] });
            const entry = m.get(item.project_id)!;
            entry.total++;
            if (item.status !== "completed") {
              entry.nonCompleted.push(item);
            }
          }
        }
      }
    }

    // Count completed items from expedice data
    for (const group of projects) {
      if (!m.has(group.project_id)) m.set(group.project_id, { total: 0, nonCompleted: [] });
      const entry = m.get(group.project_id)!;
      entry.total += group.count;
    }

    // Count inbox items
    for (const inbox of inboxProjects) {
      if (!m.has(inbox.project_id)) m.set(inbox.project_id, { total: 0, nonCompleted: [] });
      const entry = m.get(inbox.project_id)!;
      entry.total += inbox.items.length;
    }

    return m;
  }, [scheduleData, projects, inboxProjects]);

  // Summary: total items + most recent completed_at
  const { totalItems, lastCompletedStr } = useMemo(() => {
    let total = 0;
    let latest: Date | null = null;
    for (const g of projects) {
      total += g.count;
      for (const item of g.items) {
        const d = parseDate(item.completed_at);
        if (d && (!latest || d > latest)) latest = d;
      }
    }
    return { totalItems: total, lastCompletedStr: latest ? format(latest, "dd.MM.yyyy") : null };
  }, [projects]);

  const buildContextActions = useCallback(
    (item: ScheduleItem | null, projectId: string) => {
      const weekNum = item ? (() => {
        const d = new Date(item.scheduled_week);
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      })() : 0;

      const actions: ContextMenuAction[] = [];

      if (item) {
        actions.push({ label: `Vrátit do výroby (T${weekNum})`, icon: "↩", onClick: () => returnToProduction(item.id) });
        actions.push({ label: "Vrátit do Inboxu", icon: "↩", onClick: () => moveItemBackToInbox(item.id) });
      }

      if (onNavigateToTPV) {
        actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(projectId, item?.item_code) });
      }
      if (onOpenProjectDetail) {
        actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(projectId) });
      }

      return actions;
    },
    [returnToProduction, moveItemBackToInbox, onNavigateToTPV, onOpenProjectDetail]
  );

  const handleItemContextMenu = useCallback(
    (e: React.MouseEvent, item: ScheduleItem) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, actions: buildContextActions(item, item.project_id) });
    },
    [buildContextActions]
  );

  const handleProjectContextMenu = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, actions: buildContextActions(null, projectId) });
    },
    [buildContextActions]
  );

  if (collapsed) {
    return (
      <div
        className="w-[40px] shrink-0 flex flex-col items-center py-3 cursor-pointer transition-colors"
        style={{ borderLeft: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }}
        onClick={() => setCollapsed(false)}
      >
        <ChevronLeft className="h-3.5 w-3.5 mb-2 text-muted-foreground" />
        <span className="text-sm">📦</span>
        {projects.length > 0 && (
          <span
            className="text-[8px] font-bold px-1 py-0.5 rounded-full mt-1"
            style={{ backgroundColor: "#16A34A", color: "#ffffff" }}
          >
            {projects.length}
          </span>
        )}
        <span
          className="text-[8px] font-medium mt-2 text-muted-foreground"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        >
          Expedice
        </span>
      </div>
    );
  }

  return (
    <div className="w-[230px] shrink-0 flex flex-col" style={{ borderLeft: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }}>
      {/* Header */}
      <div className="px-3 py-2 flex flex-col gap-1" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">📦</span>
            <span className="text-[13px] font-semibold text-foreground">Expedice</span>
            {projects.length > 0 && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "rgba(22,163,74,0.12)", color: "#16A34A" }}
              >
                {projects.length}
              </span>
            )}
          </div>
          <button onClick={() => setCollapsed(true)} className="p-0.5 rounded hover:bg-muted transition-colors">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
        {totalItems > 0 && (
          <div className="text-[9px] text-muted-foreground">
            {totalItems} položek dokončeno{lastCompletedStr && <> · poslední: <span className="font-medium">{lastCompletedStr}</span></>}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {projects.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[10px] text-muted-foreground">Žádné dokončené položky</p>
          </div>
        )}
        {projects.map((group) => {
          const expediceRaw = projectExpediceMap.get(group.project_id);
          const expediceDate = parseDate(expediceRaw);
          const expediceStr = formatShortDate(expediceRaw);
          const headerColor = getExpediceDateColor(expediceDate);

          // Completion tracking
          const totals = projectTotalItems.get(group.project_id);
          const completedCount = group.count;
          const totalCount = totals ? totals.total : completedCount;
          const allDone = completedCount >= totalCount;
          const missingItems = totals?.nonCompleted ?? [];

          return (
            <div
              key={group.project_id}
              className="rounded-lg p-2 space-y-1.5 border border-border bg-card"
              onContextMenu={(e) => handleProjectContextMenu(e, group.project_id)}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-semibold truncate" style={{ color: "#16A34A" }}>
                      {group.project_name}
                    </span>
                    {expediceStr && (
                      <span className="text-[9px] font-medium shrink-0" style={{ color: headerColor }}>
                        Exp: {expediceStr}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[9px] text-muted-foreground">
                    {group.project_id}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {showCzk && (
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {formatCompactCzk(group.items.reduce((s, i) => s + i.scheduled_hours, 0) * hourlyRate)}
                    </span>
                  )}
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: allDone ? "#16A34A" : "#D97706",
                      color: "#ffffff",
                    }}
                  >
                    {completedCount} / {totalCount} ks{allDone ? " ✓" : ""}
                  </span>
                </div>
              </div>

              {/* Missing items indicator */}
              {!allDone && missingItems.length > 0 && (
                <div className="text-[8px] text-muted-foreground px-0.5">
                  {missingItems.length <= 2 ? (
                    <span>
                      Zbývá: {missingItems.map((mi, idx) => (
                        <span key={mi.id}>
                          {idx > 0 && " · "}
                          <span className="font-medium">{mi.item_code || mi.item_name}</span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span
                      className="cursor-pointer hover:underline"
                      style={{ color: "#D97706" }}
                      onClick={() => {
                        if (onNavigateToTPV) onNavigateToTPV(group.project_id);
                      }}
                    >
                      {missingItems.length} položek zbývá →
                    </span>
                  )}
                </div>
              )}

              <div className="space-y-[2px]">
                {group.items.map((item) => {
                  const completedStr = formatShortDate(item.completed_at);
                  const completedDate = parseDate(item.completed_at);
                  // Item-level expedice color
                  let itemExpColor = "#99a5a3";
                  if (expediceDate && completedDate) {
                    if (isPast(expediceDate)) itemExpColor = "#16A34A"; // green
                    else if (isFuture(expediceDate)) itemExpColor = "#2563EB"; // blue - completed early
                  }

                  return (
                    <div
                      key={item.id}
                      className="rounded px-1 py-[3px] cursor-default transition-colors"
                      onContextMenu={(e) => handleItemContextMenu(e, item)}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "hsl(var(--muted))")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <div className="flex items-center gap-1.5">
                        <Check className="shrink-0" style={{ width: 12, height: 12, color: "#16A34A", strokeWidth: 3 }} />
                        {item.item_code && (
                          <span className="font-mono text-[10px] shrink-0 text-foreground">
                            {item.item_code}
                          </span>
                        )}
                        <span className="text-[11px] truncate flex-1 text-muted-foreground">
                          {item.item_name}
                        </span>
                      </div>
                      {/* Date details */}
                      <div className="ml-[18px] flex flex-col gap-0">
                        {completedStr && (
                          <span className="text-[8px] text-muted-foreground">
                            Dokončeno: {completedStr}
                          </span>
                        )}
                        {expediceStr && (
                          <span className="text-[8px] font-medium" style={{ color: itemExpColor }}>
                            Expedice: {expediceStr}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
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
    </div>
  );
}
