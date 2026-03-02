import { useMemo } from "react";
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
      result.push({ start, end, weekNum: getISOWeekNumber(start), key: start.toISOString().split("T")[0] });
    }
    return result;
  }, []);

  const periodLabel = useMemo(() => {
    if (weeks.length === 0) return "";
    const first = weeks[0].start;
    const last = weeks[weeks.length - 1].end;
    if (first.getMonth() === last.getMonth()) return `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`;
    return `${MONTH_NAMES[first.getMonth()]} – ${MONTH_NAMES[last.getMonth()]} ${last.getFullYear()}`;
  }, [weeks]);

  const currentWeekKey = useMemo(() => getMonday(new Date()).toISOString().split("T")[0], []);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Toolbar */}
      <div className="px-3 py-[6px] flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid #ece8e2" }}>
        <div className="flex items-center gap-[2px]">
          <ToolbarButton active label="Týdny" />
          <ToolbarButton disabled label="Dny" />
        </div>
        <span className="text-[9px] font-medium" style={{ color: "#99a5a3" }}>{periodLabel}</span>
        <div className="flex items-center gap-[2px]">
          <ToolbarButton active={!showCzk} label="Hodiny" onClick={() => onToggleCzk(false)} />
          <ToolbarButton active={showCzk} label="Hod + Kč" onClick={() => onToggleCzk(true)} />
        </div>
      </div>

      {/* Silos */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-[6px] p-2 h-full" style={{ minWidth: `${weeks.length * 181}px` }}>
          {weeks.map((week) => (
            <SiloColumn
              key={week.key}
              weekNum={week.weekNum}
              startDate={week.start}
              endDate={week.end}
              isCurrent={week.key === currentWeekKey}
              silo={scheduleData?.get(week.key) || null}
              weeklyCapacity={weeklyCapacity}
              showCzk={showCzk}
              hourlyRate={settings?.hourly_rate ?? 550}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({ active, disabled, label, onClick }: { active?: boolean; disabled?: boolean; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={!disabled ? onClick : undefined}
      className="px-2 py-[3px] text-[10px] font-medium rounded transition-colors"
      style={{
        backgroundColor: active ? "#223937" : "#ffffff",
        color: active ? "#ffffff" : disabled ? "#99a5a3" : "#6b7a78",
        border: active ? "none" : "1px solid #e2ddd6",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

interface SiloProps {
  weekNum: number;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
  silo: WeekSilo | null;
  weeklyCapacity: number;
  showCzk: boolean;
  hourlyRate: number;
}

function SiloColumn({ weekNum, startDate, endDate, isCurrent, silo, weeklyCapacity, showCzk, hourlyRate }: SiloProps) {
  const totalHours = silo?.total_hours ?? 0;
  const pct = weeklyCapacity > 0 ? (totalHours / weeklyCapacity) * 100 : 0;
  const isOverloaded = pct > 100;
  const isWarning = pct > 85 && pct <= 100;
  const overloadHours = totalHours - weeklyCapacity;

  const barColor = isOverloaded ? "#dc3545" : isWarning ? "#d97706" : "#3a8a36";
  const barBg = isOverloaded
    ? "linear-gradient(90deg, #fca5a5, #dc3545)"
    : isWarning
    ? "linear-gradient(90deg, #fcd34d, #d97706)"
    : "linear-gradient(90deg, #a7d9a2, #3a8a36)";

  return (
    <div
      className="w-[175px] shrink-0 flex flex-col"
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 9,
        border: isCurrent
          ? "2px solid #3a8a36"
          : isOverloaded
          ? "1px solid rgba(220,53,69,0.4)"
          : "1px solid #ece8e2",
      }}
    >
      {/* Header */}
      <div className="px-2.5 py-1.5 text-center" style={{ borderBottom: "1px solid #ece8e2" }}>
        <div className="flex items-center justify-center gap-1.5">
          <span className="font-mono text-[12px] font-bold" style={{ color: "#223937" }}>T{weekNum}</span>
          {isCurrent && <span className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: "#3a8a36" }} />}
        </div>
        <div className="text-[8px] mt-0.5" style={{ color: "#99a5a3" }}>
          {formatDateShort(startDate)} – {formatDateShort(endDate)}
        </div>

        {/* Capacity meter */}
        <div className="mt-1.5">
          <div className="h-[7px] rounded" style={{ backgroundColor: "#f0eee9", overflow: "hidden" }}>
            <div
              className="h-full rounded transition-all duration-300"
              style={{ width: `${Math.min(pct, 100)}%`, background: barBg }}
            />
          </div>
          <div className="flex items-baseline justify-between mt-[3px]">
            <span className="font-mono text-[10px] font-bold" style={{ color: barColor }}>
              {Math.round(totalHours)}h
            </span>
            <span className="font-mono text-[9px]" style={{ color: "#99a5a3" }}>
              / {weeklyCapacity}h
            </span>
            <span className="font-mono text-[9px] font-bold" style={{ color: barColor }}>
              {Math.round(pct)}%
            </span>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-1.5" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {(!silo || silo.bundles.length === 0) && (
          <div
            className="flex-1 flex items-center justify-center rounded-[5px] px-2 py-[14px]"
            style={{ border: "1.5px dashed #e2ddd6" }}
          >
            <span className="text-[9px] text-center" style={{ color: "#99a5a3" }}>Přetáhni sem z Inboxu</span>
          </div>
        )}
        {silo?.bundles.map((bundle) => (
          <BundleCard key={bundle.project_id} bundle={bundle} showCzk={showCzk} hourlyRate={hourlyRate} />
        ))}
      </div>

      {/* Overload banner */}
      {isOverloaded && (
        <div
          className="px-2 py-[3px] text-[9px] font-semibold text-center"
          style={{
            backgroundColor: "rgba(239,68,68,0.06)",
            color: "#dc3545",
            borderRadius: "0 0 8px 8px",
          }}
        >
          ⚠ Přetížení +{Math.round(overloadHours)}h
        </div>
      )}
    </div>
  );
}

function BundleCard({ bundle, showCzk, hourlyRate }: { bundle: ScheduleBundle; showCzk: boolean; hourlyRate: number }) {
  const color = getProjectColor(bundle.project_id);

  return (
    <div className="rounded-[6px] overflow-hidden" style={{ border: "1px solid #ece8e2", backgroundColor: "#ffffff" }}>
      {/* Bundle header */}
      <div
        className="flex items-center gap-1.5 px-[7px] py-[5px] cursor-grab"
        style={{ backgroundColor: "#f0eee9", borderLeft: `4px solid ${color}` }}
      >
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-semibold truncate" style={{ color: "#223937" }}>
            {bundle.project_name}
          </div>
          <div className="font-mono text-[7px]" style={{ color: "#99a5a3" }}>
            {bundle.project_id}
          </div>
        </div>
        <span className="font-mono text-[9px] font-bold shrink-0" style={{ color: "#223937" }}>
          {Math.round(bundle.total_hours)}h
        </span>
      </div>
      {/* Items */}
      <div className="px-[3px] py-[2px]">
        {bundle.items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-[3px] px-[6px] py-[3px] rounded cursor-grab transition-colors"
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f0eee9")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <GripVertical className="shrink-0" style={{ width: 8, height: 8, color: "#99a5a3" }} />
            <span className="text-[9px] flex-1 truncate" style={{ color: "#6b7a78" }}>
              {item.item_name}
            </span>
            <span className="font-mono text-[8px] shrink-0" style={{ color: "#99a5a3" }}>
              {item.scheduled_hours}h
              {showCzk && ` ${Math.round(item.scheduled_czk / 1000)}K`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
