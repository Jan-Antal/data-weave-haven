import { useMemo, useState, useRef } from "react";
import { useProductionSchedule, useProductionExpedice, getISOWeekNumber, type ScheduleItem } from "@/hooks/useProductionSchedule";
import { useProductionInbox } from "@/hooks/useProductionInbox";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { useWeekCapacityLookup } from "@/hooks/useWeeklyCapacity";
import { useProjects } from "@/hooks/useProjects";
import { getProjectColor } from "@/lib/projectColors";
import { exportToExcel } from "@/lib/exportExcel";
import { parseAppDate } from "@/lib/dateFormat";
import { Download, ChevronRight, ChevronDown } from "lucide-react";

type DisplayMode = "hours" | "czk" | "percent";
type SortMode = "project" | "deadline" | "hours";

interface Props {
  displayMode: DisplayMode;
  searchQuery?: string;
}

function formatCzk(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M Kč`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K Kč`;
  return `${v.toLocaleString("cs-CZ")} Kč`;
}

function formatCzkShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return v.toLocaleString("cs-CZ");
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateShort(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

interface WeekColumn {
  key: string;
  weekNum: number;
  start: Date;
  end: Date;
  isCurrent: boolean;
}

interface ItemRow {
  id: string;
  itemName: string;
  itemCode: string | null;
  totalHours: number;
  totalCzk: number;
  weekAllocations: Map<string, { hours: number; czk: number; status: string; splitPart?: number; splitTotal?: number }>;
  inboxHours: number;
  inboxCzk: number;
  expediceHours: number;
  expediceCzk: number;
}

interface ProjectRow {
  projectId: string;
  projectName: string;
  color: string;
  totalHours: number;
  totalCzk: number;
  items: ItemRow[];
  weekTotals: Map<string, { hours: number; czk: number }>;
  inboxTotalHours: number;
  inboxTotalCzk: number;
  expediceTotalHours: number;
  expediceTotalCzk: number;
}

const CELL_W = 132;
const INBOX_W = 80;
const EXPEDICE_W = 80;
const LEFT_COL_W = 280;

export function PlanVyrobyTableView({ displayMode, searchQuery = "" }: Props) {
  const { data: scheduleData } = useProductionSchedule();
  const { data: expediceData } = useProductionExpedice();
  const { data: inboxProjects = [] } = useProductionInbox();
  const { data: settings } = useProductionSettings();
  const { data: allProjects = [] } = useProjects();
  const getWeekCapacity = useWeekCapacityLookup();
  const [sortMode, setSortMode] = useState<SortMode>("project");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const projectDateLookup = useMemo(() => {
    const map = new Map<string, { expedice?: string | null; datum_smluvni?: string | null }>();
    for (const p of allProjects) map.set(p.project_id, p);
    return map;
  }, [allProjects]);

  const hourlyRate = settings?.hourly_rate ?? 550;

  const toggleProject = (pid: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const weeks = useMemo<WeekColumn[]>(() => {
    const monday = getMonday(new Date());
    const currentWeekKey = monday.toISOString().split("T")[0];
    let earliestDataWeek = currentWeekKey;
    if (scheduleData) {
      for (const weekKey of scheduleData.keys()) {
        if (weekKey < earliestDataWeek) earliestDataWeek = weekKey;
      }
    }
    const startMonday = new Date(earliestDataWeek < currentWeekKey ? earliestDataWeek : currentWeekKey);
    startMonday.setDate(startMonday.getDate() - 7);
    const result: WeekColumn[] = [];
    for (let i = 0; i < 18; i++) {
      const start = new Date(startMonday);
      start.setDate(startMonday.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const key = start.toISOString().split("T")[0];
      result.push({ key, weekNum: getISOWeekNumber(start), start, end, isCurrent: key === currentWeekKey });
    }
    return result;
  }, [scheduleData]);

  const inboxByProject = useMemo(() => {
    const map = new Map<string, { items: { name: string; code: string | null; hours: number; czk: number }[]; totalHours: number; totalCzk: number }>();
    for (const p of inboxProjects) {
      if (p.total_hours <= 0) continue;
      map.set(p.project_id, {
        items: p.items.map(i => ({ name: i.item_name, code: i.item_code, hours: i.estimated_hours, czk: i.estimated_czk })),
        totalHours: p.total_hours,
        totalCzk: p.items.reduce((s, i) => s + i.estimated_czk, 0),
      });
    }
    return map;
  }, [inboxProjects]);

  const expediceByProject = useMemo(() => {
    const map = new Map<string, { items: { name: string; code: string | null; hours: number; czk: number }[]; totalHours: number; totalCzk: number }>();
    if (!expediceData) return map;
    for (const g of expediceData) {
      const totalHours = g.items.reduce((s, i) => s + i.scheduled_hours, 0);
      const totalCzk = g.items.reduce((s, i) => s + i.scheduled_czk, 0);
      if (totalHours <= 0) continue;
      map.set(g.project_id, {
        items: g.items.map(i => ({ name: i.item_name, code: i.item_code, hours: i.scheduled_hours, czk: i.scheduled_czk })),
        totalHours,
        totalCzk,
      });
    }
    return map;
  }, [expediceData]);

  const cleanSplitName = (name: string) => name.replace(/\s*\(\d+\/\d+\)\s*$/, "").trim();

  const projectRows = useMemo<ProjectRow[]>(() => {
    const projectMap = new Map<string, {
      projectName: string;
      items: Map<string, {
        itemName: string;
        itemCode: string | null;
        weekAllocations: Map<string, { hours: number; czk: number; status: string; splitPart?: number; splitTotal?: number }>;
        totalHours: number;
        totalCzk: number;
      }>;
    }>();

    if (scheduleData) {
      for (const [weekKey, silo] of scheduleData) {
        for (const bundle of silo.bundles) {
          if (!projectMap.has(bundle.project_id)) {
            projectMap.set(bundle.project_id, { projectName: bundle.project_name, items: new Map() });
          }
          const proj = projectMap.get(bundle.project_id)!;
          for (const item of bundle.items) {
            if (item.status === "completed") continue;
            const itemKey = item.split_group_id || item.id;
            if (!proj.items.has(itemKey)) {
              proj.items.set(itemKey, { itemName: cleanSplitName(item.item_name), itemCode: item.item_code, weekAllocations: new Map(), totalHours: 0, totalCzk: 0 });
            }
            const entry = proj.items.get(itemKey)!;
            const existing = entry.weekAllocations.get(weekKey);
            entry.weekAllocations.set(weekKey, {
              hours: (existing?.hours ?? 0) + item.scheduled_hours,
              czk: (existing?.czk ?? 0) + item.scheduled_czk,
              status: item.status,
              splitPart: item.split_part ?? undefined,
              splitTotal: item.split_total ?? undefined,
            });
            entry.totalHours += item.scheduled_hours;
            entry.totalCzk += item.scheduled_czk;
          }
        }
      }
    }

    const allProjectIds = new Set<string>([...projectMap.keys(), ...inboxByProject.keys(), ...expediceByProject.keys()]);
    const rows: ProjectRow[] = [];

    for (const pid of allProjectIds) {
      const proj = projectMap.get(pid);
      const inbox = inboxByProject.get(pid);
      const expedice = expediceByProject.get(pid);
      const items: ItemRow[] = [];
      const knownItemKeys = new Set<string>();

      if (proj) {
        for (const [, entry] of proj.items) {
          if (entry.totalHours <= 0) continue;
          const cleanName = cleanSplitName(entry.itemName);
          if (entry.itemCode) knownItemKeys.add(entry.itemCode.toLowerCase());
          knownItemKeys.add(cleanName.toLowerCase());
          items.push({
            id: Math.random().toString(36),
            itemName: cleanName,
            itemCode: entry.itemCode,
            totalHours: entry.totalHours,
            totalCzk: entry.totalCzk,
            weekAllocations: entry.weekAllocations,
            inboxHours: 0, inboxCzk: 0, expediceHours: 0, expediceCzk: 0,
          });
        }
      }

      if (inbox) {
        for (const inItem of inbox.items) {
          if (inItem.hours <= 0) continue;
          const cleanName = cleanSplitName(inItem.name);
          const codeKey = inItem.code?.toLowerCase();
          const nameKey = cleanName.toLowerCase();
          const existing = items.find(i =>
            (codeKey && i.itemCode?.toLowerCase() === codeKey) ||
            cleanSplitName(i.itemName).toLowerCase() === nameKey
          );
          if (existing) {
            existing.inboxHours += inItem.hours;
            existing.inboxCzk += inItem.czk;
            existing.totalHours += inItem.hours;
            existing.totalCzk += inItem.czk;
          } else {
            if (codeKey) knownItemKeys.add(codeKey);
            knownItemKeys.add(nameKey);
            items.push({
              id: Math.random().toString(36),
              itemName: cleanName, itemCode: inItem.code,
              totalHours: inItem.hours, totalCzk: inItem.czk,
              weekAllocations: new Map(),
              inboxHours: inItem.hours, inboxCzk: inItem.czk,
              expediceHours: 0, expediceCzk: 0,
            });
          }
        }
      }

      if (expedice) {
        for (const exItem of expedice.items) {
          if (exItem.hours <= 0) continue;
          const cleanName = cleanSplitName(exItem.name);
          const codeKey = exItem.code?.toLowerCase();
          const nameKey = cleanName.toLowerCase();
          const existing = items.find(i =>
            (codeKey && i.itemCode?.toLowerCase() === codeKey) ||
            cleanSplitName(i.itemName).toLowerCase() === nameKey
          );
          if (existing) {
            existing.expediceHours += exItem.hours;
            existing.expediceCzk += exItem.czk;
            existing.totalHours += exItem.hours;
            existing.totalCzk += exItem.czk;
          } else {
            items.push({
              id: Math.random().toString(36),
              itemName: cleanName, itemCode: exItem.code,
              totalHours: exItem.hours, totalCzk: exItem.czk,
              weekAllocations: new Map(),
              inboxHours: 0, inboxCzk: 0,
              expediceHours: exItem.hours, expediceCzk: exItem.czk,
            });
          }
        }
      }

      // Hide empty item rows
      const visibleItems = items.filter(i => i.totalHours > 0 || i.inboxHours > 0 || i.expediceHours > 0);
      if (visibleItems.length === 0) continue;

      const weekTotals = new Map<string, { hours: number; czk: number }>();
      for (const item of visibleItems) {
        for (const [wk, alloc] of item.weekAllocations) {
          const existing = weekTotals.get(wk);
          weekTotals.set(wk, { hours: (existing?.hours ?? 0) + alloc.hours, czk: (existing?.czk ?? 0) + alloc.czk });
        }
      }

      const realName = inboxProjects.find(p => p.project_id === pid)?.project_name ||
        expediceData?.find(g => g.project_id === pid)?.project_name ||
        proj?.projectName || pid;

      rows.push({
        projectId: pid, projectName: realName, color: getProjectColor(pid),
        totalHours: visibleItems.reduce((s, i) => s + i.totalHours, 0),
        totalCzk: visibleItems.reduce((s, i) => s + i.totalCzk, 0),
        items: visibleItems, weekTotals,
        inboxTotalHours: inbox?.totalHours ?? 0, inboxTotalCzk: inbox?.totalCzk ?? 0,
        expediceTotalHours: expedice?.totalHours ?? 0, expediceTotalCzk: expedice?.totalCzk ?? 0,
      });
    }

    if (sortMode === "hours") rows.sort((a, b) => b.totalHours - a.totalHours);
    else if (sortMode === "deadline") {
      rows.sort((a, b) => {
        const aMin = Math.min(...a.items.flatMap(i => [...i.weekAllocations.keys()].map(k => weeks.findIndex(w => w.key === k))).filter(x => x >= 0), 999);
        const bMin = Math.min(...b.items.flatMap(i => [...i.weekAllocations.keys()].map(k => weeks.findIndex(w => w.key === k))).filter(x => x >= 0), 999);
        return aMin - bMin;
      });
    } else {
      rows.sort((a, b) => a.projectName.localeCompare(b.projectName, "cs"));
    }
    return rows;
  }, [scheduleData, expediceData, inboxByProject, expediceByProject, inboxProjects, sortMode, weeks]);

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return projectRows;
    const q = searchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return projectRows.filter(p => {
      const pName = p.projectName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const pId = p.projectId.toLowerCase();
      if (pName.includes(q) || pId.includes(q)) return true;
      return p.items.some(i => {
        const iName = i.itemName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const iCode = (i.itemCode || "").toLowerCase();
        return iName.includes(q) || iCode.includes(q);
      });
    });
  }, [projectRows, searchQuery]);

  const totalProjects = filteredRows.length;
  const totalItems = filteredRows.reduce((s, p) => s + p.items.length, 0);

  const weekCapacities = useMemo(() => {
    const map = new Map<string, number>();
    if (scheduleData) {
      for (const [weekKey, silo] of scheduleData) {
        const activeHours = silo.bundles.reduce((sum, b) =>
          sum + b.items.reduce((s, i) => s + (i.status === "paused" ? 0 : i.scheduled_hours), 0), 0);
        map.set(weekKey, activeHours);
      }
    }
    return map;
  }, [scheduleData]);

  const getCellStyle = (status: string) => {
    switch (status) {
      case "completed": return { bg: "#ecfdf5", text: "#059669", border: "#059669" };
      case "in_progress": return { bg: "#fffbeb", text: "#d97706", border: "#d97706" };
      case "paused": return { bg: "#fefce8", text: "#a16207", border: "#a16207" };
      default: return { bg: "#eff6ff", text: "#3b82f6", border: "#3b82f6" };
    }
  };

  const formatCellValue = (hours: number, czk: number, status: string, totalItemHours: number, splitPart?: number, splitTotal?: number) => {
    const splitLabel = splitPart && splitTotal
      ? ` ${["½", "²⁄₂", "⅓", "²⁄₃", "¼", "²⁄₄", "¾"][splitPart === 1 && splitTotal === 2 ? 0 : splitPart === 2 && splitTotal === 2 ? 1 : 0] || `${splitPart}/${splitTotal}`}`
      : "";
    if (displayMode === "percent") {
      const pct = totalItemHours > 0 ? Math.round((hours / totalItemHours) * 100) : 0;
      return `${pct}%${splitLabel}`;
    }
    if (displayMode === "czk") return `${formatCzkShort(Math.round(czk))} Kč${splitLabel}`;
    return `${Math.round(hours)}h${splitLabel}`;
  };

  const formatCapacity = (used: number, weekKey: string) => {
    const cap = getWeekCapacity(weekKey);
    if (displayMode === "percent") return `${cap > 0 ? Math.round((used / cap) * 100) : 0}%`;
    if (displayMode === "czk") return `${formatCzk(Math.round(used * hourlyRate))}`;
    return `${Math.round(used)}h / ${cap}h`;
  };

  const formatProjectTotal = (row: ProjectRow) => {
    if (displayMode === "czk") return formatCzk(Math.round(row.totalCzk));
    if (displayMode === "percent") {
      const completedItems = row.items.filter(i => i.expediceHours > 0).length;
      const totalItems = row.items.length;
      const completedPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
      return `${completedPct}% hotovo`;
    }
    return `${Math.round(row.totalHours)}h`;
  };

  const formatWeekTotal = (hours: number, czk: number) => {
    if (displayMode === "czk") return `${formatCzkShort(Math.round(czk))} Kč`;
    return `${Math.round(hours)}h`;
  };

  const formatInboxValue = (hours: number, czk: number, totalProjectHours?: number) => {
    if (displayMode === "czk") return `${formatCzkShort(Math.round(czk))} Kč`;
    if (displayMode === "percent" && totalProjectHours && totalProjectHours > 0) return `${Math.round((hours / totalProjectHours) * 100)}%`;
    return `${Math.round(hours)}h`;
  };

  const formatExpediceValue = (hours: number, czk: number, totalProjectHours?: number) => {
    if (displayMode === "czk") return `${formatCzkShort(Math.round(czk))} Kč`;
    if (displayMode === "percent" && totalProjectHours && totalProjectHours > 0) return `${Math.round((hours / totalProjectHours) * 100)}%`;
    return `${Math.round(hours)}h`;
  };

  const formatItemTotal = (item: ItemRow) => {
    if (displayMode === "czk") return formatCzkShort(Math.round(item.totalCzk)) + " Kč";
    return `${Math.round(item.totalHours)}h`;
  };

  const handleExport = () => {
    const headers = ["Projekt", "ID", "Položka", "Kód", "Inbox h", ...weeks.map(w => `T${w.weekNum}`), "Expedice h"];
    const rows: (string | number)[][] = [];
    for (const proj of filteredRows) {
      for (const item of proj.items) {
        const row: (string | number)[] = [proj.projectName, proj.projectId, item.itemName, item.itemCode || "", item.inboxHours || ""];
        for (const week of weeks) {
          const alloc = item.weekAllocations.get(week.key);
          row.push(alloc ? Math.round(alloc.hours) : "");
        }
        row.push(item.expediceHours || "");
        rows.push(row);
      }
    }
    const today = new Date().toISOString().split("T")[0];
    exportToExcel({ sheetName: "Plán Výroby", fileName: `AMI-Plan-Vyroby-${today}.xlsx`, headers, rows });
  };

  // Always show Inbox and Expedice columns as fixed/sticky
  const hasAnyInbox = true;
  const hasAnyExpedice = true;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Toolbar */}
      <div className="px-3 py-[6px] flex items-center justify-between shrink-0 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium text-muted-foreground">
            {totalProjects} projektů · {totalItems} položek
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-medium text-muted-foreground">Řadit:</span>
            {(["project", "deadline", "hours"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`px-2 py-[2px] text-[9px] font-medium rounded transition-colors ${
                  sortMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground border border-border"
                }`}
              >
                {mode === "project" ? "Projekt" : mode === "deadline" ? "Termín" : "Hodiny"}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1 px-2 py-[3px] text-[10px] font-medium rounded bg-card text-muted-foreground border border-border transition-colors hover:bg-accent"
        >
          <Download className="h-3 w-3" />
          Export
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-muted/30" ref={scrollRef} style={{ padding: "0 0 8px 0" }}>
        <div className="min-w-max">
          {/* Header row */}
          <div className="flex sticky top-0 z-30" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div className="shrink-0 sticky left-0 z-40 border-r border-b border-border bg-card" style={{ width: LEFT_COL_W }}>
              <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Projekt / Položka
              </div>
            </div>
            {hasAnyInbox && (
              <div
                className="shrink-0 text-center px-1 py-1.5 border-b border-r border-border/50 sticky z-40"
                style={{ width: INBOX_W, left: LEFT_COL_W, backgroundColor: "#fff7ed" }}
              >
                <div className="text-[10px] font-bold" style={{ color: "#ea580c" }}>📥 Inbox</div>
              </div>
            )}
            {weeks.map(week => {
              const used = weekCapacities.get(week.key) ?? 0;
              const cap = getWeekCapacity(week.key);
              const pct = cap > 0 ? (used / cap) * 100 : 0;
              const barColor = pct > 120 ? "hsl(var(--destructive))" : pct > 100 ? "#d97706" : "hsl(var(--primary))";
              return (
                <div
                  key={week.key}
                  className="shrink-0 text-center px-1 py-1.5 border-b border-r border-border/50 bg-card"
                  style={{
                    width: CELL_W,
                    backgroundColor: week.isCurrent ? "hsl(142 76% 97%)" : undefined,
                    borderTop: week.isCurrent ? "2px solid hsl(var(--primary))" : undefined,
                  }}
                >
                  <div className="font-mono text-[11px] font-bold text-foreground">T{week.weekNum}</div>
                  <div className="text-[8px] text-muted-foreground">
                    {formatDateShort(week.start)} – {formatDateShort(week.end)}
                  </div>
                  <div className="h-[4px] rounded mt-1 mx-1 overflow-hidden" style={{ backgroundColor: "hsl(var(--muted))" }}>
                    <div className="h-full rounded" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
                  </div>
                  <div className="font-mono text-[9px] mt-0.5 font-semibold" style={{ color: barColor }}>
                    {formatCapacity(used, week.key)}
                  </div>
                </div>
              );
            })}
            {hasAnyExpedice && (
              <div
                className="shrink-0 text-center px-1 py-1.5 border-b border-l border-border/50 sticky right-0 z-40"
                style={{ width: EXPEDICE_W, backgroundColor: "#ecfdf5" }}
              >
                <div className="text-[10px] font-bold" style={{ color: "#059669" }}>✓ Expedice</div>
              </div>
            )}
          </div>

          {/* Project rows */}
          <div className="flex flex-col" style={{ gap: 6, paddingTop: 6 }}>
            {filteredRows.map(proj => {
              const isExpanded = expandedProjects.has(proj.projectId);
              return (
                <div key={proj.projectId} style={{ marginLeft: 4, marginRight: 4 }}>
                  {/* Project header row — card style */}
                  <div
                    className="flex cursor-pointer transition-all"
                    onClick={() => toggleProject(proj.projectId)}
                    style={{
                      height: 48,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    }}
                  >
                    <div
                      className="shrink-0 flex items-center gap-2.5 px-3 sticky left-0 z-20"
                      style={{
                        width: LEFT_COL_W,
                        backgroundColor: "#fff",
                        borderLeft: `4px solid ${proj.color}`,
                        borderRight: "1px solid #e5e2dd",
                        borderTop: "1px solid #e5e2dd",
                        borderBottom: "1px solid #e5e2dd",
                        borderRadius: "6px 0 0 6px",
                      }}
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: proj.color }} />
                        : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: proj.items.length > 0 ? "#ea580c" : "#99a5a3" }} />
                      }
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold truncate text-foreground leading-tight">{proj.projectName}</div>
                        <div className="text-[10px] text-muted-foreground font-mono leading-tight">{proj.projectId}</div>
                      </div>
                      <div
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-mono font-bold"
                        style={{ backgroundColor: proj.color + "18", color: proj.color }}
                      >
                        {formatProjectTotal(proj)}
                      </div>
                    </div>
                    {/* Inbox cell */}
                    {hasAnyInbox && (
                      <div
                        className="shrink-0 flex items-center justify-center px-1.5 sticky z-20"
                        style={{ width: INBOX_W, left: LEFT_COL_W, backgroundColor: "#fff", borderTop: "1px solid #e5e2dd", borderBottom: "1px solid #e5e2dd" }}
                      >
                        {proj.inboxTotalHours > 0 && (
                          <div className="w-full rounded px-1 py-0.5 text-center text-[9px] font-mono font-bold" style={{ backgroundColor: "#fff7ed", color: "#ea580c" }}>
                            {formatInboxValue(proj.inboxTotalHours, proj.inboxTotalCzk, proj.totalHours)}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Week cells */}
                    {weeks.map(week => {
                      const wt = proj.weekTotals.get(week.key);
                      return (
                        <div
                          key={week.key}
                          className="shrink-0 flex items-center justify-center px-1.5"
                          style={{
                            width: CELL_W,
                            backgroundColor: week.isCurrent ? "hsl(142 76% 97%)" : "#fff",
                            borderTop: "1px solid #e5e2dd",
                            borderBottom: "1px solid #e5e2dd",
                          }}
                        >
                          {!isExpanded && wt && wt.hours > 0 && (
                            <div
                              className="w-full rounded px-1 py-0.5 text-center text-[9px] font-mono font-bold"
                              style={{ backgroundColor: proj.color + "18", color: proj.color }}
                            >
                              {formatWeekTotal(wt.hours, wt.czk)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Expedice cell */}
                    {hasAnyExpedice && (
                      <div
                        className="shrink-0 flex items-center justify-center px-1.5 sticky right-0 z-20"
                        style={{
                          width: EXPEDICE_W,
                          backgroundColor: "#fff",
                          borderTop: "1px solid #e5e2dd",
                          borderBottom: "1px solid #e5e2dd",
                          borderRight: "1px solid #e5e2dd",
                          borderRadius: "0 6px 6px 0",
                        }}
                      >
                        {proj.expediceTotalHours > 0 && (
                          <div className="w-full rounded px-1 py-0.5 text-center text-[9px] font-mono font-bold" style={{ backgroundColor: "#ecfdf5", color: "#059669" }}>
                            {formatExpediceValue(proj.expediceTotalHours, proj.expediceTotalCzk, proj.totalHours)} ✓
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Item rows — only when expanded */}
                  {isExpanded && (
                    <div>
                      {proj.items.map((item, idx) => (
                        <div
                          key={item.id}
                          className="flex"
                          style={{
                            height: 32,
                            borderBottom: idx < proj.items.length - 1 ? "1px solid #f5f3f0" : undefined,
                          }}
                        >
                          <div
                            className="shrink-0 flex items-center gap-2 pr-2 sticky left-0 z-20"
                            style={{
                              width: LEFT_COL_W,
                              backgroundColor: "#fff",
                              borderRight: "1px solid #e5e2dd",
                              paddingLeft: 28,
                              borderLeft: "2px dashed #e5e2dd",
                            }}
                          >
                            {item.itemCode && (
                              <span className="font-mono font-bold text-[11px] shrink-0" style={{ color: "#223937" }}>{item.itemCode}</span>
                            )}
                            <span className="text-[12px] truncate text-foreground">{item.itemName}</span>
                            <span className="text-[10px] font-mono shrink-0 ml-auto" style={{ color: "#99a5a3" }}>{formatItemTotal(item)}</span>
                          </div>
                          {/* Inbox cell */}
                          {hasAnyInbox && (
                            <div
                              className="shrink-0 flex items-center justify-center px-1 sticky z-20"
                              style={{ width: INBOX_W, left: LEFT_COL_W, backgroundColor: "#fff" }}
                            >
                              {item.inboxHours > 0 && (
                                <div className="w-full rounded px-1 py-0.5 text-center text-[9px] font-mono font-semibold" style={{ backgroundColor: "#fff7ed", color: "#ea580c" }}>
                                  {formatInboxValue(item.inboxHours, item.inboxCzk, item.totalHours)}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Week cells */}
                          {weeks.map(week => {
                            const alloc = item.weekAllocations.get(week.key);
                            if (!alloc) {
                              return (
                                <div key={week.key} className="shrink-0" style={{
                                  width: CELL_W,
                                  backgroundColor: week.isCurrent ? "hsl(142 76% 97%)" : "#fff",
                                }} />
                              );
                            }
                            const cellStyle = getCellStyle(alloc.status);
                            return (
                              <div
                                key={week.key}
                                className="shrink-0 flex items-center justify-center px-1 py-0.5"
                                style={{
                                  width: CELL_W,
                                  backgroundColor: week.isCurrent ? "hsl(142 76% 97%)" : "#fff",
                                }}
                              >
                                <div
                                  className="w-full text-center text-[9px] font-mono font-semibold"
                                  style={{
                                    backgroundColor: cellStyle.bg,
                                    color: cellStyle.text,
                                    borderRadius: 4,
                                    padding: "3px 6px",
                                    border: `1px solid ${cellStyle.border}20`,
                                  }}
                                >
                                  {formatCellValue(alloc.hours, alloc.czk, alloc.status, item.totalHours, alloc.splitPart, alloc.splitTotal)}
                                </div>
                              </div>
                            );
                          })}
                          {/* Expedice cell */}
                          {hasAnyExpedice && (
                            <div
                              className="shrink-0 flex items-center justify-center px-1 sticky right-0 z-20"
                              style={{ width: EXPEDICE_W, backgroundColor: "#f0fdf4" }}
                            >
                              {item.expediceHours > 0 && (
                                <div
                                  className="w-full text-center text-[9px] font-mono font-semibold"
                                  style={{
                                    backgroundColor: "#ecfdf5",
                                    color: "#059669",
                                    borderRadius: 4,
                                    padding: "3px 6px",
                                    border: "1px solid #05966920",
                                  }}
                                >
                                  {formatExpediceValue(item.expediceHours, item.expediceCzk, item.totalHours)} ✓
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filteredRows.length === 0 && (
            <div className="px-6 py-12 text-center text-[12px] text-muted-foreground">
              Žádné položky v plánu výroby
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 flex items-center justify-between shrink-0 border-t border-border bg-card">
        <div className="flex items-center gap-3">
          {[
            { label: "Inbox", bg: "#fff7ed", border: "#ea580c" },
            { label: "Naplánováno", bg: "#eff6ff", border: "#3b82f6" },
            { label: "Ve výrobě", bg: "#fffbeb", border: "#d97706" },
            { label: "Dokončeno", bg: "#ecfdf5", border: "#059669" },
            { label: "Pozastaveno", bg: "#fefce8", border: "#a16207" },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.bg, border: `1px solid ${l.border}30` }} />
              <span className="text-[9px] text-muted-foreground">{l.label}</span>
            </div>
          ))}
        </div>
        <span className="text-[9px] italic text-muted-foreground/60">
          Pro úpravu plánu přepněte na Kanban zobrazení
        </span>
      </div>
    </div>
  );
}
