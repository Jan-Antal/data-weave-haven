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

  // Sum scheduled hours
  const scheduledHours = scheduleData
    ? Array.from(scheduleData.values()).reduce((s, w) => s + w.total_hours, 0)
    : 0;

  // Sum inbox hours
  const inboxHours = inboxProjects.reduce((s, p) => s + p.total_hours, 0);

  const isOverCapacity = scheduledHours > monthlyHours;

  const formatCzk = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M Kč`;
    if (v >= 1_000) return `${Math.round(v / 1_000)}K Kč`;
    return `${v.toLocaleString("cs-CZ")} Kč`;
  };

  return (
    <header className="h-14 flex items-center px-4 shrink-0" style={{ backgroundColor: "#223937" }}>
      <div className="flex items-center gap-3 mr-auto">
        <span className="text-white/90 font-serif text-sm tracking-wide">A→M Interior</span>
        <span className="text-white/40">|</span>
        <span className="text-white font-semibold text-sm">Plán Výroby</span>
      </div>

      <div className="flex items-center gap-0 mx-auto">
        <StatBox label="Kapacita / měsíc" value={`${monthlyHours.toLocaleString("cs-CZ")} h`} />
        <Divider />
        <StatBox label="CZK ekvivalent" value={formatCzk(monthlyCzk)} />
        <Divider />
        <StatBox
          label="Naplánováno"
          value={`${Math.round(scheduledHours).toLocaleString("cs-CZ")} h`}
          className={isOverCapacity ? "text-red-400" : "text-emerald-400"}
        />
        <Divider />
        <StatBox
          label="V Inboxu"
          value={`${Math.round(inboxHours).toLocaleString("cs-CZ")} h`}
          className="text-amber-400"
        />
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <button
          className="flex items-center gap-1.5 text-white/60 hover:text-white/90 transition-colors text-xs"
          onClick={() => navigate("/")}
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="font-mono text-xs">Sazba: {hourlyRate} Kč/h</span>
        </button>
        <button
          className="flex items-center gap-1 text-white/60 hover:text-white/90 transition-colors text-xs"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Zpět
        </button>
      </div>
    </header>
  );
}

function StatBox({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="px-4 text-center">
      <div className="text-white/50 text-[9px] uppercase tracking-wider">{label}</div>
      <div className={`font-mono font-semibold text-sm ${className || "text-white"}`}>{value}</div>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-7 bg-white/15" />;
}
