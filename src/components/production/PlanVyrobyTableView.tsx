import { useMemo, useState, useRef } from "react";
import { useProductionSchedule, getISOWeekNumber, type ScheduleItem } from "@/hooks/useProductionSchedule";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { getProjectColor } from "@/lib/projectColors";
import { exportToExcel } from "@/lib/exportExcel";
import { Download } from "lucide-react";

type DisplayMode = "hours" | "czk" | "percent";
type SortMode = "project" | "deadline" | "hours";

interface Props {
  displayMode: DisplayMode;
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

interface ProjectRow {
  projectId: string;
  projectName: string;
  color: string;
  totalHours: number;
  totalCzk: number;
  items: ItemRow[];
}

interface ItemRow {
  id: string;
  itemName: string;
  itemCode: string | null;
  totalHours: number;
  totalCzk: number;
  weekAllocations: Map<string, { hours: number; czk: number; status: string }>;
}

export function PlanVyrobyTableView({ displayMode }: Props) {
  const { data: scheduleData } = useProductionSchedule();
  const { data: settings } = useProductionSettings();
  const [sortMode, setSortMode] = useState<SortMode>("project");
  const scrollRef = useRef<HTMLDivElement>(null);

  const weeklyCapacity = Math.round((settings?.monthly_capacity_hours ?? 3500) / 4);
  const hourlyRate = settings?.hourly_rate ?? 550;

  // Build weeks (4 past + current + 12 future)
  const weeks = useMemo<WeekColumn[]>(() => {
    const monday = getMonday(new Date());
    const result: WeekColumn[] = [];
    for (let i = -4; i <= 12; i++) {
      const start = new Date(monday);
      start.setDate(monday.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const key = start.toISOString().split("T")[0];
      result.push({
        key,
        weekNum: getISOWeekNumber(start),
        start,
        end,
        isCurrent: i === 0,
      });
    }
    return result;
  }, []);

  // Build project rows from schedule data
  const projectRows = useMemo<ProjectRow[]>(() => {
    if (!scheduleData) return [];

    // Aggregate all items across all weeks by project, then by item
    const projectMap = new Map<string, {
      projectName: string;
      items: Map<string, {
        item: ScheduleItem;
        weekAllocations: Map<string, { hours: number; czk: number; status: string }>;
        totalHours: number;
        totalCzk: number;
      }>;
    }>();

    for (const [weekKey, silo] of scheduleData) {
      for (const bundle of silo.bundles) {
        if (!projectMap.has(bundle.project_id)) {
          projectMap.set(bundle.project_id, {
            projectName: bundle.project_name,
            items: new Map(),
          });
        }
        const proj = projectMap.get(bundle.project_id)!;
        for (const item of bundle.items) {
          // Use split_group_id or item id as grouping key for split items
          const itemKey = item.split_group_id || item.id;
          if (!proj.items.has(itemKey)) {
            proj.items.set(itemKey, {
              item,
              weekAllocations: new Map(),
              totalHours: 0,
              totalCzk: 0,
            });
          }
          const entry = proj.items.get(itemKey)!;
          const existing = entry.weekAllocations.get(weekKey);
          entry.weekAllocations.set(weekKey, {
            hours: (existing?.hours ?? 0) + item.scheduled_hours,
            czk: (existing?.czk ?? 0) + item.scheduled_czk,
            status: item.status,
          });
          entry.totalHours += item.scheduled_hours;
          entry.totalCzk += item.scheduled_czk;
        }
      }
    }

    const rows: ProjectRow[] = [];
    for (const [pid, proj] of projectMap) {
      const items: ItemRow[] = [];
      for (const [, entry] of proj.items) {
        items.push({
          id: entry.item.id,
          itemName: entry.item.item_name,
          itemCode: entry.item.item_code,
          totalHours: entry.totalHours,
          totalCzk: entry.totalCzk,
          weekAllocations: entry.weekAllocations,
        });
      }
      rows.push({
        projectId: pid,
        projectName: proj.projectName,
        color: getProjectColor(pid),
        totalHours: items.reduce((s, i) => s + i.totalHours, 0),
        totalCzk: items.reduce((s, i) => s + i.totalCzk, 0),
        items,
      });
    }

    // Sort
    if (sortMode === "hours") {
      rows.sort((a, b) => b.totalHours - a.totalHours);
    } else if (sortMode === "deadline") {
      // Sort by earliest week with allocation
      rows.sort((a, b) => {
        const aMin = Math.min(...a.items.flatMap(i => [...i.weekAllocations.keys()].map(k => weeks.findIndex(w => w.key === k))).filter(x => x >= 0));
        const bMin = Math.min(...b.items.flatMap(i => [...i.weekAllocations.keys()].map(k => weeks.findIndex(w => w.key === k))).filter(x => x >= 0));
        return aMin - bMin;
      });
    } else {
      rows.sort((a, b) => a.projectName.localeCompare(b.projectName, "cs"));
    }

    return rows;
  }, [scheduleData, sortMode, weeks]);

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
      case "completed": return { bg: "#dcfce7", text: "#166534", icon: "✓" };
      case "in_progress": return { bg: "#fef3c7", text: "#92400e", icon: "●" };
      case "paused": return { bg: "#fef9c3", text: "#854d0e", icon: "⏸" };
      default: return { bg: "#dbeafe", text: "#1e40af", icon: "" };
    }
  };

  const formatCellValue = (hours: number, czk: number, status: string, totalItemHours: number) => {
    const style = getCellStyle(status);
    if (displayMode === "percent") {
      const pct = totalItemHours > 0 ? Math.round((hours / totalItemHours) * 100) : 0;
      return `${pct}%${style.icon ? " " + style.icon : ""}`;
    }
    if (displayMode === "czk") {
      return `${Math.round(hours)}h · ${formatCompactCzk(czk)}${style.icon ? " " + style.icon : ""}`;
    }
    return `${Math.round(hours)}h${style.icon ? " " + style.icon : ""}`;
  };

  const formatCapacity = (used: number) => {
    if (displayMode === "percent") {
      const pct = weeklyCapacity > 0 ? Math.round((used / weeklyCapacity) * 100) : 0;
      return `${pct}%`;
    }
    if (displayMode === "czk") {
      return `${Math.round(used)}h / ${weeklyCapacity}h · ${formatCompactCzk(used * hourlyRate)}`;
    }
    return `${Math.round(used)}h / ${weeklyCapacity}h`;
  };

  const formatProjectTotal = (row: ProjectRow) => {
    if (displayMode === "percent") {
      const completed = row.items.filter(i =>
        [...i.weekAllocations.values()].every(a => a.status === "completed")
      ).length;
      return `${completed}/${row.items.length} hotovo · ${row.items.length > 0 ? Math.round((completed / row.items.length) * 100) : 0}%`;
    }
    if (displayMode === "czk") {
      return `${Math.round(row.totalHours)}h · ${formatCompactCzk(row.totalCzk)}`;
    }
    return `${Math.round(row.totalHours)}h`;
  };

  const handleExport = () => {
    const headers = ["Projekt", "ID", "Položka", "Kód", "Celkem h", ...weeks.map(w => `T${w.weekNum}`)];
    const rows: (string | number)[][] = [];
    for (const proj of projectRows) {
      for (const item of proj.items) {
        const row: (string | number)[] = [
          proj.projectName,
          proj.projectId,
          item.itemName,
          item.itemCode || "",
          Math.round(item.totalHours),
        ];
        for (const week of weeks) {
          const alloc = item.weekAllocations.get(week.key);
          row.push(alloc ? Math.round(alloc.hours) : "");
        }
        rows.push(row);
      }
    }
    const today = new Date().toISOString().split("T")[0];
    exportToExcel({
      sheetName: "Plán Výroby",
      fileName: `AMI-Plan-Vyroby-${today}.xlsx`,
      headers,
      rows,
    });
  };

  const LEFT_COL_W = 260;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Toolbar */}
      <div className="px-3 py-[6px] flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid #ece8e2" }}>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium" style={{ color: "#99a5a3" }}>
            {totalProjects} projektů · {totalItems} položek
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-medium" style={{ color: "#99a5a3" }}>Řadit:</span>
            {(["project", "deadline", "hours"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className="px-2 py-[2px] text-[9px] font-medium rounded transition-colors"
                style={{
                  backgroundColor: sortMode === mode ? "#223937" : "#ffffff",
                  color: sortMode === mode ? "#ffffff" : "#6b7a78",
                  border: sortMode === mode ? "none" : "1px solid #e2ddd6",
                }}
              >
                {mode === "project" ? "Projekt" : mode === "deadline" ? "Termín" : "Hodiny"}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1 px-2 py-[3px] text-[10px] font-medium rounded transition-colors"
          style={{ backgroundColor: "#ffffff", color: "#6b7a78", border: "1px solid #e2ddd6" }}
        >
          <Download className="h-3 w-3" />
          Export
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div className="min-w-max">
          {/* Header row: capacity per week */}
          <div className="flex sticky top-0 z-10" style={{ backgroundColor: "#f4f2f0" }}>
            {/* Left corner */}
            <div className="shrink-0 sticky left-0 z-20" style={{ width: LEFT_COL_W, backgroundColor: "#f4f2f0", borderRight: "1px solid #e2ddd6", borderBottom: "1px solid #e2ddd6" }}>
              <div className="px-3 py-2 text-[10px] font-semibold" style={{ color: "#6b7a78" }}>
                Projekt / Položka
              </div>
            </div>
            {/* Week headers */}
            {weeks.map(week => {
              const used = weekCapacities.get(week.key) ?? 0;
              const pct = weeklyCapacity > 0 ? (used / weeklyCapacity) * 100 : 0;
              const barColor = pct > 100 ? "#dc3545" : pct > 85 ? "#d97706" : "#3a8a36";
              return (
                <div
                  key={week.key}
                  className="shrink-0 text-center px-1 py-1.5"
                  style={{
                    width: 110,
                    borderBottom: "1px solid #e2ddd6",
                    borderRight: "1px solid #f0eee9",
                    backgroundColor: week.isCurrent ? "rgba(58,138,54,0.06)" : "#f4f2f0",
                  }}
                >
                  <div className="font-mono text-[11px] font-bold" style={{ color: "#223937" }}>
                    T{week.weekNum}
                  </div>
                  <div className="text-[8px]" style={{ color: "#99a5a3" }}>
                    {formatDateShort(week.start)} – {formatDateShort(week.end)}
                  </div>
                  <div className="h-[4px] rounded mt-1 mx-1" style={{ backgroundColor: "#f0eee9", overflow: "hidden" }}>
                    <div className="h-full rounded" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
                  </div>
                  <div className="font-mono text-[9px] mt-0.5 font-semibold" style={{ color: barColor }}>
                    {formatCapacity(used)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Project rows */}
          {projectRows.map(proj => (
            <div key={proj.projectId}>
              {/* Project header */}
              <div className="flex" style={{ backgroundColor: "#fafaf8" }}>
                <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 sticky left-0 z-10" style={{ width: LEFT_COL_W, backgroundColor: "#fafaf8", borderRight: "1px solid #e2ddd6", borderBottom: "1px solid #f0eee9" }}>
                  <div className="w-[3px] h-5 rounded-full shrink-0" style={{ backgroundColor: proj.color }} />
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold truncate" style={{ color: "#223937" }}>
                      {proj.projectName}
                    </div>
                    <div className="text-[9px] flex items-center gap-1.5" style={{ color: "#99a5a3" }}>
                      <span>{proj.projectId}</span>
                      <span className="font-semibold" style={{ color: proj.color }}>{formatProjectTotal(proj)}</span>
                    </div>
                  </div>
                </div>
                {weeks.map(week => (
                  <div key={week.key} className="shrink-0" style={{
                    width: 110,
                    borderBottom: "1px solid #f0eee9",
                    borderRight: "1px solid #f0eee9",
                    backgroundColor: week.isCurrent ? "rgba(58,138,54,0.03)" : undefined,
                  }} />
                ))}
              </div>

              {/* Item rows */}
              {proj.items.map(item => (
                <div key={item.id} className="flex" style={{ borderBottom: "1px solid #f5f3f0" }}>
                  <div className="shrink-0 flex items-center pl-6 pr-2 py-1 sticky left-0 z-10" style={{ width: LEFT_COL_W, backgroundColor: "#ffffff", borderRight: "1px solid #e2ddd6" }}>
                    <div className="min-w-0">
                      <div className="text-[10px] truncate" style={{ color: "#3a4a48" }}>
                        {item.itemCode && <span className="font-mono font-semibold mr-1" style={{ color: "#6b7a78" }}>{item.itemCode}</span>}
                        {item.itemName}
                      </div>
                    </div>
                  </div>
                  {weeks.map(week => {
                    const alloc = item.weekAllocations.get(week.key);
                    if (!alloc) {
                      return (
                        <div key={week.key} className="shrink-0" style={{
                          width: 110,
                          borderRight: "1px solid #f0eee9",
                          backgroundColor: week.isCurrent ? "rgba(58,138,54,0.03)" : undefined,
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
                        className="shrink-0 flex items-center justify-center px-1 py-1"
                        style={{
                          width: 110,
                          borderRight: "1px solid #f0eee9",
                          backgroundColor: week.isCurrent ? "rgba(58,138,54,0.03)" : undefined,
                        }}
                      >
                        <div
                          className="w-full rounded px-1.5 py-0.5 text-center text-[9px] font-mono font-semibold"
                          style={{
                            backgroundColor: style.bg,
                            color: style.text,
                            opacity: cellOpacity,
                          }}
                        >
                          {formatCellValue(alloc.hours, alloc.czk, alloc.status, item.totalHours)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}

          {projectRows.length === 0 && (
            <div className="px-6 py-12 text-center text-[12px]" style={{ color: "#99a5a3" }}>
              Žádné položky v plánu výroby
            </div>
          )}
        </div>
      </div>

      {/* Footer: legend + read-only note */}
      <div className="px-3 py-2 flex items-center justify-between shrink-0" style={{ borderTop: "1px solid #ece8e2", backgroundColor: "#fafaf8" }}>
        <div className="flex items-center gap-3">
          {[
            { label: "Dokončeno", bg: "#dcfce7", text: "#166534" },
            { label: "Ve výrobě", bg: "#fef3c7", text: "#92400e" },
            { label: "Naplánováno", bg: "#dbeafe", text: "#1e40af" },
            { label: "Pozastaveno", bg: "#fef9c3", text: "#854d0e" },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.bg, border: `1px solid ${l.text}30` }} />
              <span className="text-[9px]" style={{ color: "#6b7a78" }}>{l.label}</span>
            </div>
          ))}
        </div>
        <span className="text-[9px] italic" style={{ color: "#b0bab8" }}>
          Pro úpravu plánu přepněte na Kanban zobrazení
        </span>
      </div>
    </div>
  );
}
