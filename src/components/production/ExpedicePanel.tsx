import { useState, useCallback, useMemo } from "react";
import { useProductionExpedice, type ScheduleItem } from "@/hooks/useProductionSchedule";
import { useProductionDragDrop } from "@/hooks/useProductionDragDrop";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { useProductionSchedule } from "@/hooks/useProductionSchedule";
import { useProductionInbox } from "@/hooks/useProductionInbox";
import { useProjects } from "@/hooks/useProjects";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast, isFuture, differenceInDays } from "date-fns";
import { Check, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Search } from "lucide-react";
import { getProjectColor } from "@/lib/projectColors";
import { ProductionContextMenu, type ContextMenuAction } from "./ProductionContextMenu";
import { toast } from "@/hooks/use-toast";

function formatShortDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return format(d, "dd.MM.yyyy");
  } catch { return null; }
}

function formatShortDateCompact(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return format(d, "dd.MM");
  } catch { return null; }
}

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  try {
    const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
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
  selectedProjectId?: string | null;
  onSelectProject?: (projectId: string) => void;
}

export function ExpedicePanel({ showCzk, onNavigateToTPV, onOpenProjectDetail, selectedProjectId, onSelectProject }: ExpedicePanelProps) {
  const { data: projects = [] } = useProductionExpedice();
  const { data: allProjects = [] } = useProjects();
  const { data: scheduleData } = useProductionSchedule();
  const { data: inboxProjects = [] } = useProductionInbox();
  const { returnToProduction, moveItemBackToInbox } = useProductionDragDrop();
  const { data: settings } = useProductionSettings();
  const qc = useQueryClient();
  const hourlyRate = settings?.hourly_rate ?? 550;
  const [collapsed, setCollapsed] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["production-expedice"] });
    qc.invalidateQueries({ queryKey: ["production-schedule"] });
    qc.invalidateQueries({ queryKey: ["production-inbox"] });
    qc.invalidateQueries({ queryKey: ["production-progress"] });
  }, [qc]);

  // Map project_id → expedice field
  const projectExpediceMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const p of allProjects) m.set(p.project_id, p.expedice ?? null);
    return m;
  }, [allProjects]);

  // Split projects into active (has at least one non-expediced item) and archived (all expediced)
  const { activeProjects, archivedProjects } = useMemo(() => {
    const active: typeof projects = [];
    const archived: typeof projects = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const group of projects) {
      const hasNonExpediced = group.items.some(i => !i.expediced_at);
      if (hasNonExpediced) {
        active.push(group);
      } else {
        // Check if all expediced within 30 days
        const allRecent = group.items.every(i => {
          const d = parseDate(i.expediced_at);
          return d && d >= thirtyDaysAgo;
        });
        if (allRecent) {
          archived.push(group);
        }
      }
    }

    // Sort archived by most recent expediced_at
    archived.sort((a, b) => {
      const latestA = Math.max(...a.items.map(i => parseDate(i.expediced_at)?.getTime() ?? 0));
      const latestB = Math.max(...b.items.map(i => parseDate(i.expediced_at)?.getTime() ?? 0));
      return latestB - latestA;
    });

    return { activeProjects: active, archivedProjects: archived };
  }, [projects]);

  // Filtered archive
  const filteredArchive = useMemo(() => {
    if (!archiveSearch.trim()) return archivedProjects;
    const q = archiveSearch.toLowerCase();
    return archivedProjects.filter(g =>
      g.project_name.toLowerCase().includes(q) || g.project_id.toLowerCase().includes(q)
    );
  }, [archivedProjects, archiveSearch]);

  // Compute total items per project
  const projectTotalItems = useMemo(() => {
    const m = new Map<string, { total: number; nonCompleted: ScheduleItem[] }>();
    if (scheduleData) {
      for (const [, silo] of scheduleData) {
        for (const bundle of silo.bundles) {
          for (const item of bundle.items) {
            if (!m.has(item.project_id)) m.set(item.project_id, { total: 0, nonCompleted: [] });
            const entry = m.get(item.project_id)!;
            entry.total++;
            if (item.status !== "completed") entry.nonCompleted.push(item);
          }
        }
      }
    }
    for (const group of projects) {
      if (!m.has(group.project_id)) m.set(group.project_id, { total: 0, nonCompleted: [] });
      const entry = m.get(group.project_id)!;
      entry.total += group.count;
    }
    for (const inbox of inboxProjects) {
      if (!m.has(inbox.project_id)) m.set(inbox.project_id, { total: 0, nonCompleted: [] });
      const entry = m.get(inbox.project_id)!;
      entry.total += inbox.items.length;
    }
    return m;
  }, [scheduleData, projects, inboxProjects]);

  const { totalItems, lastCompletedStr } = useMemo(() => {
    let total = 0;
    let latest: Date | null = null;
    for (const g of activeProjects) {
      total += g.count;
      for (const item of g.items) {
        const d = parseDate(item.completed_at);
        if (d && (!latest || d > latest)) latest = d;
      }
    }
    return { totalItems: total, lastCompletedStr: latest ? format(latest, "dd.MM.yyyy") : null };
  }, [activeProjects]);

  const allGroupsExpanded = activeProjects.length > 0 && collapsedGroups.size === 0;
  const handleToggleAllGroups = () => {
    if (allGroupsExpanded) {
      setCollapsedGroups(new Set(activeProjects.map(p => p.project_id)));
    } else {
      setCollapsedGroups(new Set());
    }
  };

  // === EXPEDICE ACTIONS ===
  const markAsExpediced = useCallback(async (itemId: string) => {
    try {
      const { error } = await supabase
        .from("production_schedule")
        .update({ expediced_at: new Date().toISOString() } as any)
        .eq("id", itemId);
      if (error) throw error;
      invalidateAll();
      toast({ title: "📦 Expedováno" });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll]);

  const markAllAsExpediced = useCallback(async (projectId: string) => {
    try {
      // Get all completed items for this project that aren't yet expediced
      const { data: items, error: fetchErr } = await supabase
        .from("production_schedule")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", "completed")
        .is("expediced_at", null);
      if (fetchErr) throw fetchErr;
      if (!items || items.length === 0) return;

      const { error } = await supabase
        .from("production_schedule")
        .update({ expediced_at: new Date().toISOString() } as any)
        .in("id", items.map(i => i.id));
      if (error) throw error;
      invalidateAll();
      toast({ title: `📦 ${items.length} položek expedováno` });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll]);

  const unExpedice = useCallback(async (itemId: string) => {
    try {
      const { error } = await supabase
        .from("production_schedule")
        .update({ expediced_at: null } as any)
        .eq("id", itemId);
      if (error) throw error;
      invalidateAll();
      toast({ title: "↩ Vráceno do Expedice" });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll]);

  const unExpediceAll = useCallback(async (projectId: string) => {
    try {
      const { data: items, error: fetchErr } = await supabase
        .from("production_schedule")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", "completed")
        .not("expediced_at", "is", null);
      if (fetchErr) throw fetchErr;
      if (!items || items.length === 0) return;
      const { error } = await supabase
        .from("production_schedule")
        .update({ expediced_at: null } as any)
        .in("id", items.map(i => i.id));
      if (error) throw error;
      invalidateAll();
      toast({ title: `↩ ${items.length} položek vráceno do Expedice` });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll]);

  const returnAllToProduction = useCallback(async (projectId: string) => {
    try {
      const { data: items, error: fetchErr } = await supabase
        .from("production_schedule")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", "completed");
      if (fetchErr) throw fetchErr;
      if (!items || items.length === 0) return;
      for (const item of items) {
        await returnToProduction(item.id);
      }
      toast({ title: `↩ ${items.length} položek vráceno do výroby` });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [returnToProduction]);

  const returnAllToInbox = useCallback(async (projectId: string) => {
    try {
      const { data: items, error: fetchErr } = await supabase
        .from("production_schedule")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", "completed");
      if (fetchErr) throw fetchErr;
      if (!items || items.length === 0) return;
      for (const item of items) {
        await moveItemBackToInbox(item.id);
      }
      toast({ title: `📥 ${items.length} položek vráceno do Inboxu` });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [moveItemBackToInbox]);

  // === CONTEXT MENUS ===
  const buildContextActions = useCallback(
    (item: ScheduleItem | null, projectId: string, isArchive = false) => {
      const weekNum = item ? (() => {
        const d = new Date(item.scheduled_week);
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      })() : 0;

      const actions: ContextMenuAction[] = [];

      if (isArchive && item) {
        // Archive item context menu
        actions.push({ label: "Vrátit do Expedice", icon: "↩", onClick: () => unExpedice(item.id) });
        actions.push({ label: `Vrátit do výroby (T${weekNum})`, icon: "🔧", onClick: () => returnToProduction(item.id) });
        actions.push({ label: "Vrátit do Inboxu", icon: "📥", onClick: () => moveItemBackToInbox(item.id) });
      } else if (isArchive && !item) {
        // Archive project header context menu
        actions.push({ label: "Vrátit do Expedice", icon: "↩", onClick: () => unExpediceAll(projectId) });
        actions.push({ label: "Vrátit do Výroby", icon: "🔧", onClick: () => returnAllToProduction(projectId) });
        actions.push({ label: "Vrátit do Inboxu", icon: "📥", onClick: () => returnAllToInbox(projectId) });
      } else if (item) {
        // Active Expedice item context menu
        actions.push({ label: "Expedováno ✓", icon: "📦", onClick: () => markAsExpediced(item.id) });
        actions.push({ label: `Vrátit do výroby (T${weekNum})`, icon: "↩", onClick: () => returnToProduction(item.id) });
        actions.push({ label: "Vrátit do Inboxu", icon: "↩", onClick: () => moveItemBackToInbox(item.id) });
      } else {
        // Active project header context menu
        actions.push({ label: "Expedovat vše", icon: "📦", onClick: () => markAllAsExpediced(projectId) });
      }

      if (onNavigateToTPV) {
        actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(projectId, item?.item_code), dividerBefore: isArchive && !item });
      }
      if (onOpenProjectDetail) {
        actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(projectId) });
      }

      return actions;
    },
    [returnToProduction, moveItemBackToInbox, onNavigateToTPV, onOpenProjectDetail, markAsExpediced, markAllAsExpediced, unExpedice, unExpediceAll, returnAllToProduction, returnAllToInbox]
  );

  const handleItemContextMenu = useCallback(
    (e: React.MouseEvent, item: ScheduleItem, isArchive = false) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, actions: buildContextActions(item, item.project_id, isArchive) });
    },
    [buildContextActions]
  );

  const handleProjectContextMenu = useCallback(
    (e: React.MouseEvent, projectId: string, isArchive = false) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, actions: buildContextActions(null, projectId, isArchive) });
    },
    [buildContextActions]
  );

  // === COLLAPSED STATE ===
  if (collapsed) {
    return (
      <div
        className="w-[40px] shrink-0 flex flex-col items-center py-3 cursor-pointer transition-colors"
        style={{ borderLeft: "1px solid #ece8e2", backgroundColor: "#ffffff" }}
        onClick={() => setCollapsed(false)}
      >
        <ChevronLeft className="h-3.5 w-3.5 mb-2 text-muted-foreground" />
        <span className="text-sm">📦</span>
        {activeProjects.length > 0 && (
          <span
            className="text-[8px] font-bold px-1 py-0.5 rounded-full mt-1"
            style={{ backgroundColor: "#16A34A", color: "#ffffff" }}
          >
            {activeProjects.length}
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

  // === EXPANDED STATE ===
  return (
    <div className="w-[270px] shrink-0 flex flex-col" style={{ borderLeft: "1px solid #ece8e2", backgroundColor: "#ffffff" }}>
      {/* Header */}
      <div className="px-3 py-2 flex flex-col gap-1" style={{ borderBottom: "1px solid #ece8e2" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">📦</span>
            <span className="text-[13px] font-semibold" style={{ color: "#223937" }}>Expedice</span>
            {activeProjects.length > 0 && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "rgba(22,163,74,0.12)", color: "#16A34A" }}
              >
                {activeProjects.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {activeProjects.length > 0 && (
              <button onClick={handleToggleAllGroups} className="p-0.5 rounded hover:bg-muted transition-colors">
                {allGroupsExpanded
                  ? <ChevronDown className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                  : <ChevronUp className="h-4 w-4 text-gray-400 hover:text-gray-600" />}
              </button>
            )}
            <button onClick={() => setCollapsed(true)} className="p-0.5 rounded hover:bg-muted transition-colors">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
        {totalItems > 0 && (
          <div className="text-[9px] text-muted-foreground">
            {totalItems} položek dokončeno{lastCompletedStr && <> · poslední: <span className="font-medium">{lastCompletedStr}</span></>}
          </div>
        )}
      </div>

      {/* Active items */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5" onClick={() => onSelectProject?.(null as any)}>
        {activeProjects.length === 0 && archivedProjects.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[10px] text-muted-foreground">Žádné dokončené položky</p>
          </div>
        )}
        {activeProjects.map((group) => (
          <ProjectGroup
            key={group.project_id}
            group={group}
            projectExpediceMap={projectExpediceMap}
            projectTotalItems={projectTotalItems}
            scheduleData={scheduleData}
            inboxProjects={inboxProjects}
            isGroupCollapsed={collapsedGroups.has(group.project_id)}
            toggleGroup={() => setCollapsedGroups(prev => {
              const next = new Set(prev);
              next.has(group.project_id) ? next.delete(group.project_id) : next.add(group.project_id);
              return next;
            })}
            onProjectContextMenu={handleProjectContextMenu}
            onItemContextMenu={(e, item) => handleItemContextMenu(e, item, false)}
            onNavigateToTPV={onNavigateToTPV}
            isArchive={false}
            isSelected={selectedProjectId === group.project_id}
            onSelectProject={onSelectProject}
          />
        ))}
      </div>

      {/* Archive section */}
      <div className="bg-gray-50" style={{ borderTop: "1px solid hsl(var(--border))" }}>
        <button
          onClick={() => setArchiveOpen(!archiveOpen)}
          className="w-full flex items-center justify-between px-3 py-2 text-left transition-colors hover:bg-gray-100"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-sm">📁</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: "#6b7280" }}>Archiv · posledních 30 dní</span>
          </div>
          <div className="flex items-center gap-1.5">
            {archivedProjects.length > 0 && (
              <span className="rounded-full" style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", backgroundColor: "rgba(217,151,6,0.12)", color: "#d97706" }}>
                {archivedProjects.length}
              </span>
            )}
            {archiveOpen
              ? <ChevronUp className="h-3 w-3 text-gray-400" />
              : <ChevronDown className="h-3 w-3 text-gray-400" />}
          </div>
        </button>

        {archiveOpen && (
          <div className="px-2 pb-2 space-y-1.5 overflow-y-auto bg-gray-50" style={{ maxHeight: "40vh" }}>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3" style={{ color: "#b0bab8" }} />
              <input
                type="text"
                placeholder="Hledat projekt..."
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
                className="w-full border rounded px-2 py-1 text-[11px] pl-6"
                style={{ borderColor: "#ece8e2", outline: "none" }}
                onFocus={(e) => (e.target.style.borderColor = "#99a5a3")}
                onBlur={(e) => (e.target.style.borderColor = "#ece8e2")}
              />
            </div>

            {filteredArchive.length === 0 && (
              <div className="text-center py-4">
                <p className="text-[10px] text-muted-foreground">
                  {archiveSearch ? "Nic nenalezeno" : "Archiv je prázdný"}
                </p>
              </div>
            )}

            {filteredArchive.map((group) => (
              <ProjectGroup
                key={group.project_id}
                group={group}
                projectExpediceMap={projectExpediceMap}
                projectTotalItems={projectTotalItems}
                scheduleData={scheduleData}
                inboxProjects={inboxProjects}
                isGroupCollapsed={collapsedGroups.has(`archive-${group.project_id}`)}
                toggleGroup={() => setCollapsedGroups(prev => {
                  const key = `archive-${group.project_id}`;
                  const next = new Set(prev);
                  next.has(key) ? next.delete(key) : next.add(key);
                  return next;
                })}
                onProjectContextMenu={handleProjectContextMenu}
                onItemContextMenu={(e, item) => handleItemContextMenu(e, item, true)}
                onNavigateToTPV={onNavigateToTPV}
                isArchive={true}
                isSelected={selectedProjectId === group.project_id}
                onSelectProject={onSelectProject}
              />
            ))}
          </div>
        )}
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

// === PROJECT GROUP COMPONENT ===
interface ProjectGroupProps {
  group: { project_id: string; project_name: string; items: ScheduleItem[]; count: number };
  projectExpediceMap: Map<string, string | null>;
  projectTotalItems: Map<string, { total: number; nonCompleted: ScheduleItem[] }>;
  scheduleData: any;
  inboxProjects: any[];
  isGroupCollapsed: boolean;
  toggleGroup: () => void;
  onProjectContextMenu: (e: React.MouseEvent, projectId: string, isArchive?: boolean) => void;
  onItemContextMenu: (e: React.MouseEvent, item: ScheduleItem) => void;
  onNavigateToTPV?: (projectId: string, itemCode?: string | null) => void;
  isArchive: boolean;
  isSelected?: boolean;
  onSelectProject?: (projectId: string) => void;
}

function ProjectGroup({
  group, projectExpediceMap, projectTotalItems,
  isGroupCollapsed, toggleGroup,
  onProjectContextMenu, onItemContextMenu, onNavigateToTPV,
  isArchive, isSelected, onSelectProject,
}: ProjectGroupProps) {
  const expediceRaw = projectExpediceMap.get(group.project_id);
  const expediceDate = parseDate(expediceRaw);
  const expediceStr = formatShortDate(expediceRaw);

  const totals = projectTotalItems.get(group.project_id);
  const completedCount = group.count;
  const totalCount = totals ? totals.total : completedCount;
  const allDone = completedCount >= totalCount;
  const missingItems = totals?.nonCompleted ?? [];

  // For archive, find latest expediced_at date
  const latestExpedicedStr = isArchive
    ? formatShortDate(
        group.items.reduce((latest, i) => {
          const d = i.expediced_at;
          return d && (!latest || d > latest) ? d : latest;
        }, null as string | null)
      )
    : null;

  const projectColor = isArchive ? "#d1d5db" : getProjectColor(group.project_id);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: isSelected ? "rgba(217,119,6,0.04)" : (isArchive ? "hsl(var(--muted) / 0.5)" : "#ffffff"),
        borderTop: isSelected ? "2px solid #d97706" : `1px solid ${isArchive ? "hsl(var(--border))" : "#ece8e2"}`,
        borderRight: isSelected ? "2px solid #d97706" : `1px solid ${isArchive ? "hsl(var(--border))" : "#ece8e2"}`,
        borderBottom: isSelected ? "2px solid #d97706" : `1px solid ${isArchive ? "hsl(var(--border))" : "#ece8e2"}`,
        borderLeft: `4px solid ${projectColor}`,
        boxShadow: isSelected ? "0 0 0 2px rgba(217,119,6,0.15)" : undefined,
        transition: "border-color 150ms, box-shadow 150ms",
      }}
      onContextMenu={(e) => onProjectContextMenu(e, group.project_id, isArchive)}
    >
      <button
        onClick={(e) => { e.stopPropagation(); toggleGroup(); onSelectProject?.(group.project_id); }}
        onContextMenu={(e) => onProjectContextMenu(e, group.project_id, isArchive)}
        className="w-full flex items-center gap-1.5 px-2.5 py-2 text-left transition-colors"
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = isArchive ? "hsl(210 20% 96%)" : "#f8f7f5")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        {isGroupCollapsed
          ? <ChevronRight className="h-3 w-3 shrink-0 text-gray-400" />
          : <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <span
              className="truncate"
              style={{ fontSize: 13, fontWeight: 600, color: isArchive ? "hsl(var(--muted-foreground))" : "#1a1a1a" }}
            >
              {group.project_name}
            </span>
            <span
              className="rounded-full shrink-0 text-center"
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 7px",
                ...(isArchive ? {
                  backgroundColor: "hsl(var(--muted))",
                  color: "hsl(var(--muted-foreground))",
                  minWidth: 40,
                } : {
                  backgroundColor: allDone ? "rgba(22,163,74,0.12)" : "rgba(217,151,6,0.12)",
                  color: allDone ? "#16A34A" : "#d97706",
                  minWidth: 40,
                }),
              }}
            >
              {completedCount}/{totalCount}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono" style={{ fontSize: 11, color: isArchive ? "#9ca3af" : "#6b7280" }}>{group.project_id}</span>
            {isArchive && latestExpedicedStr ? (
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                Expedováno: {latestExpedicedStr}
              </span>
            ) : expediceStr ? (
              <span className="shrink-0" style={{
                fontSize: 11,
                fontWeight: 500,
                color: expediceDate && expediceDate < new Date() ? "#dc2626"
                  : expediceDate && differenceInDays(expediceDate, new Date()) <= 14 ? "#d97706"
                  : "#6b7280"
              }}>
                Exp: {expediceStr}
              </span>
            ) : null}
          </div>
        </div>
      </button>

      {!isGroupCollapsed && (
        <div className="px-2.5 pb-2 space-y-1.5">
          {/* Missing items indicator (active only) */}
          {!isArchive && !allDone && missingItems.length > 0 && (
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
                  style={{ fontSize: 11, color: "#d97706", fontWeight: 500 }}
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
              const isItemExpediced = !!item.expediced_at;
              const completedStr = formatShortDate(item.completed_at);
              const expedicedCompactStr = formatShortDateCompact(item.expediced_at);

              return (
                <div
                  key={item.id}
                  className="rounded px-1 py-[3px] cursor-default transition-colors"
                  style={{ opacity: isArchive ? 0.75 : (isItemExpediced ? 0.4 : 1) }}
                  onContextMenu={(e) => onItemContextMenu(e, item)}
                  onMouseEnter={(e) => { if (!isArchive) e.currentTarget.style.backgroundColor = "hsl(var(--muted))"; }}
                  onMouseLeave={(e) => { if (!isArchive) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <div className="flex items-center gap-1.5">
                    {isArchive ? (
                      <span className="shrink-0" style={{ fontSize: 12, color: "#9ca3af" }}>✓</span>
                    ) : isItemExpediced ? (
                      <span className="font-bold px-1 py-[1px] rounded shrink-0"
                        style={{ fontSize: 8, backgroundColor: "rgba(13,148,136,0.12)", color: "#0d9488" }}>
                        ✓ Exp
                      </span>
                    ) : (
                      <Check className="shrink-0" style={{ width: 12, height: 12, color: "#3a8a36", strokeWidth: 3 }} />
                    )}
                    {item.item_code && (
                      <span className="font-mono shrink-0" style={{ fontSize: 11, fontWeight: 500, color: isArchive ? "#9ca3af" : "#223937" }}>
                        {item.item_code}
                      </span>
                    )}
                    <span
                      className="truncate flex-1"
                      style={{ fontSize: 12, color: isArchive ? "#9ca3af" : "#4b5563", textDecoration: (!isArchive && isItemExpediced) ? "line-through" : "none" }}
                    >
                      {item.item_name}
                    </span>
                  </div>
                  {isArchive ? (
                    expedicedCompactStr && (
                      <div className="ml-[18px]">
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, backgroundColor: "#f0fdf4", color: "#3a8a36", border: "1px solid #86efac" }}>
                          ✓ Expedováno {expedicedCompactStr}
                        </span>
                      </div>
                    )
                  ) : (
                    <div className="ml-[18px] flex flex-col gap-0">
                      {completedStr && (
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>
                          Dokončeno: {completedStr}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}