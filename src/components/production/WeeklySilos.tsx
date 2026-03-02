import { useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { useProductionSchedule, getISOWeekNumber, type WeekSilo, type ScheduleBundle } from "@/hooks/useProductionSchedule";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { getProjectColor } from "@/lib/projectColors";

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
}

export function WeeklySilos({ showCzk, onToggleCzk }: Props) {
  const { data: scheduleData } = useProductionSchedule();
  const { data: settings } = useProductionSettings();

  const weeklyCapacity = Math.round((settings?.monthly_capacity_hours ?? 3500) / 4);

  const weeks = useMemo(() => {
    const monday = getMonday(new Date());
    const result: { start: Date; end: Date; weekNum: number; key: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const start = new Date(monday);
      start.setDate(monday.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      result.push({
        start,
        end,
        weekNum: getISOWeekNumber(start),
        key: start.toISOString().split("T")[0],
      });
    }
    return result;
  }, []);

  // Period label
  const periodLabel = useMemo(() => {
    if (weeks.length === 0) return "";
    const first = weeks[0].start;
    const last = weeks[weeks.length - 1].end;
    if (first.getMonth() === last.getMonth()) {
      return `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`;
    }
    return `${MONTH_NAMES[first.getMonth()]} – ${MONTH_NAMES[last.getMonth()]} ${last.getFullYear()}`;
  }, [weeks]);

  const currentWeekKey = useMemo(() => getMonday(new Date()).toISOString().split("T")[0], []);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <button className="px-2.5 py-1 text-xs font-medium rounded bg-primary text-primary-foreground">Týdny</button>
          <button className="px-2.5 py-1 text-xs font-medium rounded text-muted-foreground cursor-not-allowed opacity-50">Dny</button>
        </div>
        <span className="text-xs font-medium text-muted-foreground">{periodLabel}</span>
        <div className="flex items-center gap-1">
          <ToggleButton active={!showCzk} label="Hodiny" onClick={() => onToggleCzk(false)} />
          <ToggleButton active={showCzk} label="Hod + Kč" onClick={() => onToggleCzk(true)} />
        </div>
      </div>

      {/* Silos container */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-2 p-2 h-full" style={{ minWidth: `${weeks.length * 183}px` }}>
          {weeks.map((week) => {
            const silo = scheduleData?.get(week.key);
            return (
              <SiloColumn
                key={week.key}
                weekKey={week.key}
                weekNum={week.weekNum}
                startDate={week.start}
                endDate={week.end}
                isCurrent={week.key === currentWeekKey}
                silo={silo || null}
                weeklyCapacity={weeklyCapacity}
                showCzk={showCzk}
                hourlyRate={settings?.hourly_rate ?? 550}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ToggleButton({ active, label, onClick }: { active: boolean; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
      }`}
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
  silo: WeekSilo | null;
  weeklyCapacity: number;
  showCzk: boolean;
  hourlyRate: number;
}

function SiloColumn({ weekKey, weekNum, startDate, endDate, isCurrent, silo, weeklyCapacity, showCzk, hourlyRate }: SiloProps) {
  const totalHours = silo?.total_hours ?? 0;
  const pct = weeklyCapacity > 0 ? (totalHours / weeklyCapacity) * 100 : 0;
  const isOverloaded = pct > 100;
  const isWarning = pct > 85 && pct <= 100;
  const overloadHours = totalHours - weeklyCapacity;

  const barColor = isOverloaded ? "#dc3545" : isWarning ? "#d97706" : "#3a8a36";

  return (
    <div
      className="w-[175px] shrink-0 rounded-lg border flex flex-col bg-card"
      style={{
        borderColor: isCurrent
          ? "rgba(58,138,54,0.5)"
          : isOverloaded
          ? "rgba(220,53,69,0.4)"
          : undefined,
        borderWidth: isCurrent ? 2 : undefined,
      }}
    >
      {/* Header */}
      <div className="px-2.5 py-1.5 border-b">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-bold">T{weekNum}</span>
          {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
          <span className="text-[10px] text-muted-foreground ml-auto">
            {formatDateShort(startDate)} – {formatDateShort(endDate)}
          </span>
        </div>

        {/* Capacity meter */}
        <div className="mt-1.5">
          <div className="h-[7px] rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }}
            />
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="font-mono text-[10px] font-bold" style={{ color: barColor }}>
              {Math.round(totalHours)}h
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">/ {weeklyCapacity}h</span>
            <span className="font-mono text-[9px] text-muted-foreground ml-auto">{Math.round(pct)}%</span>
          </div>
        </div>
      </div>

      {/* Items area */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
        {(!silo || silo.bundles.length === 0) && (
          <div className="h-full flex items-center justify-center border border-dashed rounded-md p-3">
            <span className="text-[10px] text-muted-foreground text-center">Přetáhni sem z Inboxu</span>
          </div>
        )}
        {silo?.bundles.map((bundle) => (
          <BundleCard key={bundle.project_id} bundle={bundle} showCzk={showCzk} hourlyRate={hourlyRate} />
        ))}
      </div>

      {/* Overload banner */}
      {isOverloaded && (
        <div className="px-2 py-1 text-[10px] font-semibold text-center" style={{ backgroundColor: "rgba(220,53,69,0.1)", color: "#dc3545" }}>
          ⚠ Přetížení +{Math.round(overloadHours)}h
        </div>
      )}
    </div>
  );
}

function BundleCard({ bundle, showCzk, hourlyRate }: { bundle: ScheduleBundle; showCzk: boolean; hourlyRate: number }) {
  const color = getProjectColor(bundle.project_id);

  return (
    <div className="rounded-md border overflow-hidden">
      <div
        className="flex items-center gap-1.5 px-2 py-1 cursor-grab"
        style={{ borderLeft: `4px solid ${color}` }}
      >
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-bold truncate">{bundle.project_name}</div>
          <div className="font-mono text-[7px] text-muted-foreground">{bundle.project_id}</div>
        </div>
        <span className="font-mono text-[10px] font-bold shrink-0">{Math.round(bundle.total_hours)}h</span>
      </div>
      <div className="px-1 pb-1 space-y-0.5">
        {bundle.items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-1 px-1.5 py-1 rounded cursor-grab hover:bg-muted/50 transition-colors"
          >
            <GripVertical className="h-2.5 w-2.5 text-muted-foreground/30 shrink-0" />
            <span className="text-[10px] flex-1 truncate">{item.item_name}</span>
            <span className="font-mono text-[9px] text-muted-foreground shrink-0">
              {item.scheduled_hours}h
              {showCzk && <span className="ml-1">{Math.round(item.scheduled_czk / 1000)}K</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
