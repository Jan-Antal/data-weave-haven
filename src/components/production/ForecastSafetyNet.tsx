import { useState, useCallback, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, RotateCcw, GripVertical, Check, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProductionContextMenu, type ContextMenuAction } from "./ProductionContextMenu";
import { useDraggable } from "@dnd-kit/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { cs } from "date-fns/locale";
import { format, differenceInDays, isPast } from "date-fns";
import { parseAppDate } from "@/lib/dateFormat";

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

const statusColors: Record<string, { bg: string; color: string }> = {
  scheduled: { bg: "#2a3d3a", color: "#7aa8a4" },
  in_progress: { bg: "#1e3a5f", color: "#60a5fa" },
  paused: { bg: "#451a03", color: "#fdba74" },
  completed: { bg: "#14532d", color: "#86efac" },
};

interface DeadlineDisplay {
  label: string;
  dateStr: string;
  color: string;
}

const DEADLINE_FIELDS: { key: string; label: string }[] = [
  { key: "expedice", label: "Exp" },
  { key: "montaz", label: "Mnt" },
  { key: "predani", label: "Před" },
  { key: "datum_smluvni", label: "Sml" },
];

function resolveDeadlineDisplay(info: Record<string, string | null> | undefined): DeadlineDisplay | null {
  if (!info) return null;
  for (const f of DEADLINE_FIELDS) {
    const val = info[f.key];
    if (!val) continue;
    const d = parseAppDate(val);
    if (!d) continue;
    const dateStr = `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
    const days = differenceInDays(d, new Date());
    const color = isPast(d) ? "#DC2626" : days <= 14 ? "#D97706" : days <= 30 ? "#2563EB" : "#7aa8a4";
    return { label: f.label, dateStr, color };
  }
  return null;
}

const DATE_FIELDS = [
  { key: "expedice", label: "Expedice" },
  { key: "montaz", label: "Montáž" },
  { key: "predani", label: "Předání" },
  { key: "datum_smluvni", label: "Datum smluvní" },
] as const;

type DateFieldKey = typeof DATE_FIELDS[number]["key"];

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}.${m}.${y}`;
}

function parseLocalDate(s: string): Date | undefined {
  if (!s) return undefined;
  // Handle dd.mm.yyyy
  const parts = s.split(".");
  if (parts.length === 3) {
    const d = parseInt(parts[0]), m = parseInt(parts[1]) - 1, y = parseInt(parts[2]);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, m, d);
  }
  // ISO fallback
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? undefined : dt;
}

/** Due date dialog for projects missing deadlines */
function DueDateDialog({
  open,
  onOpenChange,
  projectName,
  projectId,
  onSaveAndRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  projectId: string;
  onSaveAndRestore: (projectId: string) => void;
}) {
  const [dates, setDates] = useState<Record<DateFieldKey, Date | undefined>>({
    expedice: undefined,
    montaz: undefined,
    predani: undefined,
    datum_smluvni: undefined,
  });
  const [saving, setSaving] = useState(false);

  const hasAnyDate = Object.values(dates).some(d => d !== undefined);

  const handleSave = async () => {
    if (!hasAnyDate) return;
    setSaving(true);
    const update: Record<string, string | null> = {};
    for (const f of DATE_FIELDS) {
      if (dates[f.key]) {
        update[f.key] = localDateStr(dates[f.key]!);
      }
    }
    const { error } = await supabase
      .from("projects")
      .update(update)
      .eq("project_id", projectId);

    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    setSaving(false);
    onOpenChange(false);
    onSaveAndRestore(projectId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]" style={{ backgroundColor: "#1a2422", border: "1px solid #2a3d3a", color: "#a8c5c2" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "#f59e0b", fontSize: 15 }}>
            ⚠ Chybí termín — {projectName}
          </DialogTitle>
          <p style={{ fontSize: 12, color: "#5c706f", marginTop: 4 }}>
            Pro vrácení do forecastu je nutné zadat alespoň jeden termín.
          </p>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {DATE_FIELDS.map(f => (
            <div key={f.key} className="flex items-center gap-3">
              <span className="w-[100px] text-right shrink-0" style={{ fontSize: 12, fontWeight: 500, color: "#7aa8a4" }}>
                {f.label}
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="flex items-center gap-2 px-3 py-1.5 rounded text-left flex-1"
                    style={{
                      backgroundColor: "#253533",
                      border: "1px solid #2a3d3a",
                      color: dates[f.key] ? "#a8c5c2" : "#4a5a58",
                      fontSize: 12,
                    }}
                  >
                    <CalendarIcon className="w-3.5 h-3.5 shrink-0" style={{ color: "#4a5a58" }} />
                    {dates[f.key] ? format(dates[f.key]!, "d. M. yyyy") : "Nezadáno"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dates[f.key]}
                    onSelect={(d) => setDates(prev => ({ ...prev, [f.key]: d || undefined }))}
                    locale={cs}
                    weekStartsOn={1}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            style={{ color: "#5c706f" }}
            size="sm"
          >
            Zrušit
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasAnyDate || saving}
            size="sm"
            style={{
              backgroundColor: hasAnyDate ? "#d97706" : "#2a3d3a",
              color: hasAnyDate ? "#ffffff" : "#4a5a58",
            }}
          >
            {saving ? "Ukládám..." : "Uložit a vrátit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Draggable row for a safety net project */
function DraggableSafetyNetRow({
  project,
  isExpanded,
  items,
  isLoading,
  deadlineInfo,
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
  deadlineInfo: DeadlineDisplay | null;
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
            {deadlineInfo ? (
              <span className="text-[9px] font-medium" style={{ color: deadlineInfo.color }}>
                · {deadlineInfo.label}: {deadlineInfo.dateStr}
              </span>
            ) : (
              <span className="text-[9px] font-medium" style={{ color: "#d97706" }}>
                ⚠ BEZ TERMÍNU
              </span>
            )}
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

  // Multi-select state
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);

  // Due date dialog state
  const [dueDateDialog, setDueDateDialog] = useState<{ projectId: string; projectName: string } | null>(null);

  // Escape clears multi-select
  useEffect(() => {
    if (selectedProjects.size === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSelectedProjects(new Set()); setLastClicked(null); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedProjects.size]);

  /** Check if project has any deadline, if not show dialog */
  const attemptRestore = useCallback(async (projectId: string) => {
    const project = projects.find(p => p.project_id === projectId);
    if (!project) return;

    // Check DB for dates
    const { data } = await supabase
      .from("projects")
      .select("expedice, montaz, predani, datum_smluvni")
      .eq("project_id", projectId)
      .single();

    const hasDueDate = data && (data.expedice || data.montaz || data.predani || data.datum_smluvni);

    if (hasDueDate) {
      onRestoreToForecast?.(projectId);
    } else {
      setDueDateDialog({ projectId, projectName: project.project_name });
    }
  }, [projects, onRestoreToForecast]);

  const handleSaveAndRestore = useCallback((projectId: string) => {
    onRestoreToForecast?.(projectId);
  }, [onRestoreToForecast]);

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

    setSelectedProjects(new Set());
    setLastClicked(project.project_id);
    toggleExpand(project.project_id, project.source);
  };

  const handleContextMenu = (e: React.MouseEvent, project: SafetyNetProject) => {
    e.preventDefault();
    e.stopPropagation();

    let targetIds: string[];
    if (selectedProjects.size > 0 && selectedProjects.has(project.project_id)) {
      targetIds = Array.from(selectedProjects);
    } else {
      targetIds = [project.project_id];
      setSelectedProjects(new Set([project.project_id]));
    }

    const isExpanded = expandedProjects.has(project.project_id);
    const actions: ContextMenuAction[] = [];

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
          if (targetIds.length === 1) {
            attemptRestore(targetIds[0]);
          } else {
            // For batch, restore all (skip date check for simplicity — batch restores are intentional)
            for (const id of targetIds) {
              attemptRestore(id);
            }
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
              onRestore={(pid) => attemptRestore(pid)}
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
            onClick={async () => {
              for (const id of selectedProjects) {
                await attemptRestore(id);
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

      {/* Due date dialog */}
      {dueDateDialog && (
        <DueDateDialog
          open={!!dueDateDialog}
          onOpenChange={(open) => { if (!open) setDueDateDialog(null); }}
          projectId={dueDateDialog.projectId}
          projectName={dueDateDialog.projectName}
          onSaveAndRestore={handleSaveAndRestore}
        />
      )}

      {/* Context menu */}
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
