import { useState, useCallback, useEffect } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, RotateCcw, GripVertical, Check } from "lucide-react";
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

/** Draggable row for a safety net project */
function DraggableSafetyNetRow({
  project,
  isExpanded,
  items,
  isLoading,
  badge,
  isMultiSelected,
  onToggleExpand,
  onClick,
  onContextMenu,
  onRestore,
}: {
  project: SafetyNetProject;
  isExpanded: boolean;
  items: SafetyNetItem[] | undefined;
  isLoading: boolean;
  badge: { label: string; bg: string };
  isMultiSelected: boolean;
  onToggleExpand: () => void;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onRestore?: (projectId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `safety-net-${project.project_id}`,
    data: {
      type: "safety-net-project",
      projectId: project.project_id,
      projectName: project.project_name,
      estimatedHours: project.estimated_hours,
      source: project.source,
    },
  });

  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.4 : 1 }}>
      {/* Project row */}
      <div
        className="flex items-center gap-1 py-1.5 px-1.5 rounded cursor-pointer transition-colors select-none"
        onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
        style={{
          backgroundColor: isMultiSelected ? "rgba(217,119,6,0.12)" : isExpanded ? "#253533" : "transparent",
          border: isMultiSelected ? "1.5px solid #d97706" : "1.5px solid transparent",
          boxShadow: isMultiSelected ? "0 0 0 2px rgba(217,119,6,0.15)" : undefined,
        }}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-white/10"
          onClick={(e) => e.stopPropagation()}
          title="Přetáhni do týdne"
        >
          <GripVertical className="w-3 h-3" style={{ color: "#4a5a58" }} />
        </div>

        {isExpanded
          ? <ChevronDown className="w-3 h-3 shrink-0" style={{ color: "#7aa8a4" }} />
          : <ChevronRight className="w-3 h-3 shrink-0" style={{ color: "#4a5a58" }} />}
        <div className="flex-1 min-w-0">
          <div className="truncate" style={{ fontSize: 12, fontWeight: 500, color: isMultiSelected ? "#fcd34d" : "#a8c5c2" }}>
            {project.project_name}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-[10px]" style={{ color: "#5c706f" }}>{project.project_id}</span>
            <span
              className="px-1 py-0 rounded text-[9px] font-medium"
              style={{ background: badge.bg, color: "#e5e5e5" }}
            >
              {badge.label}
            </span>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {isMultiSelected && (
            <Check className="h-3 w-3 flex-shrink-0" style={{ color: "#d97706" }} />
          )}
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-[11px] font-semibold" style={{ color: "#7aa8a4" }}>
              ~{project.estimated_hours}h
            </span>
            {onRestore && !isMultiSelected && (
              <button
                onClick={(e) => { e.stopPropagation(); onRestore(project.project_id); }}
                className="flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-medium hover:opacity-80 transition-opacity"
                style={{ background: "#2a4a46", color: "#7aa8a4" }}
                title="Vrátit do forecastu"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Vrátit
              </button>
            )}
          </div>
        </div>
      </div>

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
}

export function ForecastSafetyNet({ projects, onRestoreToForecast, onViewDetail, onViewItems }: ForecastSafetyNetProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectItems, setProjectItems] = useState<Record<string, SafetyNetItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; actions: ContextMenuAction[] } | null>(null);

  // Multi-select state (same pattern as Inbox reserve)
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);

  // Escape clears multi-select
  useEffect(() => {
    if (selectedProjects.size === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSelectedProjects(new Set()); setLastClicked(null); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedProjects.size]);

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

  const handleClick = (e: React.MouseEvent, project: SafetyNetProject) => {
    e.stopPropagation();

    // Ctrl/Cmd multi-select
    if (e.ctrlKey || e.metaKey) {
      setSelectedProjects(prev => {
        const next = new Set(prev);
        if (next.has(project.project_id)) next.delete(project.project_id);
        else next.add(project.project_id);
        return next;
      });
      setLastClicked(project.project_id);
      return;
    }

    // Shift range-select
    if (e.shiftKey && lastClicked) {
      const ids = projects.map(p => p.project_id);
      const startIdx = ids.indexOf(lastClicked);
      const endIdx = ids.indexOf(project.project_id);
      if (startIdx !== -1 && endIdx !== -1) {
        const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        setSelectedProjects(prev => {
          const next = new Set(prev);
          for (let i = from; i <= to; i++) next.add(ids[i]);
          return next;
        });
      }
      setLastClicked(project.project_id);
      return;
    }

    // Normal click: clear multi-select, toggle expand
    setSelectedProjects(new Set());
    setLastClicked(project.project_id);
    toggleExpand(project.project_id, project.source);
  };

  const handleContextMenu = (e: React.MouseEvent, project: SafetyNetProject) => {
    e.preventDefault();
    e.stopPropagation();

    // Determine targets: if right-clicked item is in multi-select, use all; otherwise just this one
    let targetIds: string[];
    if (selectedProjects.size > 0 && selectedProjects.has(project.project_id)) {
      targetIds = Array.from(selectedProjects);
    } else {
      targetIds = [project.project_id];
      setSelectedProjects(new Set([project.project_id]));
    }

    const isExpanded = expandedProjects.has(project.project_id);
    const actions: ContextMenuAction[] = [];

    // Single-item actions only when one target
    if (targetIds.length === 1) {
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
    }

    if (onRestoreToForecast) {
      const label = targetIds.length === 1
        ? "Vrátit do forecastu"
        : `Vrátit ${targetIds.length} projektů do forecastu`;
      actions.push({
        label,
        icon: "↩",
        onClick: () => {
          for (const id of targetIds) {
            onRestoreToForecast(id);
          }
          setSelectedProjects(new Set());
        },
      });
    }

    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 200),
      y: Math.min(e.clientY, window.innerHeight - 200),
      actions,
    });
  };

  const selectedCount = selectedProjects.size;
  const selectedHours = selectedCount > 0
    ? projects.filter(p => selectedProjects.has(p.project_id)).reduce((s, p) => s + p.estimated_hours, 0)
    : 0;

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
          const isMultiSelected = selectedProjects.has(p.project_id);

          return (
            <DraggableSafetyNetRow
              key={p.project_id}
              project={p}
              isExpanded={isExpanded}
              items={items}
              isLoading={isLoading}
              badge={badge}
              isMultiSelected={isMultiSelected}
              onToggleExpand={() => toggleExpand(p.project_id, p.source)}
              onClick={(e) => handleClick(e, p)}
              onContextMenu={(e) => handleContextMenu(e, p)}
              onRestore={onRestoreToForecast}
            />
          );
        })}
      </div>

      {/* Multi-select footer bar */}
      {selectedCount >= 2 && onRestoreToForecast && (
        <div
          className="px-3 py-2 flex items-center justify-between shrink-0"
          style={{ borderTop: "1px solid #d97706", backgroundColor: "rgba(217,119,6,0.1)" }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: "#d97706" }}>
            ✓ {selectedCount} vybráno · ~{Math.round(selectedHours)}h
          </span>
          <button
            onClick={() => {
              for (const id of selectedProjects) {
                onRestoreToForecast(id);
              }
              setSelectedProjects(new Set());
            }}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#d97706", color: "#ffffff" }}
          >
            <RotateCcw className="w-3 h-3" />
            Vrátit vše
          </button>
        </div>
      )}

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
