import { useNavigate } from "react-router-dom";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { useProductionSchedule } from "@/hooks/useProductionSchedule";
import { useProductionInbox } from "@/hooks/useProductionInbox";
import { ArrowLeft, Settings } from "lucide-react";

export function ProductionHeader() {
  const navigate = useNavigate();
  const { data: settings } = useProductionSettings();
  const { data: scheduleData } = useProductionSchedule();
  const { data: inboxProjects = [] } = useProductionInbox();

  const monthlyHours = settings?.monthly_capacity_hours ?? 3500;
  const hourlyRate = settings?.hourly_rate ?? 550;
  const monthlyCzk = monthlyHours * hourlyRate;

  const scheduledHours = scheduleData
    ? Array.from(scheduleData.values()).reduce((s, w) => s + w.total_hours, 0)
    : 0;

  const inboxHours = inboxProjects.reduce((s, p) => s + p.total_hours, 0);
  const isOverCapacity = scheduledHours > monthlyHours;

  const formatCzk = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M Kč`;
    if (v >= 1_000) return `${Math.round(v / 1_000)}K Kč`;
    return `${v.toLocaleString("cs-CZ")} Kč`;
  };

  return (
    <div
      className="shrink-0 flex items-center px-4 py-1.5 border-b"
      style={{ backgroundColor: "#f4f2f0", borderColor: "#ece8e2" }}
    >
      <div className="flex items-center gap-0">
        <StatBox label="Kapacita / měsíc" value={`${monthlyHours.toLocaleString("cs-CZ")} h`} />
        <Divider />
        <StatBox label="CZK ekvivalent" value={formatCzk(monthlyCzk)} />
        <Divider />
        <StatBox
          label="Naplánováno"
          value={`${Math.round(scheduledHours).toLocaleString("cs-CZ")} h`}
          valueColor={isOverCapacity ? "#dc3545" : "#3a8a36"}
        />
        <Divider />
        <StatBox
          label="V Inboxu"
          value={`${Math.round(inboxHours).toLocaleString("cs-CZ")} h`}
          valueColor="#d97706"
        />
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <span className="flex items-center gap-1.5 text-xs" style={{ color: "#6b7a78" }}>
          <Settings className="h-3 w-3" />
          <span className="font-mono text-[10px]">Sazba: {hourlyRate} Kč/h</span>
        </span>
        <button
          className="flex items-center gap-1 text-xs transition-colors hover:opacity-80"
          style={{ color: "#6b7a78" }}
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="h-3 w-3" />
          Zpět
        </button>
      </div>
    </div>
  );
}

function StatBox({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="px-3.5 text-center">
      <div className="text-[8px] uppercase tracking-[0.08em] font-medium" style={{ color: "#99a5a3" }}>
        {label}
      </div>
      <div
        className="font-mono font-semibold text-[13px] leading-tight"
        style={{ color: valueColor || "#223937" }}
      >
        {value}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-6" style={{ backgroundColor: "#e2ddd6" }} />;
}
