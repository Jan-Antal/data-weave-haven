import { useState, useCallback, useMemo } from "react";
import { useProductionExpediceData, type ExpediceItem, type ExpediceProject } from "@/hooks/useProductionExpedice";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { useProductionSchedule } from "@/hooks/useProductionSchedule";
import { useProductionInbox } from "@/hooks/useProductionInbox";
import { useProjects } from "@/hooks/useProjects";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays } from "date-fns";
import { Check, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { getProjectColor } from "@/lib/projectColors";
import { resolveDeadline } from "@/lib/deadlineWarning";
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
  searchQuery?: string;
}

export function ExpedicePanel({ showCzk, onNavigateToTPV, onOpenProjectDetail, selectedProjectId, onSelectProject, searchQuery = "" }: ExpedicePanelProps) {
  const { data: projects = [] } = useProductionExpediceData();
  const { data: allProjects = [] } = useProjects();
  const { data: scheduleData } = useProductionSchedule();
  const { data: inboxProjects = [] } = useProductionInbox();
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
    qc.invalidateQueries({ queryKey: ["production-expedice-schedule-ids"] });
    qc.invalidateQueries({ queryKey: ["production-schedule"] });
    qc.invalidateQueries({ queryKey: ["production-inbox"] });
    qc.invalidateQueries({ queryKey: ["production-progress"] });
  }, [qc]);

  const projectDeadlineMap = useMemo(() => {
    const m = new Map<string, { expedice?: string | null; montaz?: string | null; predani?: string | null; datum_smluvni?: string | null }>();
    for (const p of allProjects) m.set(p.project_id, {
      expedice: p.expedice ?? null,
      montaz: p.montaz ?? null,
      predani: p.predani ?? null,
      datum_smluvni: p.datum_smluvni ?? null,
    });
    return m;
  }, [allProjects]);

  // Split projects into active (not yet expediced) and archived (expediced)
  const { activeProjects, archivedProjects } = useMemo(() => {
    const active: ExpediceProject[] = [];
    const archived: ExpediceProject[] = [];

    for (const group of projects) {
      const activeItems = group.items.filter(i => !i.expediced_at);
      const archivedItems = group.items.filter(i => !!i.expediced_at);
      if (activeItems.length > 0) {
        active.push({ ...group, items: activeItems, count: activeItems.length });
      }
      if (archivedItems.length > 0) {
        archived.push({ ...group, items: archivedItems, count: archivedItems.length });
      }
    }

    archived.sort((a, b) => {
      const latestA = Math.max(...a.items.map(i => parseDate(i.expediced_at)?.getTime() ?? 0));
      const latestB = Math.max(...b.items.map(i => parseDate(i.expediced_at)?.getTime() ?? 0));
      return latestB - latestA;
    });

    return { activeProjects: active, archivedProjects: archived };
  }, [projects]);

  // Deep archive search
  const archiveSearchTrimmed = archiveSearch.trim().toLowerCase();
  const isDeepSearch = archiveSearchTrimmed.length >= 3;

  const { data: deepSearchResults = [] } = useQuery({
    queryKey: ["production-expedice-search", archiveSearchTrimmed],
    enabled: isDeepSearch,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_expedice" as any)
        .select("*, projects!production_expedice_project_id_fkey(project_name)")
        .not("expediced_at", "is", null)
        .order("expediced_at", { ascending: false });
      if (error) throw error;

      const q = archiveSearchTrimmed;
      const grouped = new Map<string, ExpediceProject>();
      for (const row of data || []) {
        const pid = (row as any).project_id;
        const pname = (row as any).projects?.project_name || pid;
        if (!pid.toLowerCase().includes(q) && !pname.toLowerCase().includes(q)) continue;
        if (!grouped.has(pid)) {
          grouped.set(pid, { project_id: pid, project_name: pname, items: [], count: 0 });
        }
        const g = grouped.get(pid)!;
        g.items.push({
          id: (row as any).id,
          project_id: pid,
          stage_id: (row as any).stage_id ?? null,
          item_name: (row as any).item_name,
          item_code: (row as any).item_code ?? null,
          source_schedule_id: (row as any).source_schedule_id ?? null,
          manufactured_at: (row as any).manufactured_at,
          expediced_at: (row as any).expediced_at ?? null,
          is_midflight: (row as any).is_midflight ?? false,
          created_at: (row as any).created_at,
        });
        g.count++;
      }
      return Array.from(grouped.values());
    },
  });

  const filteredArchive = useMemo(() => {
    if (isDeepSearch) return deepSearchResults;
    if (!archiveSearchTrimmed) return archivedProjects;
    return archivedProjects.filter(g =>
      g.project_name.toLowerCase().includes(archiveSearchTrimmed) || g.project_id.toLowerCase().includes(archiveSearchTrimmed)
    );
  }, [archivedProjects, archiveSearchTrimmed, isDeepSearch, deepSearchResults]);

  const { totalItems, lastCompletedStr } = useMemo(() => {
    let total = 0;
    let latest: Date | null = null;
    for (const g of activeProjects) {
      total += g.count;
      for (const item of g.items) {
        const d = parseDate(item.manufactured_at);
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

  // === EXPEDICE ACTIONS (now using production_expedice table) ===
  const markAsExpediced = useCallback(async (itemId: string) => {
    try {
      const { error } = await supabase
        .from("production_expedice" as any)
        .update({ expediced_at: new Date().toISOString() })
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
      const { data: items, error: fetchErr } = await supabase
        .from("production_expedice" as any)
        .select("id")
        .eq("project_id", projectId)
        .is("expediced_at", null);
      if (fetchErr) throw fetchErr;
      if (!items || items.length === 0) return;

      const { error } = await supabase
        .from("production_expedice" as any)
        .update({ expediced_at: new Date().toISOString() })
        .in("id", (items as any[]).map(i => i.id));
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
        .from("production_expedice" as any)
        .update({ expediced_at: null })
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
        .from("production_expedice" as any)
        .select("id")
        .eq("project_id", projectId)
        .not("expediced_at", "is", null);
      if (fetchErr) throw fetchErr;
      if (!items || items.length === 0) return;
      const { error } = await supabase
        .from("production_expedice" as any)
        .update({ expediced_at: null })
        .in("id", (items as any[]).map(i => i.id));
      if (error) throw error;
      invalidateAll();
      toast({ title: `↩ ${items.length} položek vráceno do Expedice` });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll]);

  const returnToProduction = useCallback(async (expediceItemId: string) => {
    try {
      // Delete from production_expedice → schedule item returns to active in silos
      const { error } = await supabase
        .from("production_expedice" as any)
        .delete()
        .eq("id", expediceItemId);
      if (error) throw error;
      invalidateAll();
      toast({ title: "↩ Vráceno do výroby" });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll]);

  const returnAllToProduction = useCallback(async (projectId: string) => {
    try {
      const { data: items, error: fetchErr } = await supabase
        .from("production_expedice" as any)
        .select("id")
        .eq("project_id", projectId);
      if (fetchErr) throw fetchErr;
      if (!items || items.length === 0) return;
      const { error } = await supabase
        .from("production_expedice" as any)
        .delete()
        .in("id", (items as any[]).map(i => i.id));
      if (error) throw error;
      invalidateAll();
      toast({ title: `↩ ${items.length} položek vráceno do výroby` });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll]);

  const returnAllToInbox = useCallback(async (projectId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      // Get expedice items with their source_schedule_ids
      const { data: expItems, error: fetchErr } = await supabase
        .from("production_expedice" as any)
        .select("id, source_schedule_id, project_id, item_name, item_code")
        .eq("project_id", projectId);
      if (fetchErr) throw fetchErr;
      if (!expItems || expItems.length === 0) return;

      // For each expedice item: delete from expedice, delete schedule row, create inbox item
      for (const item of expItems as any[]) {
        // Delete from expedice
        await supabase.from("production_expedice" as any).delete().eq("id", item.id);
        
        // If there's a source schedule row, get its details and delete it
        if (item.source_schedule_id) {
          const { data: schedItem } = await supabase
            .from("production_schedule")
            .select("*")
            .eq("id", item.source_schedule_id)
            .single();
          if (schedItem) {
            await supabase.from("production_schedule").delete().eq("id", schedItem.id);
            // Create inbox item
            if (schedItem.inbox_item_id) {
              await supabase.from("production_inbox").update({ status: "pending" }).eq("id", schedItem.inbox_item_id);
            } else {
              await supabase.from("production_inbox").insert({
                project_id: schedItem.project_id,
                stage_id: schedItem.stage_id,
                item_name: schedItem.item_name,
                item_code: schedItem.item_code,
                estimated_hours: schedItem.scheduled_hours,
                estimated_czk: schedItem.scheduled_czk,
                sent_by: user.id,
                status: "pending",
              });
            }
          }
        }
      }
      invalidateAll();
      toast({ title: `📥 ${expItems.length} položek vráceno do Inboxu` });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll]);

  // === CONTEXT MENUS ===
  const buildContextActions = useCallback(
    (item: ExpediceItem | null, projectId: string, isArchive = false) => {
      const actions: ContextMenuAction[] = [];

      if (isArchive && item) {
        actions.push({ label: "Vrátit do Expedice", icon: "↩", onClick: () => unExpedice(item.id) });
        actions.push({ label: "Vrátit do výroby", icon: "🔧", onClick: () => returnToProduction(item.id) });
      } else if (isArchive && !item) {
        actions.push({ label: "Vrátit do Expedice", icon: "↩", onClick: () => unExpediceAll(projectId) });
        actions.push({ label: "Vrátit do Výroby", icon: "🔧", onClick: () => returnAllToProduction(projectId) });
        actions.push({ label: "Vrátit do Inboxu", icon: "📥", onClick: () => returnAllToInbox(projectId) });
      } else if (item) {
        actions.push({ label: "Expedováno ✓", icon: "📦", onClick: () => markAsExpediced(item.id) });
        actions.push({ label: "Vrátit do výroby", icon: "↩", onClick: () => returnToProduction(item.id) });
      } else {
        actions.push({ label: "Expedovat vše", icon: "📦", onClick: () => markAllAsExpediced(projectId) });
        actions.push({ label: "Vrátit do Výroby", icon: "↩", onClick: () => returnAllToProduction(projectId) });
        actions.push({ label: "Vrátit do Inboxu", icon: "📥", onClick: () => returnAllToInbox(projectId) });
      }

      if (onNavigateToTPV) {
        actions.push({ label: "Zobrazit položky", icon: "📋", onClick: () => onNavigateToTPV(projectId, item?.item_code), dividerBefore: isArchive && !item });
      }
      if (onOpenProjectDetail) {
        actions.push({ label: "Zobrazit detail projektu", icon: "🏗", onClick: () => onOpenProjectDetail(projectId) });
      }

      return actions;
    },
    [returnToProduction, onNavigateToTPV, onOpenProjectDetail, markAsExpediced, markAllAsExpediced, unExpedice, unExpediceAll, returnAllToProduction, returnAllToInbox]
  );

  const handleItemContextMenu = useCallback(
    (e: React.MouseEvent, item: ExpediceItem, isArchive = false) => {
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
    <div className="w-[252px] shrink-0 flex flex-col" style={{ borderLeft: "1px solid #ece8e2", backgroundColor: "#ffffff" }}>
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
            projectDeadlineMap={projectDeadlineMap}
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
                placeholder="Hledat v archivu..."
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
                className="w-full border rounded px-2 py-1 text-[11px] pl-6 pr-6"
                style={{ borderColor: "#ece8e2", outline: "none" }}
                onFocus={(e) => (e.target.style.borderColor = "#99a5a3")}
                onBlur={(e) => (e.target.style.borderColor = "#ece8e2")}
              />
              {archiveSearch && (
                <button
                  onClick={() => setArchiveSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-200 transition-colors"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>

            {isDeepSearch && (
              <div className="text-[10px] text-muted-foreground px-1">
                {filteredArchive.length} výsledkov pre „{archiveSearch.trim()}"
              </div>
            )}

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
                projectDeadlineMap={projectDeadlineMap}
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
  group: ExpediceProject;
  projectDeadlineMap: Map<string, { expedice?: string | null; montaz?: string | null; predani?: string | null; datum_smluvni?: string | null }>;
  isGroupCollapsed: boolean;
  toggleGroup: () => void;
  onProjectContextMenu: (e: React.MouseEvent, projectId: string, isArchive?: boolean) => void;
  onItemContextMenu: (e: React.MouseEvent, item: ExpediceItem) => void;
  onNavigateToTPV?: (projectId: string, itemCode?: string | null) => void;
  isArchive: boolean;
  isSelected?: boolean;
  onSelectProject?: (projectId: string) => void;
}

const DEADLINE_SHORT_LABELS: Record<string, string> = {
  expedice: "Exp",
  montaz: "Mnt",
  predani: "Před",
  datum_smluvni: "Sml",
};

function ProjectGroup({
  group, projectDeadlineMap,
  isGroupCollapsed, toggleGroup,
  onProjectContextMenu, onItemContextMenu, onNavigateToTPV,
  isArchive, isSelected, onSelectProject,
}: ProjectGroupProps) {
  const deadlineFields = projectDeadlineMap.get(group.project_id);
  const resolved = deadlineFields ? resolveDeadline(deadlineFields) : null;
  const deadlineDate = resolved?.date ?? null;
  const deadlineStr = deadlineDate ? formatShortDate(deadlineDate.toISOString()) : null;
  const deadlineLabel = resolved ? (DEADLINE_SHORT_LABELS[resolved.fieldName] ?? "Exp") : "Exp";

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
                fontSize: 11, fontWeight: 600, padding: "2px 7px",
                ...(isArchive ? {
                  backgroundColor: "hsl(var(--muted))",
                  color: "hsl(var(--muted-foreground))",
                  minWidth: 40,
                } : {
                  backgroundColor: "rgba(22,163,74,0.12)",
                  color: "#16A34A",
                  minWidth: 40,
                }),
              }}
            >
              {group.count}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-sans" style={{ fontSize: 11, color: isArchive ? "#9ca3af" : "#6b7280" }}>{group.project_id}</span>
            {isArchive && latestExpedicedStr ? (
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                Expedováno: {latestExpedicedStr}
              </span>
            ) : deadlineStr ? (
              <span className="shrink-0" style={{
                fontSize: 11,
                fontWeight: 500,
                color: deadlineDate && deadlineDate < new Date() ? "#dc2626"
                  : deadlineDate && differenceInDays(deadlineDate, new Date()) <= 14 ? "#d97706"
                  : "#6b7280"
              }}>
                {deadlineLabel}: {deadlineStr}
              </span>
            ) : null}
          </div>
        </div>
      </button>

      {!isGroupCollapsed && (
        <div className="px-2.5 pb-2 space-y-1.5">
          <div className="space-y-[2px]">
            {group.items.map((item) => {
              const isItemExpediced = !!item.expediced_at;
              const manufacturedStr = formatShortDate(item.manufactured_at);
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
                      <span className="font-sans shrink-0" style={{ fontSize: 11, fontWeight: 500, color: isArchive ? "#9ca3af" : "#223937" }}>
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
                      {manufacturedStr && (
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>
                          Dokončeno: {manufacturedStr}
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
