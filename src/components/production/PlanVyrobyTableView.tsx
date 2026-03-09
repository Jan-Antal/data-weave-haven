import { useMemo, useState, useRef } from "react";
import { useProductionSchedule, useProductionExpedice, getISOWeekNumber, type ScheduleItem } from "@/hooks/useProductionSchedule";
import { useProductionInbox } from "@/hooks/useProductionInbox";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { useWeekCapacityLookup } from "@/hooks/useWeeklyCapacity";
import { getProjectColor } from "@/lib/projectColors";
import { exportToExcel } from "@/lib/exportExcel";
import { Download, ChevronRight, ChevronDown } from "lucide-react";

type DisplayMode = "hours" | "czk" | "percent";
type SortMode = "project" | "deadline" | "hours";

interface Props {
  displayMode: DisplayMode;
  searchQuery?: string;
}

function formatCompactCzk(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${Math.round(v)}`;
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

const CELL_W = 110;
const INBOX_W = 80;
const EXPEDICE_W = 80;
const LEFT_COL_W = 260;

export function PlanVyrobyTableView({ displayMode, searchQuery = "" }: Props) {
  const { data: scheduleData } = useProductionSchedule();
  const { data: expediceData } = useProductionExpedice();
  const { data: inboxProjects = [] } = useProductionInbox();
  const { data: settings } = useProductionSettings();
  const getWeekCapacity = useWeekCapacityLookup();
  const [sortMode, setSortMode] = useState<SortMode>("project");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const hourlyRate = settings?.hourly_rate ?? 550;

  const toggleProject = (pid: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  // Build weeks — from first week with data, skip past empty weeks
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
      result.push({
        key,
        weekNum: getISOWeekNumber(start),
        start,
        end,
        isCurrent: key === currentWeekKey,
      });
    }
    return result;
  }, [scheduleData]);

  // Build inbox lookup: projectId -> items
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

  // Build expedice lookup: projectId -> items
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

  // Build project rows combining schedule + inbox + expedice
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

    // From schedule data
    if (scheduleData) {
      for (const [weekKey, silo] of scheduleData) {
        for (const bundle of silo.bundles) {
          if (!projectMap.has(bundle.project_id)) {
            projectMap.set(bundle.project_id, { projectName: bundle.project_name, items: new Map() });
          }
          const proj = projectMap.get(bundle.project_id)!;
          for (const item of bundle.items) {
            // Skip completed items (they go to expedice)
            if (item.status === "completed") continue;
            const itemKey = item.split_group_id || item.id;
            if (!proj.items.has(itemKey)) {
              proj.items.set(itemKey, { itemName: item.item_name, itemCode: item.item_code, weekAllocations: new Map(), totalHours: 0, totalCzk: 0 });
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

    // Collect all project IDs that have inbox or expedice data too
    const allProjectIds = new Set<string>([...projectMap.keys(), ...inboxByProject.keys(), ...expediceByProject.keys()]);

    const rows: ProjectRow[] = [];
    for (const pid of allProjectIds) {
      const proj = projectMap.get(pid);
      const inbox = inboxByProject.get(pid);
      const expedice = expediceByProject.get(pid);

      // Get project name from any source
      const projectName = proj?.projectName || inbox?.items[0]?.name?.split(" ")[0] || 
        inboxProjects.find(p => p.project_id === pid)?.project_name ||
        expediceData?.find(g => g.project_id === pid)?.project_name || pid;

      const items: ItemRow[] = [];

      // Build item rows from schedule
      if (proj) {
        for (const [, entry] of proj.items) {
          if (entry.totalHours <= 0) continue;
          items.push({
            id: Math.random().toString(36),
            itemName: entry.itemName,
            itemCode: entry.itemCode,
            totalHours: entry.totalHours,
            totalCzk: entry.totalCzk,
            weekAllocations: entry.weekAllocations,
            inboxHours: 0,
            inboxCzk: 0,
            expediceHours: 0,
            expediceCzk: 0,
          });
        }
      }

      // Add inbox items as separate rows
      if (inbox) {
        for (const inItem of inbox.items) {
          if (inItem.hours <= 0) continue;
          items.push({
            id: Math.random().toString(36),
            itemName: inItem.name,
            itemCode: inItem.code,
            totalHours: inItem.hours,
            totalCzk: inItem.czk,
            weekAllocations: new Map(),
            inboxHours: inItem.hours,
            inboxCzk: inItem.czk,
            expediceHours: 0,
            expediceCzk: 0,
          });
        }
      }

      // Add expedice items as separate rows
      if (expedice) {
        for (const exItem of expedice.items) {
          if (exItem.hours <= 0) continue;
          items.push({
            id: Math.random().toString(36),
            itemName: exItem.name,
            itemCode: exItem.code,
            totalHours: exItem.hours,
            totalCzk: exItem.czk,
            weekAllocations: new Map(),
            inboxHours: 0,
            inboxCzk: 0,
            expediceHours: exItem.hours,
            expediceCzk: exItem.czk,
          });
        }
      }

      if (items.length === 0) continue;

      // Compute per-week totals
      const weekTotals = new Map<string, { hours: number; czk: number }>();
      for (const item of items) {
        for (const [wk, alloc] of item.weekAllocations) {
          const existing = weekTotals.get(wk);
          weekTotals.set(wk, {
            hours: (existing?.hours ?? 0) + alloc.hours,
            czk: (existing?.czk ?? 0) + alloc.czk,
          });
        }
      }

      const inboxTotalHours = inbox?.totalHours ?? 0;
      const inboxTotalCzk = inbox?.totalCzk ?? 0;
      const expediceTotalHours = expedice?.totalHours ?? 0;
      const expediceTotalCzk = expedice?.totalCzk ?? 0;

      // Get proper project name
      const realName = inboxProjects.find(p => p.project_id === pid)?.project_name ||
        expediceData?.find(g => g.project_id === pid)?.project_name ||
        proj?.projectName || pid;

      rows.push({
        projectId: pid,
        projectName: realName,
        color: getProjectColor(pid),
        totalHours: items.reduce((s, i) => s + i.totalHours, 0),
        totalCzk: items.reduce((s, i) => s + i.totalCzk, 0),
        items,
        weekTotals,
        inboxTotalHours,
        inboxTotalCzk,
        expediceTotalHours,
        expediceTotalCzk,
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

  const totalProjects = projectRows.length;
  const totalItems = projectRows.reduce((s, p) => s + p.items.length, 0);

  // Week capacity data
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
      case "completed": return { bg: "hsl(142 76% 92%)", text: "hsl(143 64% 24%)", icon: "✓" };
      case "in_progress": return { bg: "hsl(45 93% 90%)", text: "hsl(26 90% 37%)", icon: "●" };
      case "paused": return { bg: "hsl(48 96% 89%)", text: "hsl(35 92% 33%)", icon: "⏸" };
      default: return { bg: "hsl(214 95% 93%)", text: "hsl(221 83% 53%)", icon: "" };
    }
  };

  const formatCellValue = (hours: number, czk: number, status: string, totalItemHours: number, splitPart?: number, splitTotal?: number) => {
    const style = getCellStyle(status);
    const splitLabel = splitPart && splitTotal ? ` ${splitPart}/${splitTotal}` : "";
    if (displayMode === "percent") {
      const pct = totalItemHours > 0 ? Math.round((hours / totalItemHours) * 100) : 0;
      return `${pct}%${splitLabel}${style.icon ? " " + style.icon : ""}`;
    }
    if (displayMode === "czk") {
      return `${Math.round(hours)}h · ${formatCompactCzk(czk)}${splitLabel}`;
    }
    return `${Math.round(hours)}h${splitLabel}${style.icon ? " " + style.icon : ""}`;
  };

  const formatCapacity = (used: number, weekKey: string) => {
    const cap = getWeekCapacity(weekKey);
    if (displayMode === "percent") {
      return `${cap > 0 ? Math.round((used / cap) * 100) : 0}%`;
    }
    if (displayMode === "czk") {
      return `${Math.round(used)}h / ${cap}h · ${formatCompactCzk(used * hourlyRate)}`;
    }
    return `${Math.round(used)}h / ${cap}h`;
  };

  const formatProjectTotal = (row: ProjectRow) => {
    if (displayMode === "czk") return `${Math.round(row.totalHours)}h · ${formatCompactCzk(row.totalCzk)}`;
    return `${Math.round(row.totalHours)}h`;
  };

  const formatWeekTotal = (hours: number, czk: number) => {
    if (displayMode === "czk") return `${Math.round(hours)}h · ${formatCompactCzk(czk)}`;
    return `${Math.round(hours)}h`;
  };

  const formatSimple = (hours: number, czk: number) => {
    if (displayMode === "czk") return `${Math.round(hours)}h · ${formatCompactCzk(czk)}`;
    if (displayMode === "percent") return `${Math.round(hours)}h`;
    return `${Math.round(hours)}h`;
  };

  const handleExport = () => {
    const headers = ["Projekt", "ID", "Položka", "Kód", "Inbox h", ...weeks.map(w => `T${w.weekNum}`), "Expedice h"];
    const rows: (string | number)[][] = [];
    for (const proj of projectRows) {
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

  const hasAnyInbox = projectRows.some(p => p.inboxTotalHours > 0);
  const hasAnyExpedice = projectRows.some(p => p.expediceTotalHours > 0);

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
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div className="min-w-max">
          {/* Header row */}
          <div className="flex sticky top-0 z-30 bg-muted" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div className="shrink-0 sticky left-0 z-40 border-r border-b border-border bg-muted" style={{ width: LEFT_COL_W }}>
              <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground">
                Projekt / Položka
              </div>
            </div>
            {/* Inbox header — sticky left after project col */}
            {hasAnyInbox && (
              <div
                className="shrink-0 text-center px-1 py-1.5 border-b border-r border-border/50 sticky z-40"
                style={{ width: INBOX_W, left: LEFT_COL_W, backgroundColor: "hsl(45 93% 95%)" }}
              >
                <div className="text-[10px] font-bold" style={{ color: "hsl(26 90% 37%)" }}>📥 Inbox</div>
              </div>
            )}
            {/* Week headers — scroll freely */}
            {weeks.map(week => {
              const used = weekCapacities.get(week.key) ?? 0;
              const cap = getWeekCapacity(week.key);
              const pct = cap > 0 ? (used / cap) * 100 : 0;
              const barColor = pct > 120 ? "hsl(var(--destructive))" : pct > 100 ? "#d97706" : "hsl(var(--primary))";
              return (
                <div
                  key={week.key}
                  className="shrink-0 text-center px-1 py-1.5 border-b border-r border-border/50"
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
                  <div className="h-[4px] rounded mt-1 mx-1 bg-muted overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
                  </div>
                  <div className="font-mono text-[9px] mt-0.5 font-semibold" style={{ color: barColor }}>
                    {formatCapacity(used, week.key)}
                  </div>
                </div>
              );
            })}
            {/* Expedice header — sticky right */}
            {hasAnyExpedice && (
              <div
                className="shrink-0 text-center px-1 py-1.5 border-b border-l border-border/50 sticky right-0 z-40"
                style={{ width: EXPEDICE_W, backgroundColor: "hsl(142 76% 95%)" }}
              >
                <div className="text-[10px] font-bold" style={{ color: "hsl(143 64% 24%)" }}>✓ Expedice</div>
              </div>
            )}
          </div>

          {/* Project rows */}
          {projectRows.map(proj => {
            const isExpanded = expandedProjects.has(proj.projectId);
            return (
              <div key={proj.projectId}>
                {/* Project header row */}
                <div
                  className="flex cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() => toggleProject(proj.projectId)}
                >
                  <div
                    className="shrink-0 flex items-center gap-2 px-2 py-1.5 sticky left-0 z-20 border-r border-b border-border/60 bg-card"
                    style={{ width: LEFT_COL_W }}
                  >
                    {isExpanded
                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    }
                    <div className="w-[3px] h-5 rounded-full shrink-0" style={{ backgroundColor: proj.color }} />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold truncate text-foreground">{proj.projectName}</div>
                      <div className="text-[9px] flex items-center gap-1.5 text-muted-foreground">
                        <span>{proj.projectId}</span>
                        <span className="font-semibold" style={{ color: proj.color }}>{formatProjectTotal(proj)}</span>
                      </div>
                    </div>
                  </div>
                  {/* Inbox cell — sticky left */}
                  {hasAnyInbox && (
                    <div
                      className="shrink-0 flex items-center justify-center px-1 py-1 border-b border-r border-border/30 sticky z-20 bg-card"
                      style={{ width: INBOX_W, left: LEFT_COL_W }}
                    >
                      {proj.inboxTotalHours > 0 && (
                        <div className="w-full rounded px-1 py-0.5 text-center text-[9px] font-mono font-semibold" style={{ backgroundColor: "hsl(45 93% 90%)", color: "hsl(26 90% 37%)" }}>
                          {formatSimple(proj.inboxTotalHours, proj.inboxTotalCzk)}
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
                        className="shrink-0 flex items-center justify-center px-1 py-1 border-b border-r border-border/30"
                        style={{
                          width: CELL_W,
                          backgroundColor: week.isCurrent ? "hsl(142 76% 97%)" : undefined,
                        }}
                      >
                        {!isExpanded && wt && wt.hours > 0 && (
                          <div
                            className="w-full rounded px-1 py-0.5 text-center text-[9px] font-mono font-semibold"
                            style={{ backgroundColor: proj.color + "20", color: proj.color }}
                          >
                            {formatWeekTotal(wt.hours, wt.czk)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Expedice cell — sticky right */}
                  {hasAnyExpedice && (
                    <div
                      className="shrink-0 flex items-center justify-center px-1 py-1 border-b border-l border-border/30 sticky right-0 z-20 bg-card"
                      style={{ width: EXPEDICE_W }}
                    >
                      {proj.expediceTotalHours > 0 && (
                        <div className="w-full rounded px-1 py-0.5 text-center text-[9px] font-mono font-semibold" style={{ backgroundColor: "hsl(142 76% 92%)", color: "hsl(143 64% 24%)" }}>
                          {formatSimple(proj.expediceTotalHours, proj.expediceTotalCzk)} ✓
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Item rows — only when expanded */}
                {isExpanded && proj.items.map(item => (
                  <div key={item.id} className="flex border-b border-border/20">
                    <div
                      className="shrink-0 flex items-center pl-9 pr-2 py-1 sticky left-0 z-20 border-r border-border bg-background"
                      style={{ width: LEFT_COL_W }}
                    >
                      <div className="min-w-0">
                        <div className="text-[10px] truncate text-foreground">
                          {item.itemCode && <span className="font-mono font-semibold mr-1 text-muted-foreground">{item.itemCode}</span>}
                          {item.itemName}
                        </div>
                      </div>
                    </div>
                    {/* Inbox cell — sticky left */}
                    {hasAnyInbox && (
                      <div
                        className="shrink-0 flex items-center justify-center px-1 py-1 border-r border-border/30 sticky z-20 bg-background"
                        style={{ width: INBOX_W, left: LEFT_COL_W }}
                      >
                        {item.inboxHours > 0 && (
                          <div className="w-full rounded px-1 py-0.5 text-center text-[9px] font-mono font-semibold" style={{ backgroundColor: "hsl(45 93% 90%)", color: "hsl(26 90% 37%)" }}>
                            {Math.round(item.inboxHours)}h
                          </div>
                        )}
                      </div>
                    )}
                    {/* Week cells */}
                    {weeks.map(week => {
                      const alloc = item.weekAllocations.get(week.key);
                      if (!alloc) {
                        return (
                          <div key={week.key} className="shrink-0 border-r border-border/30" style={{
                            width: CELL_W,
                            backgroundColor: week.isCurrent ? "hsl(142 76% 97%)" : undefined,
                          }} />
                        );
                      }
                      const style = getCellStyle(alloc.status);
                      const cellOpacity = displayMode === "percent" && item.totalHours > 0
                        ? 0.4 + 0.6 * (alloc.hours / item.totalHours)
                        : 1;
                      return (
                        <div
                          key={week.key}
                          className="shrink-0 flex items-center justify-center px-1 py-1 border-r border-border/30"
                          style={{
                            width: CELL_W,
                            backgroundColor: week.isCurrent ? "hsl(142 76% 97%)" : undefined,
                          }}
                        >
                          <div
                            className="w-full rounded px-1.5 py-0.5 text-center text-[9px] font-mono font-semibold"
                            style={{ backgroundColor: style.bg, color: style.text, opacity: cellOpacity }}
                          >
                            {formatCellValue(alloc.hours, alloc.czk, alloc.status, item.totalHours, alloc.splitPart, alloc.splitTotal)}
                          </div>
                        </div>
                      );
                    })}
                    {/* Expedice cell — sticky right */}
                    {hasAnyExpedice && (
                      <div
                        className="shrink-0 flex items-center justify-center px-1 py-1 border-l border-border/30 sticky right-0 z-20 bg-background"
                        style={{ width: EXPEDICE_W }}
                      >
                        {item.expediceHours > 0 && (
                          <div className="w-full rounded px-1 py-0.5 text-center text-[9px] font-mono font-semibold" style={{ backgroundColor: "hsl(142 76% 92%)", color: "hsl(143 64% 24%)" }}>
                            {Math.round(item.expediceHours)}h ✓
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {projectRows.length === 0 && (
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
            { label: "Inbox", bg: "hsl(45 93% 90%)", text: "hsl(26 90% 37%)" },
            { label: "Naplánováno", bg: "hsl(214 95% 93%)", text: "hsl(221 83% 53%)" },
            { label: "Ve výrobě", bg: "hsl(45 93% 90%)", text: "hsl(26 90% 37%)" },
            { label: "Dokončeno", bg: "hsl(142 76% 92%)", text: "hsl(143 64% 24%)" },
            { label: "Pozastaveno", bg: "hsl(48 96% 89%)", text: "hsl(35 92% 33%)" },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.bg, border: `1px solid ${l.text}30` }} />
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
