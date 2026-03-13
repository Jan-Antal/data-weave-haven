import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, RotateCcw, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProductionContextMenu, type ContextMenuAction } from "./ProductionContextMenu";
import { useDraggable } from "@dnd-kit/core";

export interface SafetyNetProject {
  project_id: string;
  project_name: string;
  estimated_hours: number;
  source: "scheduled" | "inbox" | "unplanned";
}

interface SafetyNetItem {
  id: string;
  item_name: string;
  item_code?: string | null;
  hours?: number;
  status?: string | null;
}

interface ForecastSafetyNetProps {
  projects: SafetyNetProject[];
  onRestoreToForecast?: (projectId: string) => void;
  onViewDetail?: (projectId: string) => void;
  onViewItems?: (projectId: string) => void;
}

const sourceBadge: Record<string, { label: string; bg: string }> = {
  scheduled: { label: "Plán", bg: "#2a3d3a" },
  inbox: { label: "Inbox", bg: "#14532d" },
  unplanned: { label: "Bez plánu", bg: "#451a03" },
};

const statusColors: Record<string, { bg: string; color: string }> = {
  scheduled: { bg: "#2a3d3a", color: "#7aa8a4" },
  in_progress: { bg: "#1e3a5f", color: "#60a5fa" },
  paused: { bg: "#451a03", color: "#fdba74" },
  completed: { bg: "#14532d", color: "#86efac" },
};

export function ForecastSafetyNet({ projects, onRestoreToForecast, onViewDetail, onViewItems }: ForecastSafetyNetProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectItems, setProjectItems] = useState<Record<string, SafetyNetItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; actions: ContextMenuAction[] } | null>(null);

  const toggleExpand = useCallback(async (projectId: string, source: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
        if (!projectItems[projectId] && !loadingItems.has(projectId)) {
          fetchItems(projectId, source);
        }
      }
      return next;
    });
  }, [projectItems, loadingItems]);

  const fetchItems = async (projectId: string, source: string) => {
    setLoadingItems(prev => new Set(prev).add(projectId));
    try {
      let items: SafetyNetItem[] = [];
      if (source === "unplanned") {
        const { data } = await supabase
          .from("tpv_items")
          .select("id, item_name, item_type, status")
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .limit(50);
        if (data) {
          items = data.map(d => ({
            id: d.id,
            item_name: d.item_name,
            item_code: d.item_type,
            status: d.status,
          }));
        }
      } else {
        const { data } = await supabase
          .from("production_schedule")
          .select("id, item_name, item_code, scheduled_hours, status")
          .eq("project_id", projectId)
          .neq("status", "completed")
          .limit(50);
        if (data) {
          items = data.map(d => ({
            id: d.id,
            item_name: d.item_name,
            item_code: d.item_code,
            hours: Number(d.scheduled_hours),
            status: d.status,
          }));
        }
      }
      setProjectItems(prev => ({ ...prev, [projectId]: items }));
    } catch {
      setProjectItems(prev => ({ ...prev, [projectId]: [] }));
    }
    setLoadingItems(prev => {
      const next = new Set(prev);
      next.delete(projectId);
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, project: SafetyNetProject) => {
    e.preventDefault();
    e.stopPropagation();

    const isExpanded = expandedProjects.has(project.project_id);
    const actions: ContextMenuAction[] = [];

    actions.push({
      label: isExpanded ? "Sbalit" : "Rozbalit",
      icon: "⇅",
      onClick: () => toggleExpand(project.project_id, project.source),
    });

    if (onViewItems) {
      actions.push({
        label: "Zobrazit položky",
        icon: "📋",
        onClick: () => onViewItems(project.project_id),
      });
    }

    if (onViewDetail) {
      actions.push({
        label: "Zobrazit detail projektu",
        icon: "🏗",
        onClick: () => onViewDetail(project.project_id),
      });
    }

    if (onRestoreToForecast) {
      actions.push({
        label: "Vrátit do forecastu",
        icon: "↩",
        onClick: () => onRestoreToForecast(project.project_id),
      });
    }

    setContextMenu({ x: e.clientX, y: e.clientY, actions });
  };

  return (
    <div
      className="w-[252px] shrink-0 flex flex-col"
      style={{ backgroundColor: "#1f2e2c", borderRight: "1px solid #2a3d3a" }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center gap-2 shrink-0"
        style={{ borderBottom: "1px solid #2a3d3a" }}
      >
        <AlertTriangle className="w-3.5 h-3.5" style={{ color: "#f59e0b" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b" }}>Záchranná síť</span>
        <span
          className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
          style={{ backgroundColor: "rgba(245,158,11,0.15)", color: "#f59e0b" }}
        >
          {projects.length}
        </span>
      </div>

      {/* Scrollable project list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {projects.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-8">
            <span className="text-[10px] italic" style={{ color: "#4a5a58" }}>Žádné projekty v záchranné síti</span>
          </div>
        )}

        {projects.map(p => {
          const badge = sourceBadge[p.source] || sourceBadge.unplanned;
          const isExpanded = expandedProjects.has(p.project_id);
          const items = projectItems[p.project_id];
          const isLoading = loadingItems.has(p.project_id);

          return (
            <DraggableSafetyNetRow
              key={p.project_id}
              project={p}
              isExpanded={isExpanded}
              items={items}
              isLoading={isLoading}
              badge={badge}
              onToggleExpand={() => toggleExpand(p.project_id, p.source)}
              onContextMenu={(e) => handleContextMenu(e, p)}
              onRestore={onRestoreToForecast}
            />

              {/* Expanded items */}
              {isExpanded && (
                <div className="mt-0.5 mb-1">
                  {isLoading ? (
                    <div className="pl-4 py-1">
                      <span className="text-[10px] italic" style={{ color: "#4a5a58" }}>Načítám...</span>
                    </div>
                  ) : items && items.length > 0 ? (
                    items.map(item => {
                      const sc = statusColors[item.status || ""] || { bg: "#2a3d3a", color: "#7aa8a4" };
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-1.5 py-[3px]"
                          style={{ paddingLeft: 16, borderLeft: "1px solid #2a3d3a", marginLeft: 8, fontSize: 11 }}
                        >
                          {item.item_code && (
                            <span className="font-mono shrink-0" style={{ color: "#5c706f", fontSize: 10 }}>
                              {item.item_code}
                            </span>
                          )}
                          <span className="flex-1 truncate" style={{ color: "#7aa8a4" }}>
                            {item.item_name}
                          </span>
                          {item.hours != null && (
                            <span className="font-mono shrink-0" style={{ color: "#5c706f", fontSize: 10 }}>
                              {Math.round(item.hours)}h
                            </span>
                          )}
                          {item.status && (
                            <span
                              className="px-1 py-0 rounded text-[9px]"
                              style={{ backgroundColor: sc.bg, color: sc.color }}
                            >
                              {item.status}
                            </span>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="pl-4 py-1">
                      <span className="text-[10px] italic" style={{ color: "#4a5a58" }}>Žádné položky</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Context menu — uses shared ProductionContextMenu */}
      {contextMenu && (
        <ProductionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextMenu.actions}
          onClose={() => setContextMenu(null)}
          darkMode
        />
      )}
    </div>
  );
}
